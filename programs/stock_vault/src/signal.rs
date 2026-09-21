use anchor_lang::prelude::*;

use crate::error::AngelError;
use crate::pricing::{parse_price_update_v2, PYTH_RECEIVER_PROGRAM_ID};
use crate::state::{Agent, MarketRegime, Signal};

/// Record a Pyth-attested market read for an agent's reference feed.
///
/// Pyth data here does real work rather than decorating a dashboard: the
/// instruction refuses to run unless the caller supplies a live Pyth account of
/// the right owner, right account type, right feed id, and inside their declared
/// staleness policy. The resulting `Signal` is the on-chain evidence that the
/// agent acted on real market data.
///
/// `max_staleness_secs` is the caller's policy, not a constant, because the whole
/// point is that equity feeds go legitimately stale: on a weekend the correct
/// read is "frozen, last print Friday after-hours", not "no data". Pass a tight
/// bound to assert liveness; pass a loose bound to record a frozen reference.
#[derive(Accounts)]
#[instruction(expected_feed_id: [u8; 32])]
pub struct RecordSignal<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        constraint = agent.creator == authority.key() || agent.agent_signer == authority.key()
            @ AngelError::Unauthorized
    )]
    pub agent: Account<'info, Agent>,

    /// The Pyth `PriceUpdateV2` account. Owner is asserted before we parse it.
    /// CHECK: validated in the handler against `PYTH_RECEIVER_PROGRAM_ID`.
    pub price_update: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        seeds = [Signal::SEED, agent.key().as_ref(), expected_feed_id.as_ref()],
        bump,
        payer = authority,
        space = 8 + Signal::INIT_SPACE,
    )]
    pub signal: Account<'info, Signal>,

    pub system_program: Program<'info, System>,
}

pub fn record_signal(
    ctx: Context<RecordSignal>,
    expected_feed_id: [u8; 32],
    max_staleness_secs: u64,
    frozen_after_secs: u64,
) -> Result<()> {
    let oracle = &ctx.accounts.price_update;

    // Owner first: never parse an account some other program controls.
    require_keys_eq!(
        *oracle.owner,
        PYTH_RECEIVER_PROGRAM_ID,
        AngelError::PythAccountOwnerMismatch
    );

    let price = {
        let data = oracle.try_borrow_data()?;
        parse_price_update_v2(&data)?
    };

    require!(
        price.feed_id == expected_feed_id,
        AngelError::PythFeedIdMismatch
    );

    let clock = Clock::get()?;
    let staleness_secs = price.age_secs(clock.unix_timestamp);
    require!(staleness_secs <= max_staleness_secs, AngelError::StalePrice);

    let regime = if staleness_secs > frozen_after_secs {
        MarketRegime::Frozen
    } else {
        MarketRegime::Live
    };

    let signal = &mut ctx.accounts.signal;
    signal.agent = ctx.accounts.agent.key();
    signal.oracle = oracle.key();
    signal.feed_id = price.feed_id;
    signal.price = price.price;
    signal.conf = price.conf;
    signal.exponent = price.exponent;
    signal.publish_time = price.publish_time;
    signal.observed_at = clock.unix_timestamp;
    signal.staleness_secs = staleness_secs;
    signal.regime = regime;
    signal.bump = ctx.bumps.signal;

    emit!(SignalRecorded {
        agent: signal.agent,
        oracle: signal.oracle,
        feed_id: price.feed_id,
        price: price.price,
        exponent: price.exponent,
        publish_time: price.publish_time,
        staleness_secs,
        regime,
    });

    Ok(())
}

#[event]
pub struct SignalRecorded {
    pub agent: Pubkey,
    pub oracle: Pubkey,
    pub feed_id: [u8; 32],
    pub price: i64,
    pub exponent: i32,
    pub publish_time: i64,
    pub staleness_secs: u64,
    pub regime: MarketRegime,
}
