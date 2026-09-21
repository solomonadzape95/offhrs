/**
 * Verify `web/lib/chain.ts` against a real cluster.
 *
 *   PROGRAM_RPC_URL=https://api.devnet.solana.com pnpm exec tsx web/scripts/chain-check.ts
 *
 * This is the proof the hand-written decoders match the deployed program: it
 * fetches the wrappers, the agent, and the vault created by `scripts/devnet-smoke.ts`
 * and prints every field. If a decoder drifted, the discriminator assert would
 * drop the account and the count would read 0.
 */
import {
  fetchAgents,
  fetchWrappers,
  fetchVaults,
  programDeployed,
  PROGRAM_ID,
  PROGRAM_RPC_URL,
} from "../lib/chain";

const big = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

async function main() {
  console.log(`rpc      ${PROGRAM_RPC_URL}`);
  console.log(`program  ${PROGRAM_ID.toBase58()}`);
  console.log(`deployed ${await programDeployed()}`);

  const wrappers = await fetchWrappers();
  console.log(`\nwrappers ${wrappers.length}`);
  for (const w of wrappers) {
    console.log(
      `  ${w.pda}\n    ${w.prestockMint} -> ${w.wrappedMint}` +
        `  received=${w.totalReceivedIn} feePaid=${w.totalFeePaidIn} paused=${w.paused}`,
    );
  }

  const agents = await fetchAgents();
  console.log(`\nagents   ${agents.length}`);
  console.log(JSON.stringify(agents, big, 2));

  const vaults = await fetchVaults();
  console.log(`\nvaults   ${vaults.length}`);
  console.log(JSON.stringify(vaults, big, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
