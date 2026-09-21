# Angel (System Specification)

## 1. Executive Summary

**One-Sentence Description:** An autonomous marketplace where quantitative creators launch AI trading agents that arbitrage pre-IPO tech stocks 24/7, streaming both trading profits and dynamic bonding-curve fees directly to token holders as real, accumulating shares of SpaceX and OpenAI.

---

> **⚠️ New session? Read `AGENTS.md` first.** It is the entry point: current status, commands,
> environment gotchas, and the rename from Angel to Offhours.

## 1A. ⚠️ VERIFIED CONSTRAINTS — READ BEFORE BUILDING

> Verified against live primary sources on **Sat 19 Sep 2026**. Hackathon deadline is
> **Fri 25 Sep 2026, 16:00 ET — roughly 6 days.**
> Companion file with full evidence: `stocklana_bounty_verification.md`.
>
> **This section overrides anything later in this document that contradicts it.**

### Bounty decision

| Bounty | Prize | Verdict |
|---|---|---|
| Main track (Solana Foundation) | $100,000 | ✅ Enter |
| PreStocks | $10,000 ($5k/$3k/$2k) | ✅ Core |
| Meteora DBC | $5,000 | ✅ Core |
| Clawpump | $5,000 ($3k/$1.5k/$500) | ✅ Core |
| Pyth | 3 months Pyth Pro (non-cash) | ✅ Add — now central, see C6 |
| Tessera | $6,000 | ❌ **DROP** — see C10 |

---

### 🔴 C1 — PreStocks can NEVER be a Meteora DBC quote mint

**The single biggest constraint. It invalidates §3.2–3.4, §5 `Quote Asset`, and the §6 flow of
funds diagram as originally written.**

Meteora DBC rules (`docs.meteora.ag/core-products/dbc/token-2022-support.md`):

1. *"Token 2022 quote assets are permissionless only when the mint uses metadata-related
   extensions and has a zero transfer fee."*
2. *"A badge does not allow a non-zero transfer fee. Current and any scheduled
   `transfer_fee_basis_points` must be `0`."* Enforced at badge creation, config creation,
   pool creation, and **on every instruction that transfers quote tokens**.

On-chain facts for the PreStock mints (`PreANx…` SPACEX, `PreweJ…` OPENAI):

| Extension | State | Effect on DBC |
|---|---|---|
| `transferFeeConfig` | **50 bps now → 100 bps at epoch 1039** (current epoch 1038) | ❌ fatal |
| `permanentDelegate` | `WV9PJ…` | ❌ outside permissionless allowlist |
| `pausableConfig` | `paused: false` | ❌ outside allowlist |
| `scaledUiAmountConfig` | multiplier 5 (SPACEX), 1.4861347 (OPENAI) | ❌ outside allowlist |
| `confidentialTransferMint`, `confidentialTransferFeeConfig` | present | ❌ outside allowlist |
| `defaultAccountState` | `initialized` | ❌ outside allowlist |
| `transferHook` | `programId: null` | benign (no hook program) |

Only **Metadata Pointer + Token Metadata** qualify for the permissionless path. PreStocks are far
outside it, **and** the zero-fee requirement is absolute — so this is not a coordination problem
we can escalate away. Note Meteora's docs say the badge path *"is the path used for Stock
Tokens"*; the 1% fee is what disqualifies PreStocks specifically.

**Important nuance:** this is **DBC-specific**. PreStocks trade fine in Meteora **DLMM/DAMM**
(confirmed: a SPACEX→USDC Jupiter route executes through Meteora DLMM). Only DBC validates the
quote mint this strictly.

**⇒ FIX: build a wrapped PreStock and use the wrapper as the DBC quote mint.**

- Mint a **zero-fee classic SPL Token** `wSPACEX` / `wOPENAI`, 1:1 backed by PreStock held in a
  program-owned vault. SPL quote mints are *always* permissionless → no Meteora dependency, no
  PreStocks dependency, no badge.
- Cost: the PreStock transfer fee is paid **once** on wrap and **once** on unwrap. Route all
  stock movement through the wrapper so it is paid at the boundary only.
- This is not a hack — it is a legitimate infrastructure contribution and a strong pitch for the
  PreStocks bounty (*"new ways to trade or use them through derivatives or DeFi integrations"*):
  PreStocks are currently **unusable as a DBC quote asset**, and this makes them usable.
- Fallback if cut for time: DBC quotes SOL/USDC and the vault buys PreStocks post-hoc. Keeps 3 of
  4 bounties coherent but forfeits "stock-paired" for the Clawpump requirement.

**Invariant to enforce in code: `total_supply(wPreStock) == PreStock balance of wrapper reserve`.**
Mint only against measured reserve delta (see C4).

---

### 🔴 C2 — Clawpump cannot launch a Meteora DBC pool

Clawpump's bounty text is *"Launch your token with a stock-paired liquidity pool using clawpump
and Meteora."* Verified Clawpump surface: `POST /api/v1/launch`,
`/api/v1/launch/self-funded`, `/api/v1/launch/pons`; CLI `npx clawpump launch --paid`; MCP at
`https://clawpump.tech/api/mcp`. Its only launch paths are `launch_token` (**pump.fun**),
`launch_token_self_funded`, `launch_metaplex_genesis_token`, `launch_pons` (Robinhood Chain).

**There is no Meteora DBC launch and no custom-quote-mint option.** Meteora appears only in
Clawpump's tracked DeFi protocol list. Clawpump's fee split (75% agent / 25% platform) is collected
from **pump.fun creator vaults**, so a DBC launch earns nothing through its rails.

**⇒ Compose instead:** Clawpump = agent identity, wallet, execution, and (optionally) the $AGENT
token launch. We create the stock-paired DBC pool ourselves with
`@meteora-ag/dynamic-bonding-curve-sdk`. **Ask Clawpump to confirm this satisfies the requirement —
highest-priority clarification.**

