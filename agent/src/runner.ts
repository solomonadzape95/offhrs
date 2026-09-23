/**
 * Registry-driven multi-agent runner.
 *
 * The single-agent runtime (`index.ts`) is a loop for one symbol. This is the
 * shape a hosted service needs: enumerate every `Agent` on chain, drop the beta
 * and test ones, and run the decision engine for each — one job per registered
 * agent, on a schedule.
 *
 *   pnpm exec tsx agent/src/runner.ts              # one sweep, read-only
 *   pnpm exec tsx agent/src/runner.ts --loop       # sweep on an interval
 *
 * What this file is: discovery, filtering and the per-agent schedule. The pass it
 * runs (`pass.ts`) signs with each agent's app-owned key. It is read-only until
 * the program is on mainnet and the agent wallets are funded — see the note at the
 * bottom.
 *
 * On devnet the assets are mocks and the equity feed is mainnet-only, so the
 * snapshot is read from a separate mainnet connection (`MARKET_RPC_URL`) and the
 * mock wrapper is mapped back to the real underlying symbol.
 *
 * Filtering is by creator. There is no on-chain beta flag, so:
 *   - `AGENT_INCLUDE_CREATORS` (allowlist) wins when set;
 *   - otherwise `AGENT_EXCLUDE_CREATORS` plus the known beta set is used.
 * Keep `BETA_CREATORS` in sync with `HIDDEN_AGENT_CREATORS` in
 * `web/lib/chain.ts`.
 */
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";

import { config } from "./config.js";
import * as chain from "./chain.js";
import { agentSignerFor } from "./agent-keys.js";
import { runAgentPass } from "./pass.js";
import { shouldExecute } from "./signal.js";

/** Mirror of `HIDDEN_AGENT_CREATORS` in `web/lib/chain.ts`. */
const BETA_CREATORS = new Set<string>([
  "7fnhz4V3Wdax3r8yGU8zfE1sG4BNKcwLxVfwHJUbFEhv",
  "EAzreuDuUYYhVGUKadmqLPgxbzHBqfScmsxbzsNhZ4pV",
  "2Tf4FM8XAzG15hmyi2b5WU5nm2HaJxJr6tKmarn5rCPn",
  "Cxrg8bzNJ31ASS2D1o2F2kgZWnwgFs1i2PmKXUUr6jU",
  "FtsN8Z4Jreokop6ieszp43tTYHGqv7fryJ67o3khBGpE",
  "2X9aab1UvabVbfHUCJqX5aF2SUCsegerE6evLeSWufkR",
  "2bzf6MDmz43X1Zi1iisfYC7N3Ys3t8fs8ZXTvoqdyRom",
]);

/**
 * Mirror of `IDENTITIES` in `web/lib/devnet-assets.ts`: devnet has no symbols on
 * chain, so the mocks borrow the identity of the real shares they stand in for,
 * assigned by sorted prestock mint. We map to the **underlying** symbol, because
 * the snapshot is fetched from the real issuer API.
 */
const DEVNET_IDENTITIES = [
  "SPACEX",
  "OPENAI",
  "ANDURIL",
  "ANTHROPIC",
  "NEURALINK",
  "KALSHI",
  "POLYMARKET",
  "FIGUREAI",
] as const;

function devnetSymbol(prestockMint: string, sorted: string[]): string | null {
  const i = sorted.indexOf(prestockMint);
  return i < 0 ? null : DEVNET_IDENTITIES[i % DEVNET_IDENTITIES.length];
}

