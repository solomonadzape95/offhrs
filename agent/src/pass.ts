/**
 * One agent's pass, start to finish.
 *
 *   snapshot -> decide -> attest (record_signal) -> execute -> log (log_arb) -> route (deposit_rewards)
 *
 * This is the sequence both the single-agent runtime and the multi-agent runner
 * use. It is deliberately the only place that knows the order, so the two entry
 * points cannot drift apart.
 *
 * Two honest notes about "execute":
 *   - The decision engine trades the **stock** (wPreStock / PreStock) against its
 *     reference mark. It does not trade the agent's own `$AGENT` curve — that is
 *     where holders trade, and its fee is the vault's other income.
 *   - The profit only reaches holders after `deposit_rewards`. `log_arb` writes
 *     the record and moves nothing. This function does both.
 */
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

import { config, requireFeedId } from "./config.js";
import * as chain from "./chain.js";
import { collectSnapshot, type MarketSnapshot } from "./market.js";
import { decide, shouldExecute, type Decision } from "./signal.js";
import { selectAdapter, type ExecuteResult } from "./execution.js";

export type AgentPass = {
  snap: MarketSnapshot;
  decision: Decision;
  executed: boolean;
  result?: ExecuteResult;
  signalSignature?: string;
  executionSignature?: string;
  routeSignature?: string;
};

export type RunAgentPassInput = {
  program: anchor.Program;
  conn: Connection;
  /**
   * RPC for the market snapshot's Pyth leg. Defaults to `conn`. On devnet, pass a
   * mainnet connection — the program is on devnet but the equity feed is not.
   */
  marketConn?: Connection;
  /** The `$AGENT` mint. The `Agent` PDA is seeded by it, not by the PreStock. */
  agentMint: PublicKey;
  symbol: string;
  /** When false, the pass decides and stops — no writes, no wallet needed. */
  execute: boolean;
  notional?: bigint;
  rewardSlots?: number;
};

export async function runAgentPass(input: RunAgentPassInput): Promise<AgentPass> {
  const { program, conn, agentMint, symbol, execute } = input;

  const market = input.marketConn ?? conn;
  const snap = await collectSnapshot(market, symbol, config.referenceFeed, config.frozenAfterSecs);
  const decision = decide(snap);

  if (!shouldExecute(decision) || !execute) {
    return { snap, decision, executed: false };
  }

  const agent = chain.agentPda(program.programId, agentMint);
  const adapter = selectAdapter();
  if (!adapter.ready()) {
    throw new Error(`execution backend "${adapter.name}" is not ready`);
  }

  // 1. Attest the Pyth read. `log_arb` requires a Signal, so the record can never
  //    be detached from a real oracle read.
  const signalSignature = await chain.recordSignal(program, agent, new PublicKey(snap.pyth.account), {
    feedIdHex: requireFeedId(config.referenceFeed),
    maxStalenessSecs: config.maxStalenessSecs,
    frozenAfterSecs: config.frozenAfterSecs,
  });

  // 2. Execute the arbitrage. The signer is the app-owned agent key, so the
  //    wallet that pays is the agent, not the operator.
  const result = await adapter.execute(snap, decision, input.notional ?? config.notional, {
    connection: conn,
    signer: (program.provider as anchor.AnchorProvider).wallet.payer,
  });

  // 3. Log it. The oracle fields are copied from the Signal on chain.
  const account: any = await chain.readAgent(program, agent);
  const executionSignature = await chain.logArb(
    program,
    agent,
    requireFeedId(config.referenceFeed),
    Number(account.executionCount),
    result.amountIn,
    result.amountOut,
    chain.venueFromAdapter(result.venue),
  );

  // 4. Route the profit. This is the step that actually pays holders.
  const profit = result.amountOut > result.amountIn ? result.amountOut - result.amountIn : 0n;
  let routeSignature: string | undefined;
  if (profit > 0n) {
    const rewardMint = account.wrappedMint as PublicKey;
    const depositorRewardAccount = getAssociatedTokenAddressSync(
      rewardMint,
      program.provider.publicKey!,
    );
    routeSignature = await chain.depositRewards(
      program,
      agent,
      agentMint,
      rewardMint,
      profit,
      input.rewardSlots ?? config.rewardDurationSlots,
      depositorRewardAccount,
    );
  }

  return {
    snap,
    decision,
    executed: true,
    result,
    signalSignature,
    executionSignature,
    routeSignature,
  };
}
