/**
 * The app-owned agent signer.
 *
 * A bot that trades around the clock cannot ask the user to sign every trade, so
 * each agent gets a signer keypair the app controls. There is no database to
 * store one secret per agent, so the key is derived deterministically from a
 * single master secret:
 *
 *   seed = HMAC-SHA256(AGENT_MASTER_SECRET, "agent-signer:" + agent_mint)
 *
 * The web app derives the public key at launch and registers it as the agent's
 * `agent_signer`. The runner, given the same master secret, derives the same
 * keypair and signs with it. The master secret must be stable: rotating it
 * invalidates every agent's signer.
 *
 * Trade-off, stated plainly: one leaked master secret compromises every agent.
 * That is the price of no key store. With a database or a KMS, this should be a
 * random key per agent instead — the interface here would not change.
 *
 * Server-only. Never import this from a client component.
 */
import { createHmac } from "node:crypto";
import { Keypair } from "@solana/web3.js";

function master(): string {
  const secret = process.env.AGENT_MASTER_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AGENT_MASTER_SECRET is not set (or too short). The app cannot create agent signer keys without it.",
    );
  }
  return secret;
}

/** The app-owned signer keypair for one agent, derived from its `$AGENT` mint. */
export function agentSignerFor(agentMint: string): Keypair {
  const seed = createHmac("sha256", master()).update(`agent-signer:${agentMint}`).digest();
  return Keypair.fromSeed(new Uint8Array(seed));
}

/** The public key to register as the agent's `agent_signer`. */
export function agentSignerAddress(agentMint: string): string {
  return agentSignerFor(agentMint).publicKey.toBase58();
}

/** True when the app can derive signers on this deployment. */
export function agentSignerConfigured(): boolean {
  return Boolean(process.env.AGENT_MASTER_SECRET && process.env.AGENT_MASTER_SECRET.length >= 16);
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Base58, so the key can be pasted into a wallet that imports one. */
export function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits: number[] = [0];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) out += B58[digits[i]];
  return out;
}

/** The secret key as base58 — the form Phantom and most wallets import. */
export function agentSignerSecret(agentMint: string): string {
  return base58Encode(agentSignerFor(agentMint).secretKey);
}
