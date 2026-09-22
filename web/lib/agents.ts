/**
 * The agent launch set.
 *
 * ⚠️ HONESTY NOTE — read this before trusting the grid.
 *
 * The *market* figures shown against each agent are real: they come from the
 * PreStocks issuer API, a live Jupiter quote and an on-chain Pyth account.
 *
 * The agent *records* below (name, ticker, creator, fee tier) are **seeded
 * configuration**, not on-chain registrations. No `$AGENT` DBC pool has been
 * created yet, so there is nothing on chain to read. The UI marks these as
 * PREVIEW for that reason, and `lib/chain.ts` is the path that replaces this
 * list with real `Agent` accounts the moment pools exist — the registry PDA is
 * `[b"agent", agentTokenMint]` and the shape of an `Agent` account is fixed in
 * `programs/stock_vault/src/state.rs`.
 */

export type AgentSeed = {
  id: string;
  name: string;
  ticker: string;
  /** PreStocks symbol this agent's vault pays out in. */
  asset: string;
  thesis: string;
  creator: string;
  /** DBC dynamic fee tier, bps. */
  feeBps: number;
  /** Fraction of the curve filled, for the progress meter. Seeded. */
  curveProgress: number;
  /** Slots since the agent last traded. Seeded. */
  lastTradeSecsAgo: number;
  /** True when this record came from the chain, false/undefined for the seed set. */
  onchain?: boolean;
};

export const AGENTS: AgentSeed[] = [
  {
    id: "orbital",
    name: "Orbital",
    ticker: "ORB",
    asset: "SPACEX",
    thesis: "Buys SpaceX tokens on weekends, when the price drifts farthest from its mark.",
    creator: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    feeBps: 500,
    curveProgress: 0.72,
    lastTradeSecsAgo: 1840,
  },
  {
    id: "sentinel",
    name: "Sentinel",
    ticker: "SNTL",
    asset: "ANDURIL",
    thesis: "Trades Anduril on its defence backlog; holds through the open, sells when price meets mark.",
    creator: "9BmQr4kLhVn2XcWpY7TfAd3sGzE6uJqRoP8vNbC1dHfM",
    feeBps: 650,
    curveProgress: 0.41,
    lastTradeSecsAgo: 610,
  },
  {
    id: "alignment",
    name: "Alignment",
    ticker: "ALGN",
    asset: "OPENAI",
    thesis: "Trades OpenAI as its mark moves, sizing bets to how confident the price feed is.",
    creator: "4dFgH8jKlMn2PqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTu",
    feeBps: 750,
    curveProgress: 0.88,
    lastTradeSecsAgo: 240,
  },
  {
    id: "frontier",
    name: "Frontier",
    ticker: "FRNTR",
    asset: "ANTHROPIC",
    thesis: "Trades Anthropic only when the gap is twice the cost of trading. Usually does nothing.",
    creator: "2hJkL4mNoP6qRsTuV8wXyZaBcDeFgHiJkLmNoPqRsTuV",
    feeBps: 400,
    curveProgress: 0.19,
    lastTradeSecsAgo: 14200,
  },
  {
    id: "cortex",
    name: "Cortex",
    ticker: "CRTX",
    asset: "NEURALINK",
    thesis: "Watches Neuralink around clinical news, with a hard stop if the regime changes.",
    creator: "5nPqR7sTuV9wXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaBc",
    feeBps: 900,
    curveProgress: 0.55,
    lastTradeSecsAgo: 3980,
  },
  {
    id: "forecast",
    name: "Forecast",
    ticker: "FCST",
    asset: "KALSHI",
    thesis: "Trades Kalshi against its prediction-market contract, not the share price.",
    creator: "8rSvW2xYzAbCdEfGhJkLmNoPqRsTuVwXyZaBcDeFgHi",
    feeBps: 550,
    curveProgress: 0.34,
    lastTradeSecsAgo: 9020,
  },
  {
    id: "consensus",
    name: "Consensus",
    ticker: "CNSN",
    asset: "POLYMARKET",
    thesis: "Trades Polymarket on event-driven swings — small bets, high turnover.",
    creator: "3tUvX6yZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJk",
    feeBps: 500,
    curveProgress: 0.63,
    lastTradeSecsAgo: 1500,
  },
  {
    id: "humanoid",
    name: "Humanoid",
    ticker: "HMND",
    asset: "FIGUREAI",
    thesis: "Trades Figure in a thin book, so it takes the smallest positions of the set.",
    creator: "6vWxY9zAbCdEfGhJkLmNoPqRsTuVwXyZaBcDeFgHiJkL",
    feeBps: 800,
    curveProgress: 0.27,
    lastTradeSecsAgo: 6110,
  },
];

export const findAgent = (id: string) => AGENTS.find((a) => a.id === id);

/**
 * The display identity for an on-chain agent that carries no Metaplex metadata,
 * keyed by the asset it trades. These are the preview names, reused so a launched
 * devnet agent reads as a desk rather than as a mint fragment. Metadata always
 * wins when it exists.
 */
export const AGENT_IDENTITY_BY_ASSET: Record<string, { name: string; ticker: string }> = {
  SPACEX: { name: "Orbital", ticker: "ORB" },
  ANDURIL: { name: "Sentinel", ticker: "SNTL" },
  OPENAI: { name: "Alignment", ticker: "ALGN" },
  ANTHROPIC: { name: "Frontier", ticker: "FRNTR" },
  NEURALINK: { name: "Cortex", ticker: "CRTX" },
  KALSHI: { name: "Forecast", ticker: "FCST" },
  POLYMARKET: { name: "Consensus", ticker: "CNSN" },
  FIGUREAI: { name: "Humanoid", ticker: "HMND" },
};

/**
 * The assets we lead with. The PreStocks universe is eight tokens; these two are
 * the ones the demo and the bounty narrative center on. **OpenAI** is still
 * private — the PreStocks bounty is about pre-IPO equity — and **SpaceX** has
 * IPO'd, so its PreStock is tokenized *post-IPO* stock. The wrapper, the vault and
 * the pool are identical either way; only the underlying's status differs.
 */
export const LEAD_ASSETS = ["OPENAI", "SPACEX"] as const;

/** Lead assets first, then the rest of the universe in its given order. */
export const orderByLead = <T extends { symbol: string }>(assets: T[]): T[] =>
  [...assets].sort((a, b) => {
    const ai = (LEAD_ASSETS as readonly string[]).indexOf(a.symbol);
    const bi = (LEAD_ASSETS as readonly string[]).indexOf(b.symbol);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

/** Curve progress is seeded; the migration threshold is configured in quote-token units. */
export const MIGRATION_THRESHOLD_WPRESTOCK = 750;
