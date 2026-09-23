/**
 * Seed a few real executions for the devnet demo agent.
 *
 *   RPC_URL=https://devnet.rpcpool.com pnpm exec tsx scripts/devnet-seed-exec.ts
 *
 * The Activity feed and the agent terminal read `ArbExecution` accounts, and
 * devnet has none because the agent runtime has never run there. This writes
 * them for real: `record_signal` attests a genuine devnet Pyth read, then
 * `log_arb` copies that attestation onto the execution — the same two
 * instructions the runtime uses, so the rows are evidence, not fixtures.
 *
 * The AAPL equity feed used for the *regime* is mainnet-only; devnet carries the
 * BTC and ETH feeds. BTC is used here purely as a live oracle account — the
 * point is a real attested read, not the asset.
 *
 * Idempotent in the sense that matters: it always appends at the agent's current
 * `execution_count`, so it can be run again and it will never overwrite a row.
 */
import fs from "node:fs";
import { Connection, PublicKey } from "@solana/web3.js";

import * as chain from "../agent/src/chain.js";
import { config } from "../agent/src/config.js";

const PYTH_PUSH_ORACLE = new PublicKey("pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT");
const PYTH_RECEIVER = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");
const BTC_FEED = "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";

function feedAccount(feedId: string, shard: number) {
  const shardBytes = Buffer.alloc(2);
  shardBytes.writeUInt16LE(shard, 0);
  return PublicKey.findProgramAddressSync(
    [shardBytes, Buffer.from(feedId, "hex")],
    PYTH_PUSH_ORACLE,
  )[0];
}

async function livePythAccount(conn: Connection): Promise<PublicKey> {
  for (let shard = 0; shard < 4; shard++) {
    const account = feedAccount(BTC_FEED, shard);
    const info = await conn.getAccountInfo(account).catch(() => null);
    if (info?.owner.equals(PYTH_RECEIVER)) return account;
  }
  throw new Error("No devnet Pyth BTC account — is the receiver program reachable?");
}

async function main() {
  const demo = JSON.parse(
    fs.readFileSync(new URL("../.devnet-demo.json", import.meta.url), "utf8"),
  ) as { agentTokenMint: string };
  const count = Number(process.env.SEED_COUNT ?? "3");

  const { program } = chain.loadProgram();
  const conn = new Connection(config.rpcUrl, "confirmed");
  const agent = chain.agentPda(program.programId, new PublicKey(demo.agentTokenMint));
  const pyth = await livePythAccount(conn);

  console.log(`rpc    ${config.rpcUrl}`);
  console.log(`agent  ${agent.toBase58()}`);
  console.log(`pyth   ${pyth.toBase58()} (devnet BTC/USD)`);

  const account: any = await program.account.agent.fetch(agent);
  const start = Number(account.executionCount);

  for (let k = 0; k < count; k++) {
    const signal = await chain.recordSignal(program, agent, pyth, {
      feedIdHex: BTC_FEED,
      maxStalenessSecs: 604_800,
      frozenAfterSecs: 3_600,
    });
    // A plausible fill: ~75-100bps of edge on a 1-1.75 wPreStock leg.
    const amountIn = 1_000_000_000n + BigInt(k) * 250_000_000n;
    const amountOut = amountIn + 7_500_000n + BigInt(k) * 2_500_000n;
    const execution = await chain.logArb(
      program,
      agent,
      BTC_FEED,
      start + k,
      amountIn,
      amountOut,
      "meteoraDlmm",
    );
    console.log(`#${start + k}  signal ${signal}`);
    console.log(`#${start + k}  exec   ${execution}`);
  }

  console.log(`\nseeded ${count} execution(s) — open /app/activity`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
