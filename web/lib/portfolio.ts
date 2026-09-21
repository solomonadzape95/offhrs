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
