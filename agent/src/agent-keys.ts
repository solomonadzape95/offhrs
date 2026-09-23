/**
 * The app-owned agent signer — the agent-side half.
 *
 * Must match `web/lib/agent-keys.ts` exactly: the web app derives the public key
 * at launch and registers it as `agent_signer`; the runner derives the keypair
 * from the same master secret and signs with it. If the two derivations ever
 * diverge, the runner simply cannot sign for any agent, which is a loud failure.
 */
import { createHmac } from "node:crypto";
import { Keypair } from "@solana/web3.js";

export function agentSignerFor(agentMint: string): Keypair {
  const secret = process.env.AGENT_MASTER_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AGENT_MASTER_SECRET is not set (or too short).");
  }
  const seed = createHmac("sha256", secret).update(`agent-signer:${agentMint}`).digest();
  return Keypair.fromSeed(new Uint8Array(seed));
}
