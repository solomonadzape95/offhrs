use anchor_lang::prelude::*;

use crate::error::AngelError;

/// Pyth Solana Receiver — owns every `PriceUpdateV2` account.
///
/// Read access is **permissionless**: a plain `getAccountInfo` is enough, no API
/// key and no entitlement. That matters because Hermes gates every equity feed
/// behind `pyth-indices`, while the on-chain accounts are public.
pub const PYTH_RECEIVER_PROGRAM_ID: Pubkey = pubkey!("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

/// Anchor discriminator for the `PriceUpdateV2` account: first 8 bytes of
/// `sha256("account:PriceUpdateV2")`. Pinned so we can't be fooled by an account
/// of the right owner but the wrong type.
pub const PRICE_UPDATE_V2_DISCRIMINATOR: [u8; 8] =
    [0x22, 0xf1, 0x23, 0x63, 0x9d, 0x7e, 0xf4, 0xcd];

/// Serialized size: 8 (disc) + 32 (authority) + 1 (verification level)
/// + 84 (PriceFeedMessage) + 8 (posted slot) + 1 (padding).
pub const PRICE_UPDATE_V2_LEN: usize = 134;

const OFF_VERIFICATION: usize = 40;
const OFF_FEED_ID: usize = 41;
const OFF_PRICE: usize = 73;
const OFF_CONF: usize = 81;
const OFF_EXPONENT: usize = 89;
const OFF_PUBLISH_TIME: usize = 93;
const OFF_PREV_PUBLISH_TIME: usize = 101;
const OFF_EMA_PRICE: usize = 109;
const OFF_EMA_CONF: usize = 117;
const OFF_POSTED_SLOT: usize = 125;

/// A decoded Pyth `PriceUpdateV2`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PythPrice {
    pub feed_id: [u8; 32],
    pub price: i64,
    pub conf: u64,
    pub exponent: i32,
    pub publish_time: i64,
    pub prev_publish_time: i64,
    pub ema_price: i64,
    pub ema_conf: u64,
    pub posted_slot: u64,
    /// 0 = partial (fewer signatures than the threshold), 1 = full.
    pub verification_level: u8,
}

impl PythPrice {
    /// Seconds since this price was published. Never negative, so a validator
    /// with a skewed clock can't be used to fabricate negative staleness.
    pub fn age_secs(&self, now_unix: i64) -> u64 {
        now_unix.saturating_sub(self.publish_time).max(0) as u64
    }

    /// Re-scale `price` to `target_exponent`, e.g. -6 for USDC-like units.
    /// Returns `None` on overflow rather than wrapping a price.
    ///
    /// We want `X` such that `X * 10^target == price * 10^exponent`, so
    /// `X = price * 10^(exponent - target)`. Note the subtraction order — getting
    /// it backwards scales the price the wrong way (334.82 would become 33481.59).
    pub fn value_at_exponent(&self, target_exponent: i32) -> Option<i128> {
        let diff = self.exponent - target_exponent;
        if diff >= 0 {
            let factor = 10i128.checked_pow(diff as u32)?;
            (self.price as i128).checked_mul(factor)
        } else {
            let factor = 10i128.checked_pow((-diff) as u32)?;
            Some((self.price as i128) / factor)
        }
    }

    /// The maximum relative width of the confidence interval, in bps.
    pub fn conf_bps(&self) -> Option<u64> {
        if self.price == 0 {
            return None;
        }
        Some(
            (self.conf as u128)
                .checked_mul(10_000)?
                .checked_div(self.price.unsigned_abs() as u128)? as u64,
        )
    }
}

fn read_u64(d: &[u8], o: usize) -> u64 {
    let mut b = [0u8; 8];
    b.copy_from_slice(&d[o..o + 8]);
    u64::from_le_bytes(b)
}

fn read_i64(d: &[u8], o: usize) -> i64 {
    let mut b = [0u8; 8];
    b.copy_from_slice(&d[o..o + 8]);
    i64::from_le_bytes(b)
}

fn read_i32(d: &[u8], o: usize) -> i32 {
    let mut b = [0u8; 4];
    b.copy_from_slice(&d[o..o + 4]);
    i32::from_le_bytes(b)
}