---

### 🔴 C3 — `scaledUiAmount` multiplier: naive price reads are wrong by 5×

PreStocks mints carry a mutable Token-2022 `scaledUiAmountConfig`:

| Symbol | multiplier | effective |
|---|---|---|
| SPACEX | 1 → **5** | 2026-06-10 |
| OPENAI | 1 → **1.4861347** | 2026-07-17 |

Live proof:

- PreStocks API `tokenPrice` SPACEX = `121.82`; live Jupiter quote 1 SPACEX → USDC = **$606.04**.
  `606.04 / 121.82 = 4.975 ≈ 5` ✅
- OpenAI: API `tokenPrice` `1128.50`; live DEX quote **$1678.50**. `1678.50 / 1128.50 = 1.4874` ✅
- Jupiter's `usdPrice` (121.82) is the **raw/unscaled** price. The PreStocks API also reports
  **unscaled** prices.

**⇒ All valuation and vault accounting must read the multiplier off the mint** and must tolerate it
changing (it is effectively a corporate action / split — a real story for the Pyth/infra angle).
Premium % is multiplier-invariant, so the basis numbers below stay valid.

---

### 🟠 C4 — Every PreStock transfer costs 0.5% now, 1% from epoch 1039

`transferFeeConfig`: `olderTransferFee` 50 bps, `newerTransferFee` 100 bps at epoch 1039
(current epoch **1038**). `maximumFee = u64::MAX` → uncapped. The mint already shows
`withheldAmount: 114`.

Consequences and required handling:

- **Mint against measured balance delta, never the requested amount.** Sending 100 PreStock
  delivers 99 to the vault, so `wrap` must credit exactly what arrived. Same on the way out.
- **Distribute `wPreStock`, not raw PreStock**, so dividend claims do not burn the fee each time.
  Users pay it once if and when they unwrap.
- Round-tripping raw PreStock costs ~3% (0.5% in + 0.5% out today). Disclose it.
- The fee is *rising* — do not assume it will be removed.

### 🟠 C5 — PreStocks can freeze the agent and seize the vault

- `pausableConfig` → PreStocks can **pause all transfers**, halting the agent and blocking every
  vault payout mid-flight.
- `permanentDelegate` = `WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc` → PreStocks can **move or
  burn any holder's tokens, including the vault's reserve**.

**⇒ Must be handled explicitly (fail gracefully + surface in the UI) and disclosed.** Do not build
as if the reserve is unconditionally safe.

---

### 🟢 C6 — Pyth: CENTRAL, but NOT via the OPENAI/ANTHROPIC index feeds

> **⚠️ CORRECTED ON DAY 3.** The original C6 said to build on OPENAI and ANTHROPIC because Pyth
> prices them 24/7. **That is not usable.** Verified on-chain (`experiments/day3-scan-freshness.ts`):
> both `Equity.Index.OPENAI/USD` and `Equity.Index.ANTHROPIC/USD` are **gated on Hermes**
> (`pyth-indices`) **and have no account on-chain at all**. There is no permissionless path to them
> today. See `day3_results.md`.
>
> **What IS reachable, permissionlessly, with no API key:**
>
> | Feed | On-chain | Freshness (Sat 19 Sep 2026) |
> |---|---|---|
> | `Crypto.BTC/USD`, `Crypto.ETH/USD` | ✅ shards 0-2 | **3-5s — live** |
> | `Equity.US.AAPL/USD`, `Equity.US.NVDA/USD` | ✅ shards 0,1 | 16h — **last print Friday after-hours** |
> | `Crypto.AAPLX/USD` | ✅ shard 0 | 19h |
> | `Equity.Index.*`, `Crypto.AAPLON/USD` | ❌ absent | — |
>
> **A 16h-stale equity feed on a Saturday is not a broken feed — it IS the weekend gap.** That is
> §2.1's thesis, measurable for free from `publish_time`.
>
> **⇒ What Pyth does for Angel, in priority order:**
> 1. **The regime oracle.** `Signal`/`MarketRegime` is derived from `publish_time` staleness. The
>    agent deploys mean-reversion capital when the reference market is *frozen*, because that is when
>    on-chain stock-token prices detach. (`programs/stock_vault/src/signal.rs`)
> 2. **An on-chain attestation layer.** `record_signal` refuses to run unless given an account owned
>    by the Pyth receiver, of the right type, carrying the expected feed id, inside the caller's
>    staleness policy. No trade signal can be recorded without real oracle data behind it.
> 3. **USD valuation** for the vault and the PreStock premium surfaces.
>
> **The PreStocks arb trigger is therefore NOT Pyth** — it is the **PreStocks-internal
> mark-vs-DEX basis**, which is real and large (below). Pyth supplies the regime and the valuation.
>
> **Upgrade path:** if Pyth grants `pyth-indices`, add `Equity.Index.OPENAI/USD` and
> `Equity.Index.ANTHROPIC/USD` through this same `record_signal` path — the feed id is already a
> parameter, so it is a config change, not a rewrite. Worth asking; not on the critical path.

Feed listing (`hermes.pyth.network/v2/price_feeds`, public — listing is open, *prices* are gated):

| Feed | Type | `market_hours.is_open` (Sat) | Schedule |
|---|---|---|---|
| `Equity.US.AAPL/USD` | Equity | **false** | `America/New_York;0930-1600,…` |
| `Equity.Index.AAPL/USD` | Equity | true | `America/New_York;O,O,O,O,O,O,O` |
| `Crypto.AAPLX/USD` (xStock) | Crypto | true | 24/7 |
| `Crypto.AAPLON/USD` (Ondo) | Crypto | — | — |
| `Equity.Index.OPENAI/USD` | Equity | true | **gated + absent on-chain** |
| `Equity.Index.ANTHROPIC/USD` | Equity | true | **gated + absent on-chain** |

