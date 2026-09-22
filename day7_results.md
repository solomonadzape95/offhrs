# OFFHRS — One real browser signature

The last unverified link in the write path was the **browser half**. Every instruction was already
proven with the local keypair on devnet (`web/scripts/write-check.ts`, `trade-check.ts`,
`launch-curve-check.ts`), but those sign with `@solana/web3.js` in Node and send directly. The
wallet's `decode → sign → encode → relay` path had only been type-checked. "One real browser
signature" was item 2 of the handover, and the only development task between the project and the
demo submission.

`scripts/browser-sign-check.ts` closes it. It drives the real UI in headless Chromium against a
running dev server, with a synthetic **Wallet Standard** wallet registered before the page boots —
the same registry Phantom and Solflare register into. The wallet signs with **WebCrypto Ed25519**
(Chrome exposes it on localhost, a secure context), so the bytes on the wire are genuinely signed.
What is absent is only the human clicking Approve in an extension; the protocol, the cryptography
and the app's own code path are real.

```
pnpm exec tsx scripts/browser-sign-check.ts
```

## What it exercises

| Step | Real? |
|---|---|
| Wallet Standard discovery + `standard:connect` | yes — the app's `watchWalletStandardConnectors` finds it |
| Server builds the unsigned transaction (`buildStakeTx`) | yes — the real server action |
| Browser decodes with `@solana/kit` | yes — same `getTransactionDecoder` the app uses |
| `session.signTransaction` hands the wire to the wallet | yes — the app's own `useWriteTx` path |
| Wallet signs and returns the wire | yes — WebCrypto Ed25519 |
| Browser re-encodes and POSTs to `submitTx` | yes — the real server action |
| Chain confirms the written state | yes — asserted on `UserStake.staked_amount` |

## Evidence

**Single-signer stake, through `/app/vault`:**

```
stake    1 $AGENT (1000000 raw) — before 196321041082919
→ signature 3E4RG4Wybf66yC7wpvAy3jiYhoW5KPdk2NvW36DetefXntWQvy1eo8KBKK4KBcafb2jPyJRuUAkj3intCNwiY2uz
PASS — stake browser-signed, server-relayed, confirmed on chain: 196321041082919 → 196321042082919 staked.
```

**Multi-signer co-sign, a self-owned DBC launch:** `buildCreateAgentCurve` partial-signs the
transaction with the ephemeral config and base-mint keypairs; the wallet must add its own
signature without wiping theirs. The same browser wallet signs that wire and all three signatures
verify:

```
→ multi-signer co-sign: 3/3 signatures (config + base mint partials preserved)
PASS — self-owned DBC co-sign: all three signatures valid.
```

An earlier passing run, kept for the record: `5aEX54RtYQGqbbNmc7icaZMuK2izYHPzEMmjp11fLftgQLMSL9a6D3PSDBC88j5VSFvHA34bSaH97EfJuV6qQ26G`.

## The bug this caught

The first browser run failed before it reached the wallet: `/app/vault` rendered **"No agent is
registered on this cluster yet"**. The cause was an RPC 429 storm, not a missing agent.

`getUserPosition` called `fetchAgents` and `fetchWrappers` **twice each** on every load —
directly, and again through `fetchLiveAgents` — so a single dashboard load fired **four concurrent
`getProgramAccounts` scans**. The public devnet RPC rate-limits that burst, the action's `catch`
swallowed the failure, and the page reported an empty portfolio. `web/lib/chain.ts` now de-duplicates
in-flight scans and caches them for 30s; single-account reads are never cached, so a write is still
visible immediately. This is the same class of fix the market layer already had (AGENTS §6.6) — the
chain layer just never got it.

## Reproduce

```bash
# from web/ — point the app at the live devnet program and open it up
NEXT_PUBLIC_BETA=false \
PROGRAM_RPC_URL=https://api.devnet.solana.com \
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com \
node_modules/.bin/next dev -p 3939

# from the repo root
pnpm exec tsx scripts/browser-sign-check.ts
```

`playwright-core@1.63.0` is a dev dependency; a Chromium build must be present (on this machine it
is the one Playwright already cached). The check reads the wallet from `ANCHOR_WALLET` and the agent
from `.devnet-demo.json`, so it targets the same demo agent without arguments.
