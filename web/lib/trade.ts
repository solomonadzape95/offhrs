/**
 * The trade layer — buying and selling an agent's `$AGENT` token on its Meteora
 * DBC curve, with the two product behaviours that define Offhrs wired into the
 * transaction itself rather than bolted on in the UI:
 *
 *   - **auto-stake on buy** (item 3): the bought `$AGENT` is staked into the
 *     dividend vault in the *same transaction* as the swap. A buyer never sees
 *     an "unstaked balance" they have to act on, and rewards start streaming
 *     from the slot they buy.
 *   - **payout choice on sell** (item 4): the sale can settle as `wPreStock`
 *     (stay in the wrapper), raw `PreStock` (unwrap), or USDC (unwrap then route
 *     through Jupiter). The first two are one atomic transaction; USDC adds a
 *     client-side Jupiter leg, because Jupiter is mainnet-only.
 *
 * Everything here is **server-side**. It imports the Meteora SDK and
 * `@solana/web3.js`; the browser receives only a base64 wire transaction from
 * `app/actions.ts`, exactly like the existing stake/claim write path. The
 * instruction discriminators and PDA seeds mirror `programs/stock_vault/src/`.
 *
 * The one honest asymmetry: `swap2` sends the bought `$AGENT` to the wallet's
 * token account, then we stake it. We stake the quote's *minimum* output (the
 * slippage-guaranteed floor), so the transaction can never revert because the
 * curve delivered a hair less than quoted. Any favourable slippage stays liquid.
 */
import BN from "bn.js";
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";

import {
  PROGRAM_ID,
  PROGRAM_RPC_URL,
  agentPda,
  fetchAgentByPda,
  fetchWrapper,
  reservePda,
  wrapperConfigPda,
} from "./chain";
import { associatedAddress, createAtaIdempotent, stakeInstruction } from "./program-tx";
import type { SellPayout, TradeQuote, TradeSide } from "./portfolio";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

const DISC = {
  unwrap: Uint8Array.from([126, 175, 198, 14, 212, 69, 50, 44]),
} as const;

function u64le(v: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
}

// The SDK is ~500 KB of curve maths and must not reach a client bundle. It is
// imported dynamically so a request that only reads (and never trades) pays
// nothing for it, and Next keeps it out of the browser graph because every
// importer of this module is a server action.
let clientPromise: Promise<{ sdk: any; client: any }> | null = null;
async function dbc(): Promise<{ sdk: any; client: any }> {
  clientPromise ??= (async () => {
    const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
    const connection = new Connection(PROGRAM_RPC_URL, "confirmed");
    const client = sdk.DynamicBondingCurveClient.create(connection, "confirmed");
    return { sdk, client };
  })();
  return clientPromise;
}

// ---------------------------------------------------------------------------
// Pool discovery
// ---------------------------------------------------------------------------
export type PoolContext = {
  pool: string;
  config: string;
  quoteMint: string;
  baseDecimals: number;
  quoteDecimals: number;
};

type CachedPool = {
  at: number;
  promise: Promise<(PoolContext & { virtualPool: any; configState: any }) | null>;
};
const POOL_TTL_MS = 15_000;
const poolCache = new Map<string, CachedPool>();

/**
 * Find the DBC pool whose base mint is `$AGENT`, plus its config, from the base
 * mint alone. The `Agent` account stores the *wrapped* mint and the token mint,
 * but not the curve's config, so `getPoolByBaseMint` is the join. Cached briefly:
 * the discovery is a `getProgramAccounts`, and the buy box quotes on a debounce.
 */