1,243 equity-type feeds total. **No SPACEX or NEURALINK feed exists.**

**Reading Pyth on-chain (the mechanics, already implemented):**

- Receiver program `rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ` owns every `PriceUpdateV2` account.
- Push-oracle program `pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT` (mainnet **and** devnet).
- Account derivation: `findProgramAddressSync([shardId_u16le, feedId_32], pushOracle)`.
- `PriceUpdateV2` is **134 bytes**: discriminator `22f123639d7ef4cd`, feed id @41, price i64 @73,
  exponent i32 @89, publish_time i64 @93.
- Parsed in `pricing.rs` with **zero Pyth dependencies** — the official receiver SDK breaks this
  workspace via an `rpc-websockets` `exports` conflict.
- **Logistics:** Hermes *feed listing* is public; *price updates* need a key. Feed updates are gated
  per-group (`pyth-indices` for equities). On-chain reads need neither.
  Pyth MCP: `https://mcp.pyth.network/mcp`.

**Live basis to build the demo around** (PreStocks' own published "Premium %" metric, so it is
unimpeachable — **this, not Pyth, is the arb trigger**):

| Symbol | tokenPrice | markPrice | Premium |
|---|---|---|---|
| SPACEX | 121.82 | 153.00 | **+25.60%** |
| NEURALINK | 407.98 | 328.53 | **−19.47%** |
| OPENAI | 1128.50 | 985.59 | **−12.66%** |
| FIGUREAI | 177.11 | 182.04 | +2.78% |
| ANDURIL | 151.65 | 153.29 | +1.08% |
| ANTHROPIC | 1016.39 | 1021.23 | +0.48% |
| KALSHI | 890.56 | 892.35 | +0.20% |
| POLYMARKET | 144.62 | 144.18 | −0.30% |

No simulation needed — the dislocation is live and large.

---

### 🟡 C7 — The asset universe is 8 tokens, and the tickers in this doc are wrong

`GET https://prestocks.com/api/prestocks` (no auth) → `name, symbol, description, image,
external_url, contract_address, markPrice, markValuation, tokenPrice, impliedValuation, supply`.

| Symbol | Contract |
|---|---|
| ANDURIL | `PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB` |
| ANTHROPIC | `Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw` |
| FIGUREAI | `PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd` |
| KALSHI | `PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua` |
| NEURALINK | `PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S` |
| OPENAI | `PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF` |
| POLYMARKET | `Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP` |
| SPACEX | `PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh` |

- ❌ `$SPCX` / `$OPAI` → actual symbols are **`SPACEX` / `OPENAI`**.
- ❌ **No Canva. No Stripe.** §8 filters must use the real 8.

### 🟡 C8 — "Meteora StockLaunch" does not exist

Not a Meteora product name. Replace every mention with **Meteora DBC** (+ Meteora *Invent* launch
pools). The §6 "Fair Launch" paragraph must read "launches `$AGENT` on a Meteora DBC pool".

### 🟡 C9 — DBC fee routing needs no custom program

DBC already has `collect fee mode` (`QuoteToken` | `OutputToken`) plus creator/partner fee sharing,
claimed through `claim_creator_trading_fee2` / `claim_partner_trading_fee2`. The §7 `dbc_adapter`
program is therefore **unnecessary** — it is an SDK integration plus an off-chain **crank** that
claims fees and forwards them to the vault.

### 🟡 C10 — Tessera is mutually exclusive with PreStocks

PreStocks rules: *"projects that integrate any non-PreStocks pre-IPO tokens will be ineligible for
this bounty."* Tessera (`tSpaceX`), xStocks (`SPCXx`), Ondo (`SPCXon`), Backpack (`SPCX`) are all
non-PreStocks pre-IPO tokens.

**⇒ Do not integrate them.** This also kills the tempting cross-issuer SpaceX arbitrage (five
different SpaceX tokens trade on Solana at c. $153–$607). The arb must be **PreStocks-internal**:
mark-vs-on-chain basis, and cross-PreStock relative value via Pyth. The $10k is worth more than the
fancier arb.

---

### Resulting architecture (replaces §6's diagram)

```
[Creator] ──launches──> [Meteora DBC pool] ── quote mint = wOPENAI (permissionless SPL) ──┐
        └── Clawpump agent (identity, wallet, execution)                                │
                                                                                         ▼
  [Pyth Equity.Index.OPENAI/USD 24/7] ──┐                                   [wPreStock wrapper]
  [PreStocks markPrice (stale wknd)]  ──┼──> AGENT ARB TRIGGER ──> profits ──>    1:1 backed
  [PreStock DEX price 24/7]           ──┘                                         by PreStock
                                                                                         │
                          [DBC trading fees] ──(crank: claim_creator_trading_fee2)──────┤
                                                                                         ▼
                                                                   [DividendVault accumulator]
                                                                   (distributes wPreStock, not
                                                                    raw PreStock — avoids the fee)
                                                                                         │
                                                                                         ▼
                                                                   [Stakers claim wPreStock,
                                                                    unwrap to real PreStock]
```

---

## 2. Problem Statement

1. **The Weekend Market Disconnect:** Traditional equity markets close Friday at 4:00 PM EST and stay shut until Monday morning. When breaking news, regulatory changes, or product breakthroughs occur over the weekend, real-world equity markets remain frozen, causing volatile weekend on-chain mispricings that snap back violently at the opening bell.
2. **Retail Exclusion from Pre-IPO Equity:** High-growth private tech unicorns (such as OpenAI, SpaceX, Canva, and Anthropic) are walled off behind accredited investor rules, million-dollar minimums, and exclusive venture networks. Everyday investors are locked out of private wealth creation.
3. **The Quant "Cold Start" Dilemma:** Individual developers and prompt engineers who build profitable trading strategies struggle to raise initial capital, manage gas infrastructure, or tokenize their models without massive upfront liquidity.
4. **Meme Coin Fatigue & Zero-Utility Speculation:** Retail crypto participants are tired of purely extractive meme tokens on bonding curves that offer no underlying collateral, no productive cash flow, and inevitable capital decay.
5. **Idle Collateral & Thin Liquidity:** Tokenized stocks sitting on-chain frequently suffer from shallow order books and idle holding periods where assets generate zero native lending or trading yield.

