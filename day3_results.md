# ANGEL — Day 3 Results (VERIFIED)

Pyth integration. **15/15 unit tests** (6 new for the price decoder) and **9 new integration tests**
against **real mainnet Pyth accounts**, 23/23 integration overall.

```bash
anchor test     # 23 passing (~2m)
cargo test --manifest-path programs/stock_vault/Cargo.toml   # 15 passing
```

## The question I set out to answer

Your Pyth key authenticates but is scoped to crypto/FX — every equity feed returns
`Not entitled ... requires access to one of the following groups: ["pyth-indices"]`. So before
building anything I needed to know: **can we read these feeds on-chain instead?** On-chain Pyth
accounts are permissionless to read — no key, no entitlement.

### Answer: partly, and the split is decisive

Derivation is `findProgramAddressSync([shardId_u16le, feedId_32bytes], pushOracle)`.

| Feed | On-chain? | Freshness (2026-09-19, Saturday) |
|---|---|---|
| `Crypto.BTC/USD` | ✅ yes (shards 0,1,2) | **3s — live** |
| `Crypto.ETH/USD` | ✅ yes | **5s — live** |
| `Equity.US.AAPL/USD` | ✅ yes (shards 0,1) | 16h — **last print Friday after-hours** |
| `Equity.US.NVDA/USD` | ✅ yes | 16h |
| `Crypto.AAPLX/USD` | ✅ yes (shard 0) | 19h |
| `Equity.Index.AAPL/USD` | ❌ absent | — |
| `Crypto.AAPLON/USD` | ❌ absent | — |
| **`Equity.Index.OPENAI/USD`** | ❌ **absent** | — |
| **`Equity.Index.ANTHROPIC/USD`** | ❌ **absent** | — |

### ⚠️ This corrects C6 in the source-of-truth doc

C6 said to build on OPENAI and ANTHROPIC because "the only two whose underlying Pyth prices 24/7".
**That is not usable.** Those feeds are gated on Hermes *and* have no on-chain account. There is no
permissionless path to them today.

### A correction to my own first read

My initial scan labelled the equity feeds `ABANDONED` at 16h stale. **That was wrong.** It is
Saturday: US equities closed Friday 16:00 ET, and the AAPL account's `publish_time` is the Friday
after-hours print. 16h stale on a Saturday is not abandonment — **it is the weekend gap and nothing
else**, and it is precisely the doc's §2.1 thesis, measurable on-chain for free.

That distinction is the whole Pyth story, so I encoded it rather than describing it.

---

## What was built

```
programs/stock_vault/src/
  pricing.rs   # NEW  PriceUpdateV2 decoder + 6 unit tests
  signal.rs    # NEW  record_signal + SignalRecorded event
  state.rs     # UPD  + Signal, MarketRegime
  error.rs     # UPD  + 5 Pyth errors
```

**`pricing.rs`** — decodes a Pyth `PriceUpdateV2` account with zero Pyth dependencies (the official
receiver SDK pulls an `rpc-websockets` version that breaks the workspace). Layout was determined
empirically from real accounts rather than assumed:

```
discriminator(8) 22f123639d7ef4cd | write_authority(32) | verification_level(1)
feed_id(32) @41 | price i64 @73 | conf u64 @81 | exponent i32 @89
publish_time i64 @93 | prev_publish_time i64 @101 | ema_price @109 | ema_conf @117
posted_slot u64 @125          total = 134 bytes
```

It validates the **discriminator as well as the length**, so a same-owner account of the wrong type
is rejected rather than misread as a price. `age_secs` clamps at zero so a validator with a skewed
clock cannot fabricate negative staleness (which would wrap to a huge `u64`).

**`signal.rs`** — `record_signal(feed_id, max_staleness_secs, frozen_after_secs)` upserts a
`Signal` PDA per (agent, feed). It refuses to run unless the caller supplies an account that is:

1. owned by `rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ` (Pyth receiver),
2. a genuine `PriceUpdateV2` (discriminator check),
3. carrying the **expected feed id**, and
4. within the caller's declared staleness policy.

Then it stores the decoded price plus a `MarketRegime` — `Frozen` when staleness exceeds
`frozen_after_secs`, else `Live`.

**Pyth does real work here rather than decorating a dashboard.** The on-chain record is an
*attestation*: it cannot exist unless real, correctly-identified, policy-compliant oracle data was
supplied. The agent cannot log a market read it didn't actually take.

`max_staleness_secs` is the caller's policy, not a constant, precisely because equity feeds go
*legitimately* stale — on a weekend the correct read is "frozen, last print Friday after-hours", not
"no data". Pass a tight bound to assert liveness, a loose one to record a frozen reference.