export async function loadPool(
  baseMint: string,
): Promise<(PoolContext & { virtualPool: any; configState: any }) | null> {
  const cached = poolCache.get(baseMint);
  if (cached && Date.now() - cached.at < POOL_TTL_MS) return cached.promise;

  const promise = (async () => {
    const { client } = await dbc();
    const found = await client.state.getPoolByBaseMint(new PublicKey(baseMint));
    if (!found) return null;
    const virtualPool: any = found.account ?? found;
    const poolKey: PublicKey = found.publicKey ?? virtualPool.publicKey;
    const configAddr: PublicKey = virtualPool.poolState?.config ?? virtualPool.config;
    const configState = await client.state.getPoolConfig(configAddr);
    return {
      pool: poolKey.toBase58(),
      config: configAddr.toBase58(),
      quoteMint: configState.quoteMint.toBase58(),
      // The on-chain config stores only the *base* decimals. DBC quote mints are
      // 9-decimal by convention, and the wrapper inherits the PreStock's 9.
      baseDecimals: Number(configState.tokenDecimal),
      quoteDecimals: 9,
      virtualPool,
      configState,
    };
  })();

  poolCache.set(baseMint, { at: Date.now(), promise });
  return promise;
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------
export async function quoteTrade(
  baseMint: string,
  side: TradeSide,
  amountInRaw: string,
  slippageBps = 100,
): Promise<TradeQuote> {
  const amount = BigInt(amountInRaw);
  if (amount <= 0n) throw new Error("Amount must be greater than zero.");

  const { sdk, client } = await dbc();
  const ctx = await loadPool(baseMint);
  if (!ctx) throw new Error("This agent has no Meteora DBC pool on this cluster yet.");

  const quote = client.pool.swapQuote2({
    virtualPool: ctx.virtualPool,
    config: ctx.configState,
    swapBaseForQuote: side === "sell",
    swapMode: sdk.SwapMode.ExactIn,
    amountIn: new BN(amountInRaw),
    slippageBps,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint: new BN(Math.floor(Date.now() / 1000)),
  });

  const outAmount = BigInt(quote.outputAmount.toString());
  const minOut = BigInt((quote.minimumAmountOut ?? quote.outputAmount).toString());

  // Normalise both directions to "wPreStock per $AGENT".
  const human = (raw: bigint, decimals: number) => Number(raw) / 10 ** decimals;
  const price =
    side === "buy"
      ? human(amount, ctx.quoteDecimals) / human(outAmount, ctx.baseDecimals)
      : human(outAmount, ctx.quoteDecimals) / human(amount, ctx.baseDecimals);

  return {
    side,
    pool: ctx.pool,
    inMint: side === "buy" ? ctx.quoteMint : baseMint,
    outMint: side === "buy" ? baseMint : ctx.quoteMint,
    inAmount: amount.toString(),
    outAmount: outAmount.toString(),
    minOut: minOut.toString(),
    baseDecimals: ctx.baseDecimals,
    quoteDecimals: ctx.quoteDecimals,
    price,
    tradingFee: quote.tradingFee?.toString() ?? "0",
    protocolFee: quote.protocolFee?.toString() ?? "0",
  };
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/** Set feePayer/blockhash on an SDK-built transaction without re-signing it. */
function finalise(tx: Transaction, owner: PublicKey, blockhash: string): Transaction {
  tx.feePayer = owner;
  tx.recentBlockhash = blockhash;
  return tx;
}

/**
 * Buy `$AGENT` with `wPreStock`, optionally auto-staking in the same transaction.
 *
 * Account order and discriminators for the appended `stake` instruction come from
 * `program-tx.ts`, so there is one source of truth for our own program.
 */
export async function buildBuyTransaction(
  owner: string,
  agentTokenMint: string,
  amountInRaw: string,
  autoStake: boolean,
  blockhash: string,
  slippageBps = 100,
): Promise<Transaction> {
  const amount = BigInt(amountInRaw);
  if (amount <= 0n) throw new Error("Amount must be greater than zero.");

  const { sdk, client } = await dbc();
  const ctx = await loadPool(agentTokenMint);
  if (!ctx) throw new Error("This agent has no Meteora DBC pool on this cluster yet.");

  const quote = client.pool.swapQuote2({
    virtualPool: ctx.virtualPool,
    config: ctx.configState,
    swapBaseForQuote: false,
    swapMode: sdk.SwapMode.ExactIn,
    amountIn: new BN(amountInRaw),
    slippageBps,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint: new BN(Math.floor(Date.now() / 1000)),
  });

  const ownerKey = new PublicKey(owner);
  const tx: Transaction = await client.pool.swap2({
    owner: ownerKey,
    pool: new PublicKey(ctx.pool),
    swapBaseForQuote: false,
    referralTokenAccount: null,
    swapMode: sdk.SwapMode.ExactIn,
    amountIn: new BN(amountInRaw),
    minimumAmountOut: quote.minimumAmountOut,
  });

  if (autoStake) {
    const agent = await fetchAgentByPda(agentPda(agentTokenMint));
    if (!agent) throw new Error("No agent registered for that token on this cluster.");
    const stakeAmount = BigInt((quote.minimumAmountOut ?? quote.outputAmount).toString());
    if (stakeAmount > 0n) {
      tx.add(
        stakeInstruction(
          ownerKey,
          new PublicKey(agent.vault),
          new PublicKey(agentTokenMint),
          stakeAmount,
        ),
      );
    }
  }

  return finalise(tx, ownerKey, blockhash);
}

export type { SellPayout };

/**
 * Sell `$AGENT` for `wPreStock`, and — when the chosen payout is `prestock` or
 * `usdc` — unwrap the proceeds in the same transaction. The USDC leg itself is a
 * Jupiter swap built client-side and executed after this lands.
 */
export async function buildSellTransaction(
  owner: string,
  agentTokenMint: string,
  prestockMint: string,
  amountInRaw: string,
  payout: SellPayout,
  blockhash: string,
  slippageBps = 100,
): Promise<Transaction> {
  const amount = BigInt(amountInRaw);
  if (amount <= 0n) throw new Error("Amount must be greater than zero.");

  const { sdk, client } = await dbc();
  const ctx = await loadPool(agentTokenMint);
  if (!ctx) throw new Error("This agent has no Meteora DBC pool on this cluster yet.");

  const quote = client.pool.swapQuote2({
    virtualPool: ctx.virtualPool,
    config: ctx.configState,
    swapBaseForQuote: true,
    swapMode: sdk.SwapMode.ExactIn,
    amountIn: new BN(amountInRaw),
    slippageBps,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint: new BN(Math.floor(Date.now() / 1000)),
  });

  const ownerKey = new PublicKey(owner);
  const tx: Transaction = await client.pool.swap2({
    owner: ownerKey,
    pool: new PublicKey(ctx.pool),
    swapBaseForQuote: true,
    referralTokenAccount: null,
    swapMode: sdk.SwapMode.ExactIn,
    amountIn: new BN(amountInRaw),
    minimumAmountOut: quote.minimumAmountOut,
  });

  if (payout === "prestock" || payout === "usdc") {
    const wrapper = await fetchWrapper(prestockMint);
    if (!wrapper) throw new Error("No wrapper for that PreStock on this cluster yet.");
    const prestock = new PublicKey(prestockMint);
    const wrapped = new PublicKey(wrapper.wrappedMint);
    const wrapperConfig = wrapperConfigPda(prestock);
    const unwrapAmount = BigInt((quote.minimumAmountOut ?? quote.outputAmount).toString());
    if (unwrapAmount > 0n) {
      tx.add(createAtaIdempotent(ownerKey, ownerKey, prestock, TOKEN_2022_PROGRAM_ID));
      tx.add(
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: ownerKey, isSigner: true, isWritable: true },
            { pubkey: prestock, isSigner: false, isWritable: true },
            { pubkey: wrapperConfig, isSigner: false, isWritable: true },
            { pubkey: wrapped, isSigner: false, isWritable: true },
            { pubkey: reservePda(wrapperConfig), isSigner: false, isWritable: true },
            {
              pubkey: associatedAddress(ownerKey, prestock, TOKEN_2022_PROGRAM_ID),
              isSigner: false,
              isWritable: true,
            },
            {
              pubkey: associatedAddress(ownerKey, wrapped, TOKEN_PROGRAM_ID),
              isSigner: false,
              isWritable: true,
            },
            { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          ],
          data: Buffer.concat([Buffer.from(DISC.unwrap), u64le(unwrapAmount)]),
        }),
      );
    }
  }

  return finalise(tx, ownerKey, blockhash);
}