---

## 3. The Solution

1. **Continuous Autonomous Arbitrage:** Independent AI trading agents deployed via Clawpump monitor price discrepancies across decentralized exchanges and Automated Market Makers (AMMs) 24/7, executing instant cross-pool arbitrage while traditional financial institutions sleep.

2. **Fractional Private Asset Access:** Retail users hold and trade tokenized claims on private tech company equity directly on Solana. **⚠️ C1: PreStocks are not DBC-compatible as a quote asset, so we mint a 1:1 wrapped PreStock (`wSPACEX` / `wOPENAI`) and compose on that.**

3. **Gasless, Zero-Capital Agent Launch:** Developers spin up agents through Clawpump's rails, instantly launching a custom Agent Token on a Meteora DBC pool **⚠️ C1/C2: quoted in `wPreStock`, not raw PreStock; Clawpump launches the token while we build the DBC pool** — without needing upfront liquidity seeds.

4. **The Dual-Yield Engine:** Every transaction on an Agent Token generates trading fees, and every bot execution generates arbitrage gains. Instead of paying out empty inflationary rewards, the system routes these profits into a smart vault that buys real tokenized equities and distributes them continuously to token holders. **⚠️ C6: which equity is chosen, and when the agent trades, is driven by Pyth market data.**

---

## 4. User Demographics & Personas

- **The Quantitative Creator (Power User / Dev):**
- _Profile:_ Algorithmic traders, data scientists, and Web3 developers who build trading models.
- _Motivation:_ Wants to monetize algorithms without running a hedge fund or dealing with broker licenses. They earn protocol creator fees on every secondary swap of their agent’s token.

- **The Emerging-Market Saver (Passive Retail):**
- _Profile:_ Professionals in countries experiencing severe local currency inflation (e.g., Argentina, Nigeria, Turkey).
- _Motivation:_ Needs dollar-denominated exposure to top-tier US tech companies (SpaceX, OpenAI) without dealing with foreign bank wires, high account minimums, or inaccessible brokerage approvals.

- **The Crypto-Native Speculator (Trader):**
- _Profile:_ High-velocity on-chain traders who actively hunt early bonding curves and momentum tokens.
- _Motivation:_ Wants the rapid upside potential of early-stage bonding curve dynamics, but with the safety floor of accumulating real equity backing rather than holding an empty meme token.

---

## 5. Core System Entities & Objects

- **Users:**
- `Creator`: Deploys agent logic, sets fee parameters, receives creator royalties.
- `Trader`: Buys and sells Agent Tokens along the bonding curve or AMM pools.
- `Holder / Staker`: Retains Agent Tokens to passively accumulate underlying stock dividends.

- **Agents (Bots):**
- Autonomous programs deployed through Clawpump holding their own keypairs and execution permissions.

- Listens to DEX/AMM price events, Pyth Network oracle data, and off-chain sentiment feeds to execute cross-DEX arbitrage.

- **Oracles:**
- `Pyth Price Feeds`: `Equity.Index.OPENAI/USD` and `Equity.Index.ANTHROPIC/USD` (24/7, `market_hours.is_open`), plus `Equity.US.*` / `Crypto.AAPLX` for comparison surfaces. Supplies the arb trigger and the USD NAV of the vault. **⚠️ C6: choose OPENAI/ANTHROPIC PreStocks precisely because Pyth prices them 24/7.**

- **Tokens:**
- `Agent Token ($AGENT)`: SPL token representing fractional community backing of a specific AI bot, launched on a Meteora Dynamic Bonding Curve.

- `PreStock` (as issued): The real tokenized private equity, e.g. `SPACEX` `PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh` or `OPENAI` `PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF`. **⚠️ C1: Token-2022 with a 0.5%→1% transfer fee and 6+ extensions — cannot be a DBC quote mint, base mint, or freely transferred.**

- `wPreStock` (**NEW — required**): A 0-fee **classic SPL Token** (`wSPACEX` / `wOPENAI`), 1:1 backed by PreStock in the wrapper reserve. **This is the DBC quote asset.** Invariant: `supply(wPreStock) == reserve(PreStock)`. **⚠️ C3: must be priced through the mint's `scaledUiAmount` multiplier. ⚠️ C4: mint only against measured balance delta.**

- **Contracts & Modules:**
- `Agent Registry`: Registers bots and verifies their runtime parameters.
- `PreStock Wrapper` (**NEW — required, C1**): `wrap` / `unwrap` against the reserve. Unlocks DeFi for PreStocks, which are otherwise unusable as a DBC quote asset.
- `Meteora DBC Pool`: The dynamic pricing curve handling automated price discovery and dynamic fee collection. Quote mint = `wPreStock`. Fees claimed via DBC's own instructions + an off-chain crank (**⚠️ C9: no custom adapter program needed**).
- `Dividend Reward Vault`: Accumulates trading fees and arbitrage proceeds, calculates duration-weighted yield, and distributes equity. **⚠️ Distributes `wPreStock`, not raw PreStock, so the transfer fee is paid once on unwrap rather than on every claim (C4).**

---

## 6. Flow of Funds & Yield Architecture

