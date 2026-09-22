# Stocklana × Angel — Bounty Verification & Spec Corrections

Verified against the live hackathon page and primary sponsor sources on **Sat 19 Sep 2026**.
Deadline: **Fri 25 Sep 2026, 16:00 ET** (~6 days). Judging through 2 Oct.

## 1. Hackathon facts

| Item | Value |
|---|---|
| Prize pool | $126,000 |
| Main track | $100,000 (Solana Foundation, judged on real user + problem, working end-to-end demo, why Solana, execution quality) |
| Bounty tracks | 5 — PreStocks, Tessera, Clawpump, Meteora, Pyth |
| Registered / submitted | 703 / 122 (at time of check) |
| Requirement | ≥1 link: GitHub, live demo, or video. One submission per team, original work |
| Next step | Colosseum World's Fair |

## 2. Bounty decision

| Bounty | Prize | Verdict |
|---|---|---|
| Main track | $100,000 | ✅ Enter |
| **PreStocks** | $10,000 ($5k/$3k/$2k) | ✅ Core — largest bounty, matches doc |
| **Meteora DBC** | $5,000 | ✅ Core |
| **Clawpump** | $5,000 ($3k/$1.5k/$500) | ✅ Core |
| **Pyth** | 3 months Pyth Pro (non-cash) | ✅ Add — verified genuinely central, see §6 |
| Tessera | $6,000 | ❌ **Drop** — mutually exclusive with PreStocks |

**Tessera is mutually exclusive.** PreStocks rules: *"projects that integrate any non-PreStocks
pre-IPO tokens will be ineligible for this bounty."* Tessera (tSpaceX/OpenAI/Kalshi T-Tokens),
xStocks (`SPCXx`), Ondo (`SPCXon`), Backpack (`SPCX`) are all competing pre-IPO tokens. Touching
them forfeits the $10k. This also kills the tempting cross-issuer SpaceX arbitrage — see §5.

One submission can win multiple bounties. Ceiling: $100k + $10k + $5k + $5k + Pyth Pro.

## 3. ⛔ Blocker: PreStocks can NEVER be a Meteora DBC quote mint

The doc's central mechanic is:

> "The DBC is configured with a dynamic fee tier... **Because the curve trades against the
> tokenized stock quote asset**, every buy and sell automatically pays a cut in equity shares."

**This is not buildable.** Two independent hard constraints, both from
`docs.meteora.ag/core-products/dbc/token-2022-support.md`:

1. *"Token 2022 quote assets are permissionless only when the mint uses metadata-related
   extensions and has a zero transfer fee."*
2. *"A badge does not allow a non-zero transfer fee. Current and any scheduled
   `transfer_fee_basis_points` must be `0`."* Enforced at badge creation, config creation,
   pool creation, and **on every instruction that transfers quote tokens**.

On-chain state of `PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh` (SPACEX PreStock):

- `transferFeeConfig` → newer **100 bps (1%)**, older 50 bps. Non-zero, and even *scheduled*
  values must be zero.
- `permanentDelegate`, `pausableConfig`, `scaledUiAmountConfig`, `confidentialTransferMint`,
  `defaultAccountState`, `transferHook` → all far outside the permissionless allowlist
  (only Metadata Pointer + Token Metadata qualify).
- Note the docs say the token-badge path *"is the path used for Stock Tokens"* — Meteora built
  exactly this for stock tokens. The 1% fee is what disqualifies PreStocks specifically.

Also, if a quote mint's fee later becomes non-zero: *"quote-side swaps, surplus withdrawals, and
quote fee claims fail until the fee returns to zero."* So there is no workaround via badge.

### Fix (recommended): wrapped-PreStock quote mint

Mint a zero-fee **SPL** wrapper (`wSPACEX`) backed 1:1 by a PreStock vault balance, and use the
wrapper as the DBC quote mint.

- SPL quote mints are *always* permissionless → no badge, no Meteora dependency, no PreStocks
  dependency.
- Preserves "stock-paired liquidity pool" for the Clawpump requirement.
- Honest cost: 1% PreStocks transfer fee on wrap/unwrap (disclose it; it's also a nice
  "we read the token extensions" credibility signal for judges).
