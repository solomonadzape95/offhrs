/// Fixed-point scale for `acc_reward_per_share`.
pub const PRECISION: u128 = 1_000_000_000_000; // 1e12

/// Stream `elapsed` slots' worth of rewards into the per-share accumulator.
///
/// Returns the new `(acc_reward_per_share, reward_reserve)`.
///
/// Payout is **capped at `reward_reserve`**, which is what makes the vault
/// solvent by construction: it can never credit more than it holds, whatever
/// the rate or elapsed time.
pub fn accrue(
    acc_reward_per_share: u128,
    reward_rate: u128,
    reward_reserve: u64,
    total_staked: u64,
    elapsed: u64,
) -> (u128, u64) {
    // Nobody to pay: pause the stream rather than burning the reserve.
    if elapsed == 0 || total_staked == 0 || reward_rate == 0 || reward_reserve == 0 {
        return (acc_reward_per_share, reward_reserve);
    }

    let mut payout = reward_rate.saturating_mul(elapsed as u128);
    if payout > reward_reserve as u128 {
        payout = reward_reserve as u128;
    }
    if payout == 0 {
        return (acc_reward_per_share, reward_reserve);
    }

    let increment = payout.saturating_mul(PRECISION) / total_staked as u128;
    (
        acc_reward_per_share.saturating_add(increment),
        reward_reserve - payout as u64,
    )
}

/// Rewards earned but not yet settled into `accrued`.
pub fn pending(staked: u64, acc_reward_per_share: u128, reward_debt: u128) -> u128 {
    let gross = (staked as u128)
        .saturating_mul(acc_reward_per_share)
        / PRECISION;
    gross.saturating_sub(reward_debt)
}