```
[Agent Creator] ---> Deploys Trading Logic via Clawpump (agent identity/wallet/execution)
                           │
                           ▼
               [Meteora Dynamic Bonding Curve]
               quote mint = wPreStock (0-fee SPL)   ⚠️ C1: NOT raw PreStock
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
  [Stream A: Trading Fees]       [Stream B: Bot Arbitrage]
Dynamic 5-15% swap fee taken    Bot trades wPreStock/PreStock across DEXs,
in quote asset (wPreStock)      triggered by Pyth 24/7 index divergence
            │                             │
            └──────────────┬──────────────┘
                           ▼
               [Dividend Reward Vault]
        (Accrues wPreStock; 1:1 backed by PreStock in reserve)
                           │
                           ▼
        [Proportional Payout of wPreStock to $AGENT Holders]
                (holders unwrap to real PreStock, paying
                 the PreStock transfer fee once — ⚠️ C4)
```

> **⚠️ C1:** raw PreStocks can never appear in this diagram as a pool quote asset. The wrapper
> (`wPreStock`) is what makes the curve stock-paired. **⚠️ C4:** raw PreStock is distributed only
> on explicit unwrap.

### Capital Inflow (The Fair Launch)

1. A creator configures an agent and launches `$AGENT` on a **Meteora DBC pool** (**⚠️ C8: "Meteora StockLaunch" is not a real product name**).

2. The initial pool uses a Dynamic Bonding Curve **quoted in `wSPACEX`/`wOPENAI`** — the 0-fee wrapped PreStock, because raw PreStocks cannot be a DBC quote mint (**⚠️ C1**).

3. Buyers purchase `$AGENT` tokens; as purchasing volume increases, the price formula mathematically scales the token value.

### Yield Stream A: Bonding Curve Trading Fees (Passive)

- The Meteora DBC is configured with a dynamic fee tier (between 5% and 15% per trade).

- Because the curve's quote asset is `wPreStock`, every buy and sell pays a cut in wrapped tokenized equity shares.

- These fees bypass the creator and flow into the Dividend Reward Vault, pushed by an off-chain **crank** that calls DBC's `claim_creator_trading_fee2` and forwards the proceeds (**⚠️ C9**).

- **⚠️ C4: the DBC's `collect fee mode` decides whether fees land as `wPreStock` (QuoteToken) or as `$AGENT` (OutputToken), and a non-zero quote transfer fee makes quote-side fee claims fail. `wPreStock` is 0-fee, so this is safe.**

### Yield Stream B: Agent Arbitrage Returns (Active)

- The Clawpump agent monitors wPreStock/PreStock pools across decentralized exchanges (Raydium, Meteora, Orca).

- **⚠️ C6: the trigger is Pyth.** `Equity.Index.OPENAI/USD` / `Equity.Index.ANTHROPIC/USD` price 24/7 while the PreStocks SPV `markPrice` follows the business-day reference. The divergence *is* the signal — no simulated weekend events required.

- During weekend hours when traditional market data is stationary, off-chain liquidity events create temporary pricing spreads between pools.
- The agent executes atomic or multi-hop swaps across AMMs to extract the spread.
- Net trading profits are converted into the target tokenized equity and deposited into the Dividend Reward Vault. **⚠️ C10: only ever touch PreStocks assets — integrating a non-PreStocks pre-IPO token forfeits the PreStocks bounty.**

### Graduation & Permanent Liquidity

- When the bonding curve hits the designated threshold, Meteora's migration keepers trigger. **⚠️ Unverified: the "$750" figure in earlier drafts is not sourced. The threshold is configured in **quote-token (`wPreStock`) units**, so it must be chosen against real wPreStock liquidity — confirm the min/max with Meteora.**

- The collected liquidity (quote reserve = `wPreStock`) is migrated into a **Meteora DAMM v2 pool**, producing a permanent `$AGENT`/`wPreStock` market and securing uninterrupted decentralized trading without interrupting dividend accumulation.

---

## 7. Smart Contract Architecture (Anchor / Solana)

### A. Program Structure

#### 1. Agent Registry Program (`agent_registry`)

Manages deployment records, bot ownership, and fee distributions.

```rust
pub struct AgentAccount {
    pub creator: Pubkey,          // Creator wallet
    pub agent_signer: Pubkey,     // Clawpump bot execution keypair
    pub agent_token_mint: Pubkey, // SPL mint of the $AGENT token
    pub target_equity_mint: Pubkey, // SPL mint of the PreStock (e.g., SpaceX)
    pub dynamic_fee_bps: u16,     // Fee rate on DBC (e.g., 500 = 5%)
    pub total_profits_routed: u64,// Historical arbitrage yield generated
    pub bump: u8,
}

```

#### 2. Meteora DBC Integration — **⚠️ C9: NO custom program**

DBC is consumed **off-chain via the TypeScript SDK** (`@meteora-ag/dynamic-bonding-curve-sdk`) and
claimed via DBC's own instructions. There is no `dbc_adapter` program:

- **Pool creation:** SDK `createConfig` + `createPool`, quote mint = `wPreStock`. **⚠️ C1: because `wPreStock` is a classic SPL mint, `tokenBadge` is `null` and the path is permissionless.** Never pass the raw PreStock mint — pool creation would be rejected, and even if it succeeded every quote-side swap would fail.
- **Fee routing:** a small **crank** (Node/cron, or the Clawpump agent itself) calls `claim_creator_trading_fee2` / `claim_partner_trading_fee2`, swaps any non-`wPreStock` proceeds, and forwards into `DividendVault`.

#### 3. PreStock Wrapper (`prestock_wrapper`) — **⚠️ NEW, required by C1**

```rust
pub struct WrapperReserve {
    pub prestock_mint: Pubkey,         // Token-2022, e.g. SPACEX
    pub wrapped_mint: Pubkey,          // classic SPL Token, 0 fee, mint authority = PDA
    pub reserve_token_account: Pubkey, // PDA-owned, holds the raw PreStock
    pub bump: u8,
}
```

