/**
 * Server-side market data.
 *
 * Every number on the site comes from one of exactly three real sources:
 *   1. the PreStocks issuer API  (mark, token price, valuations)
 *   2. a live Jupiter quote      (the executable DEX price)
 *   3. an on-chain Pyth account  (the market regime)
 *
 * Nothing here is synthetic. Where a value genuinely cannot be known yet — an
 * agent's staked balance before its pool exists — the UI says so rather than
 * inventing a figure.
 *
 * This mirrors `agent/src/market.ts`. Kept separate rather than shared because
 * the agent is an ESM binary and this is bundled by Next; the duplicated part is
 * the Pyth decode below, which is short and asserted by the program's own Rust
 * tests against the same fixtures.
 */
import { Connection, PublicKey } from "@solana/web3.js";

import { SNAPSHOT_ASSETS, SNAPSHOT_CAPTURED_AT } from "./snapshot";

const RPC = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const PYTH_RECEIVER = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";
const PYTH_PUSH_ORACLE = "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT";

/**
 * The only feeds we can read permissionlessly.
 *
 * `Equity.Index.OPENAI/ANTHROPIC` are gated on Hermes behind `pyth-indices` and
 * have no on-chain account at all, which is why the regime uses an equity
 * *market clock* rather than the asset's own price.
 */
export const FEEDS = {
  "Equity.US.AAPL/USD": "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
  "Equity.US.NVDA/USD": "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
  "Crypto.BTC/USD": "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "Crypto.AAPLX/USD": "978e6cc68a119ce066aa830017318563a9ed04ec3a0a6439010fc11296a58675",
} as const;

export const REGIME_FEED = "Equity.US.AAPL/USD";

export type PreStock = {
  symbol: string;
  name: string;
  description: string;
  mint: string;
  image: string;
  markPrice: number;
  tokenPrice: number;
  supply: number;
  impliedValuation: number;
  markValuation: number;
  /** PreStocks' own published premium. Scale-invariant, so the multiplier is irrelevant. */
  premiumBps: number;
};

export type PythRead = {
  feed: string;
  price: number;
  exponent: number;
  conf: number;
  publishTime: number;
  stalenessSecs: number;
  account: string;
};

export type DexQuote = {
  priceUsd: number;
  route: string[];
  priceImpactPct: number;
};

export type Market = {
  prestock: PreStock;
  dex: DexQuote | null;
  regime: PythRead;
  regimeState: "live" | "frozen";
  /** dexPrice / apiTokenPrice — recovers the mint's effective scaledUiAmount. */
  multiplier: number | null;
};

/** All eight PreStocks, cached and de-duplicated.
 *
 * The cache matters: /explore, /portfolio, /launch, /agent/[id] and the layout all
 * want this list, and during a static build that is 15 renders across 7 workers.
 * Issued naively that is a burst the issuer API answers with 429s — which it did,
 * at length, until this was added.
 *
 * On failure it falls back to a captured snapshot rather than throwing, so the
 * build and the running site survive a flaky network. `universeStatus()` reports
 * when that happened so the UI can say so; a stale mark presented as live would be
 * worse than no mark, because the product is a claim about prices.
 */
const UNIVERSE_TTL_MS = 60_000;

let cached: { at: number; promise: Promise<PreStock[]> } | null = null;
let meta: { stale: boolean; capturedAt: string; error?: string } = {
  stale: false,
  capturedAt: new Date().toISOString(),
};

export const universeStatus = () => meta;

export function fetchAllPreStocks(): Promise<PreStock[]> {
  const now = Date.now();
  if (cached && now - cached.at < UNIVERSE_TTL_MS) return cached.promise;

  const promise = loadUniverse().catch((e) => {
    meta = {
      stale: true,
      capturedAt: SNAPSHOT_CAPTURED_AT,
      error: e instanceof Error ? e.message : String(e),
    };
    return SNAPSHOT_ASSETS as unknown as PreStock[];
  });

  cached = { at: now, promise };
  return promise;
}

