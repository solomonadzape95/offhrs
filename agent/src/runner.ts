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
 * What this file is: discovery, filtering and the per-agent schedule. What it is
 * not yet: the send path. Executing for someone else's agent needs that agent's
 * `agent_signer` keypair, which the registry stores but nobody has handed over.
 * See the note at the bottom of this file.
 *
 * Filtering is by creator. There is no on-chain beta flag, so:
 *   - `AGENT_INCLUDE_CREATORS` (allowlist) wins when set;
 *   - otherwise `AGENT_EXCLUDE_CREATORS` plus the known beta set is used.
 * Keep `BETA_CREATORS` in sync with `HIDDEN_AGENT_CREATORS` in
 * `web/lib/chain.ts`.
 */
import * as anchor from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";

import { config } from "./config.js";
import * as chain from "./chain.js";
import { collectSnapshot } from "./market.js";
import { decide, shouldExecute } from "./signal.js";

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

async function sweep(program: anchor.Program, conn: Connection, execute: boolean) {
  const [agents, wrappers] = await Promise.all([
    program.account.agent.all(),
    program.account.wrapperConfig.all(),
  ]);

  const wrappedToPrestock = new Map(
    (wrappers as any[]).map((w) => [
      w.account.wrappedMint.toBase58(),
      w.account.prestockMint.toBase58(),
    ]),
  );
  const symbols = await fetchSymbols();

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
    const symbol = prestockMint ? symbols.get(prestockMint) ?? null : null;
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
      const snap = await collectSnapshot(conn, symbol, config.referenceFeed, config.frozenAfterSecs);
      const decision = decide(snap);
      const actionable = shouldExecute(decision);
      console.log(
        `  signal  ${decision.direction}  edge ${decision.edgeBps}bps  ` +
          `net ${decision.netEdgeBps}bps  regime ${snap.regime}`,
      );
      console.log(
        `  action  ${
          !actionable
            ? "none"
            : execute
              ? "WOULD SEND — see the signer note in runner.ts"
              : "actionable, read-only"
        }`,
      );
    } catch (e: unknown) {
      console.log(`  error   ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const { program } = chain.loadProgram();
  const conn = new Connection(config.rpcUrl, "confirmed");
  const sweepSeconds = Number(process.env.AGENT_SWEEP_SECONDS ?? "120");

  console.log(
    `runner  rpc=${config.rpcUrl}  backend=${config.execution}  ` +
      `mode=${execute ? "EXECUTE" : "read-only"}`,
  );

  const run = async () => {
    try {
      await sweep(program, conn, execute);
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
 * Sending, when the keys exist
 * ----------------------------
 * A registered agent carries `agent_signer`, and the program lets that signer
 * (or the creator) call `record_signal`, `log_arb` and `deposit_rewards`. So a
 * hosted runner needs one keypair per agent. Three ways to get them, in order of
 * how much custody they require:
 *
 *   1. Platform-held signer (easiest to run). At launch, the app generates the
 *      `agent_signer` keypair, stores it encrypted (KMS / a secret manager), and
 *      registers its pubkey. The creator never holds it. This is the only model
 *      that works for a service that runs other people's agents.
 *   2. Creator-held signer (non-custodial). The creator runs their own bot, or
 *      signs a delegated session. More work, less trust required.
 *   3. One operator keypair reused as every agent's signer. Simplest, but a
 *      single leak drains every agent. Only acceptable for the devnet beta.
 *
 * The per-agent pass (`record_signal` -> execute -> `log_arb` -> `deposit_rewards`)
 * is the same code the single-agent runtime already has in `index.ts`; extracting
 * it to `pass.ts` and calling it here with a loaded keypair is the remaining step.
 */
