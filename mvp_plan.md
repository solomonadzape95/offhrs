# ANGEL — MVP Plan (verified, 6 days)

Deadline **Fri 25 Sep 2026, 16:00 ET**. Today is **Sat 19 Sep**. Working backward from a submitted
project, not forward from a wishlist.

Companion docs: `angel_source_of_truth.md` (spec + corrections), `stocklana_bounty_verification.md`
(bounty evidence), `day0_results.md` (on-chain proof).

---

## 0. What Day 0 already settled

`experiments/day0-quote-mint.ts` and `experiments/day0-pool.ts` both run green on devnet.

- Raw PreStock as a DBC quote mint is **impossible** — program error `6081 QuoteMintHasNonZeroTransferFee`.
- A 0-fee classic **SPL wrapper** works — pool created, buy swap executed.
- **Fees accrue in the stock quote asset** (0.1 in → 0.095 reserve = 5% fee). §6 Stream A is real.
- 6 integration gotchas documented so we don't re-hit them.

**So the architecture is no longer a hypothesis:**

```
PreStock ──wrap──► wPreStock ──quote mint──► Meteora DBC  ──fees──► DividendVault ──► stakers
   (Token-2022)     (0-fee SPL)              ($AGENT/wStock)         (wPreStock)      (wPreStock)
        ▲                                                                                │
        └──────────────────── unwrap (fee paid once) ────────────────────────────────────┘
```

---

## 1. How I will mint the wrapped PreStock (the asked-about piece)

### 1.1 Two-phase: mock now, real later

**Real PreStocks exist only on mainnet** (verified: `getAccountInfo` for the SPACEX mint on devnet
returns `null`). Devnet testing therefore needs a **faithful mock** — the Day-0 experiment already
created the right one:

| Mock mint | Extensions | Purpose |
|---|---|---|
| `mock PreStock` | Token-2022, `TransferFeeConfig` 50bps, `PermanentDelegate`, `DefaultAccountState` | stands in for SPACEX/OPENAI |
| `wMOCK` | classic SPL, 0 fee | stands in for `wSPACEX`/`wOPENAI` |

Promote to the real mints on mainnet at day 5, reusing identical code paths.

### 1.2 The wrapper program: `programs/stock_vault`

One Anchor program, three modules. **Not three programs** — 6 days, and one well-structured program
beats three half-built ones.

```
programs/stock_vault/src/
  lib.rs        # entrypoints
  state.rs      # WrapperConfig, DividendVault, UserStake, Agent
  wrapper.rs    # initialize_wrapper, wrap, unwrap
  vault.rs      # deposit_rewards, stake, unstake, claim
  accum.rs      # per-share accumulator math + unit tests
  pricing.rs    # scaledUiAmount-aware PreStock valuation (read-only helper)
```

```rust
#[account]
pub struct WrapperConfig {
    pub prestock_mint: Pubkey,   // Token-2022 (SPACEX / OPENAI)
    pub wrapped_mint: Pubkey,    // classic SPL, mint authority = wrapper PDA
    pub reserve: Pubkey,         // PDA-owned token account holding raw PreStock
    pub prestock_decimals: u8,   // 9
    pub wrapped_decimals: u8,    // 9  (1:1 at RAW amount level — see 1.4)
    pub bump: u8,
    pub paused: bool,            // our circuit breaker, mirrors PreStocks' pausableConfig
}
```

### 1.3 `wrap` — the one instruction that must be exactly right

```
1. reserve_before = reserve.amount            (reload)
2. transfer_checked(prestock, user_ata -> reserve, amount, 9)   // PreStock charges its fee here
3. reserve.reload(); received = reserve.amount - reserve_before
4. mint_to(wrapped_mint, user_wrapped_ata, received)            // ◄── delta, NOT amount
5. assert_eq!(wrapped_mint.supply, reserve.amount)              // invariant
6. emit Wrapped(user, amount_requested, received, fee_paid)
```

**Step 3→4 is the whole point.** Sending 100 PreStock delivers 99. Minting `amount` instead of
`received` would silently create 1% of unbacked supply *per wrap* and break the peg. Day-0 confirmed
the fee is live (`withheldAmount: 114` on the SPACEX mint).

`unwrap` is the mirror: `burn(wrapped, amount)` → `transfer_checked(reserve -> user, amount)` → the
user receives `amount − fee`; assert the invariant.

### 1.4 Decisions I'm making now, with reasons

