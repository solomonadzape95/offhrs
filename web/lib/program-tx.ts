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
  fetchWrappers,
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
  setPaused: Uint8Array.from([91, 60, 125, 192, 176, 225, 166, 218]),
  closeAgent: Uint8Array.from([52, 185, 104, 145, 157, 30, 87, 237]),
  wrap: Uint8Array.from([178, 40, 10, 189, 228, 129, 186, 140]),
  unwrap: Uint8Array.from([126, 175, 198, 14, 212, 69, 50, 44]),
} as const;

function u64le(v: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
}

/**
 * The associated token address for `owner`/`mint` under a given token program.
 * The program id is part of the PDA seeds, so a Token-2022 mint (the raw
 * PreStock) has a different ATA than the classic SPL wrapper of the same owner.
 */
export const associatedAddress = (
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
) =>
  PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];

/** `CreateIdempotent` on the Associated Token Program — a no-op if it exists. */
export function createAtaIdempotent(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedAddress(owner, mint, tokenProgram), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
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

/**
 * The bare `stake` instruction, without the ATA prelude. Auto-stake-on-buy
 * composes this after a DBC swap in the same transaction, where the token
 * account already exists (the swap creates it), so it must stand alone.
 */
export function stakeInstruction(
  owner: PublicKey,
  vault: PublicKey,
  stakingMint: PublicKey,
  amountRaw: bigint,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: stakingMint, isSigner: false, isWritable: false },
      { pubkey: stakeVaultPda(vault), isSigner: false, isWritable: true },
      { pubkey: associatedAddress(owner, stakingMint), isSigner: false, isWritable: true },
      { pubkey: stakePda(vault, owner), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from(DISC.stake), u64le(amountRaw)]),
  });
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
  tx.add(stakeInstruction(ownerKey, vault, stakingMint, amountRaw));
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

/**
 * `close_agent` — deregister an agent. Creator only, and only once the vault has
 * no stakers; the program enforces both, so a wrong caller simply fails.
 */
export async function buildCloseAgentTransaction(
  owner: string,
  agentAddress: string,
  blockhash: string,
): Promise<Transaction> {
  const { ownerKey, vault } = await context(owner, agentAddress);
  const tx = new Transaction().add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: ownerKey, isSigner: true, isWritable: true },
        { pubkey: new PublicKey(agentAddress), isSigner: false, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(DISC.closeAgent),
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

/**
 * `set_paused` on the agent's **wrapper** — the circuit breaker mirroring
 * PreStocks' `pausableConfig`. It halts wrapping and unwrapping for the asset,
 * not the agent's trading or the vault. Admin-only, enforced by `has_one = admin`.
 */
export async function buildSetPausedTransaction(
  owner: string,
  agentAddress: string,
  paused: boolean,
  blockhash: string,
): Promise<Transaction> {
  const agent = await fetchAgentByPda(agentAddress);
  if (!agent) throw new Error("No agent at that address on this cluster.");

  const wrappers = await fetchWrappers();
  const wrapper = wrappers.find((w) => w.wrappedMint === agent.wrappedMint);
  if (!wrapper) throw new Error("No wrapper for this agent's reward asset.");

  return buildSetPausedForWrapperTransaction(owner, wrapper.prestockMint, paused, blockhash);
}

/**
 * `set_paused` on a wrapper addressed by its PreStock mint, without going
 * through an agent. The admin surface pauses the circuit breaker directly.
 */
export function buildSetPausedForWrapperTransaction(
  owner: string,
  prestockMint: string,
  paused: boolean,
  blockhash: string,
): Transaction {
  const admin = new PublicKey(owner);
  const tx = new Transaction().add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: admin, isSigner: true, isWritable: false },
        { pubkey: wrapperConfigPda(prestockMint), isSigner: false, isWritable: true },
      ],
      data: Buffer.concat([Buffer.from(DISC.setPaused), Buffer.from([paused ? 1 : 0])]),
    }),
  );
  tx.feePayer = admin;
  tx.recentBlockhash = blockhash;
  return tx;
}
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

