# ANGEL — Day 4 Results (VERIFIED)

Arbitrage execution log (on-chain) + the agent runtime (off-chain). **15/15 unit tests**, **30/30
integration tests**. The agent runs against live market data and produces differentiated signals.

```bash
anchor test                                                    # 30 passing (~2m)
cargo test --manifest-path programs/stock_vault/Cargo.toml      # 15 passing
ANGEL_ONCE=1 pnpm exec tsx agent/src/index.ts                   # live read-only agent pass
```

---

## Part 1 — On-chain: `ArbExecution` + `log_arb`

```
programs/stock_vault/src/
  execution.rs  # NEW  log_arb + ArbLogged event
  state.rs      # UPD  + ArbExecution, ArbVenue, Agent.execution_count / total_profit_logged
```

The design point: **`log_arb` requires a `Signal` account, and the Pyth fields on the record are
copied from that signal by the program — never supplied by the caller.** So an execution cannot be
fabricated without a genuine, current, correctly-identified oracle read behind it. That is what
turns the execution log into *evidence* rather than a claim, and it is what the §8 UI terminal and
the Pyth bounty both need.

`profit` is likewise **derived on-chain** (`amount_out.saturating_sub(amount_in)`), not asserted.
A leg with no edge logs `0` rather than being hidden — tested explicitly.

The PDA is seeded `[b"exec", agent, index.to_le_bytes()]` and the instruction requires
`index == agent.execution_count`, so executions are strictly ordered and cannot be quietly
overwritten.

### Tests — 7 new

| Test | Proves |
|---|---|
| `logs an execution and copies the Pyth attestation from the Signal` | oracle, feed id, price, exponent, `publish_time`, staleness and regime all **identical to the signal's**, and equal to the real AAPL fixture |
| `advances the agent's counters` | `execution_count` and `total_profit_logged` |
| `logs a zero-profit leg rather than hiding it` | a losing leg is recorded, not suppressed |
| `rejects an out-of-order index` | `ExecutionIndexMismatch` |
| `rejects a signal belonging to a different agent` | `SignalAgentMismatch` |
| `rejects an execution with no Signal account at all` | discriminator constraint |
| `rejects a log from someone who is neither creator nor agent signer` | `Unauthorized` |

**A test bug caught:** the "foreign signal" case initially passed a signal PDA for a second agent
that **had never had a signal recorded**, so it was testing "account not found" rather than
"wrong agent". Fixed by recording one first — otherwise the test would have passed forever while
proving nothing.

---

## Part 2 — Off-chain: the agent runtime

```
agent/src/
  config.ts      # env-driven; dry-run by default
  market.ts      # on-chain Pyth read + PreStocks API + executable DEX price
  signal.ts      # the quant core (pure, dependency-free)
  execution.ts   # swappable adapters: dryrun | jupiter | clawpump
  chain.ts       # Anchor client: recordSignal, logArb, read executions
  index.ts       # snapshot -> decide -> attest -> execute -> log
```

### Execution is behind an adapter, deliberately

Clawpump still hasn't answered, and the question is structural: their launch paths are pump.fun /
Metaplex Genesis / Pons with **no Meteora DBC launch and no custom-quote-mint option**. So whether
"Clawpump agent + our own DBC pool" satisfies their bounty text is unresolved.

Rather than block, the venue sits behind `ExecutionAdapter { name, ready(), execute() }`. Whichever
way Clawpump resolves, **only `execution.ts` changes** — the decision loop is untouched.

> ⚠️ **Honesty note:** the `ClawpumpAdapter` is written against their *documented* MCP surface
> (`arbitrage_quote`, `arbitrage_prices`, `swap_execute` at `POST /api/mcp`). I have **no API key**,
> so the JSON-RPC envelope is **unverified**. The `dryrun` and `jupiter` paths are exercised; the
> Clawpump path is a well-formed guess pending a key.

Also honest: `--execute` currently performs the real `record_signal` and `log_arb` writes, but the
adapters return `executed: false` because wallet swap-signing is Day 5 wiring. The signal engine,
the attestation and the log are real; the swap send is not yet.

### The signal engine

