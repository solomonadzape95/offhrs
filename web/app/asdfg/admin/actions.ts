"use server";

/**
 * Admin reads.
 *
 * Server actions, like the rest of the write path, so the Meteora SDK and
 * `@solana/web3.js` stay out of the browser bundle. Every one of these fails
 * soft: an admin page should render an honest "unreachable" state rather than an
 * error boundary when the public RPC rate-limits a scan.
 *
 * The health checks are the reason this exists beyond a table view: a wrapper
 * whose wrapped supply has drifted from its reserve, and a vault whose
 * accounting claims more than its token accounts hold. Both are conditions the
 * program is built never to reach.
 */
import {
  PROGRAM_ID,
  PROGRAM_RPC_URL,
  assetByWrappedMint,
  fetchAgents,
  fetchExecutions,
  fetchMintSupply,
  fetchSolBalance,
  fetchStakes,
  fetchTokenAccountAmount,
  fetchVaults,
  fetchWrappers,
  isHiddenCreator,
  programDeployed,
  toLiveAgent,
  type OnChainVault,
  type OnChainWrapper,
} from "@/lib/chain";
import { fetchUniverse } from "@/lib/universe";
import { universeStatus } from "@/lib/market";
import { WAITLIST_CAP, waitlistSize } from "@/lib/waitlist";
import { faucetEnabled } from "@/lib/faucet";
import {
  ADMIN_ADDRESSES,
  type AdminAgent,
  type AdminExecution,
  type AdminOverview,
  type AdminStats,
  type AdminUser,
  type AdminUsers,
  type AdminVault,
  type AdminWrapper,
} from "@/lib/admin";

type UniverseEntry = { symbol: string; mint: string };

/** Add the symbol, the reserve balance and the supply==reserve invariant check. */
async function decorateWrappers(
  wrappers: OnChainWrapper[],
  universe: UniverseEntry[],
): Promise<AdminWrapper[]> {
  const byMint = new Map(universe.map((u) => [u.mint, u.symbol]));

  return Promise.all(
    wrappers.map(async (w) => {
      const [reserve, supply] = await Promise.all([
        fetchTokenAccountAmount(w.reserve).catch(() => null),
        fetchMintSupply(w.wrappedMint).catch(() => null),
      ]);
      const reserveAmount = reserve ?? 0n;
      const wrappedSupply = supply ?? 0n;
      return {
        pda: w.pda,
        symbol: byMint.get(w.prestockMint) ?? w.prestockMint.slice(0, 4).toUpperCase(),
        prestockMint: w.prestockMint,
        wrappedMint: w.wrappedMint,
        reserve: w.reserve,
        reserveAmount: reserveAmount.toString(),
        wrappedSupply: wrappedSupply.toString(),
        // The one invariant the wrapper promises: minted supply is fully backed.
        invariantOk: reserveAmount === wrappedSupply,
        admin: w.admin,
        paused: w.paused,
        totalRequestedIn: w.totalRequestedIn.toString(),
        totalReceivedIn: w.totalReceivedIn.toString(),
        totalFeePaidIn: w.totalFeePaidIn.toString(),
        totalUnwrapped: w.totalUnwrapped.toString(),
      };
    }),
  );
}

