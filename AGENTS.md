# AGENTS.md — Offhrs

**Read this first.** It is the entry point for a fresh session. It says what the project is, what
already works, how to run it, and what is broken or blocked.

Last updated: **Tue 22 Sep 2026, ~21:30 UTC.**

---

## 1. What this is

**Offhrs** — an autonomous marketplace where AI trading agents arbitrage tokenized **pre-IPO
equity** on Solana, and stream the proceeds to holders as the actual shares.

Built for **Stocklana** (`https://hackathons.solana.com/hackathons/stocklana`).
**Submissions close Fri 25 Sep 2026, 16:00 ET** — ~3 days from the timestamp above. Only **one
link** is required (GitHub, live demo, or video), so a devnet demo is a valid submission if the
mainnet deploy does not land in time.

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
| 5 | `day5_results.md` / `day6_results.md` | the frontend |
| 6 | `day7_results.md` | the browser sign → relay path, current |
| 7 | `mvp_plan.md` | day-by-day status and the risk register |

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
| Frontend — all routes build and serve | `day6_results.md`; `/waitlist` added since |
| Waitlist (Resend segments) + beta gate | §11, §12; `web/scripts/waitlist-setup.ts` |
| Brand assets — banner, pfp, OG card | `web/scripts/generate-brand-png.py` |
| Wallet connect (Wallet Standard) | `/connect`, header menu |
| **Swap signing** — real Jupiter tx, real signature | `web/scripts/swap-check.ts` |
| **Agent-token trade** — DBC buy/sell + auto-stake | `web/scripts/trade-check.ts` lands buy+stake, sell→PreStock, wrap, unwrap on devnet |
| **Browser sign → relay** — real Wallet Standard signature through the UI | `scripts/browser-sign-check.ts`; `day7_results.md` |
| **Devnet beta** — faucet + self-serve launch on mock assets | `web/lib/faucet.ts`, `scripts/browser-launch-check.ts`; §14 |
| **Live on devnet** — program deployed | `FoVBZ…VLw`; `scripts/devnet-smoke.ts` runs wrapper → registry → streaming vault on-chain |

### Deployed on devnet; blocked on mainnet rent

**The program is live on devnet** (`FoVBZ…VLw`, upgrade authority `Duzj6…`) and the whole path runs
on-chain — see `scripts/devnet-smoke.ts`. **Mainnet is the remaining spend: ~2.9 SOL of refundable
rent**, not the 3.86 SOL earlier drafts assumed. Measured, not estimated: the devnet deploy moved the
deploy wallet 11.30 → 8.41 SOL for the same 555 KB program. Every dashboard balance, the Activity
feed, and the `/launch` deploy transaction are downstream of it. The mainnet wallet is empty.
**See §13 for how to fund it, and the devnet fallback.**

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
pnpm exec next dev -p 3939                     # dev server (hot reload)
pnpm exec next build && pnpm exec next start -p 3939

# ── agent (off-chain runtime) ─────────────────────────────────────────
ANGEL_ONCE=1 pnpm exec tsx agent/src/index.ts          # one read-only pass
ANGEL_SYMBOL=OPENAI pnpm exec tsx agent/src/index.ts   # a different asset
pnpm exec tsx agent/src/index.ts --feeds               # known on-chain feeds

# ── checks ────────────────────────────────────────────────────────────
pnpm exec tsx web/scripts/session-check.ts   # 8 market-session cases
pnpm exec tsx web/scripts/swap-check.ts      # decodes a real Jupiter tx
pnpm exec tsx scripts/browser-sign-check.ts  # real browser sign → relay; dev server required (see §9)
pnpm exec tsx scripts/browser-launch-check.ts # a fresh faucet-funded wallet launches an agent (§14)

# ── ops scripts (cluster-agnostic; RPC_URL / ANCHOR_WALLET env) ───────
pnpm exec tsx scripts/status.ts              # deployed? wrappers, agents
pnpm exec tsx scripts/devnet-smoke.ts        # full on-chain path on devnet
pnpm exec tsx scripts/devnet-pool.ts         # a tradable devnet agent (wrapper + DBC pool + vault)
CLUSTER=devnet ./scripts/deploy.sh           # build + deploy + status

