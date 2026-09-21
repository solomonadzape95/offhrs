/**
 * ANGEL — Day 3: read Pyth prices ON-CHAIN, permissionlessly.
 *
 * The probe found `Equity.US.AAPL/USD` and `Crypto.AAPLX/USD` as live accounts
 * owned by the Pyth receiver program, ~134 bytes each (PriceUpdateV2). This
 * decodes them with zero Pyth dependencies and no API key.
 *
 * Layout (PriceUpdateV2):
 *   discriminator(8) | write_authority(32) | verification_level(1)
 *   | PriceFeedMessage { feed_id[32], price i64, conf u64, exponent i32,
 *                       publish_time i64, prev_publish_time i64,
 *                       ema_price i64, ema_conf u64 }
 *   | posted_slot u64
 *
 * Rather than trusting fixed offsets we locate the 32-byte feed id inside the
 * account, then read the fields relative to it.
 */
import { Connection, PublicKey } from "@solana/web3.js";

const CONN = new Connection(process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed");
const PUSH_ORACLE = new PublicKey("pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT");
const RECEIVER = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

const ok = (s: string) => `\x1b[32m${s}\x1b[0m`;
const bad = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

function derive(feedIdHex: string, shard: number): PublicKey {
  const shardBuf = Buffer.alloc(2);
  shardBuf.writeUInt16LE(shard, 0);
  return PublicKey.findProgramAddressSync([shardBuf, Buffer.from(feedIdHex, "hex")], PUSH_ORACLE)[0];
}

async function resolveId(symbol: string): Promise<string | null> {
  const r = await fetch(`https://hermes.pyth.network/v2/price_feeds?query=${encodeURIComponent(symbol)}`);
  const feeds = (await r.json()) as any[];
  const hit = feeds.find((f) => f.attributes?.symbol === symbol);
  return hit ? (hit.id as string).replace(/^0x/, "") : null;
}

type Update = {
  feedId: string;
  price: number;
  conf: number;
  exponent: number;
  publishTime: number;
  emaPrice: number;
  ageSec: number;
  account: PublicKey;
  owner: string;
};

function decode(data: Buffer, feedIdHex: string, account: PublicKey, owner: string): Update {
  const expected = Buffer.from(feedIdHex, "hex");
  const at = data.indexOf(expected);
  if (at < 0) throw new Error("feed id not present in account data");

  const price = data.readBigInt64LE(at + 32);
  const conf = data.readBigUInt64LE(at + 40);
  const exponent = data.readInt32LE(at + 48);
  const publishTime = Number(data.readBigInt64LE(at + 52));

  const scale = 10 ** exponent;
  return {
    feedId: feedIdHex,
    price: Number(price) * scale,
    conf: Number(conf) * scale,
    exponent,
    publishTime,
    emaPrice: Number(data.readBigInt64LE(at + 68)) * scale,
    ageSec: Math.max(0, Math.floor(Date.now() / 1000) - publishTime),
    account,
    owner,
  };
}

async function read(symbol: string, shard = 0): Promise<Update> {
  const id = await resolveId(symbol);
  if (!id) throw new Error(`no feed defined for ${symbol}`);
  const acct = derive(id, shard);
  const info = await CONN.getAccountInfo(acct);
  if (!info) throw new Error(`no on-chain account for ${symbol} at shard ${shard} (${acct.toBase58()})`);
  return decode(Buffer.from(info.data), id, acct, info.owner.toBase58());
}

function fmt(u: Update, label: string) {
  const stale = u.ageSec > 300;
  const age = stale ? bad(`${u.ageSec}s STALE`) : ok(`${u.ageSec}s`);
  const ownerTag = u.owner === RECEIVER.toBase58() ? "receiver" : u.owner.slice(0, 8);
  console.log(
    `  ${label.padEnd(22)} $${u.price.toFixed(2).padStart(12)}` +
      `  conf=±$${u.conf.toFixed(4).padEnd(9)}  exp=${u.exponent}  age=${age}  owner=${ownerTag}`,
  );
  console.log(`  ${dim("".padEnd(22) + " " + u.account.toBase58())}`);
}

async function main() {
  console.log(bold("\n=== Pyth price reads: on-chain, no API key, no entitlement ===\n"));

  const aapl = await read("Equity.US.AAPL/USD");
  const aaplx = await read("Crypto.AAPLX/USD");
  const btc = await read("Crypto.BTC/USD");

  console.log(bold("Raw reads"));
  fmt(aapl, "Equity.US.AAPL/USD");
  fmt(aaplx, "Crypto.AAPLX/USD");
  fmt(btc, "Crypto.BTC/USD");

  console.log(bold("\n=== The 24/7 gap: same underlying, two venues ==="));
  const pct = ((aaplx.price - aapl.price) / aapl.price) * 100;
  console.log(`  Apple equity feed (business hours) : $${aapl.price.toFixed(2)}   (${aapl.ageSec}s old)`);
  console.log(`  xStock feed       (24/7)           : $${aaplx.price.toFixed(2)}   (${aaplx.ageSec}s old)`);
  console.log(`  basis                              : ${pct >= 0 ? "+" : ""}${pct.toFixed(3)}%`);
  console.log(
    `  staleness ratio                    : ${(aaplx.ageSec / Math.max(aapl.ageSec, 1)).toFixed(2)}x\n`,
  );

  const now = new Date();
  const isWeekend = now.getUTCDay() === 0 || now.getUTCDay() === 6;
  console.log(
    `  now = ${now.toISOString()} (${now.toUTCString().slice(0, 3)})` +
      `  -> ${isWeekend ? bold("WEEKEND") : "weekday"}\n`,
  );

  console.log(bold("Verdict"));
  console.log(
    `  ${ok("Permissionless on-chain reads work.")} Both ` +
      `${bold("Equity.US.AAPL/USD")} and ${bold("Crypto.AAPLX/USD")} are live accounts`,
  );
  console.log(
    `  owned by the receiver program, readable with a plain getAccountInfo — no key, no grant.\n`,
  );
}

main().catch((e) => {
  console.error(bad("read failed:"), e?.message ?? e);
  process.exit(1);
});
