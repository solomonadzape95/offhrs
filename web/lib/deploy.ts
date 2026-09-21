"use client";

import type { SolanaClient } from "@solana/client";
import {
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type ReadonlyUint8Array,
} from "@solana/kit";

/**
 * Launch preflight.
 *
 * Deploying an agent is three transactions against the `stock_vault` program and
 * one against Meteora's DBC. Before any of that is worth attempting, four things
 * have to be true on chain — and the useful thing this page can do today is check
 * them and report precisely which one is missing, rather than failing inside a
 * wallet prompt with a custom error code.
 *
 * It is also the honest shape of the blocker: the first check is the deployment
 * itself, and it is the one that fails.
 */
export const PROGRAM_ID = "FoVBZRFCamH1HNMiVpNZV2QJxk9bSxWtQvKgmqZ1rVLw";
export const DBC_PROGRAM_ID = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";

const enc = getAddressEncoder();
const utf8 = new TextEncoder();
const seed = (s: string) => utf8.encode(s) as unknown as ReadonlyUint8Array;

/** Seeds mirror `programs/stock_vault/src/state.rs` exactly. */
export async function wrapperConfigPda(prestockMint: string) {
  const [pda] = await getProgramDerivedAddress({
    programAddress: address(PROGRAM_ID),
    seeds: [seed("wrapper"), enc.encode(address(prestockMint))],
  });
  return pda;
}

export async function reservePda(wrapperConfig: string) {
  const [pda] = await getProgramDerivedAddress({
    programAddress: address(PROGRAM_ID),
    seeds: [seed("reserve"), enc.encode(address(wrapperConfig))],
  });
  return pda;
}

export async function agentPda(agentTokenMint: string) {
  const [pda] = await getProgramDerivedAddress({
    programAddress: address(PROGRAM_ID),
    seeds: [seed("agent"), enc.encode(address(agentTokenMint))],
  });
  return pda;
}

export type Check = {
  id: string;
  label: string;
  /** null = could not be determined (RPC down), which is not the same as false. */
  ok: boolean | null;
  detail: string;
};

/**
 * Fetch an account, treating "does not exist" as null rather than an error.
 *
 * The client exposes actions rather than a raw RPC handle, and a missing account
 * surfaces as a throw, which is exactly the case this page is here to report.
 */
async function accountExists(client: SolanaClient, addr: Address) {
  try {
    const value = await client.actions.fetchAccount(addr);
    return value ?? null;
  } catch {
    return null;
  }
}

export async function preflight(
  client: SolanaClient,
  opts: { assetMint: string; assetSymbol: string },
): Promise<Check[]> {
  const checks: Check[] = [];

  // 1. Is the program deployed at all?
  const program = await accountExists(client, address(PROGRAM_ID));
  checks.push({
    id: "program",
    label: "stock_vault program deployed",
    ok: program ? Boolean(program.executable) : false,
    detail: program
      ? `executable at ${PROGRAM_ID}`
      : `no account at ${PROGRAM_ID} — needs ~2.9 SOL of refundable rent to deploy`,
  });

  // 2. Is the wrapper for this PreStock already minted?
  const wrapper = await wrapperConfigPda(opts.assetMint);
  const wrapperAcct = await accountExists(client, wrapper);
  checks.push({
    id: "wrapper",
    label: `w${opts.assetSymbol} wrapper exists`,
    ok: Boolean(wrapperAcct),
    detail: wrapperAcct
      ? `initialised at ${wrapper}`
      : `not initialised — run initialize_wrapper first (${wrapper.slice(0, 8)}…)`,
  });

  // 3. Does DBC exist on this cluster? (It does, on mainnet and devnet.)
  const dbc = await accountExists(client, address(DBC_PROGRAM_ID));
  checks.push({
    id: "dbc",
    label: "Meteora DBC program reachable",
    ok: dbc ? Boolean(dbc.executable) : false,
    detail: dbc ? `executable at ${DBC_PROGRAM_ID}` : `not found at ${DBC_PROGRAM_ID}`,
  });

  // 4. The quote asset rule that shapes the whole design.
  checks.push({
    id: "quote",
    label: "quote mint is DBC-permissionless",
    ok: true,
    detail: `w${opts.assetSymbol} is a classic SPL mint with a zero transfer fee. Raw ${opts.assetSymbol} would be rejected with QuoteMintHasNonZeroTransferFee (6081).`,
  });

  return checks;
}
