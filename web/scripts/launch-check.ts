/**
 * Verify the launch builders on devnet.
 *
 *   pnpm exec tsx web/scripts/launch-check.ts
 *
 * Creates a fresh mock `$AGENT` mint, then drives `register_agent` and
 * `initialize_vault` through the same manual encoders the studio uses, against an
 * existing wrapper. This is the program-side half of a launch; the DBC pool that
 * mints the token is Clawpump's.
 */
import fs from "node:fs";
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  getMintLen,
} from "@solana/spl-token";

import { fetchAgents, fetchWrappers, PROGRAM_RPC_URL } from "../lib/chain";
import {
  buildInitializeVaultTransaction,
  buildRegisterAgentTransaction,
} from "../lib/program-tx";

const conn = new Connection(PROGRAM_RPC_URL, "confirmed");
const payer = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`, "utf8"),
    ),
  ),
);

async function createMint(decimals = 6) {
  const mint = Keypair.generate();
  const len = getMintLen([]);
  const rent = await conn.getMinimumBalanceForRentExemption(len);
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      lamports: rent,
      space: len,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(mint.publicKey, decimals, payer.publicKey, null, TOKEN_PROGRAM_ID),
  );
  await sendAndConfirmTransaction(conn, tx, [payer, mint], { commitment: "confirmed" });
  return mint.publicKey;
}

async function main() {
  const owner = payer.publicKey.toBase58();
  const wrappers = await fetchWrappers();
  const wrapper = wrappers.find((w) => w.totalReceivedIn > 0n) ?? wrappers[0];
  if (!wrapper) throw new Error("no wrapper on this cluster — run devnet-smoke first");
  console.log(`wrapper  ${wrapper.pda}\n  prestock ${wrapper.prestockMint}\n  wrapped  ${wrapper.wrappedMint}`);

  const mint = await createMint();
  console.log(`mock $AGENT mint ${mint.toBase58()}\n`);

  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const regTx = await buildRegisterAgentTransaction(owner, mint.toBase58(), wrapper.prestockMint, owner, 500, blockhash);
  regTx.sign(payer);
  const sig = await conn.sendRawTransaction(regTx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction(sig, "confirmed");
  console.log(`  register_agent   ${sig}`);

  const { blockhash: bh2 } = await conn.getLatestBlockhash("confirmed");
  const vaultTx = await buildInitializeVaultTransaction(owner, mint.toBase58(), wrapper.prestockMint, 0n, bh2);
  vaultTx.sign(payer);
  const sig2 = await conn.sendRawTransaction(vaultTx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction(sig2, "confirmed");
  console.log(`  initialize_vault ${sig2}`);

  const agents = await fetchAgents();
  console.log(`\nagents now ${agents.length}; new = ${agents.some((a) => a.agentTokenMint === mint.toBase58())}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
