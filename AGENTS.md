# AGENTS.md — Offhrs

**Read this first.** It is the entry point for a fresh session. It says what the project is, what
already works, how to run it, and what is broken or blocked.

Last updated: **Mon 21 Sep 2026, ~19:00 UTC.**

---

## 1. What this is

**Offhrs** — an autonomous marketplace where AI trading agents arbitrage tokenized **pre-IPO
equity** on Solana, and stream the proceeds to holders as the actual shares.

Built for **Stocklana** (`https://hackathons.solana.com/hackathons/stocklana`).
**Submissions close Fri 25 Sep 2026, 16:00 ET** — that is ~4.5 days from the timestamp above.

The thesis, in one line: *the reference market closes, the tokenized marks keep trading, and that gap
is the product.* It is measurable — see `day3_results.md`.

> 🗓️ **Asset status (21 Sep 2026).** **SpaceX IPO'd 9–11 Jun 2026** at $135 — the largest IPO in
> history — and now trades publicly, so it is **no longer a pre-IPO asset**. The docs still use it as
> the headline example; they are stale. **OpenAI is the lead asset** (still private, live ~−10%
> mark-vs-market basis), Anthropic second. Note the `scaledUiAmount` **1→5 adjustment on SPACEX took
> effect 2026-06-10 — the IPO date**: the multiplier *is* the corporate action the wrapper was built
> to survive. It is a story, not a bug.

> ⚠️ **Naming.** The project was called **Angel** until Sep 20 and was renamed **Offhrs**. The
> frontend is fully renamed. **The docs, the Rust, the agent runtime and the directory name still say
> Angel.** See §7.

## 2. Reading order

| # | File | Why |
|---|---|---|
| 1 | `AGENTS.md` | this file |
| 2 | `stocklana_bounty_verification.md` | the bounties, and what disqualifies us |
| 3 | `angel_source_of_truth.md` | the spec. **§1A overrides everything after it** |
| 4 | `day0_results.md` | the constraint that shaped the whole architecture |
| 5 | `day5_results.md` / `day6_results.md` | the frontend, current |
| 6 | `mvp_plan.md` | day-by-day status and the risk register |

`day1_results.md` … `day4_results.md` are per-day evidence logs. Read them when you need detail on a
specific subsystem.

## 3. Status

### Works, verified

| Thing | Evidence |
|---|---|
| `stock_vault` Anchor program | **15 unit + 30 integration tests**, `anchor test` |
| Wrapped PreStock (the core unlock) | `day1_results.md` |
| Streaming dividend vault | `day2_results.md` |
| Pyth on-chain reads + attestation | `day3_results.md` |
| Pyth-attested execution log | `day4_results.md` |
| Frontend, 11 routes | `day6_results.md` |
| Wallet connect (Wallet Standard) | `/connect`, header menu |
| **Swap signing** — real Jupiter tx, real signature | `web/scripts/swap-check.ts` |
| **Live on devnet** — program deployed | `FoVBZ…VLw`; `scripts/devnet-smoke.ts` runs wrapper → registry → streaming vault on-chain |

### Deployed on devnet; blocked on mainnet rent

**The program is live on devnet** (`FoVBZ…VLw`, upgrade authority `Duzj6…`) and the whole path runs
on-chain — see `scripts/devnet-smoke.ts`. **Mainnet is the remaining spend: ~2.9 SOL of refundable
rent**, not the 3.86 SOL earlier drafts assumed. Measured, not estimated: the devnet deploy moved the
deploy wallet 11.30 → 8.41 SOL for the same 555 KB program. Every dashboard balance, the Activity
feed, and the `/launch` deploy transaction are downstream of it. The mainnet wallet is empty.

### Open questions

