/**
 * Angel agent runtime.
 *
 *   snapshot -> decide -> (attest on-chain) -> execute -> (log on-chain)
 *
 * Defaults to dry-run so the signal engine is fully inspectable with no funds
 * and no keys:
 *
 *   pnpm exec tsx agent/src/index.ts                 # one pass, no writes
 *   ANGEL_ONCE=1 pnpm exec tsx agent/src/index.ts    # same, explicit
 */
import { Connection, PublicKey } from "@solana/web3.js";

import { config, FEED_IDS } from "./config.js";
import { type MarketSnapshot } from "./market.js";
import { shouldExecute, DEFAULT_PARAMS, type Decision } from "./signal.js";
import { runAgentPass } from "./pass.js";
import * as chain from "./chain.js";

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

const fmtBps = (bps: number) =>
  `${bps >= 0 ? "+" : ""}${bps}bps`.padStart(9);

function report(snap: MarketSnapshot, d: Decision) {
  const reg = d.regime === "frozen" ? c.yellow("FROZEN") : c.green("LIVE  ");
  console.log(
    c.bold(`\n${snap.prestock.symbol}`) +
      c.dim(` (${snap.prestock.name})`) +
      c.dim(`  ${snap.at}`),
  );
  console.log(`  reference ${c.cyan(config.referenceFeed)}  regime ${reg}` +
    c.dim(`  (${snap.pyth.stalenessSecs}s stale, publish ${new Date(snap.pyth.publishTime * 1000).toISOString()})`));
  const scaled = snap.pyth.price * 10 ** snap.pyth.exponent;
  console.log(
    `  pyth      ${c.cyan("$" + scaled.toLocaleString(undefined, { maximumFractionDigits: 6 }))}` +
      c.dim(`  raw ${snap.pyth.price}e${snap.pyth.exponent}  conf ±${snap.pyth.conf}`),
  );

  console.log(
    `  spv mark  $${snap.prestock.markPrice.toFixed(2)}` +
      c.dim(`   (markVal $${(snap.prestock.markValuation / 1e9).toFixed(2)}B)`),
  );
  console.log(
    `  api token $${snap.prestock.tokenPrice.toFixed(2)}` +
      c.dim(`  unscaled`),
  );
  console.log(
    `  dex quote $${snap.dex.priceUsd.toFixed(2)}` +
      c.dim(`  via ${snap.dex.route.join(" -> ") || "n/a"}, impact ${(snap.dex.priceImpactPct * 100).toFixed(3)}%`),
  );
  console.log(
    `  multiplier ${c.cyan(snap.effectiveMultiplier.toFixed(4) + "x")} derived from quote/API` +
      c.dim(`  (scaledUiAmount — the API is unscaled)`),
  );

  const edge = d.edgeBps;
  const edgeStr = edge > 0 ? c.green(fmtBps(edge)) : edge < 0 ? c.red(fmtBps(edge)) : fmtBps(edge);
  console.log(`  basis      ${edgeStr}   net ${fmtBps(d.netEdgeBps)} after ~${DEFAULT_PARAMS.costBps}bps costs`);
  console.log(`  decision   ${c.bold(d.direction)}`);

  if (d.warnings.length) for (const w of d.warnings) console.log(`  ${c.yellow("warn")}       ${w}`);
  console.log(c.dim(`  reason     ${d.reason}`));
}

async function onePass(conn: Connection, execute: boolean) {
  if (execute && !config.agentMint) {
    throw new Error(
      "ANGEL_AGENT_MINT is required for on-chain writes (the $AGENT mint the Agent PDA is seeded by).",
    );
  }

  const { program } = execute ? chain.loadProgram() : chain.loadReadOnlyProgram();
  const pass = await runAgentPass({
    program,
    conn,
    agentMint: config.agentMint ? new PublicKey(config.agentMint) : PublicKey.default,
    symbol: config.symbol,
    execute,
  });

  report(pass.snap, pass.decision);

  if (!shouldExecute(pass.decision)) {
    console.log(c.dim(`  action     none (${config.execution} backend idle)\n`));
  } else if (!execute) {
    console.log(
      c.dim(`  action     actionable but read-only — set --execute to send (backend ${config.execution})\n`),
    );
  } else if (pass.executed) {
    console.log(c.green(`  attested   record_signal ${pass.signalSignature}`));
    if (pass.result) console.log(c.dim(`  execute    ${pass.result.backend}: ${pass.result.detail}`));
    console.log(c.green(`  logged     log_arb ${pass.executionSignature}`));
    if (pass.routeSignature) {
      console.log(c.green(`  routed     deposit_rewards ${pass.routeSignature}`));
    }
    console.log("");
  }

  return pass;
}

/** Print the on-chain execution log — the §8 "live terminal" data source. */
async function showExecutions() {
  const { program } = chain.loadReadOnlyProgram();
  if (!config.agentMint) {
    throw new Error("ANGEL_AGENT_MINT is required to read an agent's execution log.");
  }
  const agent = chain.agentPda(program.programId, new PublicKey(config.agentMint));
  const rows = await chain.readExecutions(program, agent);
  console.log(c.bold(`\n=== on-chain execution log (${agent.toBase58()}) ===`));
  if (!rows.length) {
    console.log(c.dim("  no executions logged yet"));
    return;
  }
  for (const r of rows) {
    console.log(
      `  #${String(r.index).padStart(3)}  ${r.venue.padEnd(14)} ` +
        `in ${r.amountIn.padStart(14)} -> out ${r.amountOut.padStart(14)}  ` +
        c.green(`profit ${r.profit.padStart(12)}`) +
        c.dim(`  pyth $${r.pythPrice}e${r.pythExponent} ${r.regime} ${r.stalenessSecs}s`),
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const conn = new Connection(config.rpcUrl, "confirmed");

  if (args.includes("--feeds")) {
    console.log(c.bold("\nKnown permissionless on-chain feeds:"));
    for (const [sym, id] of Object.entries(FEED_IDS)) console.log(`  ${sym.padEnd(24)} ${c.dim(id)}`);
    console.log(
      c.dim("\nEquity.Index.OPENAI/ANTHROPIC are gated on Hermes AND absent on-chain.\n"),
    );
    return;
  }

  if (args.includes("--log")) {
    await showExecutions();
    return;
  }

  console.log(c.bold("\n=== Angel agent ==="));
  console.log(
    c.dim(
      `execution=${config.execution}  symbol=${config.symbol}  reference=${config.referenceFeed}` +
        `  minEdge=${config.minEdgeBps}bps  mode=${execute ? "EXECUTE" : "read-only"}\n`,
    ),
  );

  await onePass(conn, execute);
  if (config.once || execute) return;

  console.log(c.dim(`\nlooping every ${config.loopSeconds}s — ctrl-c to stop`));
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await new Promise((r) => setTimeout(r, config.loopSeconds * 1000));
    try {
      await onePass(conn, execute);
    } catch (e: any) {
      console.log(c.red(`pass failed: ${e?.message ?? e}`));
    }
  }
}

main().catch((e) => {
  console.error(c.red(`\nfatal: ${e?.message ?? e}`));
  process.exit(1);
});