- Fallback if the wrapper is cut for time: DBC quotes SOL/USDC, vault buys PreStocks post-hoc.
  Keeps 3 of 4 bounties coherent but weakens "stock-paired".

## 4. ✅ Clawpump launches the token on Meteora DBC (RESOLVED 21 Sep 2026)

Clawpump's bounty requirement: *"Launch your token with a stock-paired liquidity pool using
clawpump and Meteora."*

**Confirmed by Clawpump:** a custom-pair launch that **starts on a Meteora DBC pool and graduates
to DAMM v2**, with **Clawpump managing and distributing the fees**. Their launch surface also
exposes holder rewards, buybacks and burns. They confirmed that one submission **can enter both** the
Clawpump and Meteora tracks.

So the requirement is met natively: Clawpump launches the token as the DBC base mint, quoted in our
`wPreStock`, and graduates it to DAMM v2 — simultaneously a Clawpump token and a Meteora DBC pool.

**Consequences:**

- We do **not** create the production DBC pool ourselves; `experiments/day0-pool.ts` becomes a test
  rig.
- Clawpump owns the curve and the fee crank. Our `DividendVault` keeps the stock-denominated
  distribution, which their native SOL-denominated rewards do not provide.

**Evidence (22 Sep 2026, screenshots of the live launch UI):** the page exposes **Launchpad:
Pump.fun | Meteora**, **Launch mode: Bonding curve → DAMM v2**, a **Trading pair** selector annotated
*"Meteora · fees paid in the paired token"*, and fee strategies (auto-buyback, holder rewards,
perps). Logged-out copy: *"Your 75% fee share and any first buy go to the wallet you launch with."*