```
premiumBps = (markPrice - tokenPrice) / tokenPrice      # PreStocks' own metric
netEdgeBps = |premiumBps| - costBps                     # costBps ~600 (DBC fee + transfer fee)
act only when: |premiumBps| > minEdge  AND  regime == frozen  AND  netEdge > 0
```

Deliberately pessimistic on costs and it **warns rather than silently trusting** when the two
independent price reads disagree. It also self-calibrates the `scaledUiAmount` multiplier as
`dexPrice / apiTokenPrice` — the API reports *unscaled* prices, so this recovers the multiplier
without parsing the Token-2022 extension.

### Live output (Sat 19 Sep 2026, reference `Equity.US.AAPL/USD`, regime FROZEN)

| Symbol | SPV mark | DEX quote | Basis | Net | Decision |
|---|---|---|---|---|---|
| SPACEX | $152.45 | $604.68 | **+2433bps** | +1833 | **buy_prestock** |
| NEURALINK | $330.22 | $410.11 | **−1905bps** | +1305 | **sell_prestock** |
| OPENAI | $987.29 | $1684.43 | **−1305bps** | +705 | **sell_prestock** |
| ANTHROPIC | $1021.03 | $1008.78 | +119bps | −481 | **hold** |

The engine correctly **holds** on ANTHROPIC (inside the threshold) and differentiates the rest.
No simulation anywhere — those are live reads of the PreStocks issuer API, a live Jupiter quote,
and a live on-chain Pyth account.

```
reference Equity.US.AAPL/USD  regime FROZEN  (61789s stale, publish 2026-09-18T23:59:57Z)
pyth      $334.8159  raw 33481590e-5  conf ±6410
spv mark  $152.45
api token $122.62  unscaled
dex quote $604.68  via Meteora DLMM -> Scorch -> BisonFi, impact 1.399%
multiplier 4.9314x derived from quote/API  (scaledUiAmount — the API is unscaled)
basis      +2433bps   net  +1833bps after ~600bps costs
decision   buy_prestock
reason     SPACEX trades 2433bps below its SPV mark on a frozen reference — net 1833bps after costs
```

**That is §2.1 of the source-of-truth doc executing.** The reference market is frozen — its last
print is Friday 23:59:57Z, after-hours close — and the PreStock trades 24% below its SPV mark.

### A design correction found by running it

My first default was `Crypto.BTC/USD` as the reference feed, and it reported `LIVE` (3s stale) so the
agent refused to act. That was a genuine modelling error on my part: **a crypto feed updates 24/7 and
can never express "the reference market is closed."** The regime only means something with an
*equity* clock. Default changed to `Equity.US.AAPL/USD`, which is the market clock — not the asset's
own price. Only running it surfaced this.

---

## CLI

```bash
pnpm exec tsx agent/src/index.ts --feeds     # known permissionless on-chain feeds
pnpm exec tsx agent/src/index.ts             # one pass, read-only (default)
ANGEL_SYMBOL=OPENAI pnpm exec tsx agent/src/index.ts
ANGEL_EXECUTION=jupiter pnpm exec tsx agent/src/index.ts --execute   # writes on-chain
pnpm exec tsx agent/src/index.ts --log       # the on-chain execution log
```

Env: `ANGEL_SYMBOL`, `ANGEL_REFERENCE_FEED`, `ANGEL_MIN_EDGE_BPS`, `ANGEL_EXECUTION`,
`ANGEL_ONCE`, `ANGEL_LOOP_SECONDS`, `RPC_URL`, `CLAWPUMP_API_KEY`.

---

## Status

- **Day 4 — Clawpump agent:** ✅ done, with the Clawpump *driver* unverified pending a key/answer.
- On-chain: wrapper, registry, vault, Pyth signal, execution log — all in one program, 30/30 green.
- Next: **Day 5 — frontend + mainnet.** The UI needs the §8 screens (explore / terminal /
  portfolio), the live execution-log terminal fed by `readExecutions`, the bonding-curve meter, and
  the premium/basis surface.
- Still open: devnet deploy needs **~3.86 SOL** (program is now 555 KB) — the faucet ask I flagged on
  Day 1 grew again.
