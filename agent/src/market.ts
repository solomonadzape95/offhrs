/**
 * Market data: Pyth (on-chain), PreStocks mark, and live DEX price.
 *
 * Pyth is read from the on-chain `PriceUpdateV2` account rather than the Hermes
 * API, because Hermes gates every equity feed behind `pyth-indices` while the
 * on-chain accounts are permissionless. No key, no entitlement.
 */
import { Connection, PublicKey } from "@solana/web3.js";

import { PYTH_PUSH_ORACLE_PROGRAM_ID, PYTH_RECEIVER_PROGRAM_ID, requireFeedId } from "./config.js";

export type PythRead = {
  feedId: string;
  price: number;
  conf: number;
  exponent: number;
  publishTime: number;
  stalenessSecs: number;
  account: string;
};

export type PreStockQuote = {
  symbol: string;
  name: string;
  mint: string;
  /** SPV reference mark. */
  markPrice: number;
  /** Issuer's on-chain token price, *unscaled*. */
  tokenPrice: number;
  impliedValuation: number;
  markValuation: number;
  /** (mark - token) / token. Scale-invariant, so the multiplier doesn't matter. */
  premiumBps: number;
};

export type DexPrice = {
  /** USD per whole PreStock token, from an executable quote. */
  priceUsd: number;
  route: string[];
  priceImpactPct: number;
};

export type MarketSnapshot = {
  at: string;
  prestock: PreStockQuote;
  dex: DexPrice;
  pyth: PythRead;
  regime: "live" | "frozen";
  /**
   * Api tokenPrice is unscaled; the DEX quote is not. Their ratio is the mint's
   * effective `scaledUiAmount` multiplier — self-calibrating, so we never have
   * to parse the Token-2022 extension.
   */
  effectiveMultiplier: number;
  /** Implied DEX price if you scale the API price by that multiplier. */
  impliedDexPrice: number;
  /** Disagreement between the two independent reads of the on-chain price. */
  dataQualityBps: number;
};

function deriveFeedAccount(feedIdHex: string, shard = 0, oracle = PYTH_PUSH_ORACLE_PROGRAM_ID): PublicKey {
  const shardBuf = Buffer.alloc(2);
  shardBuf.writeUInt16LE(shard, 0);
  return PublicKey.findProgramAddressSync(
    [shardBuf, Buffer.from(feedIdHex, "hex")],
    new PublicKey(oracle),
  )[0];
}

/** Decode a Pyth `PriceUpdateV2` (134 bytes). Mirrors programs/stock_vault/src/pricing.rs. */
function decodePriceUpdateV2(data: Buffer, feedIdHex: string, account: string): PythRead {
  const at = data.indexOf(Buffer.from(feedIdHex, "hex"));
  if (at < 0) throw new Error(`feed id not present in ${account}`);

  const price = Number(data.readBigInt64LE(at + 32));
  const conf = Number(data.readBigUInt64LE(at + 40));
  const exponent = data.readInt32LE(at + 48);
  const publishTime = Number(data.readBigInt64LE(at + 52));

  return {
    feedId: feedIdHex,
    price,
    conf,
    exponent,
    publishTime,
    stalenessSecs: Math.max(0, Math.floor(Date.now() / 1000) - publishTime),
    account,
  };
}

/**
 * Read a Pyth feed on-chain, trying successive shards.
 *
 * Some feeds have several accounts and only some are maintained, so we take the
 * freshest one rather than trusting shard 0.
 */
export async function readPyth(
  conn: Connection,
  symbol: string,
  maxShards = 4,
): Promise<PythRead> {
  const feedId = requireFeedId(symbol);
  let best: { read: PythRead; info: any } | null = null;

  for (let shard = 0; shard < maxShards; shard++) {
    const acct = deriveFeedAccount(feedId, shard);
    const info = await conn.getAccountInfo(acct);
    if (!info) continue;
    if (info.owner.toBase58() !== PYTH_RECEIVER_PROGRAM_ID) continue;

    const read = decodePriceUpdateV2(Buffer.from(info.data), feedId, acct.toBase58());
    if (!best || read.publishTime > best.read.publishTime) best = { read, info };
  }

  if (!best) {
    throw new Error(
      `No on-chain Pyth account for ${symbol} (feed ${feedId}) in shards 0..${maxShards}`,
    );
  }
  return best.read;
}

/** PreStocks issuer API — public, no auth. */
export async function fetchPreStock(symbol: string): Promise<PreStockQuote> {
  const res = await fetch("https://prestocks.com/api/prestocks");
  if (!res.ok) throw new Error(`prestocks API ${res.status}`);
  const all = (await res.json()) as any[];
  const p = all.find((x) => x.symbol?.toUpperCase() === symbol.toUpperCase());
  if (!p) {
    throw new Error(
      `Unknown PreStock "${symbol}". Available: ${all.map((x: any) => x.symbol).join(", ")}`,
    );
  }
  const tokenPrice = Number(p.tokenPrice);
  const markPrice = Number(p.markPrice);
  return {
    symbol: p.symbol,
    name: p.name,
    mint: p.contract_address,
    markPrice,
    tokenPrice,
    impliedValuation: Number(p.impliedValuation),
    markValuation: Number(p.markValuation),
    premiumBps: tokenPrice > 0 ? Math.round(((markPrice - tokenPrice) / tokenPrice) * 10_000) : 0,
  };
}

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** Executable USD price for one whole PreStock token, via a live Jupiter quote. */
export async function fetchDexPrice(mint: string, decimals = 9): Promise<DexPrice> {
  const one = 10n ** BigInt(decimals);
  const url =
    `https://lite-api.jup.ag/swap/v1/quote?inputMint=${mint}&outputMint=${USDC}` +
    `&amount=${one}&slippageBps=50`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`jupiter quote ${res.status}`);
  const q = (await res.json()) as any;
  if (!q.outAmount) throw new Error(`no route for ${mint} -> USDC`);

  return {
    priceUsd: Number(q.outAmount) / 1e6,
    route: (q.routePlan ?? []).map((s: any) => s.swapInfo?.label).filter(Boolean),
    priceImpactPct: Number(q.priceImpactPct ?? 0),
  };
}

/**
 * One consistent market snapshot: issuer mark, executable DEX price, and the
 * Pyth regime that gates whether we act.
 */
export async function collectSnapshot(
  conn: Connection,
  symbol: string,
  referenceFeed: string,
  frozenAfterSecs: number,
): Promise<MarketSnapshot> {
  const prestock = await fetchPreStock(symbol);
  const [dex, pyth] = await Promise.all([
    fetchDexPrice(prestock.mint),
    readPyth(conn, referenceFeed),
  ]);

  // The API reports *unscaled* prices; the DEX quote does not. Their ratio
  // recovers the mint's effective `scaledUiAmount` multiplier without needing to
  // parse the Token-2022 extension.
  const effectiveMultiplier = prestock.tokenPrice > 0 ? dex.priceUsd / prestock.tokenPrice : 0;
  const impliedDexPrice = prestock.tokenPrice * effectiveMultiplier;
  const dataQualityBps =
    dex.priceUsd > 0
      ? Math.round((Math.abs(impliedDexPrice - dex.priceUsd) / dex.priceUsd) * 10_000)
      : 0;

  return {
    at: new Date().toISOString(),
    prestock,
    dex,
    pyth,
    regime: pyth.stalenessSecs > frozenAfterSecs ? "frozen" : "live",
    effectiveMultiplier,
    impliedDexPrice,
    dataQualityBps,
  };
}