**Confirmed 22 Sep (market-picker screenshot):** **"Use another Solana mint on Meteora"** with a
*Paste a token mint* field means the pair can be our `wPreStock`; the preview reports `Fees received
in`. Launch mode is **Bonding curve → DAMM v2**, and the 75% fee share plus first buy go to the
launch wallet. ⚠️ Avoid the **Ondo**/**Backpack** pairs in that picker — non-PreStocks pre-IPO tokens
forfeit the PreStocks bounty. Verify the fee currency by pasting `wPreStock` and reading the preview;
turn auto-buyback and holder rewards off.

Useful Clawpump agent tools either way: `swap_quote`, `swap_execute`,
`arbitrage_quote`, `arbitrage_prices`, `token_search`, `get_portfolio`, `dca_create`,
`limit_order_create`, `get_news_feed`, `predictions_*`, x402 payments, agent email.

## 5. What the market actually looks like

### PreStocks inventory — only 8 assets

`GET https://prestocks.com/api/prestocks` (no auth):
`name, symbol, description, image, external_url, contract_address, markPrice, markValuation,
tokenPrice, impliedValuation, supply`

| Symbol | tokenPrice | markPrice | Premium | Contract |
|---|---|---|---|---|
| ANDURIL | 151.65 | 153.29 | +1.08% | `PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB` |
| ANTHROPIC | 1016.39 | 1021.23 | +0.48% | `Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw` |
| FIGUREAI | 177.11 | 182.04 | +2.78% | `PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd` |
| KALSHI | 890.56 | 892.35 | +0.20% | `PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua` |
| NEURALINK | 407.98 | 328.53 | **−19.47%** | `PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S` |
| OPENAI | 1128.50 | 985.59 | **−12.66%** | `PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF` |
| POLYMARKET | 144.62 | 144.18 | −0.30% | `Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP` |
| SPACEX | 121.82 | 153.00 | **+25.60%** | `PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh` |

The mark-vs-token basis is **live and large** (SPACEX +25.6%, NEURALINK −19.5%, OPENAI −12.7%).
PreStocks publishes a "Premium %" column on their products page — it is their own metric, which
makes it an unimpeachable arb signal. No simulation needed.

### Liquidity is real

Jupiter quote, 1 SPACEX → USDC = **$606.04**, routed via **Meteora DLMM**. 10,127 holders,
~$115k Jupiter-reported liquidity. GeckoTerminal shows 20 pools for the SPACEX mint, including
`SPACEX/USDC`, `SPACEX/OPENAI`, `SPACEX/KALSHI`.

### 🔥 `scaledUiAmount` multiplier — a gotcha the doc completely misses

PreStocks mints carry a Token-2022 `scaledUiAmountConfig` whose multiplier **changes over time**:

| Symbol | multiplier | effective |
|---|---|---|
| SPACEX | 1 → **5** | 2026-06-10 |
| OPENAI | 1 → **1.4861347** | 2026-07-17 |

Live proof (this is why naive price reads are wrong):

- Jupiter `usdPrice` SPACEX = **121.82** (raw) — but the DEX quote is **$606.04**.
  `606.04 / 121.82 = 4.975 ≈ 5` ✅ multiplier
- OpenAI: PreStocks API `tokenPrice` 1128.50 → DEX quote **$1678.50**.
  `1678.50 / 1128.50 = 1.4874 ≈ 1.4861347` ✅ multiplier

**The PreStocks API reports *unscaled* prices.** Anyone who reads `tokenPrice` straight from the
API and compares it to a DEX price gets a 5× error. The vault must read the multiplier off the
mint, and must handle it changing (this is effectively a corporate action / split — a real
"corporate actions" story for the Pyth/infra angle).

Premium % is multiplier-invariant, so §5's basis numbers are valid either way.

### PreStock risk surface (Token-2022 extensions, all real)

- `transferFeeConfig` **1%** on every transfer → wrapping, swapping, and **every dividend claim**
  costs 1%. Design for accrual + **batched claims**.
- `pausableConfig` → PreStocks can **pause all transfers**, halting the agent and the vault mid-flight.
- `permanentDelegate` → PreStocks authority can move/burn any holder's tokens, *including the vault*.
- `confidentialTransferMint` + `confidentialTransferFeeConfig`, `defaultAccountState`,
  `transferHook` (programId null — no hook program, so that one is benign).
- Not available in the US / to US persons; economic exposure only, no ownership or legal rights.

## 6. Pyth — verified, and it should be central (not a bolt-on)

Your instinct was right, and it turned out better than expected: **Pyth publishes 24/7 index feeds
for two of the PreStocks' actual underlyings.**

Live feed listing (`hermes.pyth.network/v2/price_feeds`, public — verified):

| Feed | Type | `market_hours.is_open` | Schedule |
|---|---|---|---|
| `Equity.US.AAPL/USD` | Equity | **false** (it's Saturday) | `America/New_York;0930-1600,...` |
| `Equity.Index.AAPL/USD` | Equity | **true** | `America/New_York;O,O,O,O,O,O,O` |
| `Crypto.AAPLX/USD` (xStock) | Crypto | **true** | 24/7 |
| `Crypto.AAPLX/AAPL.RR` (redemption rate) | Crypto | **true** | — |
| `Crypto.AAPLON/USD` (Ondo) | Crypto | — | — |
| **`Equity.Index.OPENAI/USD`** | Equity | **true** | `America/New_York;O,O,O,O,O,O,O` |
| **`Equity.Index.ANTHROPIC/USD`** | Equity | **true** | `America/New_York;O,O,O,O,O,O,O` |

1,243 equity-type feeds total. No SPACEX or NEURALINK feed.

### The Pyth architecture that makes it load-bearing

**Build the product on OPENAI and ANTHROPIC PreStocks** — the two whose underlying Pyth prices 24/7.

Three price sources for the same asset:

1. **Pyth `Equity.Index.OPENAI/USD`** — live 24/7, carries confidence interval + `publish_time`.
2. **PreStocks `markPrice`** — SPV mark, follows business-day reference, goes stale on weekends.
3. **PreStock DEX price** — trades 24/7 (Meteora DLMM / Raydium).

Pyth is the arb *trigger*, not decoration: when `Equity.Index.*` is live and diverging from a
stale SPV mark, the agent knows on-chain PreStock price has room to converge. Pyth's
`market_hours` field (`is_open`, `next_open`, `next_close`) is literally the oracle-level
weekend-gap signal. Plus Pyth is the USD NAV oracle for the dividend vault.

This is the doc's "Weekend Market Disconnect" thesis, made measurable instead of asserted.
Bonus surface, explicitly invited by the bounty: the AAPL three-way
(`Equity.US.AAPL/USD` closed vs `Equity.Index.AAPL/USD` 24/7 vs `Crypto.AAPLX/USD` 24/7).

**Logistics: Hermes price endpoints now return `unauthorized`** — feed *listing* is public but
*price updates* need an API key (`GET /v2/updates/price/latest`, `/api/latest_price_feeds`).
Either get a Pyth API key on day 0, or read Pyth receiver price accounts on-chain (no key, and
the stronger "technical soundness" answer). Pyth Pro docs/API-key guide + MCP server at
`https://mcp.pyth.network/mcp`.

Judging: *"How central Pyth data is to the product, technical soundness and quality of the
integration, and if the app exists post hackathon."* The above scores on all three.

## 7. Source-of-truth doc corrections

| Doc says | Reality |
|---|---|
| `$SPCX`, `$OPAI` tickers | Actual symbols `SPACEX`, `OPENAI` |
| Filters: OpenAI, SpaceX, **Canva** | No Canva or Stripe. Only Anduril, Anthropic, Figure AI, Kalshi, Neuralink, OpenAI, Polymarket, SpaceX |
| "Meteora **StockLaunch**" | Not a Meteora product name. Use DBC + Invent launch pools |
| DBC quote asset = PreStock | **Impossible** (1% transfer fee). Use wrapped-PreStock or SOL/USDC |
| "every swap pays a cut in tokenized equity" | Not buildable as written — see §3 |
| Dividend vault pays out PreStocks | Works, but every claim costs a **1% transfer fee** → batch claims |
| Vault math on token amounts | Must use **`scaledUiAmount`-adjusted** amounts; multiplier is mutable (SPACEX 1→5, OPENAI 1→1.4861347) |
| "Can sell PreStocks at any time" | `pausableConfig` — PreStocks can pause transfers |
| 7-day roadmap | ~6 days. Compress; Meteora judges on *"working code on mainnet beats slides"* |
| No mention of Pyth | Add — and make it the arb trigger (§6) |

## 8. Open questions to resolve before writing code

1. **Clawpump** — does composition (Clawpump agent + our own Meteora DBC pool) satisfy
   "launch your token with a stock-paired liquidity pool using clawpump and Meteora"? If a
   pump.fun launch is required, the pool can't be Meteora. Highest-priority clarification.
2. **Meteora** — confirm there is no path for a quote mint with non-zero transfer fee
   (badge included). Confirm wrapped-PreStock SPL quote mint is acceptable for the bounty.
3. **PreStocks** — would they zero `transfer_fee_basis_points` for a dedicated `wSPACEX`-style
   path, given Meteora already has a "Stock Tokens" badge path? Would unlock the cleaner design.
4. **Pyth** — API key vs on-chain receiver account reads.
5. **Meteora** — exact minimum/maximum DBC migration threshold in quote-token units (doc's
   "$750" figure is unverified).

## 9. Recommended build order (compressed to 6 days)

1. **Day 0** — Fire off questions 1–3. Get Pyth API key. Mint the wrapped-PreStock (0-fee SPL)
   and verify a DBC pool against it end-to-end on devnet. *If this fails, the whole design
   changes — derisk it first.*
2. **Day 1–2** — `DividendVault` with the accumulator from the doc, plus `scaledUiAmount`-aware
   accounting and batched claims. `AgentRegistry`.
3. **Day 3** — Pyth integration: `Equity.Index.OPENAI/USD` + `Equity.Index.ANTHROPIC/USD` feed
   the arb trigger; market_hours gating; NAV oracle.
4. **Day 4** — Clawpump agent: permissioned keypair, `arbitrage_prices`/`swap_execute`, profit →
   vault in PreStocks.
5. **Day 5** — Next.js frontend: discover/terminal/portfolio, live exec log, bonding-curve meter,
   "Total Distributed" ticker. Mainnet for the demo path.
6. **Day 6** — E2E journey: launch agent → buy on curve → weekend arb fires on a Pyth divergence
   → dividend accrues → claim to wallet. Record video. Ship mainnet. Submit.