- **Clawpump — resolved 21 Sep.** They confirmed a **custom-pair** launch that starts on **Meteora
  DBC** and graduates to **DAMM v2**, with **Clawpump managing and distributing fees** (plus holder
  rewards / buybacks / burns). One Clawpump-launched token is therefore *also* the DBC pool: the
  Clawpump and Meteora tracks both apply, and Clawpump confirmed one submission can enter both.
  **Evidence (22 Sep, launch-UI screenshots):** the page has **Launchpad: Pump.fun | Meteora**,
  **Launch mode: Bonding curve → DAMM v2**, a **Trading pair** selector (*"fees paid in the paired
  token"*), and fee strategies; the 75% share and first buy go to the launch wallet. So the DBC path
  is real, not just a chat answer. **Confirmed 22 Sep (market-picker screenshot):** *"Use another
  Solana mint on Meteora"* + a Paste-a-token-mint field means the pair can be our `wPreStock`; the
  preview reports `Fees received in`. ⚠️ Avoid the Ondo/Backpack pairs (non-PreStocks → forfeits the
  PreStocks bounty). Verify the fee currency by pasting `wPreStock` and reading the preview; turn
  auto-buyback and holder rewards off. The `ClawpumpAdapter` in `agent/src/execution.ts` is still
  unverified — no API key.
- **Pyth `pyth-indices`** — requested, not granted. `Equity.Index.OPENAI/ANTHROPIC` are gated on
  Hermes *and* absent on-chain. Not on the critical path; if granted it is a config change.

## 4. Commands

```bash
# ── program ───────────────────────────────────────────────────────────
export SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk   # see §6
anchor build
anchor test                                  # 30 integration tests (~2m)
cargo test --manifest-path programs/stock_vault/Cargo.toml   # 15 unit tests

# ── frontend ──────────────────────────────────────────────────────────
cd web
pnpm exec next build && pnpm exec next start -p 3939

# ── agent (off-chain runtime) ─────────────────────────────────────────
ANGEL_ONCE=1 pnpm exec tsx agent/src/index.ts          # one read-only pass
ANGEL_SYMBOL=OPENAI pnpm exec tsx agent/src/index.ts   # a different asset
pnpm exec tsx agent/src/index.ts --feeds               # known on-chain feeds

# ── checks ────────────────────────────────────────────────────────────
pnpm exec tsx web/scripts/session-check.ts   # 8 market-session cases
pnpm exec tsx web/scripts/swap-check.ts      # decodes a real Jupiter tx

# ── ops scripts (cluster-agnostic; RPC_URL / ANCHOR_WALLET env) ───────
pnpm exec tsx scripts/status.ts              # deployed? wrappers, agents
pnpm exec tsx scripts/devnet-smoke.ts        # full on-chain path on devnet
CLUSTER=devnet ./scripts/deploy.sh           # build + deploy + status
```

## 5. Layout

```
angel/                        ← directory still says "angel"; the product is Offhrs
├── programs/stock_vault/     Anchor program — wrapper + registry + vault + Pyth + exec log
│   └── src/{wrapper,state,vault,accum,pricing,signal,execution,registry,error,lib}.rs
├── tests/                    stock_vault.ts · vault.ts · pyth.ts · execution.ts
├── fixtures/                 real mainnet Pyth accounts, replayed into the local validator
├── agent/src/                off-chain agent runtime (config, market, signal, execution, chain)
├── experiments/              day0–day3 probes; the evidence behind the constraints
├── web/                      Next.js 16 frontend  ← the active work
│   ├── app/(site)/           marketing: /, /explore, /connect, /launch, /agent/[id]
│   ├── app/dashboard/        signed-in: Position, Activity, Agents, Profile
│   ├── components/site/      nav (fixed bar + expanding centre menu), warp-field,
│   │                         dither-backdrop, theme-provider, theme-toggle, logo,
│   │                         agent-sigil, mechanics, agent-carousel, section,
│   │                         figure-slot, glyph, faq, site-footer, session-clock
│   ├── components/ui/        icon (Phosphor + halftone), dither-icon
│   ├── DESIGN_SYSTEM.md      the tokens, palettes, rules and component inventory
│   ├── components/app/       swap (live), app-shell, launch-studio, curve-preview, terminal
│   └── lib/                  market, session, wallet, deploy, agents, snapshot, format, theme
└── day*.md                   per-day evidence logs
```

**Program id:** `FoVBZRFCamH1HNMiVpNZV2QJxk9bSxWtQvKgmqZ1rVLw`
**DBC program id:** `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` (live on mainnet **and** devnet)

## 6. Environment gotchas — these cost real time

1. **`anchor build` fails machine-wide** with `tapi error: malformed file ... unknown architecture
   arm64e.x1-macos`. The CLT install is self-inconsistent:
   `/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk -> MacOSX27.0.sdk`, and the installed ld-1267
   cannot parse that SDK's `.tbd` files. Plain `cc` cannot link `int main(){return 0;}` either.
   **Fix:** `SDKROOT` is pinned in `.cargo/config.toml`. If C compilation fails anywhere on this
   machine, this is why.

2. **`[test.validator]` in `Anchor.toml` panics agave 3.1.15** with `UnspecifiedIpAddr(0.0.0.0)`.
   Fixed with `bind_address = "127.0.0.1"` — do not remove it.

3. **Turbopack's root must be the pnpm workspace root**, not `web/`. pnpm hoists to
   `<root>/node_modules/.pnpm` and leaves `web/node_modules/*` as symlinks pointing out; pinning the
   root to `web/` makes Turbopack refuse to follow them and it cannot find `next`.

4. **`tsx` resolves `web/` to CommonJS** (nearest `package.json` has no `type`), so scripts under
   `web/scripts/` cannot use top-level `await`. Use an `async main()`. The same reason `tests/` has
   its own `package.json` with `{"type":"commonjs"}` — the root is `"type":"module"` for the
   experiments.

5. **Fonts are self-hosted** (Satoshi, Geist Mono, Geist Pixel, Manosque). `next/font/google` made
   the build network-dependent and failed on a 429. **Miso is the exception** — it comes from a CDN
   `<link>` in `app/layout.tsx` because the files were not available locally.

6. **Upstream reads are cached and de-duplicated** in `web/lib/market.ts`. Issued naively, the layout
   plus 8 agent pages produced a 429 storm that *baked "market data unavailable" into the prerendered
   HTML of every agent page*. Both the universe and the Pyth read have TTL caches plus a captured
   fallback. Do not remove them.

7. **`anchor init` shells out to `yarn`**, which is not installed. Scaffolding still succeeds.

## 7. The rename — what still says Angel

The frontend is clean (zero occurrences). Everything else is not:

| Where | Count | Notes |
|---|---|---|
| `programs/stock_vault/src/` | ~53 | almost all the **`AngelError`** Rust enum — a real identifier, not a comment |
| `agent/src/` | ~14 | `ANGEL — Day N` header comments |
| `experiments/` | ~8 | same |
| `*.md` docs | ~18 | the spec, the day logs |
| the directory | — | `Personal/angel/` |

The code identifier and the comments are mechanical and `anchor build` verifies them. The directory
rename will break open editors and the paths quoted throughout the docs — do it last, or not at all.

## 8. Design decisions worth not undoing

- **PreStocks cannot be a DBC quote mint.** They carry a non-zero Token-2022 transfer fee and the DBC
  program rejects them with error `6081 QuoteMintHasNonZeroTransferFee` — a badge does **not** help,
  because a badge cannot authorise a non-zero fee. Hence the zero-fee wrapper. See `day0_results.md`.
- **`wrap` mints the measured reserve delta, never the requested amount.** The transfer fee means
  less arrives; minting the request would create unbacked supply on every wrap.
- **Rewards stream over time, not as a lump sum.** The doc's original formula hands a pro-rata share
  of a deposit to anyone who stakes immediately before it. Streaming pays for time held and makes the
  vault solvent by construction.
- **`log_arb` copies the Pyth fields from the `Signal`** — never from the caller. That is what makes
  the execution log evidence rather than a claim.
- **The market-session clock is computed from the calendar, not from a price feed.** If Pyth were the
  only source, a Pyth outage would look like an open market.
- **The mark is quoted unscaled; the DEX price is not.** Always apply the `scaledUiAmount` multiplier
  before comparing them. Skipping this produced `Gap -74.77%` sitting next to `+2433bps below mark` —
  the same fact with opposite signs.
- **Empty states stay empty.** Balances render as em dashes with an explanation. Do not fill them
  with plausible numbers; the program is not deployed and that is the honest state.

## 9. What to do next

1. **Deploy the program** (~3.86 SOL mainnet; devnet is free and funded). That single action
   unblocks the dashboard, the Activity feed and the `/launch` deploy path.
2. **Wire Clawpump's DBC launch into the vault.** Confirm the three pending items above, then feed
   the launch's token mint into `register_agent` / `initialize_vault`. Clawpump runs the curve and
   the fee crank; we keep the stock-denominated `DividendVault`.
3. **Day 7 — demo + submission:** record the end-to-end journey, write the submission, name the
   open-source components. See `mvp_plan.md`.
4. Optional: propagate the rename (§7).

## 9A. Frontend design system (added Sep 21, revised)

The landing page is now the design system. `web/DESIGN_SYSTEM.md` is the written version and
`web/app/globals.css` is the machine version. The load-bearing changes:

- **A palette system, not one purple.** `lib/theme.ts` declares Ultraviolet (default), Ion, Acid
  and Rose; `:root[data-theme="…"]` in `globals.css` mirrors the tokens and a pre-paint script in the
  root layout resolves the stored choice before the first frame. The Warp shader reads its stops
  from the theme too, so nothing is left pointing at the old hue. Ember stays warnings-only in every
  palette.
- **Manosque is the display face.** The Miso toggle, the CDN link and `data-display` are removed.
- **Phosphor icons**, dithered through a halftone mask (`components/ui/icon.tsx`). Lucide is gone.
- **The header is fixed and three-tracked** — wordmark left, an expanding centre menu, controls
  right — so the hero is a true 100svh and no chrome takes a strip out of it. The centre menu *is* its
  own trigger: `max-height`/`width` animate so the pill grows into a card. Hover/focus opens it on
  pointer devices, `[data-open]` on touch. The `doodle-cue` was retired, and the **mobile bottom tab
  bar stays deleted** — do not reintroduce either.
- **Layout variety is a rule.** Mechanics is a bento (`components/site/mechanics.tsx`, drawn
  diagrams); agents is a snap carousel (`components/site/agent-carousel.tsx`, generated
  `agent-sigil` marks); a full-bleed warp band breaks the page mid-scroll. A card carries one
  graphic, never an icon and a chart at once.
- **Graphic slots.** The reference and vault sections still reserve art with
  `components/site/figure-slot.tsx` and name the brief. Replace the slot with the real asset as
  `children`; nothing moves.
- **The footer** is a full-bleed warp with the wordmark set as just `offhrs`, plus the named
  palette picker.

---

## 10. Product decisions and the build queue (22 Sep)

Plain-language handover. A new session should read this after §1, before changing product behaviour.

### What the product is

People launch an AI trading agent. The agent gets its own token on a Meteora bonding curve, paired
with a tokenized stock (a PreStock). The agent trades that stock while the normal market is closed,
and the profit flows to the people holding the agent's token — paid out in the wrapped stock itself.
Buyers are betting on the agent; holders earn from it. That is the whole idea.

### Decisions we have made

| Question | Decision | Why |
|---|---|---|
| How do holders earn? | **Stake the agent token** into the vault, which streams wrapped PreStock | pays in real equity, weighted by time held, and can't be gamed by a last-second staker |
| Does the buyer see the staking step? | **No — auto-stake on purchase** | feels like hold-and-earn without an extra click |
| How do buyers pay? | **USDC**, routed by the app (USDC → PreStock → wrap → buy the agent token) | nobody should have to understand wrapping |
| When they sell, what do they get? | **Their choice: PreStock or USDC** | some want the stock, some want cash |
| What are payouts denominated in? | **wrapped PreStock** (tokenized equity) | "paid in stock" means tokenized stock, not brokerage share certificates — that is a legal wall, not a technical one |
| Which assets do we lead with? | **OpenAI** first (still private), **SpaceX** second (IPO'd) | the PreStocks bounty is about pre-IPO equity; SpaceX is the post-IPO example |
| Who creates the token and curve? | **Clawpump**, with our `wPreStock` as the pair | one token then qualifies for both the Clawpump and Meteora DBC tracks, while our vault keeps the stock payouts |
| Buyback / holder rewards? | **Off** | Clawpump pays those in SOL; paying in stock is the differentiator |

### What is not built yet (the queue, roughly in order)

1. **The agent-token buy box.** The swap on `/agent/[id]` trades the *PreStock*, not the agent token. There is currently no way to buy `$ORB`.
2. **USDC routing on buy.** USDC → PreStock → wrap → buy, as one flow.
3. **Auto-stake on purchase.**
4. **Sale reward selection.** Sell `$ORB` → choose PreStock or USDC.
5. **Self-owned DBC fallback.** Already proven on devnet (`experiments/day0-pool.ts`); use only if Clawpump falls through.
6. **Mainnet deploy** (~2.9 SOL, refundable) and the real OpenAI/SpaceX wrappers.
7. **One real browser signature.** Every instruction is proven with the local keypair on devnet; the wallet sign → relay half has not been clicked in a browser.
8. **Demo video and submission.**

**Later, not a priority:** a direct **Raydium venue adapter** — execute on Raydium's pools itself
instead of going through Jupiter. Jupiter already routes through Raydium, Meteora and Orca, so this
only earns its keep for true cross-DEX arbitrage (buy on one venue, sell on another). The venue
*labelling* from Jupiter's route is already in (`agent/src/execution.ts`), so the execution log
already shows Raydium/Orca/Meteora fills correctly.

### What runs on devnet, and what needs mainnet

**Free on devnet:** the program, the wrapper (with mock PreStocks), our own DBC pool, buying and
selling the agent token against that pool, staking, claiming, the agent's Pyth-attested signals and
executions, and the vault streaming. In other words, the whole product loop can be built and
tested for nothing.

**Needs mainnet:** the real PreStocks tokens (they only exist there), Clawpump's launch (their
product is mainnet), and the final demo. The `USDC → PreStock` leg specifically uses Jupiter, which
is mainnet-only, so on devnet that leg is mocked.

### Honest caveats to keep repeating

The vault/staking layer came from the original spec, not from the simpler "buy and get paid" model,
and it is the main source of confusion. Auto-staking is the fix that hides it. And the eight named
agents on the site are still staged previews — only agents registered on-chain are real.