/** Add what each vault's PDA token accounts actually hold against the accounting. */
async function decorateVaults(vaults: OnChainVault[]): Promise<AdminVault[]> {
  return Promise.all(
    vaults.map(async (v) => {
      const [stakeBal, rewardBal] = await Promise.all([
        fetchTokenAccountAmount(v.stakeVault).catch(() => null),
        fetchTokenAccountAmount(v.rewardVault).catch(() => null),
      ]);
      const stake = stakeBal ?? 0n;
      const reward = rewardBal ?? 0n;
      return {
        pda: v.pda,
        agent: v.agent,
        stakingMint: v.stakingMint,
        rewardMint: v.rewardMint,
        totalStaked: v.totalStaked.toString(),
        accRewardPerShare: v.accRewardPerShare.toString(),
        rewardRate: v.rewardRate.toString(),
        rewardReserve: v.rewardReserve.toString(),
        totalDistributed: v.totalDistributed.toString(),
        lastUpdateSlot: Number(v.lastUpdateSlot),
        minHoldSlots: Number(v.minHoldSlots),
        stakeVaultBalance: stake.toString(),
        rewardVaultBalance: reward.toString(),
        stakedBacked: stake >= v.totalStaked,
        rewardsBacked: reward >= v.rewardReserve,
      };
    }),
  );
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const [rawWrappers, agents, rawVaults, deployed, universe] = await Promise.all([
    fetchWrappers().catch(() => []),
    fetchAgents().catch(() => []),
    fetchVaults().catch(() => []),
    programDeployed().catch(() => false),
    fetchUniverse().catch(() => []),
  ]);

  const [wrappers, vaults] = await Promise.all([
    decorateWrappers(rawWrappers, universe),
    decorateVaults(rawVaults),
  ]);

  const adminBalances = await Promise.all(
    ADMIN_ADDRESSES.map(async (address) => ({
      address,
      sol: (await fetchSolBalance(address).catch(() => 0)) / 1e9,
    })),
  );

  const status = universeStatus();
  const waitlist = await waitlistSize();

  return {
    cluster: PROGRAM_RPC_URL.includes("devnet") ? "devnet" : "mainnet",
    programId: PROGRAM_ID.toBase58(),
    deployed,
    adminAddresses: ADMIN_ADDRESSES,
    adminBalances,
    counts: {
      wrappers: wrappers.length,
      agents: agents.length,
      vaults: vaults.length,
      paused: wrappers.filter((w) => w.paused).length,
      hidden: agents.filter((a) => isHiddenCreator(a.creator)).length,
      invariantBreaks: wrappers.filter((w) => !w.invariantOk).length,
      underfundedVaults: vaults.filter((v) => !v.stakedBacked || !v.rewardsBacked).length,
    },
    waitlist,
    waitlistCap: WAITLIST_CAP,
    universeStale: status.stale,
    universeCapturedAt: status.capturedAt,
    faucetEnabled: faucetEnabled(),
  };
}

export async function getAdminWrappers(): Promise<AdminWrapper[]> {
  const [wrappers, universe] = await Promise.all([
    fetchWrappers().catch(() => []),
    fetchUniverse().catch(() => []),
  ]);
  return decorateWrappers(wrappers, universe);
}

export async function getAdminVaults(): Promise<AdminVault[]> {
  const vaults = await fetchVaults().catch(() => []);
  return decorateVaults(vaults);
}

export async function getAdminAgents(): Promise<AdminAgent[]> {
  const [agents, wrappers, universe] = await Promise.all([
    fetchAgents().catch(() => []),
    fetchWrappers().catch(() => []),
    fetchUniverse().catch(() => []),
  ]);

  const byWrappedMint = assetByWrappedMint(wrappers);
  const byPrestockMint = new Map(universe.map((p) => [p.mint, { symbol: p.symbol, mint: p.mint }]));

  const decorated = await Promise.all(
    agents.map(async (a) => {
      const l = await toLiveAgent(a, byWrappedMint, byPrestockMint).catch(() => null);
      return l ? { l, a } : null;
    }),
  );

  return decorated
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .map(({ l, a }) => ({
      pda: l.pda,
      name: l.name,
      ticker: l.ticker,
      asset: l.asset,
      creator: l.creator,
      agentSigner: l.agentSigner,
      agentTokenMint: l.agentTokenMint,
      wrappedMint: l.wrappedMint,
      vault: l.vault,
      feeBps: l.feeBps,
      executionCount: l.executionCount,
      totalProfitLogged: a.totalProfitLogged.toString(),
      totalProfitsRouted: a.totalProfitsRouted.toString(),
      hidden: isHiddenCreator(l.creator),
    }))
    .sort((a, b) => b.executionCount - a.executionCount);
}

