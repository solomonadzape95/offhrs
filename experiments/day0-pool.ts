/**
 * ANGEL — Day 0 phase 2 (COMPLETE PATH)
 * wPreStock-shaped quote mint -> DBC config -> $AGENT base mint -> virtual pool -> BUY swap
 *
 * Proves the entire stock-paired DBC path works when the quote mint is a
 * 0-fee classic SPL wrapper instead of a raw (Token-2022, transfer-fee-bearing) PreStock.
 */
import fs from "node:fs";
import BN from "bn.js";
import {
  Connection, Keypair, SystemProgram, Transaction, PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, createInitializeMintInstruction, getMintLen,
  createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, createMintToInstruction,
} from "@solana/spl-token";
import {
  DynamicBondingCurveClient, ActivationType, BaseFeeMode, CollectFeeMode,
  DammV2BaseFeeMode, DammV2DynamicFeeMode, MigrationFeeOption, MigrationOption,
  MigratedCollectFeeMode, TokenAuthorityOption, TokenDecimal, TokenType,
  buildCurve, deriveDbcPoolAuthority, deriveDbcPoolAddress, SwapMode,
} from "@meteora-ag/dynamic-bonding-curve-sdk";

const connection = new Connection(process.env.RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(
  fs.readFileSync(new URL("../.devnet-keypair.json", import.meta.url), "utf8"))));
