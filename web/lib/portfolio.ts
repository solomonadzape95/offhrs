/**
 * Serializable shapes for the wallet-scoped surfaces.
 *
 * These live apart from `app/actions.ts` because a `"use server"` module may only
 * export async functions, and apart from `lib/chain.ts` so importing the types
 * never pulls `@solana/web3.js` into a client bundle. Every amount is a
 * pre-formatted decimal string: the boundary between server and client is
 * JSON, and BigInt does not survive it cleanly.
 */

export type PositionRow = {
  agentId: string;
  name: string;
  ticker: string;
  asset: string;
  feeBps: number;
  /** Human decimal strings, already scaled by the mint's decimals. */
  liquid: string;
  staked: string;
  accrued: string;
  claimable: string;
  rewardMint: string;
};

export type EquityCard = {
  symbol: string;
  wrappedMint: string;
  claimable: string;
};

export type Portfolio = {
  rows: PositionRow[];
  totals: {
    /** Liquid + staked `$AGENT`. */
    total: string;
    liquid: string;
    staked: string;
    accrued: string;
    claimable: string;
    incomeToDate: string;
  };
  equity: EquityCard[];
  /** False when the program is unreachable on this cluster. */
  onChain: boolean;
};

export type AgentView = {
  id: string;
  name: string;
  ticker: string;
  asset: string;
  feeBps: number;
  creator: string;
  executionCount: number;
};

export type ExecutionView = {
  agentId: string;
  agentName: string;
  index: number;
  venue: string;
  amountIn: string;
  amountOut: string;
  profit: string;
  pythPrice: string;
  pythExponent: number;
  regime: string;
  stalenessSecs: number;
  executedAt: number;
};

/** An unsigned, base64 wire transaction, or the reason it could not be built. */
export type BuildTxResult = { tx: string } | { error: string };

/** The relayed signature, or the reason the send failed. */
export type SubmitResult = { signature: string } | { error: string };

/** Which side of the DBC curve a trade is on. */
export type TradeSide = "buy" | "sell";

/** What a sale settles as: the wrapper, the raw PreStock, or USDC. */
export type SellPayout = "wprestock" | "prestock" | "usdc";

/** A live DBC quote. Raw integer amounts; the client applies the mint decimals. */
export type TradeQuote = {
  side: TradeSide;
  pool: string;
  inMint: string;
  outMint: string;
  inAmount: string;
  outAmount: string;
  /** The slippage-guaranteed floor; what auto-stake stakes. */
  minOut: string;
  baseDecimals: number;
  quoteDecimals: number;
  /** Price of one `$AGENT`, expressed in wPreStock, whichever side is quoted. */
  price: number;
  tradingFee: string;
  protocolFee: string;
};

/** The self-owned DBC launch transaction, plus the mint DBC will create. */
export type CreateCurveTxResult =
  | { tx: string; baseMint: string; config: string; pool: string }
  | { error: string };

/**
 * Everything the trade box needs before it offers a size: the pool's existence,
 * the mint decimals, and the connected wallet's raw balances. Amounts are raw
 * integer strings because the client needs to do unit math against them.
 */
export type AgentTradeInfo = {
  /** False when the route id is a seeded preview rather than an on-chain agent. */
  onChain: boolean;
  /** True only when a Meteora DBC pool exists for this `$AGENT` mint. */
  poolExists: boolean;
  agentTokenMint: string;
  wrappedMint: string;
  prestockMint: string | null;
  asset: string;
  baseDecimals: number;
  quoteDecimals: number;
  balances: {
    /** Liquid, unstaked `$AGENT`. */
    liquidAgent: string;
    /** `$AGENT` currently staked in the dividend vault. */
    stakedAgent: string;
    /** `wPreStock` held in the wallet. */
    wrapped: string;
    /** Raw PreStock (Token-2022) held in the wallet. */
    prestock: string;
  };
  /** wPreStock per `$AGENT`, from a nominal quote. Null when the pool is absent. */
  price: number | null;
};
