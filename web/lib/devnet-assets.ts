/**
 * The devnet stand-in for the mainnet PreStocks universe.
 *
 * Real PreStocks only exist on mainnet, so the website's asset list comes from the
 * issuer API — real mints, none of which have a wrapper on devnet. Every page that
 * resolves an agent's asset symbol therefore needs this list instead when the
 * program is on devnet, or a devnet agent's `yields …` reads as an em dash.
 *
 * The mocks have no on-chain symbol, so they borrow the identity of the real
 * PreStocks they stand in for. The wrappers are sorted by mint so the mapping is
 * stable regardless of the order `getProgramAccounts` returns them in.
 */
import { fetchWrappers } from "./chain";
import type { PreStock } from "./market";

/** The real PreStocks the devnet mocks stand in for, in a fixed order. */
const IDENTITIES = [
  { symbol: "SPACEX", name: "SpaceX" },
  { symbol: "OPENAI", name: "OpenAI" },
  { symbol: "ANDURIL", name: "Anduril" },
  { symbol: "ANTHROPIC", name: "Anthropic" },
  { symbol: "NEURALINK", name: "Neuralink" },
  { symbol: "KALSHI", name: "Kalshi" },
  { symbol: "POLYMARKET", name: "Polymarket" },
  { symbol: "FIGUREAI", name: "Figure AI" },
] as const;

export async function fetchDevnetAssets(): Promise<PreStock[]> {
  const wrappers = [...(await fetchWrappers())].sort((a, b) =>
    a.prestockMint < b.prestockMint ? -1 : a.prestockMint > b.prestockMint ? 1 : 0,
  );
  return wrappers.map((w, i) => {
    const identity = IDENTITIES[i % IDENTITIES.length];
    return {
      symbol: identity.symbol,
      name: identity.name,
      description: `Devnet mock standing in for ${identity.name}, carrying the same transfer-fee and permanent-delegate extensions as a real PreStock.`,
      mint: w.prestockMint,
      image: "",
      markPrice: 0,
      tokenPrice: 0,
      supply: 0,
      impliedValuation: 0,
      markValuation: 0,
      premiumBps: 0,
    } satisfies PreStock;
  });
}
