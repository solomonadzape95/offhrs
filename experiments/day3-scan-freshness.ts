/**
 * ANGEL — Day 3: is there a FRESH equity feed on-chain, or are they all stale?
 *
 * The shard-0 AAPL account exists but is 35 days old, while BTC is 6 seconds old.
 * Either a different shard/oracle is live, or equity feeds are push-abandoned and
 * Pyth now serves them pull-only (via Hermes, which is gated for equities).
 *
 * That distinction decides the whole Pyth integration, so scan it.
 */
import { Connection, PublicKey } from "@solana/web3.js";

const CONN = new Connection(process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed");

const ORACLES = {
  default: new PublicKey("pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT"),
  pro: new PublicKey("pyt2F414BA6dPttK6RddPZUdHfapoBN24GL5wbrPCou"),
} as const;

const MAX_SHARD = 32;

const ok = (s: string) => `\x1b[32m${s}\x1b[0m`;
const bad = (s: string) => `\x1b[31m${s}\x1b[0m`;
const warn = (s: string) => `\x1b[33m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function derive(feedIdHex: string, oracle: PublicKey, shard: number): PublicKey {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(shard, 0);
  return PublicKey.findProgramAddressSync([b, Buffer.from(feedIdHex, "hex")], oracle)[0];
}

async function resolveId(symbol: string): Promise<string | null> {
  const r = await fetch(`https://hermes.pyth.network/v2/price_feeds?query=${encodeURIComponent(symbol)}`);
  const feeds = (await r.json()) as any[];
  const hit = feeds.find((f) => f.attributes?.symbol === symbol);
  return hit ? (hit.id as string).replace(/^0x/, "") : null;
}

function ageOf(data: Buffer, feedIdHex: string): { age: number; price: number } | null {
  const at = data.indexOf(Buffer.from(feedIdHex, "hex"));
  if (at < 0) return null;
  const price = Number(data.readBigInt64LE(at + 32)) * 10 ** data.readInt32LE(at + 48);
  const publishTime = Number(data.readBigInt64LE(at + 52));
  return { age: Math.max(0, Math.floor(Date.now() / 1000) - publishTime), price };
}

function human(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

async function scan(symbol: string) {
  const id = await resolveId(symbol);
  console.log(bold(`\n${symbol}`) + (id ? dim(`  ${id}`) : ""));
  if (!id) {
    console.log(`  ${bad("no feed defined")}`);
    return null;
  }

  let best: { age: number; price: number; oracle: string; shard: number } | null = null;
  let count = 0;

  for (const [oracleName, oracle] of Object.entries(ORACLES)) {
    for (let shard = 0; shard < MAX_SHARD; shard++) {
      const acct = derive(id, oracle, shard);
      const info = await CONN.getAccountInfo(acct);
      if (!info) continue;
      const parsed = ageOf(Buffer.from(info.data), id);
      if (!parsed) continue;
      count++;
      if (!best || parsed.age < best.age) best = { ...parsed, oracle: oracleName, shard };
    }
  }

  if (!best) {
    console.log(`  ${bad("no accounts at all")}`);
    return null;
  }

  const ageStr = best.age < 300 ? ok(human(best.age)) : best.age < 86400 ? warn(human(best.age)) : bad(human(best.age));
  console.log(
    `  ${count} account(s) across shards 0-${MAX_SHARD - 1}; freshest: ` +
      `${ageStr}  $${best.price.toFixed(2)}  (${best.oracle} shard ${best.shard})`,
  );
  return best;
}

async function main() {
  console.log(bold("\n=== Scanning for FRESH Pyth feeds on-chain (mainnet) ==="));

  const results: Record<string, number> = {};
  for (const sym of [
    "Crypto.BTC/USD",
    "Crypto.ETH/USD",
    "Crypto.AAPLX/USD",
    "Equity.US.AAPL/USD",
    "Equity.US.NVDA/USD",
    "Equity.Index.OPENAI/USD",
  ]) {
    const r = await scan(sym);
    if (r) results[sym] = r.age;
  }

  console.log(bold("\n=== summary: staleness of the freshest on-chain account ==="));
  for (const [sym, age] of Object.entries(results)) {
    const tag = age < 300 ? ok("LIVE   ") : age < 86400 ? warn("STALE  ") : bad("ABANDONED");
    console.log(`  ${tag} ${sym.padEnd(26)} ${human(age)}`);
  }

  console.log(bold("\n=== interpretation ==="));
  const cryptoLive = (results["Crypto.BTC/USD"] ?? Infinity) < 300;
  const equityLive = (results["Equity.US.AAPL/USD"] ?? Infinity) < 300;
  console.log(`  crypto push updates flowing : ${cryptoLive ? ok("yes") : bad("no")}`);
  console.log(`  equity push updates flowing : ${equityLive ? ok("yes") : bad("no")}`);
  if (cryptoLive && !equityLive) {
    console.log(
      `\n  ${bold("Equity feeds are push-abandoned on-chain.")} Crypto is live, equities are not.\n` +
        `  Equity prices must come from Hermes (gated) and be POSTED on-chain via the\n` +
        `  Pyth receiver's pull path. That makes the Pyth API-key entitlement the\n` +
        `  gating factor for any equity-data story.`,
    );
  }
}

main().catch((e) => {
  console.error(bad("scan failed:"), e?.message ?? e);
  process.exit(1);
});