- **`wrap(amount)`:** transfer `amount` PreStock in, then mint **the measured balance delta** of `wPreStock` (**⚠️ C4: never `amount` — the transfer fee means less arrives**).
- **`unwrap(amount)`:** burn `wPreStock`, transfer PreStock out (fee applies again).
- **Invariant asserted on every instruction:** `supply(wPreStock) == reserve balance`. Only this program may mint `wPreStock`.
- **⚠️ C5:** must tolerate `pausableConfig` reverting transfers and treat `permanentDelegate` as a live reserve risk.
- **⚠️ C3:** all USD conversion goes through the mint's `scaledUiAmount` multiplier, which is mutable.

#### 4. Dividend Reward Vault Program (`dividend_vault`)

Tracks user stakes and handles continuous equity distributions.

**⚠️ Shipped inside `stock_vault` alongside the wrapper** (one program, three modules — 6 days, and
one well-structured program beats three half-built ones). Rust lives in
`programs/stock_vault/src/vault.rs` (`registry.rs` for the agent, `accum.rs` for the maths).

```rust
// state.rs — matches the shipped implementation
pub struct DividendVault {
    pub staking_mint: Pubkey,      // the $AGENT mint produced by the DBC pool
    pub reward_mint: Pubkey,       // ALWAYS wPreStock, never raw PreStock (pays the
                                   // transfer fee once on unwrap, not on every claim)
    pub stake_vault: Pubkey,       // PDA token account holding staked $AGENT
    pub reward_vault: Pubkey,      // PDA token account holding wPreStock
    pub agent: Pubkey,

    pub total_staked: u64,
    pub acc_reward_per_share: u128, // scaled by PRECISION = 1e12
    pub reward_rate: u128,          // NEW: wPreStock per slot being streamed
    pub reward_reserve: u64,        // NEW: deposited but not yet streamed out
    pub total_distributed: u64,     // NEW
    pub last_update_slot: u64,
    pub min_hold_slots: u64,        // NEW: anti-flash-loan retention window
    pub bump: u8,
}

pub struct UserStake {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub staked_amount: u64,
    pub reward_debt: u128,
    pub accrued: u64,         // NEW: settled-but-unwithdrawn. Without this, adding stake
                              // mid-stream would silently forfeit earned rewards.
    pub total_claimed: u64,   // NEW
    pub last_stake_slot: u64, // anti-flash-loan lock (was `last_deposit_slot`)
    pub bump: u8,
}
```

`Agent` (registry, `registry.rs`) carries `creator`, `agent_signer`, `agent_token_mint`,
`wrapped_mint`, `dynamic_fee_bps`, `total_profits_routed` and `vault`. Only the creator or the agent
signer may call `deposit_rewards`.

### B. Mathematical Yield Accounting

> **⚠️ IMPLEMENTED AS A TIME-STREAM, NOT A LUMP SUM (Day 2).** The formula below credits a deposit
> instantly against whatever `totalStaked` is at that moment — which means **anyone who stakes
> immediately before a deposit captures a pro-rata share of it**, having held for one slot. The
> `last_deposit_slot` lock only *prices* that attack, it does not remove the profit. See
> `day2_results.md`.
>
> The implementation streams instead:
> ```
> deposit(amount, duration) -> reward_rate = (reward_reserve + amount) / duration
> per slot                  -> payout = min(reward_rate, reward_reserve)
>                              acc   += payout × 1e12 / totalStaked
> ```
> Two consequences: yield is paid for **time held** (stake one slot before a deposit in a
> 1,000-slot stream and you earn 0.05% of it, not 100%), and the vault is **solvent by
> construction** because `payout` is capped at `reward_reserve` every step. The doc's
> `acc_reward_per_share` / `last_update_slot` fields are retained; the stream adds `reward_rate`,
> `reward_reserve`, `total_distributed` and `min_hold_slots`.

The vault employs a continuous per-share reward accumulator to prevent loop iterations over individual stakers:

$$AccRewardPerShare_{new} = AccRewardPerShare_{old} + \left( \frac{Payout_{elapsed} \times 10^{12}}{TotalStakedTokens} \right)$$

When a user deposits or claims, their pending reward is calculated:

$$PendingReward = \left( \frac{UserStaked \times AccRewardPerShare}{10^{12}} \right) - UserRewardDebt$$

When updating their balance:

$$UserRewardDebt = \frac{UserStaked \times AccRewardPerShare}{10^{12}}$$

To eliminate flash-loan exploits (where an attacker borrows a massive amount of `$AGENT`, claims dividends, and exits in the same block), the contract enforces a minimum retention rule before claims unlock. **Implemented as a per-vault `min_hold_slots`** (configurable, so agents can tune it and tests can run fast), checked in `claim` before anything settles. Note this is now **defence in depth** — the time-stream is what actually removes the attack surface; the lock just removes the last slot of exposure.

---

## 8. User Interface & Experience Specifications

### UI Inspiration

- **Jupiter (`jup.ag`):** High-efficiency multi-DEX layout, ultra-responsive mobile drawer system, and crisp execution feedback.
- **Backpack:** Clean asset balance cards, high-contrast dark theme, and institutional typography for tokenized securities.
- **pump.fun:** Live gamified bonding curve meters, animated trading feeds, and clear milestone progress bars.
- **Robinhood:** Frictionless dividend reporting and portfolio growth charts that abstract backend mechanics for mainstream users.

### Screen Layouts

#### 1. Global Navigation

- **Top Bar (Desktop & Mobile):**
- App Logo & Network Health Indicator (Solana Mainnet/Devnet).
- Persistent Global Ticker: `Total Distributed: $148,290 in Pre-IPO Equity`.
- Wallet Connection Button (supporting Backpack, Phantom, Solflare).