# ── trade verification (needs devnet-pool.ts first) ───────────────────
pnpm exec tsx web/scripts/trade-check.ts     # buy+auto-stake, sell→PreStock, wrap, unwrap
pnpm exec tsx web/scripts/launch-check.ts    # register_agent + initialize_vault (Clawpump path)
pnpm exec tsx web/scripts/launch-curve-check.ts  # self-owned DBC config+pool (Clawpump fallback)

# ── waitlist (Resend) ─────────────────────────────────────────────────
pnpm exec tsx web/scripts/waitlist-setup.ts  # verify key, create the segment, print size + domains
pnpm exec tsx web/scripts/waitlist-broadcast.ts "Subject"   # create a DRAFT to the list
#   add --send to actually mail it; add --body email.html to use your own HTML

# ── brand assets (Pillow + fontTools) ─────────────────────────────────
python3 web/scripts/generate-brand-png.py    # public/brand/{banner,pfp,og}.png
```

## 5. Layout

```
offhours/                     ← directory on disk still says "angel"; the product is Offhrs
├── programs/stock_vault/     Anchor program — wrapper + registry + vault + Pyth + exec log
│   └── src/{wrapper,state,vault,accum,pricing,signal,execution,registry,error,lib}.rs
├── tests/                    stock_vault.ts · vault.ts · pyth.ts · execution.ts
├── fixtures/                 real mainnet Pyth accounts, replayed into the local validator
├── agent/src/                off-chain agent runtime (config, market, signal, execution, chain)
├── experiments/              day0–day3 probes; the evidence behind the constraints
├── scripts/                  devnet ops: status.ts, devnet-smoke.ts, devnet-pool.ts,
│                             deploy.sh, browser-sign-check.ts, browser-launch-check.ts,
│                             lib/test-wallet.ts
├── web/                      Next.js 16 frontend  ← the active work
│   ├── app/(site)/           marketing: /, /explore, /launch, /agent/[id], /vault, /terms, /privacy
│   ├── app/(auth)/           bare chrome: /connect, /waitlist
│   ├── app/app/              signed-in: Position, Activity, Agents, Profile, Vault
│   ├── components/site/      nav, cta (beta gate), warp-field, dither-backdrop, theme-provider,
│   │                         profile-menu, logo, waitlist-form, mechanics, agent-carousel,
│   │                         section, glyph, faq, site-footer, session-clock, stat
│   ├── components/app/       agent-trade, swap, vault-panel, launch-studio, agent-manage,
│   │                         curve, curve-preview, basis, mark-vs-market, terminal, app-shell,
│   │                         devnet-faucet
│   ├── components/ui/        icon (Phosphor + halftone), dither-icon
│   ├── lib/                  market, session, wallet, deploy, agents, snapshot, format, theme,
│   │                         beta, waitlist (Resend), trade (DBC), program-tx (stock_vault ixs),
│   │                         jupiter, chain, portfolio, faq, use-write-tx, use-server-data,
│   │                         faucet, devnet, devnet-assets
│   ├── public/brand/         banner.png · pfp.png · og.png (generated)
│   ├── DESIGN_SYSTEM.md      the tokens, palettes, rules and component inventory
│   └── scripts/              check scripts + generate-brand-png.py (see §4)
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

5. **Fonts are self-hosted.** `next/font/local` for Satoshi, Geist Mono, Geist Pixel and **EB
   Garamond** (the display face, a variable woff2); **Skyscrapers** (the wordmark, and nothing else)
   is a plain `@font-face` from `public/Skyscapers.ttf`. `next/font/google` made the build
   network-dependent and failed on a 429 — do not reintroduce it. `Manosque-Regular.woff2` is still
   on disk but no longer loaded.

6. **Upstream reads are cached and de-duplicated** in `web/lib/market.ts`. Issued naively, the layout
   plus 8 agent pages produced a 429 storm that *baked "market data unavailable" into the prerendered
   HTML of every agent page*. Both the universe and the Pyth read have TTL caches plus a captured
   fallback. Do not remove them.

7. **`anchor init` shells out to `yarn`**, which is not installed. Scaffolding still succeeds.

8. **`NEXT_PUBLIC_BETA` is inlined at build time**, so flipping it needs a rebuild/redeploy, not an
   env change on a running server. The waitlist counter is the opposite: that route is
   `force-dynamic` and reads Resend per request — do **not** add `revalidate` back to it (§11).