async function loadUniverse(): Promise<PreStock[]> {
  const res = await fetch("https://prestocks.com/api/prestocks", {
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`prestocks API ${res.status}`);
  const raw = (await res.json()) as any[];
  meta = { stale: false, capturedAt: new Date().toISOString() };
  return raw.map((p) => {
    const tokenPrice = Number(p.tokenPrice);
    const markPrice = Number(p.markPrice);
    return {
      symbol: p.symbol,
      name: p.name,
      description: p.description ?? "",
      mint: p.contract_address,
      image: p.image ?? "",
      markPrice,
      tokenPrice,
      supply: Number(p.supply),
      impliedValuation: Number(p.impliedValuation),
      markValuation: Number(p.markValuation),
      premiumBps: tokenPrice > 0 ? Math.round(((markPrice - tokenPrice) / tokenPrice) * 10_000) : 0,
    };
  });
}

export async function fetchPreStock(symbol: string): Promise<PreStock> {
  const all = await fetchAllPreStocks();
  const hit = all.find((p) => p.symbol.toUpperCase() === symbol.toUpperCase());
  if (!hit) throw new Error(`unknown PreStock ${symbol}`);
  return hit;
}

/** Executable USD price for one whole token, from a live Jupiter quote. */
export async function fetchDexQuote(mint: string, decimals = 9): Promise<DexQuote | null> {
  try {
    const one = 10n ** BigInt(decimals);
    const url =
      `https://lite-api.jup.ag/swap/v1/quote?inputMint=${mint}&outputMint=${USDC}` +
      `&amount=${one}&slippageBps=50`;
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return null;
    const q = (await res.json()) as any;
    if (!q.outAmount) return null;
    return {
      priceUsd: Number(q.outAmount) / 1e6,
      route: (q.routePlan ?? []).map((s: any) => s.swapInfo?.label).filter(Boolean),
      priceImpactPct: Number(q.priceImpactPct ?? 0),
    };
  } catch {
    return null;
  }
}

function deriveFeedAccount(feedIdHex: string, shard: number): PublicKey {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(shard, 0);
  return PublicKey.findProgramAddressSync(
    [b, Buffer.from(feedIdHex, "hex")],
    new PublicKey(PYTH_PUSH_ORACLE),
  )[0];
}

/**
 * A captured on-chain Pyth read, used only if the RPC cannot be reached.
 *
 * Captured 2026-09-19 from `D9uk39pqZMcnmtPP9WeC8cREUpKZmyXLga9mSQ79SphW`. Real
 * values, including the `publish_time` of the last Friday after-hours print, so
 * staleness computed from it stays honest — it simply stops advancing.
 */
const PYTH_SNAPSHOT: PythRead = {
  feed: REGIME_FEED,
  price: 33481590,
  exponent: -5,
  conf: 6410,
  publishTime: 1789775997,
  stalenessSecs: 0, // recomputed at read time
  account: "D9uk39pqZMcnmtPP9WeC8cREUpKZmyXLga9mSQ79SphW",
};

/**
 * Read the freshest on-chain Pyth account for a feed. Permissionless — no key.
 *
 * Cached and de-duplicated for the same reason the universe fetch is: the layout
 * plus eight `/agent/[id]` pages all want this, and that burst was rate-limited
 * by the public RPC during a static build, which baked "market data unavailable"
 * into the prerendered HTML of every agent page until the first revalidation.
 * Deduping collapses it to a single call.
 *
 * Never returns null in practice — on failure it falls back to a captured read,
 * so the headline figure on the site cannot be replaced by an error message.
 */
const PYTH_TTL_MS = 30_000;
let pythCache: { at: number; promise: Promise<PythRead> } | null = null;

export function readPyth(feed: string = REGIME_FEED): Promise<PythRead> {
  const now = Date.now();
  if (pythCache && now - pythCache.at < PYTH_TTL_MS) return pythCache.promise;

  const promise = loadPyth(feed).catch(() => {
    const snap = { ...PYTH_SNAPSHOT, feed };
    snap.stalenessSecs = Math.max(0, Math.floor(Date.now() / 1000) - snap.publishTime);
    return snap;
  });

  pythCache = { at: now, promise };
  return promise;
}

async function loadPyth(feed: string): Promise<PythRead> {
  const feedId = (FEEDS as Record<string, string>)[feed];
  if (!feedId) throw new Error(`no known feed for ${feed}`);

  const conn = new Connection(RPC, "confirmed");
  let best: PythRead | null = null;

  for (let shard = 0; shard < 4; shard++) {
    const acct = deriveFeedAccount(feedId, shard);
    const info = await conn.getAccountInfo(acct);
    if (!info || info.owner.toBase58() !== PYTH_RECEIVER) continue;

    const data = Buffer.from(info.data);
    const at = data.indexOf(Buffer.from(feedId, "hex"));
    if (at < 0) continue;

    const price = Number(data.readBigInt64LE(at + 32));
    const conf = Number(data.readBigUInt64LE(at + 40));
    const exponent = data.readInt32LE(at + 48);
    const publishTime = Number(data.readBigInt64LE(at + 52));

    const read: PythRead = {
      feed,
      price,
      exponent,
      conf,
      publishTime,
      stalenessSecs: Math.max(0, Math.floor(Date.now() / 1000) - publishTime),
      account: acct.toBase58(),
    };
    if (!best || read.publishTime > best.publishTime) best = read;
  }

  if (!best) throw new Error(`no on-chain Pyth account for ${feed}`);
  return best;
}

export const FROZEN_AFTER_SECS = 3600;

/** Everything the agent detail page needs. */
export async function fetchMarket(symbol: string): Promise<Market | null> {
  const prestock = await fetchPreStock(symbol).catch(() => null);
  if (!prestock) return null;

  const [dex, regime] = await Promise.all([fetchDexQuote(prestock.mint), readPyth()]);

  const multiplier = dex && prestock.tokenPrice > 0 ? dex.priceUsd / prestock.tokenPrice : null;

  return {
    prestock,
    dex,
    regime,
    regimeState: regime.stalenessSecs > FROZEN_AFTER_SECS ? "frozen" : "live",
    multiplier,
  };
}
