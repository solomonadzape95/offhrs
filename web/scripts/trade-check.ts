/**
 * End-to-end check of the trade layer against the devnet demo agent.
 *
 *   pnpm exec tsx web/scripts/trade-check.ts
 *
 * `app/actions.ts` cannot be imported outside Next (the "use server" boundary),
 * so this drives the same builders in `lib/trade.ts` directly: quote the DBC
 * curve, build the unsigned transaction the server would hand the wallet, sign
 * it, land it, and read the stake back. If the SDK wiring, the auto-stake
 * instruction, or the account order were wrong, the program rejects it here.
 *
 * Run `scripts/devnet-pool.ts` first to create the agent (writes `.devnet-demo.json`).
 */
import fs from "node:fs";
import { Connection, Keypair } from "@solana/web3.js";

import { fetchAgentByPda, fetchTokenBalance, fetchUserStake, PROGRAM_RPC_URL } from "../lib/chain";
import { buildUnwrapTransaction, buildWrapTransaction } from "../lib/program-tx";
import { buildBuyTransaction, buildSellTransaction, quoteTrade } from "../lib/trade";

const conn = new Connection(PROGRAM_RPC_URL, "confirmed");
const payer = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`, "utf8"),
    ),
  ),
);

const ONE_WPRESTOCK = 1_000_000_000n; // 1 wPreStock, 9 decimals

async function land(label: string, tx: Awaited<ReturnType<typeof buildBuyTransaction>>) {
  tx.sign(payer);
  const sim = await conn.simulateTransaction(tx);
  if (sim.value.err) {
    const logs = (sim.value.logs ?? []).filter((l) => /Error|failed/i.test(l)).slice(-4);
    throw new Error(`${label} simulation failed: ${JSON.stringify(sim.value.err)}\n${logs.join("\n")}`);
  }
  const signature = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction(signature, "confirmed");
  console.log(`  ${label.padEnd(20)} ${signature}`);
}

async function main() {
  const demo = JSON.parse(fs.readFileSync(new URL("../../.devnet-demo.json", import.meta.url), "utf8"));
  const owner = payer.publicKey.toBase58();
  const agent = await fetchAgentByPda(demo.agent);
  if (!agent) throw new Error(`no agent at ${demo.agent} — run scripts/devnet-pool.ts`);

  console.log(`owner   ${owner}`);
  console.log(`agent   ${demo.agent}`);
  console.log(`$AGENT  ${agent.agentTokenMint}`);
  console.log(`wMOCK   ${agent.wrappedMint}\n`);

  // ── quote + buy with auto-stake ─────────────────────────────────────────
  const buyQuote = await quoteTrade(agent.agentTokenMint, "buy", ONE_WPRESTOCK.toString());
  console.log(
    `quote buy   1 wMOCK → ${buyQuote.outAmount} raw $ORB ` +
      `(min ${buyQuote.minOut}, price ${buyQuote.price.toFixed(6)} wMOCK/$AGENT)`,
  );

  const before = await fetchUserStake(agent.vault, owner);
  const beforeStaked = before?.stakedAmount ?? 0n;

  const { blockhash: bh1 } = await conn.getLatestBlockhash("confirmed");
  await land(
    "buy + auto-stake",
    await buildBuyTransaction(owner, agent.agentTokenMint, ONE_WPRESTOCK.toString(), true, bh1),
  );

  const after = await fetchUserStake(agent.vault, owner);
  const afterStaked = after?.stakedAmount ?? 0n;
  if (afterStaked <= beforeStaked) {
    throw new Error(`auto-stake did not increase the stake (${beforeStaked} → ${afterStaked})`);
  }
  console.log(`  stake ${beforeStaked} → ${afterStaked} (delta ${afterStaked - beforeStaked})\n`);

  // ── quote + sell, settling as raw PreStock (sell + unwrap, one tx) ──────
  // Sell from the liquid balance: the first buy in devnet-pool.ts left `$ORB`
  // in the wallet, while everything bought here was auto-staked.
  const liquid = (await fetchTokenBalance(agent.agentTokenMint, owner)) ?? 0n;
  if (liquid <= 0n) throw new Error("no liquid $AGENT to sell — rerun scripts/devnet-pool.ts");
  const sellAmount = liquid / 4n;
  const sellQuote = await quoteTrade(agent.agentTokenMint, "sell", sellAmount.toString());
  console.log(
    `quote sell  ${sellAmount} raw $ORB → ${sellQuote.outAmount} raw wMOCK ` +
      `(min ${sellQuote.minOut}, price ${sellQuote.price.toFixed(6)} wMOCK/$AGENT)`,
  );

  const { blockhash: bh2 } = await conn.getLatestBlockhash("confirmed");
  await land(
    "sell → PreStock",
    await buildSellTransaction(
      owner,
      agent.agentTokenMint,
      demo.prestockMint,
      sellAmount.toString(),
      "prestock",
      bh2,
    ),
  );

  console.log("\nall trade builders land on devnet");

  // ── wrap / unwrap — the USDC route's middle leg ─────────────────────────
  const { blockhash: bh3 } = await conn.getLatestBlockhash("confirmed");
  await land("wrap", await buildWrapTransaction(owner, demo.prestockMint, ONE_WPRESTOCK, bh3));
  const { blockhash: bh4 } = await conn.getLatestBlockhash("confirmed");
  await land(
    "unwrap",
    await buildUnwrapTransaction(owner, demo.prestockMint, ONE_WPRESTOCK, bh4),
  );

  console.log("\nwrap/unwrap also land — the USDC route's middle leg is proven");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