| Decision | Choice | Why |
|---|---|---|
| Backing unit | **1:1 at the RAW amount level** | The wrapper is transparent to `scaledUiAmount`. If we baked a multiplier in, the SPACEX multiplier changing 1→5 would instantly mis-back every wrapper in existence. Apply the multiplier in the **pricing layer** only. |
| Mint program | **classic SPL Token** | Token-2022 is what got us into this. Classic SPL quote mints are always DBC-permissionless. |
| Mint authority | wrapper program PDA | Only the wrapper can mint, so supply can never drift from the reserve. |
| Freeze authority | none | No reason to have one; reduces trust surface. |
| `paused` flag | mirror PreStocks' | `pausableConfig` means PreStocks can halt transfers. We surface it instead of failing opaquely. |
| Invariant strictness | assert equality in our own ixs; **expose `bad_debt()` read** | `permanentDelegate` lets PreStocks move the reserve out. A hard assert everywhere would let them *brick* the program. Read-only deficit reporting is the honest design. |

### 1.5 Test that proves it (day 1, devnet)

```
wrap(100e9)  -> user receives 99e9 wMOCK   (50bps),  invariant holds
unwrap(99e9) -> user receives 98.505e9     (50bps again)
wrap(100e9) with a 0-fee mock -> user receives 100e9 exactly   (delta path correct)
invariant fuzz: wrap/unwrap at odd amounts, dust, and full-balance
```

The third case is the one that catches a wrong implementation — if I'd used `amount`, the 0-fee test
would still pass and the fee test would over-mint. Testing both is what makes the delta path
verifiable.

### 1.6 Then the DBC pool is three calls

Already proven end to end in `experiments/day0-pool.ts`:

```ts
createConfig({ quoteMint: wPreStock, ...curve() })        // permissionless, tokenBadge: null
Keypair.generate()                                        // DBC creates the base mint
createPool({ baseMint, config, name, symbol, uri })       // base mint co-signs
```

---

## 2. Day-by-day

### Day 0 — DONE ✅
Derisked C1 on devnet. Constraint matrix + full pool + swap. Gotchas recorded. **Nothing about the
architecture is still assumed.**

### Day 1 — `stock_vault` wrapper ✅ **DONE**

Evidence: `day1_results.md`. **7/7 tests green** (`anchor test`) against Token-2022 mock PreStocks
carrying a real transfer fee.

- `WrapperConfig`, `initialize_wrapper`, `wrap`, `unwrap`, `set_paused`.
- Delta-based minting, invariant assertion (`supply == reserve`), `Wrapped`/`Unwrapped`/`PauseChanged` events.
- Transparency counters so the UI shows the real PreStock-fee cost instead of hiding it.
- **Exit met:** 50bps → 100 in / **99.5** out; 100bps → 99 out; 0-fee → exactly 1:1;
  unwrap drains supply and reserve together; non-Token-2022 PreStock rejected.
- **Blocked (non-critical):** devnet deploy needs SOL (see Day 2/4 — the figure grew with the
  program). Faucet `Duzj6WGukxjCesWCEM6uTxZEf6Dhc8LfRGzS6o8xR4HQ` at
  <https://faucet.solana.com>. The local validator has been sufficient for every day so far.
- **Env gotcha:** `anchor build` fails machine-wide on the CLT SDK/linker mismatch — fixed with an
  `SDKROOT` pin in `.cargo/config.toml`. See `day1_results.md`.

### Day 2 — `DividendVault` + registry ✅ **DONE**

Evidence: `day2_results.md`. **9/9 unit + 7/7 integration** (14/14 integration overall).

- `Agent` + `register_agent`; `DividendVault` + `initialize_vault`; `stake`/`unstake`/`claim`/`deposit_rewards`.
- **Rewards are time-streamed, not lump-sum.** The doc's formula as written lets anyone who stakes
  immediately before a deposit capture a pro-rata share of it; streaming pays for time held and makes
  the vault solvent by construction (`payout` capped at `reward_reserve` every step).
- `min_hold_slots` retention lock kept as defence in depth.
- `UserStake.accrued` so `stake`/`unstake` never forfeit or double-count accrued rewards.
- **Exit met:** deposit → accrue → claim; matches an independent naive model; flash-loan blocked;
  exact conservation (`accrued + later == reserve`).
- **Two real bugs caught by tests:** wrong PDA seeds in `claim` (signed with the reward mint instead
  of the staking mint), and a stale-debt overpay in my own test model.
- **Devnet deploy grows with the program:** 316 KB (~2.20 SOL) -> 498 KB (~3.47) -> **555 KB (~3.86 SOL)**.