const client = DynamicBondingCurveClient.create(connection, "confirmed");
const ok = (s: string) => `\x1b[32m${s}\x1b[0m`;
const bad = (s: string) => `\x1b[31m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

async function send(tx: Transaction, signers: Keypair[]) {
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  tx.sign(...signers);
  const sim = await connection.simulateTransaction(tx, signers);
  if (sim.value.err) {
    const logs = sim.value.logs ?? [];
    const errLine = logs.find((l) => /Error Code|Error Message|AnchorError/i.test(l)) ?? "";
    const tail = logs.slice(-3).join(" | ");
    return { ok: false as const, err: JSON.stringify(sim.value.err), detail: `${errLine} ${tail}`.trim() };
  }
  const sig = await sendAndConfirmTransaction(connection, tx, signers, { commitment: "confirmed" });
  return { ok: true as const, sig };
}

/** Send without a separate preflight pass — avoids racing devnet blockhash expiry. */
async function sendDirect(tx: Transaction, signers: Keypair[]) {
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = latest.blockhash;
  tx.sign(...signers);
  try {
    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true, maxRetries: 5,
    });
    await connection.confirmTransaction(
      { signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
      "confirmed",
    );
    return { ok: true as const, sig };
  } catch (e: any) {
    return { ok: false as const, err: e?.message ?? String(e), detail: "" };
  }
}

/** classic SPL mint with zero transfer fee — the wPreStock shape. */
async function createClassicMint(decimals: number, mintAuthority: PublicKey) {
  const kp = Keypair.generate();
  const rent = await connection.getMinimumBalanceForRentExemption(getMintLen([]));
  const r = await send(new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey, newAccountPubkey: kp.publicKey,
      lamports: rent, space: getMintLen([]), programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(kp.publicKey, decimals, mintAuthority, null, TOKEN_PROGRAM_ID),
  ), [payer, kp]);
  if (!r.ok) throw new Error(`mint create failed: ${r.err} ${r.detail}`);
  return kp;
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
        feeSchedulerParam: { startingFeeBps: 500, endingFeeBps: 100, numberOfPeriod: 10, totalDuration: 86_400 },
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
      totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0,
      totalVestingDuration: 0, cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    percentageSupplyOnMigration: 10,
    migrationQuoteThreshold: 100,
  });
}

async function main() {
  console.log(bold("\n=== ANGEL Day 0 phase 2 — full stock-paired DBC path (devnet) ===\n"));

  // 1 ─ quote mint = wPreStock shape (0-fee classic SPL) — the whole point
  const wMock = await createClassicMint(9, payer.publicKey);
  console.log(`wPreStock quote mint : ${wMock.publicKey.toBase58()}`);

  // 2 ─ config (permissionless: no tokenBadge)
  const config = Keypair.generate();
  let r = await send(await client.partner.createConfig({
    config: config.publicKey, feeClaimer: payer.publicKey,
    leftoverReceiver: payer.publicKey, payer: payer.publicKey,
    quoteMint: wMock.publicKey, ...curve(),
  }), [payer, config]);
  if (!r.ok) return console.log(bad(`createConfig FAILED: ${r.err} ${r.detail}`));
  console.log(`config               : ${config.publicKey.toBase58()}`);

  // 3 ─ $AGENT base mint — DBC CREATES THIS ITSELF (base_mint is SIGNER+WRITABLE in the IDL).
  //     Do NOT pre-create it or you get SystemError 0x0 (AccountAlreadyInUse).
  //     Decimals come from the config's tokenBaseDecimal.
  const baseMint = Keypair.generate();
  console.log(`$AGENT base mint     : ${baseMint.publicKey.toBase58()} (created by DBC)`);

  // 4 ─ virtual pool   (NOTE: base mint must co-sign)
  r = await send(await client.creator.createPool({
    baseMint: baseMint.publicKey, config: config.publicKey,
    name: "Angel Agent", symbol: "AGENT", uri: "https://angel.local/agent.json",
    payer: payer.publicKey, poolCreator: payer.publicKey,
  }), [payer, baseMint]);
  if (!r.ok) return console.log(bad(`createPool FAILED: ${r.err} ${r.detail}`));

  const pool = deriveDbcPoolAddress(wMock.publicKey, baseMint.publicKey, config.publicKey);
  console.log(`${ok("createPool OK")}        : ${pool.toBase58()}`);

  // 5 ─ read on-chain state to confirm the quote mint really is our wrapper
  const state = await client.state.getPool(pool);
  const cfg = await client.state.getPoolConfig(state.poolState.config);
  console.log(`config.quoteMint     : ${cfg.quoteMint.toBase58()}  ${cfg.quoteMint.equals(wMock.publicKey) ? ok("(== wPreStock)") : bad("MISMATCH")}`);
  console.log(`tokenQuoteDecimal    : ${cfg.tokenQuoteDecimal}`);

  // 6 ─ fund a wMOCK account and BUY $AGENT with it
  const wAta = await getAssociatedTokenAddress(wMock.publicKey, payer.publicKey);
  const fundTx = new Transaction().add(
    createAssociatedTokenAccountInstruction(payer.publicKey, wAta, payer.publicKey, wMock.publicKey),
    createMintToInstruction(wMock.publicKey, wAta, payer.publicKey, 1_000_000_000n), // 1 wMOCK
  );
  r = await send(fundTx, [payer]);
  if (!r.ok) return console.log(bad(`fund wMOCK FAILED: ${r.err} ${r.detail}`));
  console.log(`${ok("funded 1 wMOCK")}      : ${wAta.toBase58()}`);

  const currentPoint = new BN(Math.floor(Date.now() / 1000));
  const amountIn = new BN(100_000_000); // 0.1 wMOCK
  const q = client.pool.swapQuote2({
    virtualPool: state, config: cfg, swapBaseForQuote: false,
    swapMode: SwapMode.ExactIn, amountIn, slippageBps: 100,
    hasReferral: false, eligibleForFirstSwapWithMinFee: false, currentPoint,
  });
  const out = q.amountOut ?? (q as any).outputAmount;
  console.log(`quote: 0.1 wMOCK -> ${out?.toString()} $AGENT (raw)`);

  const swapTx = await client.pool.swap2({
    owner: payer.publicKey, pool, swapBaseForQuote: false,
    referralTokenAccount: null, swapMode: SwapMode.ExactIn,
    amountIn, minimumAmountOut: out.muln(99).divn(100),
  });
  r = await sendDirect(swapTx, [payer]);
  if (!r.ok) return console.log(bad(`swap2 FAILED: ${r.err} ${r.detail}`));
  console.log(`${ok("BUY SWAP OK")}         : ${r.sig}`);

  const post = await client.state.getPool(pool);
  console.log(`\nquote reserve after buy: ${post.poolState.quoteReserve?.toString?.() ?? "n/a"}`);
  console.log(bold(ok("\n✅ END-TO-END PROVEN: a 0-fee wrapped PreStock drives a live DBC $AGENT/stock pool.")));
}

main().catch((e) => { console.error(bad("error:"), e?.message ?? e); process.exit(1); });
