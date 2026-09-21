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
};

export const AGENTS: AgentSeed[] = [
  {
    id: "orbital",
    name: "Orbital",
    ticker: "ORB",
    asset: "SPACEX",
    thesis: "Weekend basis capture on the widest mark dislocation in the set.",
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
    thesis: "Defence backlog reads; holds through the open, exits on convergence.",
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
    thesis: "Mark convergence on the AI complex, sized by Pyth confidence width.",
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
    thesis: "Only trades when the basis clears cost by 2x. Usually flat.",
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
    thesis: "Clinical-catalyst drift, with a hard stop on regime change.",
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
    thesis: "Prediction-market basis against the event contract, not the equity.",
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
    thesis: "Event-driven dislocations; small size, high turnover.",
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
    thesis: "Robotics ramp; the thinnest book, so the smallest clips.",
    creator: "6vWxY9zAbCdEfGhJkLmNoPqRsTuVwXyZaBcDeFgHiJkL",
    feeBps: 800,
    curveProgress: 0.27,
    lastTradeSecsAgo: 6110,
  },
];

export const findAgent = (id: string) => AGENTS.find((a) => a.id === id);

/** Curve progress is seeded; the migration threshold is configured in quote-token units. */
export const MIGRATION_THRESHOLD_WPRESTOCK = 750;