- **Mobile Bottom Navigation:** Fixed 3-tab navigation bar (`Explore`, `Terminal`, `Portfolio`).

#### 2. The Marketplace (`/explore`)

- **Hero Filter Bar:** Toggle pills for `All`, `OpenAI`, `Anthropic`, `SpaceX`, `Neuralink`, `Trending`, and `Graduated`. **⚠️ C7: the real universe is 8 tokens — Anduril, Anthropic, Figure AI, Kalshi, Neuralink, OpenAI, Polymarket, SpaceX. No Canva, no Stripe.**
- **Agent Grid / Feed:**
- _Desktop:_ 3-column responsive card layout.
- _Mobile:_ Single-column swipeable vertical list.
- _Card Components:_ Agent Avatar, Name, Ticker, Dividend Badge (`Yields: SpaceX`), Bonding Curve Progress Bar (`0% to 100% to AMM Migration`), 24h Arbitrage Win Rate, and a `Quick Buy` action button.

#### 3. Agent Terminal & Detail Page (`/agent/[id]`)

- **Desktop Layout (Two-Column Split):**
- _Left Side (65%):_ Live Meteora Price/Bonding Curve Candlestick Chart, topped with an interactive terminal window showing the bot’s live on-chain arbitrage executions in real time.
- _Right Side (35%):_
- `Swap Module`: Direct buy/sell input supporting SOL/USDC to `$AGENT`.
- `Bonding Curve Progress`: Visual bar showing distance to the $750 migration milestone.

- `Dividend Claim Box`: Displays user staked `$AGENT`, uncollected shares of Pre-IPO equity, and a prominent `Claim Stock to Wallet` button.

- **Mobile Layout:** Single-column layout where charts, live logs, and swap panels collapse into clean, toggleable tabs. The buy/sell panel is anchored to an expandable bottom drawer.

#### 4. Creator Studio (`/launch`)

- **Step 1:** Select or input the Clawpump Agent keypair and strategy parameters.

- **Step 2:** Define token metadata (Name, Symbol, Icon).
- **Step 3:** Select target Pre-IPO dividend asset (**real 8, ⚠️ C7 — no Canva/Stripe: Anduril, Anthropic, Figure AI, Kalshi, Neuralink, OpenAI, Polymarket, SpaceX; default to OpenAI/Anthropic per C6**).

- **Step 4:** Set dynamic fee percentage (5% to 15%) for the Meteora Dynamic Bonding Curve.

- **Step 5:** One-click gasless deployment transaction.

#### 5. User Portfolio (`/portfolio`)

- **Net Wealth Header:** Total combined balance of held Agent Tokens and accrued Pre-IPO equity.
- **Real Equity Inventory:** Clean breakdown of ownership (e.g., `1.84 wSPACEX`, `0.65 wOPENAI`) with a `Redeem to real PreStock` action. **⚠️ C3: display values must apply the mint's `scaledUiAmount` multiplier — reading the PreStocks API price directly understates SPACEX by 5×. ⚠️ C4: label the redemption cost (currently 0.5%, rising to 1% at epoch 1039) at the point of action.**
- **Active Agent Holdings:** Table listing held bot tokens, individual APYs, and a single-click `Claim All Equity Rewards` transaction button.

---

## 9. Phased Hackathon Implementation Roadmap

> **⚠️ The roadmap below is superseded. See §10 for the verified 6-day plan.** The original plan
> assumed PreStocks could be a DBC quote asset (it cannot — C1) and had 7 days (we have ~6).
> Key changes: the wrapper moves to **day 0** as the critical-path derisk, Tessera is dropped,
> Pyth is promoted from "nice to have" to the arb trigger, and mainnet is targeted for the demo
> because Meteora judges on *"working code on mainnet beats slides"*.

- **Phase 1: Core Contracts (Days 1–2)**
- Deploy the Anchor `AgentRegistry` and `DividendVault` programs.
- Integrate Meteora’s dynamic bonding curve CPI calls for dynamic fee collection.

- **Phase 2: Agent Deployment & Mock Trading (Days 3–4)**
- Initialize a trading bot via Clawpump with permissioned execution keys.

- Configure test swaps across Raydium and Meteora devnet pools, verifying that trading profits properly route to the `DividendVault`.

- **Phase 3: Frontend Architecture & Wallet Integration (Days 5–6)**
- Build the responsive Next.js application with Tailwind CSS.
- Implement wallet adapters, bonding curve visualization meters, and the real-time execution log terminal.

- **Phase 4: Testing & Demo Delivery (Day 7)**
- Execute end-to-end user journeys: Launch bot -> Buy tokens on bonding curve -> Execute simulated weekend arbitrage trade -> Verify real equity dividend distribution -> Claim equity shares to user wallet.

---

## 10. Verified 6-Day MVP Plan

> Full detail in **`mvp_plan.md`**. On-chain evidence in **`day0_results.md`**.
> Runnable proof: `experiments/day0-quote-mint.ts`, `experiments/day0-pool.ts`.

**Day 0 is DONE and green on devnet.** The architecture is no longer a hypothesis:

- Raw PreStock as a DBC quote mint → ❌ `6081 QuoteMintHasNonZeroTransferFee` (`token.rs:232`)
- 0-fee Token-2022 + permanentDelegate, no badge → ❌ `6080 InvalidTokenBadge` **(new finding: zeroing
  the fee is NOT enough — a Meteora operator badge is also required)**
- **0-fee classic SPL wrapper (wPreStock shape) → ✅ pool created + buy swap executed**
- **0.1 wPreStock in → 0.095 in quote reserve = 5% fee accrued in the stock quote asset.**
  §6 "Yield Stream A" verified working on-chain.

