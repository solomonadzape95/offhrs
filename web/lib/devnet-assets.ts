/**
 * The devnet stand-in for the mainnet PreStocks universe.
 *
 * Real PreStocks only exist on mainnet, so the website's asset list comes from the
 * issuer API — real mints, none of which have a wrapper on devnet. The launch page
 * would therefore offer assets whose preflight can never pass.
 *
 * This builds a `PreStock`-shaped list out of the wrappers that *do* exist on this
 * cluster: the mock PreStocks created by `scripts/devnet-pool.ts` and
 * `devnet-smoke.ts`. Prices are zero because a mock has no mark; the launch page
 * only needs the mint, and the trade box reads its own curve price.
 */
import { fetchWrappers } from "./chain";
import type { PreStock } from "./market";

export async function fetchDevnetAssets(): Promise<PreStock[]> {
  const wrappers = await fetchWrappers();
  return wrappers.map((w, i) => {
    const tag = w.prestockMint.slice(0, 4).toUpperCase();
    return {
      symbol: i === 0 ? "MOCK" : `MOCK${i}`,
      name: `Mock PreStock ${tag}`,
      description:
        "A devnet mock carrying the same transfer-fee and permanent-delegate extensions as a real PreStock.",
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
