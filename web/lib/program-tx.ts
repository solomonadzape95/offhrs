/**
 * Unsigned transaction builders for the write path.
 *
 * Server-side only. These take the connected wallet's address and build a legacy
 * transaction with `@solana/web3.js` — no key is involved, so nothing is signed
 * here. `app/actions.ts` serialises the result to base64; the browser decodes it
 * with `@solana/kit`, hands it to the wallet to sign, and posts the signed bytes
 * back to be relayed. That keeps web3.js and the instruction encoding out of the
 * client bundle.
 *
 * The instruction discriminators are copied from `target/idl/stock_vault.json`
 * and the account order mirrors the `#[derive(Accounts)]` structs in `vault.rs`.
 * An idempotent associated-token-account create is prepended to each so the
 * transaction is self-sufficient — a wallet that has never held the token does
 * not fail on a missing ATA.
 */
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

import {
  PROGRAM_ID,
  fetchAgentByPda,
  rewardVaultPda,
  stakePda,
  stakeVaultPda,
} from "./chain";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
const SYSTEM_PROGRAM_ID = SystemProgram.programId;

const DISC = {
  stake: Uint8Array.from([206, 176, 202, 18, 200, 209, 179, 108]),
  unstake: Uint8Array.from([90, 95, 107, 42, 205, 124, 50, 225]),
  claim: Uint8Array.from([62, 198, 214, 193, 213, 159, 108, 210]),
} as const;

function u64le(v: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
}

const associatedAddress = (owner: PublicKey, mint: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];

/** `CreateIdempotent` on the Associated Token Program — a no-op if it exists. */
function createAtaIdempotent(payer: PublicKey, owner: PublicKey, mint: PublicKey) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedAddress(owner, mint), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

async function context(owner: string, agentAddress: string) {
  const agent = await fetchAgentByPda(agentAddress);
  if (!agent) throw new Error("No agent at that address on this cluster.");
  const ownerKey = new PublicKey(owner);
  const vault = new PublicKey(agent.vault);
  return {
    ownerKey,
    vault,
    stakingMint: new PublicKey(agent.agentTokenMint),
    rewardMint: new PublicKey(agent.wrappedMint),
  };
}

export async function buildStakeTransaction(
  owner: string,
  agentAddress: string,
  amountRaw: bigint,
  blockhash: string,
): Promise<Transaction> {
  if (amountRaw <= 0n) throw new Error("Amount must be greater than zero.");
  const { ownerKey, vault, stakingMint } = await context(owner, agentAddress);

  const tx = new Transaction().add(createAtaIdempotent(ownerKey, ownerKey, stakingMint));
  tx.add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: ownerKey, isSigner: true, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: stakingMint, isSigner: false, isWritable: false },
        { pubkey: stakeVaultPda(vault), isSigner: false, isWritable: true },
        { pubkey: associatedAddress(ownerKey, stakingMint), isSigner: false, isWritable: true },
        { pubkey: stakePda(vault, ownerKey), isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([Buffer.from(DISC.stake), u64le(amountRaw)]),
    }),
  );
  tx.feePayer = ownerKey;
  tx.recentBlockhash = blockhash;
  return tx;
}

export async function buildUnstakeTransaction(
  owner: string,
  agentAddress: string,
  amountRaw: bigint,
  blockhash: string,
): Promise<Transaction> {
  if (amountRaw <= 0n) throw new Error("Amount must be greater than zero.");
  const { ownerKey, vault, stakingMint } = await context(owner, agentAddress);

  const tx = new Transaction().add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: ownerKey, isSigner: true, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: stakingMint, isSigner: false, isWritable: false },
        { pubkey: stakeVaultPda(vault), isSigner: false, isWritable: true },
        { pubkey: associatedAddress(ownerKey, stakingMint), isSigner: false, isWritable: true },
        { pubkey: stakePda(vault, ownerKey), isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([Buffer.from(DISC.unstake), u64le(amountRaw)]),
    }),
  );
  tx.feePayer = ownerKey;
  tx.recentBlockhash = blockhash;
  return tx;
}

export async function buildClaimTransaction(
  owner: string,
  agentAddress: string,
  blockhash: string,
): Promise<Transaction> {
  const { ownerKey, vault, rewardMint } = await context(owner, agentAddress);

  const tx = new Transaction().add(createAtaIdempotent(ownerKey, ownerKey, rewardMint));
  tx.add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: ownerKey, isSigner: true, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: rewardMint, isSigner: false, isWritable: false },
        { pubkey: rewardVaultPda(vault), isSigner: false, isWritable: true },
        { pubkey: associatedAddress(ownerKey, rewardMint), isSigner: false, isWritable: true },
        { pubkey: stakePda(vault, ownerKey), isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(DISC.claim),
    }),
  );
  tx.feePayer = ownerKey;
  tx.recentBlockhash = blockhash;
  return tx;
}