/// The `reward_debt` a holder should carry for a given stake.
pub fn debt(staked: u64, acc_reward_per_share: u128) -> u128 {
    (staked as u128)
        .saturating_mul(acc_reward_per_share)
        / PRECISION
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Independent reference model: distribute each slot's payout across holders
    /// by direct pro-rata share, with no accumulator at all.
    ///
    /// Deliberately *not* a reimplementation of `accrue`. It computes
    /// `floor(payout * staked_i / total)` per holder per slot, carrying the
    /// remainder forward so the model distributes each slot's payout exactly
    /// (sum of increments == payout). Without the carry it would lose ~0.33 of a
    /// unit per slot on small numbers, and the comparison would measure that
    /// rounding artefact rather than any real disagreement.
    ///
    /// The accumulator instead computes
    /// `floor(staked_i * (sum floor(payout * PRECISION / total)) / PRECISION)`,
    /// truncating once per step. So it should land just *below* this model, by
    /// at most one unit per accrual step.
    fn naive(rate: u128, reserve: u64, stakes: &[u64], slots: u64) -> Vec<u128> {
        let total: u128 = stakes.iter().map(|s| *s as u128).sum();
        let mut out = vec![0u128; stakes.len()];
        let mut carry = vec![0u128; stakes.len()];
        let mut left = reserve as u128;
        for _ in 0..slots {
            if total == 0 || left == 0 {
                break;
            }
            let payout = core::cmp::min(rate, left);
            if payout == 0 {
                break;
            }
            left -= payout;
            for (i, s) in stakes.iter().enumerate() {
                let num = payout * (*s as u128) + carry[i];
                out[i] += num / total;
                carry[i] = num % total;
            }
        }
        out
    }

    fn run_accumulator(rate: u128, reserve: u64, stakes: &[u64], slots: u64) -> Vec<u128> {
        let total: u64 = stakes.iter().sum();
        let mut acc: u128 = 0;
        let mut left = reserve;
        for _ in 0..slots {
            let (a, r) = accrue(acc, rate, left, total, 1);
            acc = a;
            left = r;
        }
        stakes.iter().map(|s| pending(*s, acc, 0)).collect()
    }

    #[test]
    fn nobody_staked_means_reserve_is_untouched() {
        let (acc, reserve) = accrue(0, 1_000, 5_000, 0, 100);
        assert_eq!(acc, 0);
        assert_eq!(reserve, 5_000, "reserve must not be burned with no stakers");
    }

    #[test]
    fn payout_is_capped_at_the_reserve() {
        // rate 1000/slot * 100 slots = 100_000 requested, but only 5_000 held.
        let (acc, reserve) = accrue(0, 1_000, 5_000, 1_000, 100);
        assert_eq!(reserve, 0, "cannot stream more than it holds");
        assert_eq!(acc, 5_000 * PRECISION / 1_000);
    }

    #[test]
    fn holding_for_the_full_duration_earns_the_whole_stream() {
        let reserve = 1_000_000u64;
        let slots = 1_000u64;
        let rate = reserve as u128 / slots as u128;
        let got = run_accumulator(rate, reserve, &[1_000], slots)[0];
        assert!(
            got <= reserve as u128,
            "never pays more than deposited: {got} > {reserve}"
        );
        // Truncation dust only.
        assert!(
            got >= reserve as u128 - slots as u128,
            "expected ~{reserve}, got {got}"
        );
    }

    #[test]
    fn rewards_are_duration_weighted() {
        // Two holders, same size. A stakes for the whole stream, B only for the
        // last 10%. A must earn far more — this is the property that makes the
        // vault resistant to stake-just-before-the-deposit.
        let reserve = 1_000_000u64;
        let slots = 1_000u64;
        let rate = reserve as u128 / slots as u128;

        let acc_full = run_accumulator(rate, reserve, &[1_000, 1_000], slots);

        // B enters late: 900 slots with A alone, then 100 slots together.
        let mut acc: u128 = 0;
        let mut left = reserve;
        for _ in 0..900 {
            let (a, r) = accrue(acc, rate, left, 1_000, 1);
            acc = a;
            left = r;
        }
        // A settles its debt at entry point of B (simulated by reading pending
        // against acc at t=900), then both share the tail.
        let a_before: u128 = (1_000u128 * acc) / PRECISION;
        let mut acc2 = acc;
        let mut left2 = left;
        for _ in 0..100 {
            let (a, r) = accrue(acc2, rate, left2, 2_000, 1);
            acc2 = a;
            left2 = r;
        }
        let a_total = a_before + pending(1_000, acc2, a_before);
        let b_total = pending(1_000, acc2, debt(1_000, acc));

        assert!(
            a_total > b_total * 5,
            "early holder should dominate: a={a_total} b={b_total}"
        );
        assert!(
            a_total + b_total <= reserve as u128,
            "must stay solvent"
        );
        // And a full-duration holder gets more than a late entrant ever could.
        assert!(acc_full[0] > b_total);
    }

    #[test]
    fn two_holders_are_paid_in_proportion_to_stake() {
        let reserve = 900_000u64;
        let slots = 900u64;
        let rate = reserve as u128 / slots as u128;
        let got = run_accumulator(rate, reserve, &[1_000, 3_000], slots);
        let ratio = got[1] as f64 / got[0] as f64;
        assert!(
            (ratio - 3.0).abs() < 0.01,
            "expected ~3x for 3x stake, got {ratio}"
        );
    }

    #[test]
    fn accumulator_agrees_with_the_independent_naive_model() {
        let cases: &[(u128, u64, &[u64], u64)] = &[
            (1_000, 1_000_000, &[1_000, 3_000], 1_000),
            (7, 1_000_000, &[5, 5, 5], 10_000),
            (333_333, 1_000_000, &[1, 999_999], 3),
            (1, 1_000_000, &[1_000_000], 1_000_000),
            (100_000, 1_000_000, &[2_500, 2_500, 5_000], 10),
        ];

        for (rate, reserve, stakes, slots) in cases {
            let mine = run_accumulator(*rate, *reserve, stakes, *slots);
            let theirs = naive(*rate, *reserve, stakes, *slots);

            let sum_mine: u128 = mine.iter().sum();
            let sum_theirs: u128 = theirs.iter().sum();

            assert!(
                sum_mine <= *reserve as u128,
                "solvency violated: {sum_mine} > {reserve}"
            );

            // The accumulator truncates once per accrual step, so it may trail
            // the carried naive model — but by at most ~1 unit per step, and
            // never by a meaningful amount.
            let tolerance = *slots as u128 + stakes.len() as u128;
            assert!(
                sum_mine <= sum_theirs,
                "accumulator should not out-pay the exact model: {sum_mine} > {sum_theirs}"
            );
            assert!(
                sum_theirs - sum_mine <= tolerance,
                "model diverged: mine={sum_mine} naive={sum_theirs} tol={tolerance}"
            );
            for (a, b) in mine.iter().zip(theirs.iter()) {
                assert!(a <= b, "per-holder overpay: {a} > {b}");
                assert!(b - a <= tolerance);
            }
        }
    }

    #[test]
    fn stake_mid_stream_neither_forfeits_nor_duplicates_rewards() {
        // Mirrors the on-chain flow: settle at the old stake, then recompute
        // `reward_debt` against the NEW total. Using the old total here would
        // hand the holder a windfall — the reserve would be over-distributed —
        // which is exactly the bug this test exists to catch.
        let reserve = 1_000_000u64;
        let rate = 1_000u128;
        let mut acc: u128 = 0;
        let mut left = reserve;

        // 500 slots with a single 1_000 holder.
        for _ in 0..500 {
            let (a, r) = accrue(acc, rate, left, 1_000, 1);
            acc = a;
            left = r;
        }

        let accrued = pending(1_000, acc, 0);
        let debt_after_restake = debt(2_000, acc); // NOTE: 2_000, the new total

        // 500 more slots, now with 2_000 staked.
        let mut acc2 = acc;
        let mut left2 = left;
        for _ in 0..500 {
            let (a, r) = accrue(acc2, rate, left2, 2_000, 1);
            acc2 = a;
            left2 = r;
        }

        let later = pending(2_000, acc2, debt_after_restake);

        assert_eq!(left2, 0, "stream should be fully consumed");
        assert_eq!(
            accrued + later,
            reserve as u128,
            "the stream must be conserved exactly: neither forfeited nor duplicated"
        );
    }

    #[test]
    fn stale_debt_would_overpay() {
        // Guard the guard: demonstrate that recomputing debt on the OLD total
        // over-distributes, so the previous test is actually load-bearing.
        let reserve = 1_000_000u64;
        let rate = 1_000u128;
        let mut acc: u128 = 0;
        let mut left = reserve;
        for _ in 0..500 {
            let (a, r) = accrue(acc, rate, left, 1_000, 1);
            acc = a;
            left = r;
        }
        let accrued = pending(1_000, acc, 0);

        let mut acc2 = acc;
        let mut left2 = left;
        for _ in 0..500 {
            let (a, r) = accrue(acc2, rate, left2, 2_000, 1);
            acc2 = a;
            left2 = r;
        }

        let correct = pending(2_000, acc2, debt(2_000, acc));
        let wrong = pending(2_000, acc2, debt(1_000, acc));

        assert!(accrued + correct <= reserve as u128);
        assert!(
            accrued + wrong > reserve as u128,
            "stale debt must be detectable as an overpay"
        );
    }
}
