/**
 * Agent configuration. Everything is env-overridable so the same runtime can
 * run dry, against devnet, or against mainnet without code changes.
 */

export type ExecutionBackend = "dryrun" | "jupiter" | "clawpump";

const num = (v: string | undefined, d: number) => (v === undefined ? d : Number(v));
const bool = (v: string | undefined, d = false) => (v === undefined ? d : v === "1" || v === "true");

export const config = {
  /** RPC for on-chain Pyth reads + program calls. */
  rpcUrl: process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com",

  /**
   * Where the agent executes. `dryrun` decides and logs but sends nothing, so
   * the signal engine is inspectable without funds or keys.
   *
   * Clawpump has no native Meteora DBC launch and no custom-quote-mint option,
   * so if their bounty text requires the DBC pool to come from Clawpump we fall
   * back to a direct adapter. Either way the decision loop below is unchanged —
   * only this driver swaps.
   */
  execution: (process.env.ANGEL_EXECUTION ?? "dryrun") as ExecutionBackend,

  /** PreStock to trade, by symbol from https://prestocks.com/api/prestocks */
  symbol: process.env.ANGEL_SYMBOL ?? "SPACEX",

  /**
   * Market-clock proxy for the regime.
   *
   * Deliberately an *equity* feed: the whole point is to detect when the
   * reference market is closed and its marks have stopped moving. A crypto feed
   * (BTC/ETH) updates 24/7 and would never report `frozen`, so it cannot express
   * the thesis. AAPL is used as the clock, not as the asset's own price.
   */
  referenceFeed: process.env.ANGEL_REFERENCE_FEED ?? "Equity.US.AAPL/USD",

  /** Minimum |mark - market| basis, in bps, before the agent acts. */
  minEdgeBps: num(process.env.ANGEL_MIN_EDGE_BPS, 150),

  /** A reference feed older than this is classified "frozen". */
  frozenAfterSecs: num(process.env.ANGEL_FROZEN_AFTER_SECS, 3600),

  /** Staleness ceiling the agent will attest to on-chain. */
  maxStalenessSecs: num(process.env.ANGEL_MAX_STALENESS_SECS, 604_800),

  /** Notional per execution, raw quote units. */
  notional: BigInt(process.env.ANGEL_NOTIONAL ?? "1000000000"),

  /** Reward stream duration when routing profit into the vault. */
  rewardDurationSlots: num(process.env.ANGEL_REWARD_SLOTS, 216_000),

  loopSeconds: num(process.env.ANGEL_LOOP_SECONDS, 60),
  once: bool(process.env.ANGEL_ONCE),

  programId: process.env.ANGEL_PROGRAM_ID ?? "FoVBZRFCamH1HNMiVpNZV2QJxk9bSxWtQvKgmqZ1rVLw",
  keypairPath: process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`,

  /** Clawpump credentials (only needed for the clawpump backend). */
  clawpumpApiKey: process.env.CLAWPUMP_API_KEY,
  clawpumpBase: process.env.CLAWPUMP_BASE ?? "https://clawpump.tech",
} as const;

export const PYTH_RECEIVER_PROGRAM_ID = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";
export const PYTH_PUSH_ORACLE_PROGRAM_ID = "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT";

/** Well-known feed ids we actually have permissionless on-chain access to. */
export const FEED_IDS: Record<string, string> = {
  "Crypto.BTC/USD": "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "Crypto.ETH/USD": "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  "Equity.US.AAPL/USD": "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
  "Equity.US.NVDA/USD": "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
  "Crypto.AAPLX/USD": "978e6cc68a119ce066aa830017318563a9ed04ec3a0a6439010fc11296a58675",
};

export function requireFeedId(symbol: string): string {
  const id = FEED_IDS[symbol];
  if (!id) {
    throw new Error(
      `No known on-chain feed for "${symbol}". Known: ${Object.keys(FEED_IDS).join(", ")}\n` +
        `(Equity.Index.OPENAI/ANTHROPIC are gated on Hermes AND have no on-chain account.)`,
    );
  }
  return id;
}
