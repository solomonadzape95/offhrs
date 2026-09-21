/**
 * Devnet smoke test — the whole program path, end to end, on a real cluster.
 *
 *   RPC_URL=https://api.devnet.solana.com pnpm exec tsx scripts/devnet-smoke.ts
 *
 * Steps, all signed by ANCHOR_WALLET (default ~/.config/solana/id.json):
 *   1. create a PreStock-shaped mock  (Token-2022, 50bps transfer fee, permanent delegate)
 *   2. initialize the wrapper         (mints wMOCK, mints authority = wrapper PDA)
 *   3. wrap a slice                   (raw PreStock -> wMOCK, delta-minted)
 *   4. create a mock $AGENT mint      (classic SPL, stands in for the Clawpump token)
 *   5. register_agent + initialize_vault
 *   6. deposit_rewards                (streams wMOCK to stakers)
 *   7. stake $AGENT, wait, claim wMOCK
 *
 * This is the program half. The Meteora pool and the real PreStocks are mainnet-only;
 * on devnet we stand in for both with mocks.
 */
import BN from "bn.js";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getMintLen,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  createInitializePermanentDelegateInstruction,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";

import {
  loadProgram,
  wrapperConfigPda,
  reservePda,
  agentPda,
  vaultPda,
  stakeVaultPda,
  rewardVaultPda,
  userStakePda,
  short,
  banner,
  ok,
} from "./lib.js";

const DEC = 9;
const ONE = 10n ** BigInt(DEC);

/** Devnet's public RPC drops blockhashes under load; retry the transient ones. */
async function retry<T>(fn: () => Promise<T>, attempts = 5, ms = 1500): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts - 1) {
        process.stdout.write(`\x1b[2m(retry ${i + 1}) \x1b[0m`);
        await new Promise((r) => setTimeout(r, ms));
      }
    }
  }
  throw last;
}

async function createMockPrestock(connection: Connection, payer: Keypair, feeBps = 50) {
  const mint = Keypair.generate();
  const exts = [ExtensionType.TransferFeeConfig, ExtensionType.PermanentDelegate];
  const len = getMintLen(exts);
  const rent = await connection.getMinimumBalanceForRentExemption(len);
  const auth = payer.publicKey;
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: auth,
      newAccountPubkey: mint.publicKey,
      lamports: rent,
      space: len,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferFeeConfigInstruction(
      mint.publicKey,
      auth,
      auth,
      feeBps,
      BigInt(1_000_000_000),
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializePermanentDelegateInstruction(mint.publicKey, auth, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint.publicKey, DEC, auth, auth, TOKEN_2022_PROGRAM_ID),
  );
  await retry(() => sendAndConfirmTransaction(connection, tx, [payer, mint], { commitment: "confirmed" }));
  return mint.publicKey;
}

async function createSplMint(connection: Connection, payer: Keypair, decimals = 6) {
  const mint = Keypair.generate();
  const len = getMintLen([]);
  const rent = await connection.getMinimumBalanceForRentExemption(len);
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
  await retry(() => sendAndConfirmTransaction(connection, tx, [payer, mint], { commitment: "confirmed" }));
  return mint.publicKey;
}

