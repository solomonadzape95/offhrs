"use server";

/**
 * Wallet-scoped reads for the `/app` tabs.
 *
 * Server actions, deliberately: the pages are client components (they read the
 * wallet), and doing the chain reads here keeps `@solana/web3.js` out of the
 * browser bundle. Each action returns plain JSON — every amount is a formatted
 * decimal string, because BigInt does not cross the server/client boundary
 * cleanly and the UI should not be doing raw-unit math anyway.
 *
 * All three fail soft: if the program is not reachable on the configured cluster
 * they return empty data rather than throwing, so a page renders an honest empty
 * state instead of an error boundary.
 */
import { Connection } from "@solana/web3.js";

import {
  fetchAgents,
  fetchExecutions,
  fetchLiveAgents,
  fetchSlot,
  fetchUserStake,
  fetchVaultByPda,
  fetchWrappers,
  PROGRAM_RPC_URL,
  type OnChainVault,
} from "@/lib/chain";
import {
  buildClaimTransaction,
  buildInitializeVaultTransaction,
  buildRegisterAgentTransaction,
  buildStakeTransaction,
  buildUnstakeTransaction,
} from "@/lib/program-tx";
import { fetchAllPreStocks } from "@/lib/market";
import type {
  AgentView,
  BuildTxResult,
  ExecutionView,
  Portfolio,
  PositionRow,
  SubmitResult,
} from "@/lib/portfolio";

const PRECISION = 10n ** 12n;
/** `$AGENT` base decimals from the DBC config; `wPreStock` inherits the PreStock's 9. */
const STAKE_DECIMALS = 6;
const REWARD_DECIMALS = 9;

/** Raw units -> "1.2345", truncating rather than rounding (we never overstate). */
function fmt(raw: bigint, decimals: number): string {
  if (raw === 0n) return "0";
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = (raw % base).toString().padStart(decimals, "0").slice(0, 4);
  return `${whole}.${frac}`;
}

/** `staked * acc / PRECISION - debt`, clamped at zero — the program's own formula. */
function pendingOf(staked: bigint, acc: bigint, debt: bigint): bigint {
  if (staked === 0n || acc === 0n) return 0n;
  const earned = (staked * acc) / PRECISION;
  return earned > debt ? earned - debt : 0n;
}

/**
 * Project `acc_reward_per_share` to the current slot, replicating `settle_vault`.
 * Without this the page under-reports between interactions: the on-chain
 * accumulator only moves when an instruction touches the vault, but the stream is
 * defined per slot, so the live figure is `acc + rate * elapsed / totalStaked`
 * (capped by the reserve).
 */
function projectAcc(vault: OnChainVault, slot: number): bigint {
  if (vault.totalStaked === 0n) return vault.accRewardPerShare;
  const elapsed = BigInt(Math.max(0, slot - Number(vault.lastUpdateSlot)));
  const payout = vault.rewardRate * elapsed;
  const capped = payout > vault.rewardReserve ? vault.rewardReserve : payout;
  return vault.accRewardPerShare + (capped * PRECISION) / vault.totalStaked;
}

async function universe() {
  const stocks = await fetchAllPreStocks().catch(() => []);
  return stocks.map((s) => ({ symbol: s.symbol, mint: s.mint }));
}

const EMPTY: Portfolio = {
  rows: [],
  totals: { staked: "0", accrued: "0", claimable: "0", incomeToDate: "0" },
  equity: [],
  onChain: false,
};

export async function getUserPosition(owner: string): Promise<Portfolio> {
  const prestocks = await universe();

  let agents: Awaited<ReturnType<typeof fetchAgents>>;
  let wrappers: Awaited<ReturnType<typeof fetchWrappers>>;
  let live: Awaited<ReturnType<typeof fetchLiveAgents>>;
  try {
    [agents, wrappers, live] = await Promise.all([
      fetchAgents(),
      fetchWrappers(),
      fetchLiveAgents(prestocks),
    ]);
  } catch {
    return EMPTY;
  }

  const liveById = new Map(live.map((l) => [l.pda, l]));
  const prestockByMint = new Map(prestocks.map((p) => [p.mint, p]));
  const wrappedToPrestock = new Map(wrappers.map((w) => [w.wrappedMint, w.prestockMint]));
  const slot = await fetchSlot().catch(() => 0);

  const rows: PositionRow[] = [];
  let totalStaked = 0n;
  let totalAccrued = 0n;
  let totalIncome = 0n;
  const byWrapped = new Map<string, bigint>();

  for (const a of agents) {
    const [stake, vault] = await Promise.all([
      fetchUserStake(a.vault, owner).catch(() => null),
      fetchVaultByPda(a.vault).catch(() => null),
    ]);

    const staked = stake?.stakedAmount ?? 0n;
    const debt = stake?.rewardDebt ?? 0n;
    const accrued = (stake?.accrued ?? 0n) + pendingOf(staked, vault ? projectAcc(vault, slot) : 0n, debt);
    const claimed = stake?.totalClaimed ?? 0n;
    const l = liveById.get(a.pda);
    const short = a.agentTokenMint.slice(0, 4).toUpperCase();

    rows.push({
      agentId: a.pda,
      name: l?.name ?? `Agent ${short}`,
      ticker: l?.ticker ?? short,
      asset: l?.asset ?? "—",
      feeBps: a.dynamicFeeBps,
      staked: fmt(staked, STAKE_DECIMALS),
      accrued: fmt(accrued, REWARD_DECIMALS),
      claimable: fmt(accrued, REWARD_DECIMALS),
      rewardMint: a.wrappedMint,
    });

    totalStaked += staked;
    totalAccrued += accrued;
    totalIncome += claimed;
    byWrapped.set(a.wrappedMint, (byWrapped.get(a.wrappedMint) ?? 0n) + accrued);
  }

  const equity = [...byWrapped.entries()].map(([wrappedMint, amount]) => {
    const prestockMint = wrappedToPrestock.get(wrappedMint);
    const prestock = prestockMint ? prestockByMint.get(prestockMint) : undefined;
    return {
      symbol: prestock?.symbol ?? wrappedMint.slice(0, 4),
      wrappedMint,
      claimable: fmt(amount, REWARD_DECIMALS),
    };
  });

  return {
    rows,
    totals: {
      staked: fmt(totalStaked, STAKE_DECIMALS),
      accrued: fmt(totalAccrued, REWARD_DECIMALS),
      claimable: fmt(totalAccrued, REWARD_DECIMALS),
      incomeToDate: fmt(totalIncome, REWARD_DECIMALS),
    },
    equity,
    onChain: true,
  };
}

