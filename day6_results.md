# OFFHOURS — App surfaces, wallet, signing, launch

Everything still open on the frontend. **All 11 routes build and serve**, typecheck clean, no
server errors.

```bash
cd web && pnpm exec next build && pnpm exec next start -p 3939
```

| Route | What it is | State |
|---|---|---|
| `/connect` | wallet picker | **live** |
| `/dashboard` | Position | **live shell**, honest empty state |
| `/dashboard/activity` | execution log | **live shell**, honest empty state |
| `/dashboard/agents` | your agents vs the seeded set | **live shell** |
| `/dashboard/profile` | identity + system status | **live** |
| `/agent/[id]` | swap module | **live, signable** |
| `/launch` | preflight + curve config | **live checks**, deploy blocked |
| `/portfolio` | → redirects to `/dashboard` | — |

---

## Wallet connection — real

`@solana/client` + `@solana/react-hooks` (framework-kit), as the Solana skill recommends, with
**Wallet Standard discovery** rather than a curated adapter list. `autoDiscover()` reports what the
browser actually has, so the panel shows real availability instead of six rows that each open an
install page. Wallets that aren't installed still appear, but as an install link rather than a
button that will fail.

Nebula's shape is preserved: a thin `useWalletUi()` adapter over the framework's state returning
`{ address, connectorId, status, error, connectors, connect, disconnect, isReady }`, plus
`describeWalletError` turning wallet-standard objects into sentences ("You declined the request in
your wallet", "Not enough SOL to cover the network fee and rent").

Two things worth noting:

- **`isReady` is respected everywhere.** On the server there is no wallet, so the header, the
  connect list and the dashboard gate all render a skeleton until discovery has run. Rendering
  "Connect" first would flash at people who are already connected.
- **The client runs against mainnet, deliberately.** Every market input this product uses —
  PreStocks tokens, Jupiter routes, Pyth accounts — is mainnet-only. Pointing at devnet would give a
  wallet that cannot see or trade anything the site is about.

## Swap signing — live

`/agent/[id]` now signs real swaps. Quote → Jupiter `/swap` → kit's decoder → wallet session.

The transaction stays **opaque** through us: kit's `getTransactionDecoder()` returns
`{ messageBytes, signatures }` and hands it to the wallet untouched, which is exactly why the wallet
can verify what it is signing without us ever holding a key.

Verified without a browser by `web/scripts/swap-check.ts`, which fetches a real quote and decodes the
real transaction:

```
quote   1.00 USDC -> 1614463 raw SPACEX
route   Byreal -> Meteora DLMM
tx      824 base64 chars
sigslot 1 (our signer)
message version=v0 requiredSignatures=1 accounts=9
feepayer 9BmQr4kLhVn2XcWpY7TfAd3sGzE6uJqRoP8vNbC1dHfM
PASS — kit decodes it, it is a v0 tx, and it is payable by the connected wallet.
```

The message header is parsed by hand (version byte, shortvec account count, first static account) so
this checks the transaction rather than just asserting it decoded. Run it from the repo root:
`pnpm exec tsx web/scripts/swap-check.ts`.

**What is not verified:** the wallet's actual signature. That needs a browser and a real extension.

## Launch — real preflight, real curve, blocked deploy

Two things on `/launch` compute for real:

**Preflight** queries the chain for the four conditions a deployment needs — program deployed,
wrapper initialised, DBC reachable, quote mint permissionless — and reports each with the actual
address. It exists because the alternative is failing inside a wallet prompt with custom error 6081.
The first check is the deployment itself, and it is the one that fails.

**The curve configuration is computed by Meteora's own SDK**, not described. `buildCurve` runs from
the chosen fee tier and the panel shows the resulting supply, curve points, fee schedule, collected
fee mode, and the initial and migration prices derived from the curve's first and last sqrt prices.
Dynamically imported so ~500KB of bonding-curve maths only reaches a browser that asked for it.

```
Total supply            1,000,000,000 $AGENT
Curve points            2
Start → end fee         5.00% → 1.00%
Fee collected in        QuoteToken (wSPACEX)
Migration threshold     750 wSPACEX   quote-token units, not dollars
```

The deploy button is disabled and says **"Blocked by preflight"**. It is not a stub that pretends:
the same checks would pass the moment the program has an address.

## What is deliberately empty

The dashboard is the shape the numbers will arrive into. Every balance is an em dash, and each page
says why rather than leaving you to wonder:

- **Position** — staked, accrued and claimable are em dashes; the SOL balance is real, because that
  is the one thing a connected Solana wallet genuinely has. A panel explains the vault is not
  deployed.
- **Activity** — the terminal is empty, and instead of invented fills it shows the `ArbExecution`
  schema with the note that all seven of its tests pass in `execution.rs`.
- **Agents** — separates "created by you" (none) from the staged set, which is labelled *seeded
  config, not on chain*. Listing seeded rows under a "yours" heading would be the one genuinely
  misleading thing this page could do.
- **Profile** — an inventory of what is live, written, or blocked, with counts.

---

## The bug this caught

**The dashboard rendered two headers.** Every route is wrapped by the root layout, so putting the
marketing nav there meant `/dashboard` painted a session clock and a distributed ticker *above* the
app tabs, and the page read as two different products stacked.

The fix is the App Router's route group: the root layout now holds only what every route needs
(fonts, tokens, the Solana client, the halftone), the marketing chrome moved to `app/(site)/`, and
`app/dashboard/` keeps its own shell. Groups change no URLs, only who wraps whom.

Verified by asserting on both trees:

```
/                      marketingNav=True  appTabs=False
/dashboard             marketingNav=False appTabs=True
/dashboard/profile     marketingNav=False appTabs=True
```

Worth noting because it is invisible at the file level — both layouts looked correct in isolation,
and the fault only existed in the composition.

## Smaller notes

- **No `motion` dependency.** Nebula's profile menu uses `motion/react` and a portal; ours is a plain
  absolutely-positioned panel with a click-outside listener. The portal exists in Nebula because its
  header carries `backdrop-blur`, which makes the header the containing block for fixed descendants —
  ours avoids the case rather than paying for a portal and a spring to work around it.
- **`/portfolio` is a redirect.** §8 named that screen; it is now `/dashboard`, which is the same
  page plus tabs and an app header. Kept as a redirect so the old path does not 404.
- `tsx` resolves `web/` to CommonJS, so scripts under `web/scripts/` cannot use top-level `await`.
  Both check scripts use an `async main()`.

## Still open

- **Wallet signature** on a swap, in a real browser.
- **Deploying the program** — ~3.86 SOL of mainnet rent. Everything in the launch flow and every
  balance on the dashboard is downstream of that one number.
- Reading `ArbExecution` accounts for the Activity tab (needs an address to point `getProgramAccounts`
  at).