### Day 3 — Pyth ✅ **DONE (re-scoped)**

Evidence: `day3_results.md`. **6 new unit tests + 9 new integration tests**, 23/23 integration overall.

- **Settled the gating question empirically.** `Equity.Index.OPENAI/USD` and
  `Equity.Index.ANTHROPIC/USD` are gated on Hermes **and absent on-chain** → no permissionless path.
  `Equity.US.AAPL/USD` and `Crypto.AAPLX/USD` **do** exist on-chain and are readable with a plain
  `getAccountInfo` — no key, no entitlement.
- **Correction to my own first read:** 16h-stale AAPL on a Saturday is **not** an abandoned feed, it
  is the weekend gap. That distinction is the thesis, so it got encoded rather than described.
- **Built:** `pricing.rs` (134-byte `PriceUpdateV2` decoder, zero Pyth dependencies) and `signal.rs`
  (`record_signal` → `Signal` + `MarketRegime`), plus 5 Pyth errors.
- **Pyth does real work:** `record_signal` refuses unless the account is Pyth-owned, a genuine
  `PriceUpdateV2`, the expected feed id, and inside the caller's staleness policy. The on-chain
  record is an attestation, not a claim.
- **Real Pyth accounts replayed into the local validator** via `[[test.validator.account]]`, so
  on-chain reads are tested against genuine mainnet data.
- **Re-scope:** the PreStocks arb trigger is the **PreStocks-internal mark-vs-DEX basis**, not Pyth.
  Pyth supplies regime + attestation + USD valuation. Upgrade path documented if `pyth-indices`
  is granted (config change, not a rewrite).
- **Bug caught:** `value_at_exponent` scaled the wrong way — a 100× NAV error that read as correct.

### Day 4 — Clawpump agent ✅ **DONE**

Evidence: `day4_results.md`. **7 new integration tests**, 30/30 integration + 15/15 unit.

- **On-chain:** `ArbExecution` + `log_arb`. Requires a `Signal` account and **copies** the oracle
  fields onto the record, so an execution cannot be fabricated without real Pyth data behind it.
  `profit` derived on-chain; index must match the agent counter.
- **Off-chain:** the agent runtime — `snapshot -> decide -> attest -> execute -> log`.
- **Execution behind a swappable adapter** (`dryrun | jupiter | clawpump`) because the Clawpump
  question is still open. Whichever way it resolves, only `execution.ts` changes.
- **Live signals** (reference FROZEN, Friday after-hours): SPACEX +2433bps → buy, NEURALINK −1905 →
  sell, OPENAI −1305 → sell, ANTHROPIC +119 → hold. No simulation.
- **Correction found by running it:** a *crypto* reference feed can never report `frozen`; the regime
  needs an *equity* clock. Default changed to `Equity.US.AAPL/USD`.
- ⚠️ **Not verified:** the `ClawpumpAdapter` is written against their documented MCP surface but I
  have no API key, so the JSON-RPC envelope is a well-formed guess. `--execute` does the real
  `record_signal` + `log_arb` writes; swap send is Day 5 wiring.

### Day 5 — Frontend ✅ **DONE** (mainnet deferred)

Evidence: `day5_results.md`. All routes build and render; every figure is live.

- **Built in Nebula's visual language** — same palette, zero radius, halftone dither, dithered
  display figures. Self-hosted Satoshi + Geist Pixel.
- **All five §8 screens:** `/`, `/explore`, `/agent/[id]`, `/launch`, `/portfolio`.
- **Real data only:** PreStocks API + live Jupiter quote + on-chain Pyth read. No simulation.
- **Bug caught by reading the render:** the mark is quoted *unscaled* while the market price carries
  the `scaledUiAmount` multiplier, so the panel showed `Gap -74.77%` next to `+2433bps below mark` —
  the same fact with opposite signs. Fixed by reconciling units; both now read ~+24.5%.
- **Build fixes:** Turbopack root must be the pnpm workspace root (hoisted symlinks); fonts
  self-hosted after a Google 429; upstream reads de-duplicated (static generation 21.5s -> **3.1s**).
- **Honest state:** agent records are seeded and marked PREVIEW; portfolio balances are em dashes
  rather than invented numbers; disabled buttons are labelled as unwired.
- **Deferred:** mainnet mint of the real `wSPACEX`/`wOPENAI` (still needs ~3.86 SOL), wallet connect,
  swap signing, and DBC pool creation from `/launch`.

### Day 6 — App surfaces (wallet, dashboard, signing, launch) ✅ **DONE**

