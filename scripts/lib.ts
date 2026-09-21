/**
 * Shared helpers for the cluster ops scripts.
 *
 * Everything is env-driven so the same code runs against devnet and mainnet:
 *
 *   RPC_URL           default https://api.devnet.solana.com
 *   ANCHOR_WALLET     default ~/.config/solana/id.json
 *   ANGEL_PROGRAM_ID  default the deployed stock_vault id
 *
 * Run with: pnpm exec tsx scripts/<name>.ts
 * (The repo root is `"type": "module"`, so relative imports carry `.js`.)
 */
import fs from "node:fs";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

export const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey(
  process.env.ANGEL_PROGRAM_ID ?? "FoVBZRFCamH1HNMiVpNZV2QJxk9bSxWtQvKgmqZ1rVLw",
);

const IDL_PATH = path.resolve(process.cwd(), "target/idl/stock_vault.json");

export function loadKeypair(file?: string): Keypair {
  const p = file ?? process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
}

export function loadProgram() {
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
  const keypair = loadKeypair();
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new anchor.Program(idl, provider) as any;
  return { program, provider, connection, keypair, wallet };
}

const pda = (seeds: (Buffer | Uint8Array)[]) =>
  PublicKey.findProgramAddressSync(
    seeds.map((s) => Buffer.from(s)),
    PROGRAM_ID,
  )[0];

export const wrapperConfigPda = (prestockMint: PublicKey) =>
  pda([Buffer.from("wrapper"), prestockMint.toBuffer()]);
export const reservePda = (wrapperConfig: PublicKey) =>
  pda([Buffer.from("reserve"), wrapperConfig.toBuffer()]);
export const agentPda = (agentTokenMint: PublicKey) =>
  pda([Buffer.from("agent"), agentTokenMint.toBuffer()]);
export const vaultPda = (agentTokenMint: PublicKey) =>
  pda([Buffer.from("vault"), agentTokenMint.toBuffer()]);
export const stakeVaultPda = (vault: PublicKey) =>
  pda([Buffer.from("stake_vault"), vault.toBuffer()]);
export const rewardVaultPda = (vault: PublicKey) =>
  pda([Buffer.from("reward_vault"), vault.toBuffer()]);
export const userStakePda = (vault: PublicKey, owner: PublicKey) =>
  pda([Buffer.from("stake"), vault.toBuffer(), owner.toBuffer()]);

export const short = (k: PublicKey | string, n = 4) => {
  const s = typeof k === "string" ? k : k.toBase58();
  return `${s.slice(0, n)}…${s.slice(-n)}`;
};

export const sol = (lamports: number) => (lamports / 1e9).toFixed(4);

export const banner = (s: string) => `\n\x1b[1m${s}\x1b[0m`;
export const ok = (s: string) => `\x1b[32m${s}\x1b[0m`;