export async function getUserAgents(owner: string): Promise<AgentView[]> {
  try {
    const live = await fetchLiveAgents(await universe());
    return live
      .filter((l) => l.creator === owner || l.agentSigner === owner)
      .map((l) => ({
        id: l.id,
        name: l.name,
        ticker: l.ticker,
        asset: l.asset,
        feeBps: l.feeBps,
        creator: l.creator,
        executionCount: l.executionCount,
      }));
  } catch {
    return [];
  }
}

export async function getUserExecutions(owner: string, limit = 50): Promise<ExecutionView[]> {
  try {
    const live = await fetchLiveAgents(await universe());
    const mine = live.filter((l) => l.creator === owner || l.agentSigner === owner);

    const out: ExecutionView[] = [];
    for (const a of mine) {
      const execs = await fetchExecutions(a.pda, limit);
      for (const e of execs) {
        out.push({
          agentId: a.pda,
          agentName: a.name,
          index: e.index,
          venue: e.venue,
          amountIn: e.amountIn.toString(),
          amountOut: e.amountOut.toString(),
          profit: e.profit.toString(),
          pythPrice: e.pythPrice.toString(),
          pythExponent: e.pythExponent,
          regime: e.regime,
          stalenessSecs: Number(e.pythStalenessSecs),
          executedAt: Number(e.executedAt),
        });
      }
    }
    return out.sort((a, b) => b.executedAt - a.executedAt).slice(0, limit);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Write path — build unsigned, relay signed. The wallet signs; we never key.
// ---------------------------------------------------------------------------

const rpc = () => new Connection(PROGRAM_RPC_URL, "confirmed");

const serialize = (tx: Awaited<ReturnType<typeof buildStakeTransaction>>): string =>
  tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");

export async function buildStakeTx(
  owner: string,
  agentId: string,
  amountRaw: string,
): Promise<BuildTxResult> {
  try {
    const { blockhash } = await rpc().getLatestBlockhash("confirmed");
    const tx = await buildStakeTransaction(owner, agentId, BigInt(amountRaw), blockhash);
    return { tx: serialize(tx) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function buildUnstakeTx(
  owner: string,
  agentId: string,
  amountRaw: string,
): Promise<BuildTxResult> {
  try {
    const { blockhash } = await rpc().getLatestBlockhash("confirmed");
    const tx = await buildUnstakeTransaction(owner, agentId, BigInt(amountRaw), blockhash);
    return { tx: serialize(tx) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function buildClaimTx(owner: string, agentId: string): Promise<BuildTxResult> {
  try {
    const { blockhash } = await rpc().getLatestBlockhash("confirmed");
    const tx = await buildClaimTransaction(owner, agentId, blockhash);
    return { tx: serialize(tx) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function buildRegisterAgentTx(
  owner: string,
  agentTokenMint: string,
  prestockMint: string,
  agentSigner: string,
  feeBps: number,
): Promise<BuildTxResult> {
  try {
    const { blockhash } = await rpc().getLatestBlockhash("confirmed");
    const tx = await buildRegisterAgentTransaction(
      owner,
      agentTokenMint,
      prestockMint,
      agentSigner,
      feeBps,
      blockhash,
    );
    return { tx: serialize(tx) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function buildInitializeVaultTx(
  owner: string,
  agentTokenMint: string,
  prestockMint: string,
  minHoldSlots: number,
): Promise<BuildTxResult> {
  try {
    const { blockhash } = await rpc().getLatestBlockhash("confirmed");
    const tx = await buildInitializeVaultTransaction(
      owner,
      agentTokenMint,
      prestockMint,
      BigInt(minHoldSlots),
      blockhash,
    );
    return { tx: serialize(tx) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Relay a wallet-signed transaction. The server never holds a key. */
export async function submitTx(signedBase64: string): Promise<SubmitResult> {
  try {
    const conn = rpc();
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const signature = await conn.sendRawTransaction(Buffer.from(signedBase64, "base64"), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    return { signature };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
