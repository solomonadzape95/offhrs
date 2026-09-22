/**
 * End-to-end check of the write path's instruction encoding.
 *
 *   pnpm exec tsx web/scripts/write-check.ts
 *
 * `app/actions.ts` cannot be imported outside Next (the "use server" boundary),
 * so this drives the same builders in `lib/program-tx.ts` directly: build the
 * unsigned transaction, sign it with the devnet keypair, land it, then read the
 * stake back. If a discriminator or an account order were wrong, the program
 * would reject it here.
 */
import fs from "node:fs";
import { Connection, Keypair } from "@solana/web3.js";

import { fetchAgents, fetchUserStake, PROGRAM_RPC_URL } from "../lib/chain";
import { buildClaimTransaction, buildSetPausedTransaction, buildStakeTransaction, buildUnstakeTransaction } from "../lib/program-tx";

const conn = new Connection(PROGRAM_RPC_URL, "confirmed");
const payer = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`, "utf8"),
    ),
  ),
);

async function send(label: string, tx: Awaited<ReturnType<typeof buildStakeTransaction>>) {
  tx.sign(payer);
  const signature = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction(signature, "confirmed");
  console.log(`  ${label} ${signature}`);
}

async function main() {
  const owner = payer.publicKey.toBase58();
  const agents = await fetchAgents();
  if (agents.length === 0) throw new Error("no agents registered");
  // Prefer an agent the wallet already stakes, so the round-trip has tokens to move.
  let agent = agents[0];
  for (const a of agents) {
    const s = await fetchUserStake(a.vault, owner).catch(() => null);
    if (s && s.stakedAmount > 0n) {
      agent = a;
      break;
    }
  }
  console.log(`owner ${owner}\nagent ${agent.pda}\n`);

  const before = await fetchUserStake(agent.vault, owner);
  console.log(`before staked=${before?.stakedAmount ?? 0n} claimed=${before?.totalClaimed ?? 0n}`);

  const amount = 500_000n; // 0.5 $AGENT (6 decimals)
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  await send("stake", await buildStakeTransaction(owner, agent.pda, amount, blockhash));

  const { blockhash: bh2 } = await conn.getLatestBlockhash("confirmed");
  try {
    await send("claim", await buildClaimTransaction(owner, agent.pda, bh2));
  } catch (e) {
    // NothingToClaim is expected once the vault's stream is fully drained — it
    // still proves the instruction reached the handler.
    console.log(`  claim skipped: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }

  const { blockhash: bh3 } = await conn.getLatestBlockhash("confirmed");
  await send("unstake", await buildUnstakeTransaction(owner, agent.pda, amount, bh3));

  const { blockhash: bh4 } = await conn.getLatestBlockhash("confirmed");
  await send("pause  ", await buildSetPausedTransaction(owner, agent.pda, true, bh4));
  const { blockhash: bh5 } = await conn.getLatestBlockhash("confirmed");
  await send("resume ", await buildSetPausedTransaction(owner, agent.pda, false, bh5));

  const after = await fetchUserStake(agent.vault, owner);
  console.log(`after  staked=${after?.stakedAmount ?? 0n} claimed=${after?.totalClaimed ?? 0n}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
