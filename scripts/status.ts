/**
 * Read-only cluster status: is the program deployed, what wrappers/agents exist.
 *
 *   RPC_URL=https://api.devnet.solana.com pnpm exec tsx scripts/status.ts
 */
import { loadProgram, PROGRAM_ID, RPC_URL, short, sol } from "./lib.js";

async function main() {
  const { program, provider, connection } = loadProgram();
  const wallet = provider.publicKey!;

  console.log(`rpc        ${RPC_URL}`);
  console.log(`program    ${PROGRAM_ID.toBase58()}`);
  console.log(`wallet     ${wallet.toBase58()}  (${sol(await connection.getBalance(wallet))} SOL)`);

  const info = await connection.getAccountInfo(PROGRAM_ID);
  if (!info) {
    console.log("deployed   \x1b[31mNO — nothing at this program id\x1b[0m");
    return;
  }
  console.log(`deployed   yes · ${info.data.length} bytes · owner ${short(info.owner)}`);

  const wrappers: any[] = await program.account.wrapperConfig.all();
  console.log(`\nwrappers   ${wrappers.length}`);
  for (const w of wrappers) {
    const a = w.account;
    console.log(
      `  cfg ${short(w.publicKey)}  prestock ${short(a.prestockMint)}  wMint ${short(a.wrappedMint)}`,
    );
    console.log(
      `      received=${a.totalReceivedIn?.toString?.() ?? "?"}  feePaid=${a.totalFeePaidIn?.toString?.() ?? "?"}  paused=${a.paused}`,
    );
  }

  const agents: any[] = await program.account.agent.all();
  console.log(`\nagents     ${agents.length}`);
  for (const a of agents) {
    const x = a.account;
    console.log(
      `  ${short(a.publicKey)}  mint ${short(x.agentTokenMint)}  vault ${short(x.vault)}  executions=${x.executionCount?.toString?.() ?? "?"}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
