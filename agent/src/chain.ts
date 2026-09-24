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

/**
 * The IDL the agent decodes accounts with. `target/` is gitignored (it is build
 * output), so a committed copy lives in `agent/idl/` — the runner has to be able to
 * start on a host that never ran `anchor build`. Prefer the local copy, fall back
 * to the build output for development.
 */
const IDL_PATH =
  [
    path.resolve(process.cwd(), "agent/idl/stock_vault.json"),
    path.resolve(process.cwd(), "target/idl/stock_vault.json"),
  ].find((p) => fs.existsSync(p)) ?? path.resolve(process.cwd(), "agent/idl/stock_vault.json");

export function loadKeypair(): Keypair {
  // A host like Render has no keypair file, so an inline key wins when present.
  // Accepts the JSON array a `solana-keygen` file holds, or base58.
  const inline = process.env.AGENT_KEYPAIR?.trim();
  if (inline) {
    const bytes = inline.startsWith("[")
      ? Uint8Array.from(JSON.parse(inline) as number[])
      : base58Decode(inline);
    return Keypair.fromSecretKey(bytes);
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(config.keypairPath, "utf8"))),
  );
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(s: string): Uint8Array {
  const bytes: number[] = [0];
  for (const ch of s) {
    let carry = B58.indexOf(ch);
    if (carry < 0) throw new Error("AGENT_KEYPAIR is not valid base58");
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const ch of s) {
    if (ch !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

/**
 * Load the program. Pass a keypair to act as a specific agent's signer; omit it
 * and the operator key from `loadKeypair()` is used.
 */
export function loadProgram(keypair?: Keypair): {
  program: anchor.Program;
  provider: anchor.AnchorProvider;
} {
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
  const connection = new Connection(config.rpcUrl, "confirmed");
  const wallet = new anchor.Wallet(keypair ?? loadKeypair());
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new anchor.Program(idl, provider);
  return { program, provider };
}

/**
 * A program for **reads only**.
 *
 * Anchor needs a wallet to build a provider, but reads never sign — so a throwaway
 * key is enough. This is what lets the runner start on a host with no keypair file
 * (Render). Writes must go through `loadProgram(agentSignerFor(mint))`.
 */
export function loadReadOnlyProgram(): {
  program: anchor.Program;
  provider: anchor.AnchorProvider;
} {
  return loadProgram(Keypair.generate());
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

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

export const vaultPda = (programId: PublicKey, mint: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("vault"), mint.toBuffer()], programId)[0];
export const stakeVaultPda = (programId: PublicKey, vault: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("stake_vault"), vault.toBuffer()], programId)[0];
export const rewardVaultPda = (programId: PublicKey, vault: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("reward_vault"), vault.toBuffer()], programId)[0];

/**
 * Route profit into the dividend vault.
 *
 * `logArb` only writes the record; this is the instruction that actually moves
 * the money, and the only way a holder ever sees an accrued balance. The caller
 * must be the agent's creator or its execution signer, and must already hold the
 * wrapped PreStock it is depositing.
 */
export async function depositRewards(
  program: anchor.Program,
  agent: PublicKey,
  agentMint: PublicKey,
  rewardMint: PublicKey,
  amount: bigint,
  durationSlots: number,
  depositorRewardAccount: PublicKey,
) {
  const vault = vaultPda(program.programId, agentMint);
  return program.methods
    .depositRewards(new anchor.BN(amount.toString()), new anchor.BN(durationSlots))
    .accountsStrict({
      depositor: program.provider.publicKey!,
      agent,
      vault,
      rewardMint,
      rewardVault: rewardVaultPda(program.programId, vault),
      depositorRewardAccount,
      rewardTokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

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
  "meteoraDbc",
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
    MeteoraDbc: "meteoraDbc",
  };
  return map[v] ?? "other";
};