---

## Test evidence

### Unit — 6 new, against captured real accounts

Fixtures are real mainnet accounts (`fixtures/*.json` + `.hex`), captured 2026-09-19.

| Test | Proves |
|---|---|
| `decodes_a_real_equity_account` | $334.8159, exponent -5, `publish_time` 1789775997, verification level 1 (fully signed), feed id matches |
| `decodes_a_real_crypto_account` | $81,791.51, exponent -8 |
| `staleness_is_never_negative` | a clock skewed into the past yields 0, not a wrapped `u64` |
| `rejects_a_wrong_owner_type` | a clobbered discriminator is refused |
| `rejects_a_short_account` | 100 bytes and empty both refused |
| `confidence_is_reported_in_bps_and_handles_zero` | conf → bps; no divide-by-zero at price 0 |

### Integration — 9 tests, real Pyth accounts replayed into a local validator

Anchor's `[[test.validator.account]]` loads the real mainnet accounts at genesis, so on-chain reads
are testable without mainnet and without the gated API.

| Test | Proves |
|---|---|
| `the replayed fixtures are genuine Pyth accounts` | owner + 134-byte length asserted first, so the rest can't pass vacuously |
| `decodes a real equity feed on-chain and classifies it as FROZEN` | exact price/exponent/`publish_time`; `stalenessSecs == observedAt - publishTime`; regime `Frozen` |
| `decodes a real crypto feed on-chain` | $81,791.51 from the real account |
| `classifies as LIVE under a loose frozen threshold` | regime branch flips on policy, not on data |
| `refuses a price outside the caller's staleness policy` | `StalePrice` |
| `refuses a Pyth account carrying a different feed id` | `PythFeedIdMismatch` — hands it the BTC account while asking for AAPL |
| `refuses an account not owned by the Pyth receiver` | `PythAccountOwnerMismatch` |
| `upserts: a second read overwrites the stored signal` | `observedAt` advances, price stable |
| `rejects a signal from someone who is neither creator nor agent signer` | `Unauthorized` |

---

## A real bug the tests caught

`value_at_exponent` had the scaling **inverted**. I wrote `diff = target - exponent` where it must be
`exponent - target`, since `X * 10^target == price * 10^exponent` implies
`X = price * 10^(exponent - target)`.

The test expected $334.8159 rescaled to exponent -4 → 3,348,159 and got 334,815,900 — a **100×
error**. A 100× mispricing in a vault's NAV would be a serious bug, and it is exactly the kind of
thing that reads as correct in review. Now asserted at four exponents including the identity.

---

## Environment notes

- **`[test.validator]` + agave 3.1.15 panics**: `UnspecifiedIpAddr(0.0.0.0)` in
  `gossip/src/node.rs`. Anchor defaults the bind address to `0.0.0.0` once a `[test.validator]`
  section exists, and this agave build rejects it for gossip. Fixed with
  `bind_address = "127.0.0.1"`.
- **Fixture format** for `[[test.validator.account]]` is the `solana account --output json` shape:
  `{"pubkey": "...", "account": {lamports, data:[b64,"base64"], owner, executable, rentEpoch}}`.
  Verified loaded via RPC before trusting the tests.
- **The official `@pythnetwork/pyth-solana-receiver` SDK breaks this workspace** — it drags in an
  `rpc-websockets` version whose `exports` map breaks under ESM
  (`ERR_PACKAGE_PATH_NOT_EXPORTED: ./dist/lib/client`). I extracted the PDA derivation (12 lines)
  and dropped the dependency.

---

## What this means for the plan

**No Pyth equity data is available to us today** except `Equity.US.*`, which is correct only during
business hours. So the Pyth integration is **not** the OPENAI/ANTHROPIC arb trigger C6 promised. It
is:

1. **The regime oracle** — `MarketRegime` from `publish_time` staleness. The agent deploys
   mean-reversion capital when the reference market is *frozen*, because that is precisely when
   on-chain stock-token prices detach.
2. **An on-chain attestation layer** — no trade signal can be recorded without real oracle data
   behind it.
3. **USD valuation** for the vault and for the PreStock premium surfaces.

The PreStocks arb trigger itself remains the **PreStocks-internal mark-vs-DEX basis**, which is real
and large (SPACEX +25.6%, NEURALINK −19.5%, OPENAI −12.7%).

**Upgrade path:** if Pyth grants `pyth-indices`, add `Equity.Index.OPENAI/USD` and
`Equity.Index.ANTHROPIC/USD` through exactly this `record_signal` path — the code already takes the
feed id as a parameter, so it is a config change, not a rewrite. Worth still asking Pyth; just no
longer on the critical path.
