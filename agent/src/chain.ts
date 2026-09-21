/**
 * On-chain program client.
 *
 * Writes are gated behind an explicit execute flag: by default the agent only
 * reads. The IDL is loaded from disk rather than imported so tsx doesn't need
 * JSON import assertions.
 */
import fs from "node:fs";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

import { config } from "./config.js";

const IDL_PATH = path.resolve(process.cwd(), "target/idl/stock_vault.json");

export function loadKeypair(): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(config.keypairPath, "utf8"))),
  );
}

export function loadProgram(): { program: anchor.Program; provider: anchor.AnchorProvider } {
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
  const connection = new Connection(config.rpcUrl, "confirmed");
  const wallet = new anchor.Wallet(loadKeypair());
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new anchor.Program(idl, provider);
  return { program, provider };
}

export const agentPda = (programId: PublicKey, mint: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("agent"), mint.toBuffer()], programId)[0];

export const signalPda = (programId: PublicKey, agent: PublicKey, feedId: number[]) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("signal"), agent.toBuffer(), Buffer.from(feedId)],
    programId,
  )[0];

export const execPda = (programId: PublicKey, agent: PublicKey, index: number) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(index));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("exec"), agent.toBuffer(), b],
    programId,
  )[0];
};

export async function readAgent(program: anchor.Program, agent: PublicKey) {
  return program.account.agent.fetch(agent);
}

/** Fetch logged executions by walking the PDA sequence from 0 to the counter. */
export async function readExecutions(program: anchor.Program, agent: PublicKey, limit = 20) {
  const a: any = await readAgent(program, agent);
  const count = Number(a.executionCount);
  const from = Math.max(0, count - limit);
  const out: any[] = [];
  for (let i = from; i < count; i++) {
    try {
      const e: any = await program.account.arbExecution.fetch(
        execPda(program.programId, agent, i),
      );
      out.push({
        index: Number(e.index),
        venue: Object.keys(e.venue)[0],
        amountIn: e.amountIn.toString(),
        amountOut: e.amountOut.toString(),
        profit: e.profit.toString(),
        pythPrice: e.pythPrice.toString(),
        pythExponent: e.pythExponent,
        regime: Object.keys(e.regime)[0],
        stalenessSecs: Number(e.pythStalenessSecs),
        executedAt: Number(e.executedAt),
      });
    } catch {
      // gap in the sequence — skip
    }
  }
  return out;
}

export type SignalWrite = {
  feedIdHex: string;
  maxStalenessSecs: number;
  frozenAfterSecs: number;
};

/** Attest a Pyth read on-chain. This must precede any `logArb`. */
export async function recordSignal(
  program: anchor.Program,
  agent: PublicKey,
  pythAccount: PublicKey,
  w: SignalWrite,
) {
  const feedId = Array.from(Buffer.from(w.feedIdHex, "hex"));
  return program.methods
    .recordSignal(feedId, new anchor.BN(w.maxStalenessSecs), new anchor.BN(w.frozenAfterSecs))
    .accountsStrict({
      authority: program.provider.publicKey!,
      agent,
      priceUpdate: pythAccount,
      signal: signalPda(program.programId, agent, feedId),
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();
}

const VENUES = [
  "jupiter",
  "raydium",
  "meteoraDlmm",
  "meteoraDammV2",
  "orca",
  "clawpump",
  "other",
] as const;

export type VenueName = (typeof VENUES)[number];

export async function logArb(
  program: anchor.Program,
  agent: PublicKey,
  feedIdHex: string,
  index: number,
  amountIn: bigint,
  amountOut: bigint,
  venue: VenueName,
) {
  const feedId = Array.from(Buffer.from(feedIdHex, "hex"));
  return program.methods
    .logArb(
      new anchor.BN(index),
      new anchor.BN(amountIn.toString()),
      new anchor.BN(amountOut.toString()),
      { [venue]: {} } as any,
    )
    .accountsStrict({
      authority: program.provider.publicKey!,
      agent,
      signal: signalPda(program.programId, agent, feedId),
      execution: execPda(program.programId, agent, index),
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();
}

export const venueFromAdapter = (v: string): VenueName => {
  const map: Record<string, VenueName> = {
    Jupiter: "jupiter",
    Raydium: "raydium",
    MeteoraDlmm: "meteoraDlmm",
    MeteoraDammV2: "meteoraDammV2",
    Orca: "orca",
    Clawpump: "clawpump",
    Other: "other",
  };
  return map[v] ?? "other";
};