async function main() {
  const { program, connection, keypair } = loadProgram();
  const me = keypair.publicKey;

  console.log(banner(`stock_vault devnet smoke · wallet ${me.toBase58()}`));

  // 1 — a PreStock-shaped mock.
  const prestock = await createMockPrestock(connection, keypair);
  console.log(`  mock PreStock        ${prestock.toBase58()}`);

  const prestockAta = (
    await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      prestock,
      me,
      false,
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID,
    )
  ).address;

  // 2 — initialize the wrapper. wrapped_mint is a fresh mint created in-instruction.
  const wrapperConfig = wrapperConfigPda(prestock);
  const reserve = reservePda(wrapperConfig);
  const wrappedMint = Keypair.generate();

  await program.methods
    .initializeWrapper()
    .accountsStrict({
      admin: me,
      prestockMint: prestock,
      wrapperConfig,
      wrappedMint: wrappedMint.publicKey,
      reserve,
      prestockTokenProgram: TOKEN_2022_PROGRAM_ID,
      wrappedTokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([wrappedMint])
    .rpc();
  console.log(ok(`  initialize_wrapper   ${short(wrapperConfig)}  →  wMOCK ${wrappedMint.publicKey.toBase58()}`));

  // Fund the user with raw PreStock, then wrap a slice.
  const minted = 100n * ONE;
  await mintTo(connection, keypair, prestock, prestockAta, me, minted, [], undefined, TOKEN_2022_PROGRAM_ID);

  const wrappedAta = (
    await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      wrappedMint.publicKey,
      me,
      false,
      "confirmed",
      undefined,
      TOKEN_PROGRAM_ID,
    )
  ).address;

  const wrapAmount = 10n * ONE;
  await program.methods
    .wrap(new BN(wrapAmount.toString()))
    .accountsStrict({
      user: me,
      prestockMint: prestock,
      wrapperConfig,
      wrappedMint: wrappedMint.publicKey,
      reserve,
      userPrestock: prestockAta,
      userWrapped: wrappedAta,
      prestockTokenProgram: TOKEN_2022_PROGRAM_ID,
      wrappedTokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  const wrappedBal = await getAccount(connection, wrappedAta, "confirmed", TOKEN_PROGRAM_ID);
  const cfg: any = await program.account.wrapperConfig.fetch(wrapperConfig);
  console.log(
    ok(
      `  wrap(10)             received ${wrappedBal.amount} wMOCK (50bps fee) · feePaid=${cfg.totalFeePaidIn}`,
    ),
  );

  // 4 — a mock $AGENT mint (stands in for the Clawpump DBC token).
  const agentMint = await createSplMint(connection, keypair, 6);
  const agentAta = (
    await getOrCreateAssociatedTokenAccount(connection, keypair, agentMint, me, false, "confirmed")
  ).address;
  await mintTo(connection, keypair, agentMint, agentAta, me, 1_000_000n * 10n ** 6n, [], undefined, TOKEN_PROGRAM_ID);
  const agent = agentPda(agentMint);

  await program.methods
    .registerAgent(me, 500)
    .accountsStrict({
      creator: me,
      agent,
      agentTokenMint: agentMint,
      wrappedMint: wrappedMint.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const vault = vaultPda(agentMint);
  await program.methods
    .initializeVault(new BN(0))
    .accountsStrict({
      creator: me,
      agent,
      stakingMint: agentMint,
      rewardMint: wrappedMint.publicKey,
      vault,
      stakeVault: stakeVaultPda(vault),
      rewardVault: rewardVaultPda(vault),
      stakingTokenProgram: TOKEN_PROGRAM_ID,
      rewardTokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(ok(`  register + vault     agent ${short(agent)}  vault ${short(vault)}`));

  // 6 — stream a reward, then stake and claim.
  await program.methods
    .depositRewards(new BN((5n * ONE).toString()), new BN(1000))
    .accountsStrict({
      depositor: me,
      agent,
      vault,
      rewardMint: wrappedMint.publicKey,
      rewardVault: rewardVaultPda(vault),
      depositorRewardAccount: wrappedAta,
      rewardTokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  await program.methods
    .stake(new BN((1_000n * 10n ** 6n).toString()))
    .accountsStrict({
      user: me,
      vault,
      stakingMint: agentMint,
      stakeVault: stakeVaultPda(vault),
      userStakeAccount: agentAta,
      userStake: userStakePda(vault, me),
      stakingTokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(ok("  deposit_rewards + stake   streaming 5 wMOCK over 1000 slots"));

  await new Promise((r) => setTimeout(r, 3500)); // let a few slots pass

  await program.methods
    .claim()
    .accountsStrict({
      user: me,
      vault,
      rewardMint: wrappedMint.publicKey,
      rewardVault: rewardVaultPda(vault),
      userRewardAccount: wrappedAta,
      userStake: userStakePda(vault, me),
      rewardTokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  const after = await getAccount(connection, wrappedAta, "confirmed", TOKEN_PROGRAM_ID);
  const stake: any = await program.account.userStake.fetch(userStakePda(vault, me));
  console.log(ok(`  claim                wallet now ${after.amount} wMOCK · lifetime claimed ${stake.totalClaimed}`));

  console.log(banner("smoke complete — wrapper, registry, and streaming vault all executed on-chain"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
