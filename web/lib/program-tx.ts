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
  agentPda,
  fetchAgentByPda,
  fetchWrapper,
  reservePda,
  rewardVaultPda,
  stakePda,
  stakeVaultPda,
  vaultPda,
  wrapperConfigPda,
} from "./chain";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
const SYSTEM_PROGRAM_ID = SystemProgram.programId;

const DISC = {
  stake: Uint8Array.from([206, 176, 202, 18, 200, 209, 179, 108]),
  unstake: Uint8Array.from([90, 95, 107, 42, 205, 124, 50, 225]),
  claim: Uint8Array.from([62, 198, 214, 193, 213, 159, 108, 210]),
  initializeWrapper: Uint8Array.from([143, 211, 228, 247, 131, 67, 40, 30]),
  registerAgent: Uint8Array.from([135, 157, 66, 195, 2, 113, 175, 30]),
  initializeVault: Uint8Array.from([48, 191, 163, 44, 71, 129, 63, 164]),
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

// ---------------------------------------------------------------------------
// Launch — one-time wrapper init, then register + vault for a launched token.
// The DBC pool that creates the `$AGENT` mint is Clawpump's; these are the
// program-side steps that follow it.
// ---------------------------------------------------------------------------

/**
 * `initialize_wrapper` mints the zero-fee `wPreStock` and its reserve. The wrapped
 * mint is a fresh keypair, so the caller must add its signature as well as the
 * wallet's before sending.
 */
export function buildInitializeWrapperTransaction(
  owner: string,
  prestockMint: string,
  wrappedMint: PublicKey,
  blockhash: string,
): Transaction {
  const admin = new PublicKey(owner);
  const prestock = new PublicKey(prestockMint);
  const wrapperConfig = wrapperConfigPda(prestock);

  const tx = new Transaction().add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: admin, isSigner: true, isWritable: true },
        { pubkey: prestock, isSigner: false, isWritable: false },
        { pubkey: wrapperConfig, isSigner: false, isWritable: true },
        { pubkey: wrappedMint, isSigner: true, isWritable: true },
        { pubkey: reservePda(wrapperConfig), isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(DISC.initializeWrapper),
    }),
  );
  tx.feePayer = admin;
  tx.recentBlockhash = blockhash;
  return tx;
}

/** `register_agent` — binds a launched token to its creator, signer and fee tier. */
export async function buildRegisterAgentTransaction(
  owner: string,
  agentTokenMint: string,
  prestockMint: string,
  agentSigner: string,
  feeBps: number,
  blockhash: string,
): Promise<Transaction> {
  const wrapper = await fetchWrapper(prestockMint);
  if (!wrapper) throw new Error("No wrapper for that PreStock on this cluster yet.");

  const creator = new PublicKey(owner);
  const mint = new PublicKey(agentTokenMint);
  const fee = Buffer.alloc(2);
  fee.writeUInt16LE(feeBps);

  const tx = new Transaction().add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: creator, isSigner: true, isWritable: true },
        { pubkey: agentPda(mint), isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: new PublicKey(wrapper.wrappedMint), isSigner: false, isWritable: false },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([Buffer.from(DISC.registerAgent), new PublicKey(agentSigner).toBuffer(), fee]),
    }),
  );
  tx.feePayer = creator;
  tx.recentBlockhash = blockhash;
  return tx;
}

/** `initialize_vault` — creates the staking + reward vaults for a registered agent. */
export async function buildInitializeVaultTransaction(
  owner: string,
  agentTokenMint: string,
  prestockMint: string,
  minHoldSlots: bigint,
  blockhash: string,
): Promise<Transaction> {
  const wrapper = await fetchWrapper(prestockMint);
  if (!wrapper) throw new Error("No wrapper for that PreStock on this cluster yet.");

  const creator = new PublicKey(owner);
  const mint = new PublicKey(agentTokenMint);
  const agent = agentPda(mint);
  const vault = vaultPda(mint);

  const tx = new Transaction().add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: creator, isSigner: true, isWritable: true },
        { pubkey: agent, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: new PublicKey(wrapper.wrappedMint), isSigner: false, isWritable: false },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: stakeVaultPda(vault), isSigner: false, isWritable: true },
        { pubkey: rewardVaultPda(vault), isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([Buffer.from(DISC.initializeVault), u64le(minHoldSlots)]),
    }),
  );
  tx.feePayer = creator;
  tx.recentBlockhash = blockhash;
  return tx;
}
