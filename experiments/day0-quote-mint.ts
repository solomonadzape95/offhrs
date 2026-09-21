/**
 * ANGEL — Day 0 de-risk experiment
 * ---------------------------------------------------------------------------
 * QUESTION: Can a PreStock-shaped mint (Token-2022, non-zero transfer fee,
 *           extra extensions) be used as a Meteora DBC quote mint?
 *
 * The DBC program IDL ships error code 6081 "QuoteMintHasNonZeroTransferFee".
 * This script reproduces that on devnet and proves the wrapper design works.
 *
 * MATRIX
 *   A. Token-2022 + transferFee 50bps + permanentDelegate + defaultAccountState   -> expect FAIL
 *   B. Token-2022 + transferFee  0bps + permanentDelegate (no token badge)        -> expect FAIL
 *   C. classic SPL Token, 0 fee  (the wPreStock wrapper shape)                    -> expect PASS
 *
 * B is the important one: it shows that "just ask PreStocks to zero the fee"
 * is NOT sufficient — a Meteora operator token badge is *also* required for
 * permanentDelegate and friends. The wrapper needs neither.
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
  AccountState,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeDefaultAccountStateInstruction,
  getMintLen,
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
} from "@meteora-ag/dynamic-bonding-curve-sdk";

const RPC = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const connection = new Connection(RPC, "confirmed");
const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(new URL("../.devnet-keypair.json", import.meta.url), "utf8"))),
);
const client = DynamicBondingCurveClient.create(connection, "confirmed");

const label = (s: string) => `\x1b[1m${s}\x1b[0m`;
const ok = (s: string) => `\x1b[32m${s}\x1b[0m`;
const bad = (s: string) => `\x1b[31m${s}\x1b[0m`;

async function send(tx: Transaction, signers: Keypair[]) {
  tx.feePayer = payer.publicKey;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(...signers);
  // Simulate first so a failed case costs nothing.
  const sim = await connection.simulateTransaction(tx, signers);
  if (sim.value.err) {
    const logs = sim.value.logs ?? [];
    const errLine = logs.find((l) => /Error|error 0x|Custom/i.test(l));
    return { ok: false as const, err: JSON.stringify(sim.value.err), detail: errLine ?? "" };
  }
  const sig = await sendAndConfirmTransaction(connection, tx, signers, {
    commitment: "confirmed",
    skipPreflight: false,
  });
  return { ok: true as const, sig };
}

/** Create a Token-2022 mint with a PreStock-like extension profile. */
async function createToken2022(opts: {
  name: string;
  feeBps: number;
  permanentDelegate: boolean;
  defaultAccountState: boolean;
}) {
  const mint = Keypair.generate();
  const exts: ExtensionType[] = [ExtensionType.TransferFeeConfig];
  if (opts.permanentDelegate) exts.push(ExtensionType.PermanentDelegate);
  if (opts.defaultAccountState) exts.push(ExtensionType.DefaultAccountState);

  const len = getMintLen(exts);
  const rent = await connection.getMinimumBalanceForRentExemption(len);
  const tx = new Transaction();
  const auth = payer.publicKey;

  tx.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      lamports: rent,
      space: len,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferFeeConfigInstruction(
      mint.publicKey, auth, auth, opts.feeBps, BigInt(1_000_000_000), TOKEN_2022_PROGRAM_ID,
    ),
  );
  if (opts.permanentDelegate)
    tx.add(createInitializePermanentDelegateInstruction(mint.publicKey, auth, TOKEN_2022_PROGRAM_ID));
  if (opts.defaultAccountState)
    tx.add(createInitializeDefaultAccountStateInstruction(
      mint.publicKey, AccountState.Initialized, TOKEN_2022_PROGRAM_ID,
    ));
  tx.add(createInitializeMintInstruction(mint.publicKey, 9, auth, auth, TOKEN_2022_PROGRAM_ID));

  const r = await send(tx, [payer, mint]);
  if (!r.ok) throw new Error(`mint create failed: ${r.err} ${r.detail}`);
  console.log(`  created ${opts.name.padEnd(22)} ${mint.publicKey.toBase58()}`);
  return mint.publicKey;
}

/** Create a plain classic SPL mint with zero transfer fee — the wrapper shape. */
async function createClassicSpl(name: string) {
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
    createInitializeMintInstruction(mint.publicKey, 9, payer.publicKey, null, TOKEN_PROGRAM_ID),
  );
  const r = await send(tx, [payer, mint]);
  if (!r.ok) throw new Error(`mint create failed: ${r.err} ${r.detail}`);
  console.log(`  created ${name.padEnd(22)} ${mint.publicKey.toBase58()}`);
  return mint.publicKey;
}

function curveConfig() {
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
          startingFeeBps: 500, // 5% — the doc's "dynamic fee tier"
          endingFeeBps: 100,
          numberOfPeriod: 10,
          totalDuration: 86_400,
        },
      },
      dynamicFeeEnabled: true,
      collectFeeMode: CollectFeeMode.QuoteToken, // fees accrue in wPreStock
      creatorTradingFeePercentage: 0,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.Customizable,
      migrationFee: {
        feePercentage: 10,
        creatorFeePercentage: 50,
      },
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

async function tryCreateConfig(quoteMint: PublicKey, caseName: string) {
  const config = Keypair.generate();
  const tx = await client.partner.createConfig({
    config: config.publicKey,
    feeClaimer: payer.publicKey,
    leftoverReceiver: payer.publicKey,
    payer: payer.publicKey,
    quoteMint,
    ...curveConfig(),
  });
  const r = await send(tx, [payer, config]);
  if (r.ok) {
    console.log(`  ${ok("PASS")}  ${caseName}  config=${config.publicKey.toBase58()}`);
  } else {
    console.log(`  ${bad("FAIL")}  ${caseName}`);
    console.log(`        err:    ${r.err}`);
    if (r.detail) console.log(`        detail: ${r.detail.trim()}`);
  }
  return r;
}

async function main() {
  console.log(label("\n=== ANGEL Day 0 — DBC quote mint feasibility (devnet) ==="));
  console.log(`payer: ${payer.publicKey.toBase58()}`);
  console.log(`DBC program: dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`);
  const bal = await connection.getBalance(payer.publicKey);
  console.log(`balance: ${bal / 1e9} SOL\n`);

  console.log(label("Creating mock mints..."));
  const mockPrestock = await createToken2022({
    name: "mock PreStock (50bps)",
    feeBps: 50,
    permanentDelegate: true,
    defaultAccountState: true,
  });
  const zeroFee2022 = await createToken2022({
    name: "Token2022 0bps + permDel",
    feeBps: 0,
    permanentDelegate: true,
    defaultAccountState: false,
  });
  const wrapped = await createClassicSpl("wMOCK (classic SPL)");

  console.log(label("\nAttempting DBC createConfig for each quote mint:\n"));
  await tryCreateConfig(mockPrestock, "A. Token-2022 @50bps transfer fee   (raw PreStock shape)");
  await tryCreateConfig(zeroFee2022, "B. Token-2022 @0bps + permanentDelegate (no badge)");
  await tryCreateConfig(wrapped, "C. classic SPL, 0 fee                 (wPreStock shape)");

  console.log(label("\n=== verdict ==="));
  console.log("If C passed and A/B failed, the wrapped-PreStock design is confirmed.");
  console.log(`mock PreStock mint : ${mockPrestock.toBase58()}`);
  console.log(`wMOCK mint         : ${wrapped.toBase58()}`);
}

main().catch((e) => {
  console.error("\n" + bad("script error:"), e?.message ?? e);
  process.exit(1);
});
