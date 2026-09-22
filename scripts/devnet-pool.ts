/**
 * Devnet demo state — a fully tradable agent.
 *
 *   RPC_URL=https://api.devnet.solana.com pnpm exec tsx scripts/devnet-pool.ts
 *
 * `devnet-smoke.ts` proves the program half (wrapper, registry, streaming vault)
 * but stops before the Meteora curve, so the frontend's buy box has nothing to
 * trade against. This script closes that gap: it stands up one agent whose
 * `$AGENT` mint has a real DBC pool quoted in its own `wPreStock`, registered in
 * the `stock_vault` registry with a vault attached.
 *
 * Steps:
 *   1. PreStock-shaped mock (Token-2022, 50bps fee, permanent delegate)
 *   2. initialize_wrapper → wMOCK (classic SPL, mint authority = wrapper PDA)
 *   3. wrap a slice, so the wallet holds quote tokens to buy with
 *   4. $AGENT base mint (kept, because DBC needs it to co-sign createPool)
 *   5. DBC config (quoteMint = wMOCK) + createPool
 *   6. register_agent + initialize_vault
 *   7. a first buy, so the curve has moved off its opening price
 *
 * Prints the agent PDA and mint — paste the PDA into `/agent/<pda>`.
 */
import fs from "node:fs";
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
  DynamicBondingCurveClient,
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DammV2BaseFeeMode,
  DammV2DynamicFeeMode,
  MigrationFeeOption,
  MigrationOption,
  MigratedCollectFeeMode,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurve,
  deriveDbcPoolAddress,
  SwapMode,
} from "@meteora-ag/dynamic-bonding-curve-sdk";

import {
  loadProgram,
  wrapperConfigPda,
  reservePda,
  agentPda,
  vaultPda,
  stakeVaultPda,
  rewardVaultPda,
  short,
  banner,
  ok,
} from "./lib.js";

const DEC = 9;
const ONE = 10n ** BigInt(DEC);

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

/** Set feePayer/blockhash, sign with the given signers, send and confirm. */
async function send(
  connection: Connection,
  tx: Transaction,
  payer: Keypair,
  signers: Keypair[],
) {
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = latest.blockhash;
  tx.sign(payer, ...signers);
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction(
    { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    "confirmed",
  );
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
  await retry(() =>
    sendAndConfirmTransaction(connection, tx, [payer, mint], { commitment: "confirmed" }),
  );
  return mint.publicKey;
}

function curve() {
  return buildCurve({
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: TokenDecimal.NINE,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: 1_000_000_000,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: {
          startingFeeBps: 500,
          endingFeeBps: 100,
          numberOfPeriod: 10,
          totalDuration: 86_400,
        },
      },
      dynamicFeeEnabled: true,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 0,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.Customizable,
      migrationFee: { feePercentage: 10, creatorFeePercentage: 50 },
      migratedPoolFee: {
        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
        dynamicFee: DammV2DynamicFeeMode.Enabled,
        poolFeeBps: 100,
        baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
      },
    },
    liquidityDistribution: {
      partnerLiquidityPercentage: 0,
      partnerPermanentLockedLiquidityPercentage: 100,
      creatorLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 0,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    percentageSupplyOnMigration: 10,
    migrationQuoteThreshold: 100,
  });
}

async function main() {
  const { program, connection, keypair } = loadProgram();
  const me = keypair.publicKey;
  const client = DynamicBondingCurveClient.create(connection, "confirmed");

  console.log(banner(`offhrs devnet demo state · wallet ${me.toBase58()}`));

  // 1 + 2 — mock PreStock, then the wrapper.
  const prestock = await createMockPrestock(connection, keypair);
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
  console.log(ok(`  wrapper              wMOCK ${wrappedMint.publicKey.toBase58()}`));

  // 3 — fund + wrap, so there is quote liquidity in the wallet.
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
  await mintTo(
    connection,
    keypair,
    prestock,
    prestockAta,
    me,
    100n * ONE,
    [],
    undefined,
    TOKEN_2022_PROGRAM_ID,
  );
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
  await program.methods
    .wrap(new BN((50n * ONE).toString()))
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
  console.log(
    ok(`  wrapped 50           wallet now ${(await getAccount(connection, wrappedAta, "confirmed", TOKEN_PROGRAM_ID)).amount} wMOCK`),
  );

  // 4 — the $AGENT mint keypair. DBC creates the mint itself inside `createPool`
  //     (it is SIGNER+WRITABLE in the IDL); pre-creating it yields
  //     AccountAlreadyInUse. We only keep the keypair so it can co-sign.
  const agentMintKp = Keypair.generate();
  const agentMint = agentMintKp.publicKey;

  // 5 — DBC config quoted in wMOCK, then the pool.
  const config = Keypair.generate();
  await retry(async () => {
    const tx = await client.partner.createConfig({
      config: config.publicKey,
      feeClaimer: me,
      leftoverReceiver: me,
      payer: me,
      quoteMint: wrappedMint.publicKey,
      ...curve(),
    });
    await send(connection, tx, keypair, [config]);
  });
  console.log(ok(`  dbc config           ${config.publicKey.toBase58()}`));

  await retry(async () => {
    const tx = await client.creator.createPool({
      baseMint: agentMint,
      config: config.publicKey,
      name: "Orbital",
      symbol: "ORB",
      uri: "https://offhrs.local/agent.json",
      payer: me,
      poolCreator: me,
    });
    await send(connection, tx, keypair, [agentMintKp]);
  });
  const pool = deriveDbcPoolAddress(wrappedMint.publicKey, agentMint, config.publicKey);
  console.log(ok(`  dbc pool             ${pool.toBase58()}`));

  // 6 — register + vault, so the buy box can auto-stake.
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
  console.log(ok(`  agent + vault        agent ${agent.toBase58()}`));

  // 7 — a first buy, so the curve is off its opening price.
  const state = await client.state.getPool(pool);
  const cfg = await client.state.getPoolConfig(config.publicKey);
  const currentPoint = new BN(Math.floor(Date.now() / 1000));
  const amountIn = new BN((1n * ONE).toString()); // 1 wMOCK
  const q = client.pool.swapQuote2({
    virtualPool: state,
    config: cfg,
    swapBaseForQuote: false,
    swapMode: SwapMode.ExactIn,
    amountIn,
    slippageBps: 100,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint,
  });
  const swapTx = await client.pool.swap2({
    owner: me,
    pool,
    swapBaseForQuote: false,
    referralTokenAccount: null,
    swapMode: SwapMode.ExactIn,
    amountIn,
    minimumAmountOut: q.minimumAmountOut,
  });
  await send(connection, swapTx, keypair, []);
  console.log(ok(`  first buy            1 wMOCK → ${q.outputAmount.toString()} raw $ORB`));

  fs.writeFileSync(
    new URL("../.devnet-demo.json", import.meta.url),
    JSON.stringify(
      {
        agent: agent.toBase58(),
        agentTokenMint: agentMint.toBase58(),
        wrappedMint: wrappedMint.publicKey.toBase58(),
        prestockMint: prestock.toBase58(),
        vault: vault.toBase58(),
        pool: pool.toBase58(),
        config: config.publicKey.toBase58(),
      },
      null,
      2,
    ),
  );

  console.log(
    banner(
      `demo agent ready — open /agent/${agent.toBase58()}\n  (also written to .devnet-demo.json)`,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