// ---------------------------------------------------------------------------
// Wrapper — the boundary crossing. Raw PreStock (Token-2022, fee-bearing) enters
// the reserve; the zero-fee classic `wPreStock` leaves it, and vice versa. This is
// where the PreStocks transfer fee is actually paid, exactly once per direction.

/**
 * `wrap` — raw PreStock → wPreStock. The program mints the *measured* reserve
 * delta, so the amount the user receives is less than they sent whenever the
 * PreStock carries a transfer fee. We pass the requested amount; the chain
 * decides what arrives.
 */
export async function buildWrapTransaction(
  owner: string,
  prestockMint: string,
  amountRaw: bigint,
  blockhash: string,
): Promise<Transaction> {
  if (amountRaw <= 0n) throw new Error("Amount must be greater than zero.");
  const wrapper = await fetchWrapper(prestockMint);
  if (!wrapper) throw new Error("No wrapper for that PreStock on this cluster yet.");

  const user = new PublicKey(owner);
  const prestock = new PublicKey(prestockMint);
  const wrapped = new PublicKey(wrapper.wrappedMint);
  const wrapperConfig = wrapperConfigPda(prestock);

  const userPrestock = associatedAddress(user, prestock, TOKEN_2022_PROGRAM_ID);
  const userWrapped = associatedAddress(user, wrapped, TOKEN_PROGRAM_ID);

  const tx = new Transaction().add(
    createAtaIdempotent(user, user, prestock, TOKEN_2022_PROGRAM_ID),
  );
  tx.add(createAtaIdempotent(user, user, wrapped, TOKEN_PROGRAM_ID));
  tx.add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: prestock, isSigner: false, isWritable: true },
        { pubkey: wrapperConfig, isSigner: false, isWritable: true },
        { pubkey: wrapped, isSigner: false, isWritable: true },
        { pubkey: reservePda(wrapperConfig), isSigner: false, isWritable: true },
        { pubkey: userPrestock, isSigner: false, isWritable: true },
        { pubkey: userWrapped, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([Buffer.from(DISC.wrap), u64le(amountRaw)]),
    }),
  );
  tx.feePayer = user;
  tx.recentBlockhash = blockhash;
  return tx;
}

/** `unwrap` — wPreStock → raw PreStock. The user pays the PreStock fee once, here. */
export async function buildUnwrapTransaction(
  owner: string,
  prestockMint: string,
  amountRaw: bigint,
  blockhash: string,
): Promise<Transaction> {
  if (amountRaw <= 0n) throw new Error("Amount must be greater than zero.");
  const wrapper = await fetchWrapper(prestockMint);
  if (!wrapper) throw new Error("No wrapper for that PreStock on this cluster yet.");

  const user = new PublicKey(owner);
  const prestock = new PublicKey(prestockMint);
  const wrapped = new PublicKey(wrapper.wrappedMint);
  const wrapperConfig = wrapperConfigPda(prestock);

  const userPrestock = associatedAddress(user, prestock, TOKEN_2022_PROGRAM_ID);
  const userWrapped = associatedAddress(user, wrapped, TOKEN_PROGRAM_ID);

  const tx = new Transaction().add(
    createAtaIdempotent(user, user, prestock, TOKEN_2022_PROGRAM_ID),
  );
  tx.add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: prestock, isSigner: false, isWritable: true },
        { pubkey: wrapperConfig, isSigner: false, isWritable: true },
        { pubkey: wrapped, isSigner: false, isWritable: true },
        { pubkey: reservePda(wrapperConfig), isSigner: false, isWritable: true },
        { pubkey: userPrestock, isSigner: false, isWritable: true },
        { pubkey: userWrapped, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([Buffer.from(DISC.unwrap), u64le(amountRaw)]),
    }),
  );
  tx.feePayer = user;
  tx.recentBlockhash = blockhash;
  return tx;
}