/** Every logged execution across the registry, newest first. */
export async function getAdminExecutionLog(limit = 200): Promise<AdminExecution[]> {
  const agents = await fetchAgents().catch(() => []);
  const withExecs = agents.filter((a) => a.executionCount > 0n);
  const perAgent = Math.max(10, Math.ceil(limit / Math.max(1, withExecs.length)));

  const out: AdminExecution[] = [];
  for (const agent of withExecs) {
    const execs = await fetchExecutions(agent.pda, perAgent).catch(() => []);
    for (const e of execs) {
      out.push({
        agentId: agent.pda,
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
}

/** Alias kept for the activity page. */
export async function getAdminExecutions(limit = 200): Promise<AdminExecution[]> {
  return getAdminExecutionLog(limit);
}

/**
 * The only user data the protocol has is the staker set. Every `UserStake`
 * account carries an owner, so a unique-owner count is a real holder count — no
 * database required. This is what makes the "users" charts honest.
 */
export async function getAdminUsers(): Promise<AdminUsers> {
  const [stakes, vaults] = await Promise.all([
    fetchStakes().catch(() => []),
    fetchVaults().catch(() => []),
  ]);

  const byOwner = new Map<string, { total: bigint; vaults: Set<string> }>();
  for (const s of stakes) {
    if (s.stakedAmount <= 0n) continue;
    const cur = byOwner.get(s.owner) ?? { total: 0n, vaults: new Set<string>() };
    cur.total += s.stakedAmount;
    cur.vaults.add(s.vault);
    byOwner.set(s.owner, cur);
  }

  const byVault = new Map<string, { holders: number; staked: bigint }>();
  for (const s of stakes) {
    if (s.stakedAmount <= 0n) continue;
    const cur = byVault.get(s.vault) ?? { holders: 0, staked: 0n };
    cur.holders += 1;
    cur.staked += s.stakedAmount;
    byVault.set(s.vault, cur);
  }

  const users: AdminUser[] = [...byOwner.entries()]
    .map(([owner, v]) => ({ owner, totalStaked: v.total.toString(), positions: v.vaults.size }))
    .sort((a, b) => (BigInt(a.totalStaked) < BigInt(b.totalStaked) ? 1 : -1));

  return {
    users,
    totalHolders: users.length,
    byAgent: vaults
      .map((v) => {
        const h = byVault.get(v.pda) ?? { holders: 0, staked: 0n };
        return { agentId: v.agent, holders: h.holders, staked: h.staked.toString() };
      })
      .sort((a, b) => b.holders - a.holders),
  };
}

/** The aggregate series the overview charts plot, in one read. */
export async function getAdminStats(): Promise<AdminStats> {
  const [execs, agents, vaults, users] = await Promise.all([
    getAdminExecutionLog(500),
    fetchAgents().catch(() => []),
    fetchVaults().catch(() => []),
    getAdminUsers(),
  ]);

  const dayMap = new Map<string, { count: number; profit: bigint }>();
  for (const e of execs) {
    const day = new Date(e.executedAt * 1000).toISOString().slice(0, 10);
    const cur = dayMap.get(day) ?? { count: 0, profit: 0n };
    cur.count += 1;
    cur.profit += BigInt(e.profit);
    dayMap.set(day, cur);
  }

  const days = [...dayMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, v]) => ({ day, count: v.count, profit: v.profit.toString() }));

  let running = 0n;
  const cumulative = days.map((d) => {
    running += BigInt(d.profit);
    return { day: d.day, value: running.toString() };
  });

  const logged = agents.reduce((s, a) => s + a.totalProfitLogged, 0n);
  const routed = agents.reduce((s, a) => s + a.totalProfitsRouted, 0n);
  const unrouted = agents.reduce(
    (s, a) => s + (a.totalProfitLogged > a.totalProfitsRouted ? a.totalProfitLogged - a.totalProfitsRouted : 0n),
    0n,
  );
  const distributed = vaults.reduce((s, v) => s + v.totalDistributed, 0n);
  const staked = vaults.reduce((s, v) => s + v.totalStaked, 0n);

  return {
    days,
    cumulative,
    holdersByAgent: users.byAgent.slice(0, 8),
    totals: {
      logged: logged.toString(),
      routed: routed.toString(),
      unrouted: unrouted.toString(),
      distributed: distributed.toString(),
      holders: users.totalHolders,
      staked: staked.toString(),
    },
  };
}
