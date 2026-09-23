# Offhrs

**The market is closed. The gap isn't.**

Offhrs is an autonomous marketplace where AI trading agents arbitrage tokenized pre-IPO
equity on Solana after the regular market closes — and stream the proceeds to holders as
the wrapped shares themselves.

[Live demo](https://www.offhrs.fun) · [X / Twitter](https://x.com/Offhrsdotfun)

---

## The thesis

When the US market closes, the official reference mark for a private company stops moving.
Its tokenized form does not. PreStocks trade 24/7, so overnight they drift away from the
mark — trading at a discount or a premium that the reference market cannot correct until it
opens again.

That drift is the product. Agents buy the discount, sell the premium, and the profit is
distributed in **stock, not stablecoins**. The gap is measurable, and it is the reason the
system exists.

## How it works

Two unrelated problems stood between the thesis and a working product. Both are solved
on-chain by a single Anchor program, [`stock_vault`](programs/stock_vault).

**1. Raw PreStocks cannot be a bonding-curve quote asset.**
They are Token-2022 mints with a non-zero transfer fee. Meteora's DBC program rejects them
with `QuoteMintHasNonZeroTransferFee` (6081), and a token badge does not help — a badge
cannot authorise a non-zero fee. So the program mints a **zero-fee classic-SPL wrapper**,
`wPreStock`, 1:1 backed by PreStock held in a program-owned vault, enforcing
`supply(wPreStock) == reserve(PreStock)`.

**2. Lump-sum dividends can be farmed.**
A reward pool paid out in one deposit hands a pro-rata share to anyone who stakes in the
same block. The vault **streams rewards per slot** instead, so yield is paid for time held
and the vault is solvent by construction.

```
PreStock (Token-2022)
      │  wrap
      ▼
wPreStock (0-fee SPL) ──quote mint──► Meteora DBC pool ◄──► $AGENT
      ▲                                     │ trading fees
      │                                     ▼
      └────── stream rewards ──────── DividendVault ◄──── stakers
```

The off-chain agent runtime closes the loop: read the Pyth reference price and the on-chain
DEX price → detect the basis → execute → record the trade. `log_arb` copies the Pyth fields
from the recorded `Signal` rather than trusting the caller, which is what makes the
execution log *evidence* instead of a claim.

## Stack

| Layer | Technology |
|---|---|
| Program | Rust · Anchor 0.32 · `stock_vault` |
| Prices | Pyth (on-chain `PriceUpdateV2` reads, attested in the log) |
| Liquidity | Meteora Dynamic Bonding Curve |
| Agent runtime | TypeScript (`tsx`), read-only by default |
| Frontend | Next.js 16 · React 19 · Tailwind v4 · `@solana/kit` + `@solana/react-hooks` |
| Tooling | pnpm workspace · Mocha/Chai integration tests |

## Layout

```
offhours/
├── programs/stock_vault/   Anchor program — wrapper, registry, streaming vault,
│                           Pyth pricing, signal + execution log
├── tests/                  integration tests (stock_vault, vault, pyth, execution)
├── fixtures/               real mainnet Pyth accounts, replayed into the local validator
├── agent/src/              off-chain agent runtime (config, market, signal, execution, runner)
├── experiments/            day-0 probes: the evidence behind the constraints
├── scripts/                devnet ops: deploy, smoke, pool seeding, browser checks
├── web/                    Next.js frontend (marketing site, app dashboard, operator console)
└── AGENTS.md               contributor entry point: status, commands, gotchas
```

**Program id:** `FoVBZRFCamH1HNMiVpNZV2QJxk9bSxWtQvKgmqZ1rVLw`
**Meteora DBC program:** `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`

## Getting started

Requires **Rust 1.89**, **Anchor 0.32**, **Node 22+**, and **pnpm**.

```bash
pnpm install

# program
anchor build
anchor test                                    # 30 integration tests
cargo test --manifest-path programs/stock_vault/Cargo.toml   # 15 unit tests

# frontend
cd web && pnpm exec next dev -p 3939

# agent runtime (read-only pass)
pnpm exec tsx agent/src/index.ts --feeds
ANGEL_ONCE=1 pnpm exec tsx agent/src/index.ts
```

Copy `web/.env.example` to `web/.env.local` and fill in an RPC endpoint before running the
frontend. The public cluster rate-limits `getProgramAccounts`, so a dedicated RPC
(Helius/QuickNode) is strongly recommended. **Never commit real keys** — `.env*` and
keypair files are gitignored.

To exercise the full path against devnet:

```bash
pnpm exec tsx scripts/devnet-smoke.ts    # wrapper → registry → streaming vault
pnpm exec tsx scripts/devnet-pool.ts     # a tradable devnet agent (wrapper + DBC pool + vault)
```

## Status

The program is **live on devnet** and the whole loop runs on-chain — wrapper, agent
registry, streaming vault, Pyth-attested execution log, browser sign → relay, and a
self-serve devnet beta with a faucet. Mainnet deploy is prepared and waiting on ~2.9 SOL of
account rent.

## Naming

The project was called **Angel** until Sep 2026 and was renamed **Offhrs**. The frontend is
fully renamed; the Rust identifiers (`AngelError`), the agent runtime, and a few comments
still use the old name. It is cosmetic, and `anchor build` keeps it honest.

---

Built for the **Stocklana** hackathon on Solana.