9. **The contract reads are cached and de-duplicated** in `web/lib/chain.ts` (the same reason as #6,
   for the program rather than the market). `getUserPosition` asks for the agent and wrapper sets
   directly *and* through `fetchLiveAgents`, so one dashboard load fired **four concurrent
   `getProgramAccounts` scans**; the public devnet RPC answers that with a 429 storm, the action's
   `catch` returns an empty portfolio, and `/app/vault` says "no agent is registered" — which is a
   lie. The in-flight de-dupe plus 30s TTL is what keeps the dashboard honest; single-account reads
   (a stake, a wrapper, an execution) are never cached, so a write is visible at once. Do not remove
   it.

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

Ordered. §10 is the fuller product queue; this is the short version a fresh session should act on.

1. **Find the ~2.9 SOL for the mainnet deploy.** This is the single blocker on the real product —
   the real PreStocks wrappers, the mainnet demo, every dashboard number, the `/launch` deploy
   path. It is **refundable rent**, not a fee. §13 covers who to ask and the devnet fallback.
2. **Demo video + submission.** The browser sign → relay path is now *verified* — a headless Wallet
   Standard wallet drives the real `/app/vault` stake and the self-owned DBC multi-signer co-sign
   through the app's own code (`scripts/browser-sign-check.ts`, `day7_results.md`). Only one link is
   required (GitHub, live demo, or video), so a devnet demo is a valid submission. Deadline Fri
   25 Sep 16:00 ET.
3. Optional: propagate the rename (§7).

## 9A. Frontend design system (added Sep 21, revised)

The landing page is now the design system. `web/DESIGN_SYSTEM.md` is the written version and
`web/app/globals.css` is the machine version. The load-bearing changes:

- **A palette system, not one purple.** `lib/theme.ts` declares Ultraviolet (default), Ion, Acid
  and Rose; `:root[data-theme="…"]` in `globals.css` mirrors the tokens and a pre-paint script in the
  root layout resolves the stored choice before the first frame. The Warp shader reads its stops
  from the theme too, so nothing is left pointing at the old hue. Ember stays warnings-only in every
  palette.
- **Two typefaces, two jobs.** `.font-display` is **EB Garamond** (self-hosted variable woff2,
  `next/font/local`), and carries every heading and display figure. `.font-wordmark` is
  **Skyscrapers** (plain `@font-face` from `/public/Skyscapers.ttf`), used *only* by the brand
  wordmark — the nav/connect/waitlist lockups and the giant footer wordmark. There is no font
  toggle. The pre-paint script in the root layout resolves the stored palette before the first
  frame.
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
- **The footer** is a full-bleed warp with the wordmark set as just `offhrs`, the social pills and
  the site's index columns. The palette-picker components (`theme-toggle.tsx`) still exist but are
  not rendered — the palette is fixed to Ion, and `NEXT_PUBLIC_BETA` (§12) hides the app entries
  from the footer columns.

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

### Built now — items 1–5 of the queue (22 Sep)

1. ✅ **The agent-token buy box.** `/agent/[id]` now trades the agent's own `$AGENT` on its Meteora DBC curve, not the underlying PreStock. `web/lib/trade.ts` does pool discovery (`getPoolByBaseMint`), quoting and unsigned-transaction building server-side; `web/components/app/agent-trade.tsx` is the panel. Seeded previews still show the PreStock swap.
2. ✅ **USDC routing on buy.** USDC → PreStock (Jupiter) → wrap → buy, as a stepped route where every leg is signed and its signature shown. Jupiter is mainnet-only, so on devnet the direct `wPreStock` path is the one that runs.
3. ✅ **Auto-stake on purchase.** The bought `$AGENT` is staked into the dividend vault in the *same transaction* as the DBC swap, so rewards stream from the slot of purchase. The stake amount is the quote's slippage-guaranteed minimum, so the transaction can never revert because the curve delivered a hair less.
4. ✅ **Sale reward selection.** A sale settles as `wPreStock` (hold), raw `PreStock` (unwrap, same tx), or USDC (unwrap + Jupiter route). If the `$AGENT` is staked, the route unstakes the shortfall first.
5. ✅ **Self-owned DBC fallback.** If Clawpump falls through, the app can create the Meteora DBC config and pool itself (`web/lib/launch.ts`, `buildCreateAgentCurveTx`), with a "Create the curve" mode in `/launch`. The config and base-mint keypairs are generated, used to partially sign, and discarded — the mint is created `Immutable`, so they have no power after the transaction lands. Verified on devnet by `web/scripts/launch-curve-check.ts` (all three signatures present, pool exists after landing).

