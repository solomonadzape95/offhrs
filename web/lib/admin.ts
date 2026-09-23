/**
 * Admin surface: who can see it, and the shapes it reads.
 *
 * Access is deliberately thin. Every read behind the console is public chain data
 * or a public count, so the gate is a UI affordance rather than a security
 * boundary. The one privileged action — pausing a wrapper — is enforced on chain
 * by `has_one = admin`; the server never holds the key that would let it act on
 * someone's behalf. The route is obfuscated (`/asdfg/admin`) to keep it out of
 * the way, not because obscurity is the control — the wallet check is.
 *
 * The address list is `NEXT_PUBLIC_*` so the client can gate the page without a
 * round trip. Set `NEXT_PUBLIC_ADMIN_ADDRESSES` to a comma-separated list; the
 * defaults are the deploy wallet (the program's upgrade authority) and the
 * second operator key.
 */

export const ADMIN_ADDRESSES: string[] = (
  process.env.NEXT_PUBLIC_ADMIN_ADDRESSES ??
  "Duzj6WGukxjCesWCEM6uTxZEf6Dhc8LfRGzS6o8xR4HQ,Db5m2KXTAy5uUKxMZmiC8JVQcA1UBFSQvnefV4QDni9A"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const isAdmin = (address?: string | null): boolean =>
  Boolean(address && ADMIN_ADDRESSES.includes(address));

export type AdminOverview = {
  cluster: string;
  programId: string;
  deployed: boolean;
  adminAddresses: string[];
  adminBalances: { address: string; sol: number }[];
  counts: {
    wrappers: number;
    agents: number;
    vaults: number;
    paused: number;
    hidden: number;
    /** Wrappers whose wrapped supply does not equal the reserve balance. */
    invariantBreaks: number;
    /** Vaults whose accounting claims more stake or reward than the vaults hold. */
    underfundedVaults: number;
  };
  waitlist: number | null;
  waitlistCap: number;
  universeStale: boolean;
  universeCapturedAt: string;
  faucetEnabled: boolean;
};

export type AdminWrapper = {
  pda: string;
  symbol: string;
  prestockMint: string;
  wrappedMint: string;
  reserve: string;
  /** Raw reserve amount, formatted at `decimals`. */
  reserveAmount: string;
  /** Wrapped-mint supply. Must equal `reserveAmount` — the program's core invariant. */
  wrappedSupply: string;
  invariantOk: boolean;
  admin: string;
  paused: boolean;
  totalRequestedIn: string;
  totalReceivedIn: string;
  totalFeePaidIn: string;
  totalUnwrapped: string;
};

export type AdminAgent = {
  pda: string;
  name: string;
  ticker: string;
  asset: string;
  creator: string;
  agentSigner: string;
  agentTokenMint: string;
  wrappedMint: string;
  vault: string;
  feeBps: number;
  executionCount: number;
  /** Sum of logged execution profit, in quote units. */
  totalProfitLogged: string;
  /** Profit actually routed into the vault via `deposit_rewards`. */
  totalProfitsRouted: string;
  /** True when the creator is in the test-clutter set hidden from the market. */
  hidden: boolean;
};

export type AdminVault = {
  pda: string;
  agent: string;
  stakingMint: string;
  rewardMint: string;
  totalStaked: string;
  accRewardPerShare: string;
  rewardRate: string;
  rewardReserve: string;
  totalDistributed: string;
  lastUpdateSlot: number;
  minHoldSlots: number;
  /** What the PDA token accounts actually hold, versus what the accounting claims. */
  stakeVaultBalance: string;
  rewardVaultBalance: string;
  stakedBacked: boolean;
  rewardsBacked: boolean;
};

export type AdminExecution = {
  agentId: string;
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

/** One unique holder, assembled from their `UserStake` accounts across vaults. */
export type AdminUser = {
  owner: string;
  /** Raw `$AGENT` staked across every vault. */
  totalStaked: string;
  /** How many agent vaults this wallet has a stake in. */
  positions: number;
};

export type AdminHolderBar = { agentId: string; holders: number; staked: string };

export type AdminUsers = {
  users: AdminUser[];
  totalHolders: number;
  byAgent: AdminHolderBar[];
};

/** Everything the overview charts plot, in one read. */
export type AdminStats = {
  /** Per-day execution count and profit, oldest first. */
  days: { day: string; count: number; profit: string }[];
  /** Cumulative logged profit by day. */
  cumulative: { day: string; value: string }[];
  /** Unique holders per agent, largest first. */
  holdersByAgent: AdminHolderBar[];
  totals: {
    logged: string;
    routed: string;
    /** Per-agent sum of `max(0, logged - routed)` — arb profit not yet paid out. */
    unrouted: string;
    distributed: string;
    holders: number;
    staked: string;
  };
};
