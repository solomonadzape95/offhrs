/**
 * Verify the self-owned DBC launch builder on devnet.
 *
 *   pnpm exec tsx web/scripts/launch-curve-check.ts
 *
 * Builds the single `createConfigAndPool` transaction the fallback uses, checks
 * that all three signatures are present (config + base mint, partial-signed
 * server-side, plus the fee payer), simulates it, lands it, and confirms the pool
 * exists. Needs `scripts/devnet-pool.ts` first for a wrapper to quote in.
 */
import fs from "node:fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { DynamicBondingCurveClient } from "@meteora-ag/dynamic-bonding-curve-sdk";

import { PROGRAM_RPC_URL } from "../lib/chain";
import { buildCreateAgentCurve } from "../lib/launch";

const conn = new Connection(PROGRAM_RPC_URL, "confirmed");
const payer = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`, "utf8"),
    ),
  ),
);

async function main() {
  const demo = JSON.parse(fs.readFileSync(new URL("../../.devnet-demo.json", import.meta.url), "utf8"));
  const owner = payer.publicKey.toBase58();

  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const built = await buildCreateAgentCurve({
    owner,
    prestockMint: demo.prestockMint,
    name: "Self-launched",
    symbol: "SELF",
    feeBps: 500,
    blockhash,
  });

  console.log(`base mint  ${built.baseMint}`);
  console.log(`config     ${built.config}`);
  console.log(`pool       ${built.pool}`);
  console.log(`quote mint ${built.quoteMint}`);
  console.log(
    "signatures",
    built.tx.signatures.map(
      (s) => `${s.publicKey.toBase58().slice(0, 4)}${s.signature ? "✓" : "✗"}`,
    ),
  );

  // Add the fee payer without wiping the two partial signatures.
  built.tx.partialSign(payer);

  const sim = await conn.simulateTransaction(built.tx);
  if (sim.value.err) {
    const logs = (sim.value.logs ?? []).filter((l) => /Error|failed/i.test(l)).slice(-6);
    throw new Error(`simulation failed: ${JSON.stringify(sim.value.err)}\n${logs.join("\n")}`);
  }

  const signature = await conn.sendRawTransaction(built.tx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction(signature, "confirmed");
  console.log(`landed     ${signature}`);

  const client = DynamicBondingCurveClient.create(conn, "confirmed");
  const found = await client.state.getPool(new PublicKey(built.pool));
  console.log(found ? "pool exists on chain ✓" : "pool missing ✗");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