**Verified on devnet:** `scripts/devnet-pool.ts` stands up a full tradable agent (mock PreStock → wrapper → DBC config + pool → `register_agent` + vault → first buy), and `web/scripts/trade-check.ts` quotes, builds, signs and lands **buy + auto-stake**, **sell → PreStock**, **wrap** and **unwrap**. The auto-stake delta equals the quoted minimum exactly.

### Also shipped since (22 Sep)

6. ✅ **Waitlist** (`/waitlist`, Resend segments, cap 200) — §11.
7. ✅ **Beta mode** (`NEXT_PUBLIC_BETA`, default on): the waitlist is the only open action, app
   entries are hidden from the marketing menu and footer, and the landing section CTAs render
   disabled — §12.
8. ✅ **Brand assets** — banner, pfp and a 1200×630 OG card, generated by
   `web/scripts/generate-brand-png.py` and wired into the root metadata.
9. ✅ **Copy pass** — plain language throughout ("tokenized shares of private companies", "official
   mark", "the gap"). The claim is **"The market is closed. The gap isn't."** in the hero, the
   mid-page band, the banner and the OG card.
10. ✅ **Browser sign → relay** — a headless Wallet Standard wallet drives the real `/app/vault`
    stake through the app's own `decode → sign → encode → relay` path, and the self-owned DBC
    **multi-signer co-sign** (config + base mint + wallet) — `scripts/browser-sign-check.ts`,
    `day7_results.md`. This caught and fixed the `getProgramAccounts` 429 storm in `chain.ts`.
11. ✅ **Devnet beta on-ramp** — a server-signed faucet gives testers test SOL + mock PreStock +
    wPreStock, and `/launch` lists the devnet mock assets, so a fresh wallet can launch, trade and
    stake. §14; `scripts/browser-launch-check.ts`.

### Still to do (the queue, roughly in order)

1. **Find funding for the mainnet deploy** (~2.9 SOL, refundable) — §13. Then deploy and mint the
   real OpenAI/SpaceX wrappers.
2. **Demo video and submission.**

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

---

## 11. Waitlist (Resend)

`/waitlist` is the pre-launch call to action: one non-scrolling screen with the Voronoi field
behind a centred form. The landing page stays the pitch; the header's primary button and the
hero's primary button both point here. It lives in the bare `(auth)` route group, so it carries
none of the marketing chrome — arriving from a call to action should feel like a task.

**Storage is Resend, not a database.** The list's only job is to receive broadcasts, and Resend
is built for exactly that — no schema, no pool, no second system to keep in sync with the one
that sends the email. Contacts live in the `Offhrs Waitlist` **segment** (Resend renamed
*audiences* → *segments*); the app resolves it by name at runtime, so there is no id to
configure. The form collects `email` (required) and `first name` (optional). Richer
qualification (company, role, wallet) would need a Resend contact property or a Postgres table,
and is deliberately deferred until there is a second broadcast to segment.

- **Cap: 200** (`WAITLIST_CAP`), enforced before every insert, and well under Resend's
  1,000-contact limit — so the cap is a product choice (a curated first cohort), not a technical
  ceiling. A full list still reports an existing member as "already on it".
- **Env:** `RESEND_API_KEY` in `web/.env.local` (gitignored; `web/.env.example` is the tracked
  template). The key is server-only — the client bundle carries none of it.
- **Setup / verify:** `pnpm exec tsx web/scripts/waitlist-setup.ts` lists segments, creates the
  waitlist one if missing, and prints the count.
- Resend **upserts** on a duplicate email, so re-submitting never creates a second row.
- **The counter is live, not cached.** The route is `export const dynamic = "force-dynamic"` and
  reads Resend per request; the form calls `router.refresh()` after a join so the number moves
  without a reload. It was briefly static (`revalidate = 60`), which froze the count at build time
  and made a fresh signup still read `0/200`. **Do not add `revalidate` back.**

### Sending

**The `from` address is set on our end, not by Resend.** It is a field in the API call —
`WAITLIST_FROM`, default `Offhrs <hello@offhrs.fun>`. Any local part at the verified domain works
(`hello@`, `waitlist@`, `team@`) and the display name is free text. `WAITLIST_REPLY_TO` sets the
Reply-To header; replies only land somewhere if that address is a real mailbox.

**Domain verification is about the domain, not the address.** `offhrs.fun` is added and its
**DKIM and SPF records are verified** — those are the two that matter for sending. It reads
`partially_failed` only because the optional **Receiving MX** record is absent; we do not receive
mail, so that is fine and does not block a send. To get a clean `verified` badge, either add the MX
record or turn off Receiving for the domain in Resend (do not add a conflicting apex MX if the
domain already has mail elsewhere).

**To send:** `pnpm exec tsx web/scripts/waitlist-broadcast.ts "Subject"` creates a **draft** in
Resend for review; add `--send` to mail it, and `--body email.html` to supply your own HTML. The
script warns when the sending domain is not verified. Nothing in the app sends automatically.

---

## 12. Beta mode

`NEXT_PUBLIC_BETA` (documented in `web/.env.example`, defaults **on**) puts the product in
invite-only mode:

- the landing hero shows only **Join the waitlist**; the closing band's explore/launch buttons are
  replaced by the waitlist CTA;
- the marketing menu and footer hide the app entries — `/app`, `/vault`, `/launch`
  (`APP_ENTRY_HREFS` in `lib/beta.ts`);
- the landing section CTAs (board, mechanics, agents) render **disabled** through
  `components/site/cta.tsx` — they stay in the layout but stop being links, with a title explaining
  why.

The flag is inlined at **build time**, so flipping it needs a rebuild/redeploy — not an env change
on a running server. The one live action, the waitlist, is never rendered through `<Cta>`.

---

## 13. Deployment funding (the ~2.9 SOL)

The mainnet program needs **~2.9 SOL of refundable rent** — measured on devnet, not estimated (§3).
The mainnet wallet is empty. It is the only spend left, and it is a **float, not a fee**: close the
program and the rent comes back.

Who to ask, fastest first:

1. **Buy ~3 SOL** and send it to the deploy wallet. Three days out, this is the only path that
   reliably lands — and it is refundable.
2. **Ask in the Stocklana / Colosseum Discord.** The hackathon runs on `hackathons.solana.com`
   (Colosseum's platform); there is usually a support / hacker-help channel. Ask specifically about
   a deploy stipend or partner infra credits. Worth asking; do not plan around it.
3. **A teammate or friend with SOL** — again, a lend, not a spend.
4. **Hosting and RPC are not the cost.** Vercel's free tier runs the Next.js app; Helius and
   QuickNode free tiers cover the RPC. Check the hackathon page's Resources/Partners section for
   credits before paying for anything.
5. **Formal grants** (Solana Foundation Grants, Superteam) are real but too slow for this deadline.

**Fallback.** The whole product loop runs on devnet for free, and the submission needs only **one
link** (GitHub, live demo, or video) — so a devnet demo is a valid submission if the SOL does not
land. The mainnet deploy only buys the *real* PreStocks wrappers and a mainnet demo.

---

## 14. Devnet beta testing (the faucet)

A beta tester uses **their own wallet** and never imports a key. `Duzj6…` is the program's upgrade
authority *and* the mock mints' authority, so handing it out would hand over the program. The
on-ramp is a server-signed **faucet** instead.

- **`web/lib/faucet.ts`** sends a connected wallet **0.5 SOL + 10 mock PreStock + 10 wPreStock**
  (`faucetDevnet` in `app/actions.ts`). 10-minute cooldown per wallet; the faucet wallet refuses to
  drop below 1 SOL. Devnet-gated — it refuses before touching a key on a mainnet `PROGRAM_RPC_URL`.
- **The button** is `components/app/devnet-faucet.tsx`, on `/app`, rendered only when the client is
  pointed at devnet (`lib/devnet.ts`).
- **`/launch` on devnet** lists the mock PreStocks (`lib/devnet-assets.ts`) instead of the mainnet
  issuer API, so the self-owned DBC launch's preflight can actually pass for a tester.
- **Verified:** `scripts/browser-launch-check.ts` funds a fresh keypair from the faucet, then drives
  the real `/launch` UI through create-curve → register → vault, all signed in the browser.

Clawpump itself is still mainnet-only; the devnet launch is our own DBC curve. For a public beta,
set `FAUCET_KEYPAIR` to a dedicated devnet wallet and give that wallet the mock mints' authority, so
the upgrade authority is not the hot key. Evidence: `day7_results.md`.