| Day | Focus | Exit criterion |
|---|---|---|
| **0** | **Derisk C1** — mock PreStock + 0-fee SPL wrapper on devnet; attempt DBC pool with both as quote mint. Fire off C1/C2 questions. Get a Pyth API key | ✅ **DONE** — matrix reproduced; full pool + swap green |
| **1** | `stock_vault` wrapper: `wrap`/`unwrap`, **delta-minted**, invariant asserted | 100 in → 99 out; 0-fee path exact; invariant holds |
| **2** | `DividendVault` accumulator + wPreStock rewards + registry | ✅ **DONE** — 9/9 unit + 7/7 integration; time-streamed, solvent by construction (`day2_results.md`) |
| **3** | Pyth — 24/7 index feeds as the arb trigger, `market_hours` gating, USD NAV | ✅ **DONE (re-scoped)** — permissionless on-chain reads; `record_signal`/`MarketRegime`. **OPENAI/ANTHROPIC index feeds are gated AND absent on-chain**, so Pyth is the regime + attestation layer, not the arb trigger (`day3_results.md`) |
| **4** | Clawpump agent — permissioned keypair, `arbitrage_prices`/`swap_execute`, profit → vault | ✅ **DONE** — on-chain `log_arb` (Pyth-attested) + agent runtime; live signals on 4 assets (`day4_results.md`) |
| **5** | Frontend **+ mint the real wSPACEX/wOPENAI on mainnet** | ✅ **DONE** (mainnet deferred) — all five §8 screens in Nebula's style, live data only (`day5_results.md`) |
| **6** | App surfaces — wallet connect, dashboard, profile, swap signing, launch preflight | ✅ **DONE** — 11 routes, real signing, real preflight (`day6_results.md`) |
| **7** | Mainnet dry run, video, submission | Submitted before Fri 25 Sep 16:00 ET |

**Critical-path risk order:** C1 ✅ resolved → C2 (Clawpump requirement interpretation) → C3/C4
(accounting correctness) → C5 (external freeze risk) → C6 (fund the mainnet wallet).

## 11. Integration gotchas (already paid for — do not re-hit)

1. **DBC creates the `$AGENT` base mint itself.** `base_mint` is `SIGNER, WRITABLE` in
   `initialize_virtual_pool_with_spl_token`. Pre-creating it yields `SystemError 0x0`
   (`AccountAlreadyInUse`). `Keypair.generate()` and pass the pubkey; decimals come from
   `tokenBaseDecimal`.
2. **The base mint keypair must co-sign `createPool`** with the payer, or simulation returns
   `SignatureFailure`.
3. **`migrationFee: { feePercentage, creatorFeePercentage }` is required** when
   `migrationFeeOption: Customizable`, else the SDK throws `reading 'feePercentage'` before reaching
   the chain.
4. **`buildCurve` takes `percentageSupplyOnMigration` + `migrationQuoteThreshold`** — this is the
   real parameter behind the doc's unsourced "$750". It is denominated in **quote-token
   (wPreStock) units**, so it must be sized against real wPreStock liquidity.
5. **web3.js 1.x `simulateTransaction` takes signers, not a config object** (`Invalid arguments`
   otherwise; `replaceRecentBlockhash: true` requires `accounts`). Simulating then sending races
   devnet blockhash expiry — fetch a fresh blockhash immediately before `sendRawTransaction`.
6. **DBC error codes to recognise:** `6081 QuoteMintHasNonZeroTransferFee`,
   `6080 InvalidTokenBadge`, `6079 CannotCreateTokenBadgeOnSupportedMint`.
7. **`anchor build` fails on this machine** with `tapi error: malformed file ... unknown
   architecture arm64e.x1-macos`. Not our code — CLT is self-inconsistent:
   `/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk -> MacOSX27.0.sdk`, and the installed
   ld-1267 cannot parse that SDK's `.tbd` files. Plain `cc` cannot link `int main(){return 0;}`
   either. `MacOSX26.5.sdk` links fine. Pinned in `.cargo/config.toml`:
   ```toml
   [env]
   SDKROOT = { value = "/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk", force = false }
   ```
8. **Root `package.json` needs `"type": "module"`** for the tsx experiments, which breaks
   ts-mocha's CommonJS loader (`ERR_REQUIRE_ESM`). Fixed with a scoped `tests/package.json`
   containing `{"type": "commonjs"}` — Node resolves module type from the nearest `package.json`.
9. **`anchor init` shells out to `yarn`**, which is not installed. Scaffolding still succeeds; only
   the install step fails. Use pnpm.
10. **Devnet program deploy costs ~6,960 lamports/byte.** A 316 KB program needs **~2.20 SOL**.
    Devnet airdrop is rate-limited; faucet at <https://faucet.solana.com>.
11. **`[test.validator]` + agave 3.1.15 panics** with `UnspecifiedIpAddr(0.0.0.0)` in
    `gossip/src/node.rs`. Anchor defaults the bind address to `0.0.0.0` once a `[test.validator]`
    section exists and this build rejects it for gossip. Fix: `bind_address = "127.0.0.1"`.
12. **`[[test.validator.account]]` `filename` must be the `solana account --output json` shape**:
    `{"pubkey": "…", "account": {lamports, data:[b64,"base64"], owner, executable, rentEpoch}}`.
    This is how real mainnet Pyth accounts get replayed locally.
13. **The `@pythnetwork/pyth-solana-receiver` SDK breaks this workspace** — it pulls an
    `rpc-websockets` version whose `exports` map breaks under ESM
    (`ERR_PACKAGE_PATH_NOT_EXPORTED: ./dist/lib/client`). The PDA derivation is 12 lines; extract it
    rather than taking the dependency.
14. **Pyth feed entitlement is per-group.** A key can authenticate fine (`Authorization: Bearer <key>`)
    and still return `Not entitled: … requires access to one of the following groups: ["pyth-indices"]`.
    Feed *listing* is public; *prices* are not. On-chain `PriceUpdateV2` reads need no key at all.