Evidence: `day6_results.md`. All 11 routes build and serve; typecheck clean.

- **Wallet connection** — framework-kit with Wallet Standard discovery; `/connect` panel, header
  `ProfileMenu`, `isReady` respected so nothing flashes before discovery.
- **Dashboard shell** at `/dashboard` with Position / Activity / Agents / Profile tabs.
- **Swap signing is live** — real Jupiter route, real v0 transaction, signed by the wallet session.
  Decode verified by `web/scripts/swap-check.ts`.
- **Launch preflight** checks the four on-chain prerequisites and names the one that fails; the
  **curve config is computed by Meteora's own SDK**, not described.
- **Honest empty states everywhere** — em dashes with an explanation, rather than invented balances.
- **Bug caught:** the dashboard rendered *two headers* because the marketing nav sat in the root
  layout. Fixed with a `(site)` route group.
- **Still blocked:** the program deploy (~3.86 SOL), which is upstream of every dashboard number and
  of the actual deploy transaction.

### Day 7 — Demo + submission
- End-to-end: launch agent → buy on the curve → weekend arb fires on a Pyth divergence → dividend
  accrues → claim wPreStock → unwrap to real PreStock.
- Record video, push GitHub, write the submission, name the open-source components.
- **Submit well before Fri 25 Sep 16:00 ET.**

---

## 3. Send these today (blocking, external)

1. **Clawpump** — *(resolved 21 Sep)* they confirmed a custom-pair launch that starts on **Meteora
   DBC** and graduates to **DAMM v2**, with Clawpump managing fee distribution, and that one
   submission can enter both the Clawpump and Meteora tracks. The remaining questions are
   operational: is the DBC quote mint our `wPreStock`, do fees accrue there and get paid to us **in
   `wPreStock`**, and who owns the curve config. None of it blocks the build — only the final vault
   wiring.
2. **Meteora** — we hit `QuoteMintHasNonZeroTransferFee` on the real PreStock mints. Confirm there is
   no path for a non-zero transfer fee (we believe there isn't: `token.rs:232`). Confirm a wrapped
   0-fee SPL quote mint is acceptable for the bounty.
3. **PreStocks** — would they zero `transfer_fee_basis_points` for a dedicated path? (Note: not
   sufficient alone — `permanentDelegate` et al. would *also* need a Meteora token badge. The wrapper
   needs neither.) Also: can we get a `markPrice` feed more frequently than the business-day mark?
4. **Pyth** — *(resolved)* on-chain reads need no key. Still worth requesting `pyth-indices` to add
   `Equity.Index.OPENAI/ANTHROPIC`; it is a config change, not a rewrite.

---

## 4. Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| C1 | PreStock can't be a DBC quote mint | ~~fatal~~ **resolved** | Wrapper — proven on devnet |
| C2 | ~~Clawpump requirement excludes our DBC pool~~ | ~~high~~ **resolved** | Clawpump launches the token on Meteora **DBC** with a custom pair and graduates to DAMM v2. One token, both tracks. Residual: confirm the quote mint is `wPreStock` and our fee share is paid **in `wPreStock`** |
| C3 | `scaledUiAmount` multiplier changes mid-hackathon | medium | Never bake it in; 1:1 raw wrapper + pricing-layer multiplier |
| C4 | Transfer fee rises 0.5%→1% at epoch 1039 (~2 days) | medium | Delta-minting handles any rate; disclose the number in the UI |
| C5 | PreStocks pause transfers / use `permanentDelegate` | medium | `paused` mirror + `bad_debt()` view + disclosure |
| C6 | Mainnet wallet has 0 SOL | medium | Fund on day 5. Devnet deploy also needs ~3.86 SOL |
| C7 | Pyth endpoints return `unauthorized` | medium | API key day 0–3, else on-chain receiver accounts |
| C8 | 6 days is short | **high** | Fixed scope: 1 program, 3 screens. Cut `/launch` before cutting the demo journey |

---

## 5. Scope fence (say no to these)

- ❌ Any non-PreStocks pre-IPO token (Tessera, xStocks, Ondo, Backpack) — forfeits the $10k.
- ❌ Cross-issuer SpaceX arbitrage — same reason.
- ❌ Three separate Anchor programs — one program, three modules.
- ❌ `dbc_adapter` program — DBC needs the SDK + a crank, not a program.
- ❌ A custom frontend design system — Jupiter/Backpack patterns, shipped.
- ❌ Real dividend *buys* if time runs out — seed the vault manually so the claim path is still real.