/// Decode a `PriceUpdateV2` account's data.
///
/// Validates the discriminator as well as the length, so a same-owner account of
/// the wrong type is rejected instead of being misread as a price.
pub fn parse_price_update_v2(data: &[u8]) -> Result<PythPrice> {
    require!(
        data.len() >= PRICE_UPDATE_V2_LEN,
        AngelError::PythAccountTooSmall
    );
    require!(
        data[0..8] == PRICE_UPDATE_V2_DISCRIMINATOR,
        AngelError::PythWrongAccountType
    );

    let mut feed_id = [0u8; 32];
    feed_id.copy_from_slice(&data[OFF_FEED_ID..OFF_FEED_ID + 32]);

    Ok(PythPrice {
        feed_id,
        price: read_i64(data, OFF_PRICE),
        conf: read_u64(data, OFF_CONF),
        exponent: read_i32(data, OFF_EXPONENT),
        publish_time: read_i64(data, OFF_PUBLISH_TIME),
        prev_publish_time: read_i64(data, OFF_PREV_PUBLISH_TIME),
        ema_price: read_i64(data, OFF_EMA_PRICE),
        ema_conf: read_u64(data, OFF_EMA_CONF),
        posted_slot: read_u64(data, OFF_POSTED_SLOT),
        verification_level: data[OFF_VERIFICATION],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Real mainnet `PriceUpdateV2` accounts, captured 2026-09-19:
    ///   Equity.US.AAPL/USD  D9uk39pqZMcnmtPP9WeC8cREUpKZmyXLga9mSQ79SphW
    ///   Crypto.BTC/USD      4cSM2e6rvbGQUFiJbqytoVMi5GgghSMr8LwVrT9VPSPo
    fn fixture(hex: &str) -> Vec<u8> {
        let h = hex.trim();
        (0..h.len() / 2)
            .map(|i| u8::from_str_radix(&h[i * 2..i * 2 + 2], 16).unwrap())
            .collect()
    }

    fn to_hex(b: &[u8]) -> String {
        b.iter().map(|x| format!("{:02x}", x)).collect()
    }

    fn aapl() -> Vec<u8> {
        fixture(include_str!("../fixtures/pyth_equity_aapl.hex"))
    }

    fn btc() -> Vec<u8> {
        fixture(include_str!("../fixtures/pyth_crypto_btc.hex"))
    }

    #[test]
    fn decodes_a_real_equity_account() {
        let p = parse_price_update_v2(&aapl()).unwrap();

        assert_eq!(p.exponent, -5);
        assert_eq!(p.publish_time, 1_789_775_997);
        assert_eq!(p.prev_publish_time, 1_789_775_996);
        assert_eq!(p.verification_level, 1, "should be fully verified");
        assert_eq!(
            to_hex(&p.feed_id),
            "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688"
        );
        // $334.8159 — the Friday after-hours AAPL print.
        // price_raw * 10^-5 is the real value; rescaling must preserve it.
        assert_eq!(p.value_at_exponent(-5).unwrap(), 33_481_590, "identity");
        assert_eq!(p.value_at_exponent(-4).unwrap(), 3_348_159);
        assert_eq!(p.value_at_exponent(0).unwrap(), 334); // truncated
        assert_eq!(p.value_at_exponent(-8).unwrap(), 33_481_590_000);
    }

    #[test]
    fn decodes_a_real_crypto_account() {
        let p = parse_price_update_v2(&btc()).unwrap();
        assert_eq!(p.exponent, -8);
        assert_eq!(
            to_hex(&p.feed_id),
            "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"
        );
        // $81,791.51
        assert_eq!(p.value_at_exponent(-8).unwrap(), 8_179_151_074_707, "identity");
        assert_eq!(p.value_at_exponent(-6).unwrap(), 81_791_510_747);
    }

    #[test]
    fn staleness_is_never_negative() {
        let p = parse_price_update_v2(&aapl()).unwrap();
        assert_eq!(p.age_secs(p.publish_time), 0);
        assert_eq!(p.age_secs(p.publish_time + 60), 60);
        // A clock skewed into the past must not yield a huge wrapped u64.
        assert_eq!(p.age_secs(p.publish_time - 10_000), 0);
    }

    #[test]
    fn rejects_a_wrong_owner_type() {
        let mut d = aapl();
        d[0] = 0xff; // clobber the discriminator
        assert!(matches!(
            parse_price_update_v2(&d),
            Err(e) if e == AngelError::PythWrongAccountType.into()
        ));
    }

    #[test]
    fn rejects_a_short_account() {
        assert!(parse_price_update_v2(&aapl()[..100]).is_err());
        assert!(parse_price_update_v2(&[]).is_err());
    }

    #[test]
    fn confidence_is_reported_in_bps_and_handles_zero() {
        let p = parse_price_update_v2(&aapl()).unwrap();
        // conf 6410 at exponent -5 -> 0.0641 USD on 334.8 -> ~1.9 bps
        assert_eq!(p.conf_bps().unwrap(), 1);

        let mut z = parse_price_update_v2(&btc()).unwrap();
        z.price = 0;
        assert_eq!(z.conf_bps(), None, "no divide-by-zero when price is 0");
    }
}
