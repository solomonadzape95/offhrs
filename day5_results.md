# ANGEL — Day 5 Results (Frontend)

The §8 screens, built in Nebula's visual language. **All routes build and render**, and every figure
on screen is read live from one of three real sources.

```bash
cd web && pnpm exec next build && pnpm exec next start -p 3939
```

| Route | §8 | State |
|---|---|---|
| `/` | (landing) | Hero, live dislocation board, mechanics |
| `/explore` | §2 Marketplace | ✅ filter bar + agent grid |
| `/agent/[id]` | §3 Terminal & Detail | ✅ 2-column: mark/market + live log ‖ swap + curve + dividends |
| `/launch` | §4 Creator Studio | ✅ 5 steps, fee bounded to 5–15% |
| `/portfolio` | §5 Portfolio | ✅ net wealth, equity inventory, holdings table |

---

## Style: Nebula's, copied deliberately

`app/globals.css` is Nebula's design system, adapted. Same palette, same zero border radius, same
halftone. The tokens are unchanged because the signal mint is doing the same job here (yield,
confirmation, "up") and the ember the same job (fees, warnings, "down"). **If Angel wants its own
hue the swap is `--color-signal` / `--color-signal-dim` and nothing else**, because every other
surface is built from ground + ink.

Carried over verbatim: `--color-void/surface/raised/edge`, the ink ramp, `--dither-cell`, the fixed
`.dither-overlay` halftone, `.panel`, `.btn-primary/ghost` with the phosphor bloom, `.label`,
`@utility figure` (Geist Pixel for display figures only), and the display type scale.

Self-hosted: Satoshi (4 weights) and Geist Pixel, as Nebula does.

**New for Angel:** `.pill` (filter row), `.curve-track`/`.curve-fill` (bonding curve, dithered),
`.basis-up`/`.basis-down`, and `.terminal` (the execution log).

The mark is new: a halo and a head as one solid body with the ring punched through, printed with the
same halftone lattice — same technique as Nebula's, same reasoning (the body keeps the true signal
colour rather than averaging toward the background).

---

## Real data, three sources, no simulation

| Source | Supplies |
|---|---|
| PreStocks issuer API | mark, token price, supply, valuations, the premium itself |
| Live Jupiter quote | the executable DEX price and route |
| On-chain Pyth account | the market regime, read permissionlessly |

The landing page's whole argument is a **timestamp**: the Apple equity feed's `publish_time` is
Friday's after-hours print, and it has not moved since. That is read from chain at request time.

Live at capture:
- Reference **FROZEN**, stale **17.7h**, last print `2026-09-18T23:59:57Z`
- SPACEX **+2454bps below mark**, gap +24.54%, multiplier 4.9309×
- OPENAI **−1390bps above mark**, gap −13.90%, multiplier 1.4832×
- Universe board: all 8 assets with real marks and valuations

---

## The bug this caught — worth reading

The first render of `/agent/orbital` showed **two numbers on one panel contradicting each other**:

```
Basis  +2433bps below mark        (from the issuer API)
SPV mark $152.45 / Executable market $604.29 / Gap -74.77%   (computed here)
```

`markPrice` is quoted **unscaled**. The Jupiter quote is for one whole token and carries the mint's
`scaledUiAmount` multiplier (~4.93× on SPACEX). Comparing them raw is apples-to-oranges, so the gap
read as **−75%** while the basis read **+24%** — the same fact, opposite signs.

The fix scales the mark into the market's units before comparing (`markPrice × multiplier`). Both
now land on ~+24.5%, and the bars are drawn on the same scale. The panel says why.

**This is exactly the class of bug that only a rendered page finds.** The Rust is correct, the types
are correct, the build is green — and the visible output was self-contradictory. It is the same
multiplier that C3 in the source-of-truth doc warns about, and I still walked into it in the UI.

---

## Things that had to be fixed to make it build at all

1. **Turbopack root had to be the pnpm workspace root, not `web/`.** pnpm hoists to
   `<root>/node_modules/.pnpm` and leaves `web/node_modules/*` as symlinks pointing up and out.
   Pinning the root to `web/` makes Turbopack refuse to follow them and it cannot find `next` at all.
2. **Google Fonts made the build network-dependent** and it failed on a 429. Geist Mono is now
   self-hosted from the latin subset Next already ships for its own devtools. No build-time fetches.
3. **The upstream burst had to be deduped.** The layout plus eight `/agent/[id]` pages all want the
   universe and the Pyth read; issued naively that became a 429 storm and a 21.5s static generation
   that *baked "market data unavailable" into the prerendered HTML of every agent page* until the
   first revalidation. With in-flight de-duplication plus a 60s/30s TTL it is one call each, no 429s,
   and generation dropped to **3.1s**.

---

## Honesty: what is real and what is not

**Real:** every price, basis, valuation, multiplier, Pyth read, route and staleness figure.

**Seeded:** the agent records — name, ticker, creator, fee tier, curve progress. No `$AGENT` DBC pool
exists yet, so there is nothing on chain to read. The UI marks them `PREVIEW · no pool yet`,
`lib/agents.ts` explains why in a header comment, and the explore page repeats it in the footer.

**Deliberately blank:** every portfolio balance renders as an em dash. No wallet is connected and no
vault is funded, so any figure there would be invented. The footer says so.

**Not yet wired:** wallet connect, swap signing, and DBC pool creation. Those buttons are disabled
and labelled rather than styled to look live.

**Also replaced with something honest:** §8 asks for a "bonding-curve candlestick chart". There is no
pool trading, so there is no price history, and drawing candles anyway would be fabricating data. The
panel shows mark-vs-market as two measured bars — the same thing the chart would be looked at for —
and says why the chart is absent. It is replaced by the real chart once a pool has trades.

---

## What is left

- **Wallet connect** (wallet-standard) and swap signing — the last wiring on `/agent/[id]`.
- **DBC pool creation** from `/launch`, which then populates the explore grid from the on-chain
  `Agent` registry instead of the seed list (`lib/chain.ts` is written for this).
- Mainnet deploy of the program — still needs **~3.86 SOL**.
