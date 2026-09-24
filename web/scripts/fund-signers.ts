/**
 * Fund each live agent's app-owned signer with a little SOL and wPreStock, so
 * the runtime can trade as the agent (the DBC adapter needs quote tokens and gas).
 *
 *   pnpm exec tsx web/scripts/fund-signers.ts            # 0.2 SOL + 10 wPreStock each
 *   FUND_SOL=0.5 FUND_QTY=25 pnpm exec tsx web/scripts/fund-signers.ts
 */
import fs from "node:fs";
import path from "node:path";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  transfer,
} from "@solana/spl-token";

import { agentSignerAddress } from "../lib/agent-keys";
import { fetchLiveAgents, PROGRAM_RPC_URL } from "../lib/chain";
import { fetchUniverse } from "../lib/universe";

function loadEnvLocal() {
  const p = path.resolve(process.cwd(), "web/.env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const conn = new Connection(PROGRAM_RPC_URL, "confirmed");
const payer = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`, "utf8"),
    ),
  ),
);

(async () => {
  loadEnvLocal();
  const sol = Number(process.env.FUND_SOL ?? "0.2");
  const qty = Number(process.env.FUND_QTY ?? "10");

  const stocks = await fetchUniverse().catch(() => []);
  const live = await fetchLiveAgents(stocks.map((s) => ({ symbol: s.symbol, mint: s.mint })));

  for (const a of live as any[]) {
    const signer = new PublicKey(agentSignerAddress(a.agentTokenMint));
    console.log(`\n${a.name} (${a.ticker}) signer ${signer.toBase58()}`);

    const bal = await conn.getBalance(signer);
    if (bal < sol * 1e9) {
      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: signer, lamports: Math.round(sol * 1e9) }),
      );
      const sig = await sendAndConfirmTransaction(conn, tx, [payer], { commitment: "confirmed" });
      console.log(`  SOL   +${sol}  ${sig.slice(0, 12)}…`);
    } else {
      console.log(`  SOL   already ${(bal / 1e9).toFixed(3)}`);
    }

    const mint = new PublicKey(a.wrappedMint);
    const sourceAta = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey);
    const destAta = await getOrCreateAssociatedTokenAccount(conn, payer, mint, signer);
    const raw = BigInt(Math.round(qty * 1e9));
    const sig = await transfer(conn, payer, sourceAta.address, destAta.address, payer, raw, [], {
      commitment: "confirmed",
    });
    console.log(`  wPre  +${qty}  ${sig.slice(0, 12)}…`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
