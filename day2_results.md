# ANGEL — Day 2 Results (VERIFIED)

`AgentRegistry` + `DividendVault` + the reward accumulator. **9/9 unit tests** and **7/7 new
integration tests** green (14/14 integration overall, including Day 1's wrapper suite).

```bash
anchor test     # 14 passing (~1m)  — 7 wrapper + 7 vault
cargo test --manifest-path programs/stock_vault/Cargo.toml   # 9 passing — accumulator maths
```

## What was built

```
programs/stock_vault/src/
  accum.rs      # NEW  pure accumulator maths + 9 unit tests
  registry.rs   # NEW  Agent + register_agent
  vault.rs      # NEW  initialize_vault, stake, unstake, claim, deposit_rewards
  state.rs      # UPD  + Agent, DividendVault, UserStake
  error.rs      # UPD  renamed WrapperError -> AngelError, + vault errors
```

Program grew to 498 KB (from 316 KB) → devnet deploy is now **~3.47 SOL**, up from ~2.20.

---

## The design decision that matters: stream, don't drop

The source-of-truth doc specifies the standard lump-sum accumulator:

```
acc += ΔEquityDeposit × 1e12 / totalStaked
```

That is exploitable, and not in a subtle way. A lump-sum deposit is credited instantly against
whatever `totalStaked` happens to be at that moment, so **anyone who stakes immediately before a
deposit captures a pro-rata share of it.** Stake 1M tokens one slot before a 1,000-token deposit and
you take ~all of it, having held for one slot. The doc's `last_deposit_slot` lock is the patch, but a
lock only sets a price on the attack — it doesn't remove the profit.

So rewards are **streamed over a duration** instead (Synthetix `StakingRewards` shape):

```
deposit(amount, duration)  ->  reward_rate = (reward_reserve + amount) / duration
per slot                   ->  payout = min(reward_rate, reward_reserve)
                               acc += payout × 1e12 / totalStaked
```

Three properties fall out, all tested:

1. **Yield is paid for time held.** Stake one slot before a deposit and you earn one slot's worth —
   with a 1,000-slot stream, 0.05% of the deposit instead of 100% of it.
2. **The vault is solvent by construction.** `payout` is capped at `reward_reserve` on every step,
   so `acc` can never be advanced by more than the vault holds. No solvency invariant is needed in
   `claim` — but there's one there anyway, because I don't want a future edit to break it silently.
3. **This *is* the doc's "duration-weighted yield"**, literally, with no per-user bookkeeping.

The doc's `acc_reward_per_share` / `last_update_slot` fields are kept; the stream adds `reward_rate`,
`reward_reserve`, `total_distributed` and `min_hold_slots`. It's a superset of the spec, not a
replacement. The hold lock is retained as defence in depth, and made configurable per vault
(`min_hold_slots`) so agents can tune it and so tests can run fast.

### `UserStake.accrued` is load-bearing

`stake` and `unstake` both call `settle_user` **before** mutating the balance, moving earned rewards
into `accrued` and recomputing `reward_debt` against the **new** total. Without that, topping up a
position would silently forfeit everything accrued so far. There's a test for each direction.

---

## Test evidence

### Unit (`accum.rs`) — 9 tests

| Test | Proves |
|---|---|
| `nobody_staked_means_reserve_is_untouched` | the stream *pauses* with no stakers instead of burning the reserve |
| `payout_is_capped_at_the_reserve` | asks for 100,000 against a 5,000 reserve → pays 5,000 |
| `holding_for_the_full_duration_earns_the_whole_stream` | full-duration holder gets the deposit minus dust |
| `rewards_are_duration_weighted` | early holder earns >5× a late entrant of the same size |
| `two_holders_are_paid_in_proportion_to_stake` | 3× stake → 3× rewards |
| `accumulator_agrees_with_the_independent_naive_model` | matches a **separate** carry-based pro-rata model across 5 parameter sets |
| `stake_mid_stream_neither_forfeits_nor_duplicates_rewards` | exact conservation: `accrued + later == reserve` |
| `stale_debt_would_overpay` | guard-the-guard: proves the previous test is load-bearing |
| `payout_is_capped_at_the_reserve` etc. | solvency bound `sum(payouts) ≤ reserve` in every case |

The independent model is worth a note. My first version of it floored `payout × stake / total` per
slot with no remainder carry, and it diverged from the accumulator by ~70,000 units on one case —
because flooring loses up to 1 unit per holder per slot. That wasn't a disagreement, it was the
naive model's own rounding error. Fixed by carrying remainders so the reference model distributes
each slot's payout *exactly*; the accumulator then lands just below it, by at most one unit per step.

### Integration (`tests/vault.ts`) — 7 tests

| Test | Proves |
|---|---|
| `streams rewards to a staker over the deposit duration` | full lifecycle; `totalDistributed` matches what the holder received; reserve ends at 0 |
| `pays for TIME HELD — a late staker earns far less` | early >3× late across two independent claim txs; combined claims ≤ deposit |
| `blocks a stake-then-claim flash loan via the hold window` | `StakeLocked` in the next slot, succeeds after the window |
| `keeps accrued rewards when a holder adds stake mid-stream` | `accrued > 0` after a top-up |
| `lets a holder unstake and still claim what they already earned` | principal returned **and** rewards survive unstaking |
| `rejects reward deposits from anyone but the creator or agent signer` | `Unauthorized` |
| `refuses a claim when nothing has accrued` | `NothingToClaim` |

---

## Two real bugs the tests caught

**1. Wrong PDA seeds in `claim`.** I signed the vault PDA with
`[b"vault", reward_mint]`, but it's seeded by the **staking** mint
(`[b"vault", agent_token_mint]`). Every claim failed with
*"Could not create program address with signer seeds: Provided seeds do not result in a valid
address"*. This is exactly the class of bug that only a real on-chain run finds — it compiles, it
looks right, and the unit tests can't see it.

**2. A stale-debt windfall — in my test, not the program.** My first conservation test recomputed
`reward_debt` against the *old* stake total, which over-distributed the reserve
(`500,000 + 1,000,000 = 1,500,000` against a 1,000,000 reserve). The program was right; the test's
model was wrong. Rewriting it to follow the real flow (settle → resize → recompute debt against the
new total) yields exact conservation, `accrued + later == reserve`. I kept the broken variant as
`stale_debt_would_overpay` so the fixed test can't quietly stop testing anything.

---

## Status

- **Day 2 — `DividendVault` + registry:** ✅ done
- Wrapper, registry and vault are all in one program, all green, no build warnings.
- Next: **Day 3 — Pyth**, promoted to the critical path. Two open items: the API key is scoped to
  crypto/FX only (all equity/index feeds gated behind `pyth-indices`), and reading Pyth price
  accounts on-chain is permissionless and may sidestep the key entirely. Settling that first.
- Devnet deploy still pending SOL — now **~3.47 SOL** for the larger program (was 2.20).
