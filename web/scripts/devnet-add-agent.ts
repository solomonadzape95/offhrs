/**
 * Add a devnet agent for one PreStock, from the admin/deploy wallet.
 *
 *   DRY=1 pnpm exec tsx web/scripts/devnet-add-agent.ts POLYMARKET
 *   pnpm exec tsx web/scripts/devnet-add-agent.ts POLYMARKET
 *
 * Full self-owned launch: createConfigAndPool -> register_agent -> initialize_vault.
 * The agent signer is derived from AGENT_MASTER_SECRET so it matches the app.
 */
import fs from "node:fs";
import path from "node:path";
import { Connection, Keypair, type Transaction } from "@solana/web3.js";

import { fetchWrappers, PROGRAM_RPC_URL, agentPda } from "../lib/chain";
import { buildInitializeVaultTransaction, buildRegisterAgentTransaction } from "../lib/program-tx";
import { buildCreateAgentCurve } from "../lib/launch";
import { agentSignerAddress } from "../lib/agent-keys";

const ID = ["SPACEX", "OPENAI", "ANDURIL", "ANTHROPIC", "NEURALINK", "KALSHI", "POLYMARKET", "FIGUREAI"];
const NAME: Record<string, string> = {
  SPACEX: "Orbital", OPENAI: "Alignment", ANDURIL: "Sentinel", ANTHROPIC: "Frontier",
  NEURALINK: "Cortex", KALSHI: "Forecast", POLYMARKET: "Consensus", FIGUREAI: "Humanoid",
};
const TICKER: Record<string, string> = {
  SPACEX: "ORB", OPENAI: "ALGN", ANDURIL: "SNTL", ANTHROPIC: "FRNTR",
  NEURALINK: "CRTX", KALSHI: "FCST", POLYMARKET: "CNSN", FIGUREAI: "HMND",
};

function loadEnvLocal() {
  const p = path.resolve(process.cwd(), "web/.env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
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

async function send(tx: Transaction, signers: Keypair[]): Promise<string> {
  // partialSign, not sign: the config and base mint already partially signed this
  // transaction, and `sign` would wipe those signatures.
  tx.partialSign(...signers);
  const sim = await conn.simulateTransaction(tx);
  if (sim.value.err) {
    const logs = (sim.value.logs ?? []).filter((l) => /Error|failed/i.test(l)).slice(-8);
    throw new Error(`simulation failed: ${JSON.stringify(sim.value.err)}\n${logs.join("\n")}`);
  }
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

async function main() {
  loadEnvLocal();
  const asset = (process.argv[2] ?? "POLYMARKET").toUpperCase();
  const dry = process.env.DRY === "1";
  const owner = payer.publicKey.toBase58();
  console.log(`payer  ${owner}  (${(await conn.getBalance(payer.publicKey)) / 1e9} SOL)`);

  const wrappers = (await fetchWrappers()).sort((a, b) =>
    a.prestockMint < b.prestockMint ? -1 : a.prestockMint > b.prestockMint ? 1 : 0,
  );
  const idx = wrappers.findIndex((_, i) => ID[i % 8] === asset);
  if (idx < 0) throw new Error(`no wrapper for ${asset}`);
  const wrapper = wrappers[idx];
  console.log(`asset  ${asset} -> prestock ${wrapper.prestockMint}  wrapped ${wrapper.wrappedMint}`);

  const config = Keypair.generate();
  const baseMint = Keypair.generate();
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const built = await buildCreateAgentCurve({
    owner,
    prestockMint: wrapper.prestockMint,
    name: NAME[asset],
    symbol: TICKER[asset],
    feeBps: 500,
    blockhash,
    keypairs: { config, baseMint },
  });
  built.tx.partialSign(payer);

  const agent = agentPda(built.baseMint).toBase58();
  console.log(`\nbase mint    ${built.baseMint}\nconfig       ${built.config}\npool         ${built.pool}`);
  console.log(`quote mint   ${built.quoteMint}\nagent PDA    ${agent}`);
  console.log(`agent signer ${agentSignerAddress(built.baseMint)}`);

  if (dry) {
    const sim = await conn.simulateTransaction(built.tx);
    console.log(`\nDRY simulate ${sim.value.err ? "FAIL " + JSON.stringify(sim.value.err) : "ok"}`);
    return;
  }

  console.log(`\ncreateConfigAndPool ${await send(built.tx, [payer])}`);

  const { blockhash: bh2 } = await conn.getLatestBlockhash("confirmed");
  const signer = agentSignerAddress(built.baseMint);
  const regTx = await buildRegisterAgentTransaction(owner, built.baseMint, wrapper.prestockMint, signer, 500, bh2);
  console.log(`register_agent      ${await send(regTx, [payer])}`);

  const { blockhash: bh3 } = await conn.getLatestBlockhash("confirmed");
  const vaultTx = await buildInitializeVaultTransaction(owner, built.baseMint, wrapper.prestockMint, 0n, bh3);
  console.log(`initialize_vault    ${await send(vaultTx, [payer])}`);

  console.log(`\nDONE. Trade it at /agent/${agent}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
