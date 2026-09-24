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
import { Connection, PublicKey } from "@solana/web3.js";

import {
  fetchAgentByPda,
  fetchAgents,
  fetchExecutions,
  fetchLiveAgents,
  fetchMintDecimals,
  fetchSlot,
  fetchTokenBalance,
  fetchUserStake,
  fetchVaultByPda,
  fetchWrappers,
  PROGRAM_RPC_URL,
  type LiveAgent,
  type OnChainVault,
} from "@/lib/chain";
import {
  buildClaimTransaction,
  buildCloseAgentTransaction,
  buildInitializeVaultTransaction,
  buildRegisterAgentTransaction,
  buildSetPausedForWrapperTransaction,
  buildSetPausedTransaction,
  buildStakeTransaction,
  buildUnstakeTransaction,
  buildUnwrapTransaction,
  buildWrapTransaction,
} from "@/lib/program-tx";
import { buildBuyExactOutTransaction, buildBuyTransaction, buildSellTransaction, loadPool, quoteTrade } from "@/lib/trade";
import { agentSignerAddress, agentSignerFor, agentSignerSecret } from "@/lib/agent-keys";
import { buildCreateAgentCurve } from "@/lib/launch";
import { faucet } from "@/lib/faucet";
import { fetchUniverse } from "@/lib/universe";
import type {
  AgentTradeInfo,
  AgentView,
  BuildTxResult,
  CreateCurveTxResult,
  ExecutionView,
  Portfolio,
  PositionRow,
  SellPayout,
  SubmitResult,
  TradeQuote,
  TradeSide,
} from "@/lib/portfolio";

const PRECISION = 10n ** 12n;
/** `$AGENT` base decimals from the DBC config; `wPreStock` inherits the PreStock's 9. */
const STAKE_DECIMALS = 6;
const REWARD_DECIMALS = 9;

/**
 * Raw units -> a compact display string. Funds get k/m/b suffixes; small reward
 * amounts keep enough decimals to be meaningful and drop trailing zeros, rather
 * than printing `0.0000` for a real balance.
 */