const list = (name: string) =>
  (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** prestock_mint -> symbol, from the issuer's public API. Empty on devnet. */
async function fetchSymbols(): Promise<Map<string, string>> {
  try {
    const res = await fetch("https://prestocks.com/api/prestocks");
    if (!res.ok) return new Map();
    const all = (await res.json()) as { contract_address?: string; symbol?: string }[];
    return new Map(
      all
        .filter((p) => p.contract_address && p.symbol)
        .map((p) => [String(p.contract_address), String(p.symbol)]),
    );
  } catch {
    return new Map();
  }
}

async function sweep(
  program: anchor.Program,
  conn: Connection,
  marketConn: Connection,
  execute: boolean,
) {
  // `program.account` is untyped through the JSON IDL; the names match the Rust
  // account structs (`Agent`, `WrapperConfig`).
  const accounts = program.account as any;
  const [agents, wrappers] = await Promise.all([
    accounts.agent.all(),
    accounts.wrapperConfig.all(),
  ]);

  const wrappedToPrestock = new Map(
    (wrappers as any[]).map((w) => [
      w.account.wrappedMint.toBase58(),
      w.account.prestockMint.toBase58(),
    ]),
  );
  const symbols = await fetchSymbols();
  const isDevnet = config.rpcUrl.includes("devnet");
  const sortedPrestockMints = (wrappers as any[])
    .map((w) => w.account.prestockMint.toBase58())
    .sort();

  const include = new Set(list("AGENT_INCLUDE_CREATORS"));
  const exclude = new Set([...BETA_CREATORS, ...list("AGENT_EXCLUDE_CREATORS")]);

  const inScope = (agents as any[]).filter(({ account }) => {
    const creator = account.creator.toBase58();
    if (include.size > 0) return include.has(creator);
    return !exclude.has(creator);
  });

  console.log(`\n${agents.length} agents on chain · ${inScope.length} in scope`);
  console.log(
    `  filter  ${include.size > 0 ? `allow ${include.size}` : `deny ${exclude.size}`}  ` +
      `cooldown ${process.env.AGENT_COOLDOWN_SECONDS ?? "300"}s`,
  );

  const cooldown = Number(process.env.AGENT_COOLDOWN_SECONDS ?? "300");
  const now = Math.floor(Date.now() / 1000);

  for (const { publicKey, account } of inScope) {
    const creator = account.creator.toBase58();
    const agentMint = account.agentTokenMint.toBase58();
    const wrappedMint = account.wrappedMint.toBase58();
    const prestockMint = wrappedToPrestock.get(wrappedMint) ?? null;
    const symbol = prestockMint
      ? isDevnet
        ? devnetSymbol(prestockMint, sortedPrestockMints)
        : symbols.get(prestockMint) ?? null
      : null;
    const rows = await chain.readExecutions(program, publicKey, 1).catch(() => []);
    const lastAt = rows[0]?.executedAt ?? 0;
    const due = now - lastAt >= cooldown;

    console.log(
      `\n${(symbol ?? "unknown").padEnd(10)} agent ${agentMint.slice(0, 8)}…  ` +
        `creator ${creator.slice(0, 6)}…  executions ${Number(account.executionCount)}`,
    );

    if (!symbol) {
      console.log("  skip    asset not in the issuer universe (devnet mock or unlisted)");
      continue;
    }
    if (!due) {
      console.log(`  skip    acted ${now - lastAt}s ago (cooldown ${cooldown}s)`);
      continue;
    }

    try {
      // Each agent signs with its own app-owned key, derived from the master
      // secret. The operator's keypair is only used to enumerate the registry.
      const agentProgram = execute ? chain.loadProgram(agentSignerFor(agentMint)).program : program;
      const pass = await runAgentPass({
        program: agentProgram,
        conn,
        marketConn,
        agentMint: new PublicKey(agentMint),
        symbol,
        execute,
      });
      console.log(
        `  signal  ${pass.decision.direction}  edge ${pass.decision.edgeBps}bps  ` +
          `net ${pass.decision.netEdgeBps}bps  regime ${pass.snap.regime}`,
      );
      if (pass.executed) {
        console.log(
          `  executed log_arb ${pass.executionSignature}` +
            (pass.routeSignature ? `\n  routed   deposit_rewards ${pass.routeSignature}` : ""),
        );
      } else {
        console.log(
          `  action  ${
            !shouldExecute(pass.decision) ? "none" : execute ? "skipped" : "actionable, read-only"
          }`,
        );
      }
    } catch (e: unknown) {
      console.log(`  error   ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  // Enumeration is read-only. When executing, each agent's own program is loaded
  // below with that agent's derived key.
  const { program } = chain.loadReadOnlyProgram();
  const conn = new Connection(config.rpcUrl, "confirmed");
  const marketConn = new Connection(config.marketRpcUrl, "confirmed");
  const sweepSeconds = Number(process.env.AGENT_SWEEP_SECONDS ?? "120");

  console.log(
    `runner  rpc=${config.rpcUrl}  market=${config.marketRpcUrl}  backend=${config.execution}  ` +
      `mode=${execute ? "EXECUTE" : "read-only"}`,
  );

  const run = async () => {
    try {
      await sweep(program, conn, marketConn, execute);
    } catch (e: unknown) {
      console.error(`sweep failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  await run();
  if (!args.includes("--loop")) return;
  console.log(`\nlooping every ${sweepSeconds}s — ctrl-c to stop`);
  setInterval(() => void run(), sweepSeconds * 1000);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/*
 * Sending
 * -------
 * `runAgentPass` signs with the agent's app-owned key (`agentSignerFor`), so the
 * runner trades as the agent, not as the operator. Two things still gate a real
 * trade:
 *
 *   1. Funds. The agent's wallet must hold the quote asset before it can buy, and
 *      the app must fund it at launch or on first run. An unfunded agent fails its
 *      swap, which the pass surfaces as an error rather than a silent skip.
 *   2. Cluster. Jupiter is mainnet-only, so `ANGEL_EXECUTION=jupiter` only does
 *      anything once the program and the real PreStocks are on mainnet. On devnet
 *      the runner stays on the `dryrun` backend.
 */
