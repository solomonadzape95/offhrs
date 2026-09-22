/**
 * The asset universe for the current cluster.
 *
 * Mainnet uses the issuer's live PreStocks; devnet uses the mock PreStocks the
 * wrappers actually point at. Any page or action that resolves an agent's asset
 * symbol must go through here — otherwise a devnet agent's `yields …` reads as an
 * em dash, because the mock mint is not in the mainnet issuer's list.
 */
import { PROGRAM_RPC_URL } from "./chain";
import { fetchDevnetAssets } from "./devnet-assets";
import { fetchAllPreStocks, type PreStock } from "./market";

export const isDevnet = () => PROGRAM_RPC_URL.includes("devnet");

export async function fetchUniverse(): Promise<PreStock[]> {
  return isDevnet() ? fetchDevnetAssets() : fetchAllPreStocks();
}
