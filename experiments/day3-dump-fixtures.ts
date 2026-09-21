/** Capture real Pyth accounts from mainnet so the local validator can replay them. */
import fs from "node:fs";
import path from "node:path";
import { Connection, PublicKey } from "@solana/web3.js";

const CONN = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
const PUSH = new PublicKey("pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT");

const derive = (hex: string, shard: number) => {
  const b = Buffer.alloc(2); b.writeUInt16LE(shard, 0);
  return PublicKey.findProgramAddressSync([b, Buffer.from(hex, "hex")], PUSH)[0];
};
const resolve = async (sym: string) => {
  const r = await fetch(`https://hermes.pyth.network/v2/price_feeds?query=${encodeURIComponent(sym)}`);
  const f = (await r.json()) as any[];
  return f.find((x) => x.attributes?.symbol === sym)!.id.replace(/^0x/, "");
};

const TARGETS = [
  { name: "pyth_equity_aapl", symbol: "Equity.US.AAPL/USD", shard: 1 },
  { name: "pyth_crypto_btc", symbol: "Crypto.BTC/USD", shard: 0 },
];

const out = path.resolve("fixtures");
fs.mkdirSync(out, { recursive: true });

for (const t of TARGETS) {
  const id = await resolve(t.symbol);
  const addr = derive(id, t.shard);
  const info = await CONN.getAccountInfo(addr);
  if (!info) { console.log(`missing ${t.symbol}`); continue; }
  const payload = {
    pubkey: addr.toBase58(),
    account: {
      lamports: info.lamports,
      data: [Buffer.from(info.data).toString("base64"), "base64"],
      owner: info.owner.toBase58(),
      executable: false,
      rentEpoch: 0,
    },
  };
  const file = path.join(out, `${t.name}.json`);
  fs.writeFileSync(file, JSON.stringify(payload));
  console.log(`${t.name}.json  ${addr.toBase58()}  owner=${info.owner.toBase58()}  len=${info.data.length}`);
  // also emit a hex fixture for the Rust parser unit test
  fs.writeFileSync(path.join(out, `${t.name}.hex`), Buffer.from(info.data).toString("hex"));
  console.log(`  feedId=${id}`);
}
