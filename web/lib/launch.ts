/**
 * Self-owned DBC launch — the fallback if Clawpump falls through.
 *
 * The normal path is that Clawpump creates the `$AGENT` mint on a Meteora DBC
 * pool and the launch flow pastes that mint in. This module is the alternative:
 * the app creates the config **and** the pool itself, permissionlessly, using
 * Meteora's own SDK. The resulting mint is then registered and vaulted exactly
 * like a Clawpump one, so nothing downstream changes.
 *
 * Two accounts are created and must sign: the config and the base mint. The base
 * mint cannot be pre-created — DBC's `InitializeVirtualPoolWithSplToken` creates
 * it — so both keypairs are generated here, used to partially sign, and then
 * discarded. They have no power after the transaction lands: the mint is created
 * `Immutable`, and the config is only an address. The connected wallet is the
 * fee payer and the creator, and it co-signs in the browser.
 *
 * Server-side, like the rest of the write path: the SDK and `@solana/web3.js`
 * stay out of the browser bundle.
 */
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";

import { PROGRAM_RPC_URL, fetchWrapper } from "./chain";

const DEFAULT_URI = "https://offhrs.xyz/agent.json";

let clientPromise: Promise<{ sdk: any; client: any }> | null = null;
async function dbc(): Promise<{ sdk: any; client: any }> {
  clientPromise ??= (async () => {
    const [sdk, { Connection }] = await Promise.all([
      import("@meteora-ag/dynamic-bonding-curve-sdk"),
      import("@solana/web3.js"),
    ]);
    const connection = new Connection(PROGRAM_RPC_URL, "confirmed");
    return { sdk, client: sdk.DynamicBondingCurveClient.create(connection, "confirmed") };
  })();
  return clientPromise;
}

/**
 * The same curve the preview shows, computed by the DBC SDK. `feeBps` is the
 * starting dynamic-fee tier; the schedule decays to 100bps over a day.
 */
function curve(sdk: any, feeBps: number) {
  return sdk.buildCurve({
    token: {
      tokenType: sdk.TokenType.SPLToken,
      tokenBaseDecimal: sdk.TokenDecimal.SIX,
      tokenQuoteDecimal: sdk.TokenDecimal.NINE,
      tokenAuthorityOption: sdk.TokenAuthorityOption.Immutable,
      totalTokenSupply: 1_000_000_000,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: sdk.BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: {
          startingFeeBps: feeBps,
          endingFeeBps: 100,
          numberOfPeriod: 10,
          totalDuration: 86_400,
        },
      },
      dynamicFeeEnabled: true,
      // Fees accrue in the quote asset, which is wPreStock. This is the setting
      // that makes "dividends paid in equity" true.
      collectFeeMode: sdk.CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 0,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: sdk.MigrationOption.MET_DAMM_V2,
      migrationFeeOption: sdk.MigrationFeeOption.Customizable,
      migrationFee: { feePercentage: 10, creatorFeePercentage: 50 },
      migratedPoolFee: {
        collectFeeMode: sdk.MigratedCollectFeeMode.QuoteToken,
        dynamicFee: sdk.DammV2DynamicFeeMode.Enabled,
        poolFeeBps: 100,
        baseFeeMode: sdk.DammV2BaseFeeMode.FeeTimeSchedulerLinear,
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
    activationType: sdk.ActivationType.Timestamp,
    percentageSupplyOnMigration: 10,
    migrationQuoteThreshold: 100,
  });
}

export type CurveKeypairs = { config: Keypair; baseMint: Keypair };

export type CreateCurveInput = {
  owner: string;
  /** The raw PreStock the pool is quoted in — resolved to its wrapper. */
  prestockMint: string;
  name: string;
  symbol: string;
  feeBps: number;
  blockhash: string;
  uri?: string;
  /** For scripts that need to sign and send themselves; the app omits it. */
  keypairs?: CurveKeypairs;
};

export type CreateCurveResult = {
  tx: Transaction;
  keypairs: CurveKeypairs;
  /** The `$AGENT` mint DBC will create. */
  baseMint: string;
  config: string;
  pool: string;
  quoteMint: string;
};

/**
 * Build the single transaction that creates the DBC config and its pool. The
 * config and base mint keypairs partially sign it; the caller (wallet) signs as
 * fee payer and sends.
 */
export async function buildCreateAgentCurve(input: CreateCurveInput): Promise<CreateCurveResult> {
  const { sdk, client } = await dbc();
  const wrapper = await fetchWrapper(input.prestockMint);
  if (!wrapper) throw new Error("No wrapper for that PreStock on this cluster yet.");

  const owner = new PublicKey(input.owner);
  const quoteMint = new PublicKey(wrapper.wrappedMint);
  const config = input.keypairs?.config ?? Keypair.generate();
  const baseMint = input.keypairs?.baseMint ?? Keypair.generate();

  const tx: Transaction = await client.partner.createConfigAndPool({
    config: config.publicKey,
    feeClaimer: owner,
    leftoverReceiver: owner,
    payer: owner,
    quoteMint,
    ...curve(sdk, input.feeBps),
    preCreatePoolParam: {
      baseMint: baseMint.publicKey,
      name: input.name,
      symbol: input.symbol,
      uri: input.uri ?? DEFAULT_URI,
      poolCreator: owner,
    },
  });

  tx.feePayer = owner;
  tx.recentBlockhash = input.blockhash;
  // Compile first (feePayer + blockhash are set), then add the ephemeral sigs.
  tx.partialSign(config, baseMint);

  const pool = sdk.deriveDbcPoolAddress(quoteMint, baseMint.publicKey, config.publicKey);
  return {
    tx,
    keypairs: { config, baseMint },
    baseMint: baseMint.publicKey.toBase58(),
    config: config.publicKey.toBase58(),
    pool: (pool as PublicKey).toBase58(),
    quoteMint: quoteMint.toBase58(),
  };
}