function fmt(raw: bigint, decimals: number): string {
  if (raw === 0n) return "0";
  const value = Number(raw) / 10 ** decimals;
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${trim(value / 1e9)}B`;
  if (abs >= 1e6) return `${trim(value / 1e6)}M`;
  if (abs >= 1e3) return `${trim(value / 1e3)}K`;
  if (abs >= 1) return trim(value, 2);
  const s = value.toFixed(6);
  return s.replace(/0+$/, "").replace(/\.$/, "");
}

function trim(n: number, digits = 2): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
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
  const stocks = await fetchUniverse().catch(() => []);
  return stocks.map((s) => ({ symbol: s.symbol, mint: s.mint }));
}

const EMPTY: Portfolio = {
  rows: [],
  totals: { total: "0", liquid: "0", staked: "0", accrued: "0", claimable: "0", incomeToDate: "0" },
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
  let totalLiquid = 0n;
  let totalStaked = 0n;
  let totalAccrued = 0n;
  let totalIncome = 0n;
  const byWrapped = new Map<string, bigint>();

  for (const a of agents) {
    const [stake, vault, liquid] = await Promise.all([
      fetchUserStake(a.vault, owner).catch(() => null),
      fetchVaultByPda(a.vault).catch(() => null),
      fetchTokenBalance(a.agentTokenMint, owner, "spl").catch(() => null),
    ]);

    const liquidRaw = liquid ?? 0n;
    const staked = stake?.stakedAmount ?? 0n;
    const debt = stake?.rewardDebt ?? 0n;
    const accrued = (stake?.accrued ?? 0n) + pendingOf(staked, vault ? projectAcc(vault, slot) : 0n, debt);
    const claimed = stake?.totalClaimed ?? 0n;

    totalLiquid += liquidRaw;
    totalStaked += staked;
    totalAccrued += accrued;
    totalIncome += claimed;
    // Only assets with real equity behind them belong in the inventory.
    if (accrued > 0n) byWrapped.set(a.wrappedMint, (byWrapped.get(a.wrappedMint) ?? 0n) + accrued);

    // A position is only worth a row when the wallet actually holds something:
    // liquid `$AGENT`, staked `$AGENT`, or equity accrued behind the stake.
    if (liquidRaw === 0n && staked === 0n && accrued === 0n) continue;

    const l = liveById.get(a.pda);
    const short = a.agentTokenMint.slice(0, 4).toUpperCase();

    rows.push({
      agentId: a.pda,
      name: l?.name ?? `Agent ${short}`,
      ticker: l?.ticker ?? short,
      asset: l?.asset ?? "—",
      feeBps: a.dynamicFeeBps,
      liquid: fmt(liquidRaw, STAKE_DECIMALS),
      staked: fmt(staked, STAKE_DECIMALS),
      accrued: fmt(accrued, REWARD_DECIMALS),
      claimable: fmt(accrued, REWARD_DECIMALS),
      rewardMint: a.wrappedMint,
    });
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
      total: fmt(totalLiquid + totalStaked, STAKE_DECIMALS),
      liquid: fmt(totalLiquid, STAKE_DECIMALS),
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
  // No catch: a rate-limited RPC must surface as an error, not as an empty list.
  // "You haven't launched an agent" is a lie when the read simply failed.
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
}

/** Every agent registered on this cluster — the “other agents” grid. */
export async function getLiveAgents(): Promise<LiveAgent[]> {
  return fetchLiveAgents(await universe());
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
  feeBps: number,
): Promise<BuildTxResult> {
  try {
    // The app owns the trading key. Derive its public key from the master secret
    // and the agent mint; the runner derives the same keypair and signs with it.
    const agentSigner = agentSignerAddress(agentTokenMint);
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

// ---------------------------------------------------------------------------
// Agent trading key — app-owned, revealed only to the creator.
// ---------------------------------------------------------------------------

/** The public half of an agent's app-owned signer. Safe to show anyone. */
export async function getAgentSignerPublic(
  agentId: string,
): Promise<{ publicKey: string } | { error: string }> {
  try {
    const agent = await fetchAgentByPda(agentId);
    if (!agent) return { error: "No agent at that address on this cluster." };
    return { publicKey: agentSignerAddress(agent.agentTokenMint) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Reveal an agent's secret trading key to its creator.
 *
 * Gated by a wallet signature, not just the creator address: the caller signs a
 * short, recent, agent-specific challenge and the server verifies it against the
 * claimed owner. Without that, anyone could pass the creator's public address and
 * walk off with the key.
 */
export async function revealAgentSigner(
  owner: string,
  agentId: string,
  message: string,
  signatureBase64: string,
): Promise<{ secretKey: string; secretKeyJson: string; publicKey: string } | { error: string }> {
  try {
    const agent = await fetchAgentByPda(agentId);
    if (!agent) return { error: "No agent at that address on this cluster." };
    if (agent.creator !== owner) {
      return { error: "Only the agent's creator can reveal its trading key." };
    }

    const prefix = `offhrs-reveal-signer:${agent.agentTokenMint}:`;
    if (!message.startsWith(prefix)) return { error: "Unexpected challenge." };
    const issuedAt = Number(message.slice(prefix.length));
    if (!Number.isFinite(issuedAt) || Math.abs(Date.now() / 1000 - issuedAt) > 300) {
      return { error: "That challenge expired. Try again." };
    }

    const verified = await verifyEd25519(owner, message, signatureBase64);
    if (!verified) return { error: "The signature did not match the connected wallet." };

    return {
      secretKey: agentSignerSecret(agent.agentTokenMint),
      secretKeyJson: JSON.stringify(Array.from(agentSignerFor(agent.agentTokenMint).secretKey)),
      publicKey: agentSignerAddress(agent.agentTokenMint),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Verify a base64 ed25519 signature over `message` by the given wallet address. */
async function verifyEd25519(
  address: string,
  message: string,
  signatureBase64: string,
): Promise<boolean> {
  // `Uint8Array<ArrayBufferLike>` vs the DOM's `ArrayBufferView<ArrayBuffer>`
  // mismatch is a TS lib artifact; the runtime bytes are the same.
  const publicKey = new PublicKey(address).toBytes() as unknown as BufferSource;
  const key = await crypto.subtle.importKey("raw", publicKey, { name: "Ed25519" }, false, [
    "verify",
  ]);
  const signature = Buffer.from(signatureBase64, "base64") as unknown as BufferSource;
  const data = new TextEncoder().encode(message) as unknown as BufferSource;
  return crypto.subtle.verify({ name: "Ed25519" }, key, signature, data);
}

export async function buildSetPausedTx(
  owner: string,
  agentId: string,
  paused: boolean,
): Promise<BuildTxResult> {
  try {
    const { blockhash } = await rpc().getLatestBlockhash("confirmed");
    const tx = await buildSetPausedTransaction(owner, agentId, paused, blockhash);
    return { tx: serialize(tx) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** `set_paused` on a wrapper, addressed by its PreStock mint — the admin surface. */
export async function buildSetPausedForWrapperTx(
  owner: string,
  prestockMint: string,
  paused: boolean,
): Promise<BuildTxResult> {
  try {
    const { blockhash } = await rpc().getLatestBlockhash("confirmed");
    const tx = buildSetPausedForWrapperTransaction(owner, prestockMint, paused, blockhash);
    return { tx: serialize(tx) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Deregister an agent. Creator only; the program requires an empty vault. */
export async function buildCloseAgentTx(owner: string, agentId: string): Promise<BuildTxResult> {
  try {
    const { blockhash } = await rpc().getLatestBlockhash("confirmed");
    const tx = await buildCloseAgentTransaction(owner, agentId, blockhash);
    return { tx: serialize(tx) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// Trade — the `$AGENT` buy box and sell box. Same build-unsigned / sign-in-wallet
// / relay-signed shape as the vault write path, with the DBC curve maths done
// server-side by Meteora's SDK so none of it reaches the browser bundle.
// ---------------------------------------------------------------------------

/** Resolve an agent plus the raw PreStock mint its reward asset wraps. */
async function tradeContext(agentId: string) {
  const agent = await fetchAgentByPda(agentId);
  if (!agent) return null;
  const [wrappers, stocks] = await Promise.all([
    fetchWrappers().catch(() => []),
    fetchUniverse().catch(() => []),
  ]);
  const prestockMint =
    wrappers.find((w) => w.wrappedMint === agent.wrappedMint)?.prestockMint ?? null;
  const known = prestockMint ? stocks.find((s) => s.mint === prestockMint)?.symbol : undefined;
  // Fall back to a short mint label rather than an em dash: the trade box needs
  // *something* to name the quote asset, and on devnet the mock PreStock is not
  // in the issuer's universe.
  const asset = known ?? (prestockMint ? prestockMint.slice(0, 4).toUpperCase() : "—");
  return { agent, prestockMint, asset };
}

/**
 * The trade box's opening state: does a curve exist, what are the units, and what
 * does the connected wallet already hold. Reads are best-effort and fail to zero
 * rather than throwing, so the panel renders even when one RPC call is unhappy.
 */
export async function getAgentTradeInfo(
  owner: string | null,
  agentId: string,
): Promise<AgentTradeInfo> {
  const base: AgentTradeInfo = {
    onChain: false,
    poolExists: false,
    agentTokenMint: "",
    wrappedMint: "",
    prestockMint: null,
    asset: "—",
    baseDecimals: 6,
    quoteDecimals: 9,
    balances: { liquidAgent: "0", stakedAgent: "0", wrapped: "0", prestock: "0" },
    price: null,
  };

  try {
    const ctx = await tradeContext(agentId);
    if (!ctx) return base;
    const { agent, prestockMint, asset } = ctx;

    const [liquidAgent, staked, wrapped, prestock, baseDec, quoteDec, pool] = await Promise.all([
      owner
        ? fetchTokenBalance(agent.agentTokenMint, owner, "spl").catch(() => null)
        : Promise.resolve(null),
      owner
        ? fetchUserStake(agent.vault, owner)
            .then((s) => s?.stakedAmount ?? 0n)
            .catch(() => 0n)
        : Promise.resolve(0n),
      owner
        ? fetchTokenBalance(agent.wrappedMint, owner, "spl").catch(() => null)
        : Promise.resolve(null),
      owner && prestockMint
        ? fetchTokenBalance(prestockMint, owner, "token-2022").catch(() => null)
        : Promise.resolve(null),
      fetchMintDecimals(agent.agentTokenMint).catch(() => 6),
      fetchMintDecimals(agent.wrappedMint).catch(() => 9),
      loadPool(agent.agentTokenMint).catch(() => null),
    ]);

    const quoteDecimals = quoteDec ?? 9;
    let price: number | null = null;
    if (pool) {
      try {
        // A nominal 1 wPreStock buy just to read the curve price.
        const q = await quoteTrade(
          agent.agentTokenMint,
          "buy",
          (10n ** BigInt(quoteDecimals)).toString(),
        );
        price = q.price;
      } catch {
        price = null;
      }
    }

    return {
      onChain: true,
      poolExists: Boolean(pool),
      agentTokenMint: agent.agentTokenMint,
      wrappedMint: agent.wrappedMint,
      prestockMint,
      asset,
      baseDecimals: baseDec ?? 6,
      quoteDecimals,
      balances: {
        liquidAgent: (liquidAgent ?? 0n).toString(),
        stakedAgent: staked.toString(),
        wrapped: (wrapped ?? 0n).toString(),
        prestock: (prestock ?? 0n).toString(),
      },
      price,
    };
  } catch {
    return base;
  }
}

/** A live DBC quote for the buy box. Amounts are raw integer strings. */
export async function quoteAgentTrade(
  agentId: string,
  side: TradeSide,
  amountRaw: string,
): Promise<{ quote: TradeQuote } | { error: string }> {
  try {
    const agent = await fetchAgentByPda(agentId);
    if (!agent) throw new Error("That agent is not registered on this cluster.");
    const quote = await quoteTrade(agent.agentTokenMint, side, amountRaw);
    return { quote };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Buy `$AGENT` with `wPreStock`; auto-stake is a flag on the same transaction. */
export async function buildBuyAgentTx(
  owner: string,
  agentId: string,
  amountRaw: string,
  autoStake: boolean,
): Promise<BuildTxResult> {
  try {
    const { blockhash } = await rpc().getLatestBlockhash("confirmed");
    const agent = await fetchAgentByPda(agentId);
    if (!agent) throw new Error("That agent is not registered on this cluster.");
    const tx = await buildBuyTransaction(
      owner,
      agent.agentTokenMint,
      amountRaw,
      autoStake,
      blockhash,
    );
    return { tx: serialize(tx) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Buy an exact `$AGENT` allocation at launch (ExactOut), paying the quoted wPreStock. */
export async function buildBuyAgentExactOutTx(
  owner: string,
  agentId: string,
  baseOutRaw: string,
  autoStake: boolean,
): Promise<BuildTxResult> {
  try {
    const { blockhash } = await rpc().getLatestBlockhash("confirmed");
    const agent = await fetchAgentByPda(agentId);
    if (!agent) throw new Error("That agent is not registered on this cluster.");
    const tx = await buildBuyExactOutTransaction(
      owner,
      agent.agentTokenMint,
      baseOutRaw,
      autoStake,
      blockhash,
    );
    return { tx: serialize(tx) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Sell `$AGENT`; `payout` selects wPreStock, raw PreStock, or the USDC route. */
export async function buildSellAgentTx(
  owner: string,
  agentId: string,
  amountRaw: string,
  payout: SellPayout,
): Promise<BuildTxResult> {
  try {
    const ctx = await tradeContext(agentId);
    if (!ctx) throw new Error("That agent is not registered on this cluster.");
    if ((payout === "prestock" || payout === "usdc") && !ctx.prestockMint) {
      throw new Error("No PreStock mint is registered for this agent's reward asset.");
    }
    const { blockhash } = await rpc().getLatestBlockhash("confirmed");
    const tx = await buildSellTransaction(
      owner,
      ctx.agent.agentTokenMint,
      ctx.prestockMint ?? "",
      amountRaw,
      payout,
      blockhash,
    );
    return { tx: serialize(tx) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Wrap raw PreStock → wPreStock. One leg of the USDC buy route. */
export async function buildWrapTx(
  owner: string,
  prestockMint: string,
  amountRaw: string,
): Promise<BuildTxResult> {
  try {
    const { blockhash } = await rpc().getLatestBlockhash("confirmed");
    const tx = await buildWrapTransaction(owner, prestockMint, BigInt(amountRaw), blockhash);
    return { tx: serialize(tx) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Unwrap wPreStock → raw PreStock. The final leg of a PreStock/USDC payout. */
export async function buildUnwrapTx(
  owner: string,
  prestockMint: string,
  amountRaw: string,
): Promise<BuildTxResult> {
  try {
    const { blockhash } = await rpc().getLatestBlockhash("confirmed");
    const tx = await buildUnwrapTransaction(owner, prestockMint, BigInt(amountRaw), blockhash);
    return { tx: serialize(tx) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Self-owned DBC launch — the Clawpump fallback. Builds the single transaction
 * that creates the curve's config and pool; the `$AGENT` mint DBC creates is
 * returned so the caller can register and vault it next.
 */
export async function buildCreateAgentCurveTx(
  owner: string,
  prestockMint: string,
  name: string,
  symbol: string,
  feeBps: number,
): Promise<CreateCurveTxResult> {
  try {
    if (name.trim().length < 2) throw new Error("Give the agent a name.");
    if (symbol.trim().length < 2) throw new Error("Give the agent a ticker.");
    const { blockhash } = await rpc().getLatestBlockhash("confirmed");
    const built = await buildCreateAgentCurve({
      owner,
      prestockMint,
      name: name.trim(),
      symbol: symbol.trim().toUpperCase(),
      feeBps,
      blockhash,
    });
    return {
      tx: serialize(built.tx),
      baseMint: built.baseMint,
      config: built.config,
      pool: built.pool,
    };
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

/**
 * Devnet faucet — the server sends the connected wallet test SOL and the mock
 * PreStock/wPreStock pair. Devnet-only; refuses before touching a key on mainnet.
 */
export async function faucetDevnet(owner: string): Promise<SubmitResult> {
  return faucet(owner);
}
