/**
 * ANGEL — Day 3 probe: do Pyth equity/index feeds exist ON-CHAIN?
 *
 * Hermes gates every equity feed behind `pyth-indices`. On-chain Pyth price
 * accounts are permissionless to READ, so if these feeds have accounts we can
 * sidestep the API key — and an on-chain read is the stronger integration.
 *
 * Derivation (from @pythnetwork/pyth-solana-receiver dist):
 *   PDA = findProgramAddressSync([shardId_u16le, feedId_32bytes], pushOracle)
 *
 *   default push oracle : pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT
 *   pro-compatible      : pyt2F414BA6dPttK6RddPZUdHfapoBN24GL5wbrPCou
 *
 * Zero Pyth dependencies — the receiver SDK pulls a conflicting rpc-websockets.
 */
import { Connection, PublicKey } from "@solana/web3.js";

const MAINNET = new Connection(
  process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com",
  "confirmed",
);

const PUSH_ORACLES = {
  default: new PublicKey("pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT"),
  pro: new PublicKey("pyt2F414BA6dPttK6RddPZUdHfapoBN24GL5wbrPCou"),
} as const;

const ok = (s: string) => `\x1b[32m${s}\x1b[0m`;
const bad = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function derive(feedIdHex: string, pushOracle: PublicKey, shard: number): PublicKey {
  const shardBuf = Buffer.alloc(2);
  shardBuf.writeUInt16LE(shard, 0);
  const feedBuf = Buffer.from(feedIdHex, "hex");
  if (feedBuf.length !== 32) throw new Error("feed id must be 32 bytes");
  return PublicKey.findProgramAddressSync([shardBuf, feedBuf], pushOracle)[0];
}

async function resolveId(symbol: string): Promise<string | null> {
  const res = await fetch(
    `https://hermes.pyth.network/v2/price_feeds?query=${encodeURIComponent(symbol)}`,
  );
  const feeds = (await res.json()) as any[];
  const hit = feeds.find((f) => f.attributes?.symbol === symbol);
  return hit ? (hit.id as string).replace(/^0x/, "") : null;
}

const TARGETS = [
  "Crypto.BTC/USD", // CONTROL — must be found, or the derivation is wrong
  "Equity.US.AAPL/USD",
  "Equity.Index.AAPL/USD",
  "Crypto.AAPLX/USD",
  "Crypto.AAPLON/USD",
  "Equity.Index.OPENAI/USD",
  "Equity.Index.ANTHROPIC/USD",
];

async function main() {
  console.log("\x1b[1m=== Pyth on-chain feed availability (mainnet) ===\x1b[0m");
  console.log(dim(`default push oracle: ${PUSH_ORACLES.default.toBase58()}`));
  console.log(dim(`pro-compatible     : ${PUSH_ORACLES.pro.toBase58()}\n`));

  const summary: Array<[string, string]> = [];

  for (const symbol of TARGETS) {
    const id = await resolveId(symbol);
    if (!id) {
      console.log(`${bad("NO FEED DEFINED")}  ${symbol}`);
      summary.push([symbol, "no feed defined"]);
      continue;
    }

    const found: string[] = [];
    for (const [label, prog] of Object.entries(PUSH_ORACLES)) {
      for (const shard of [0, 1, 2, 3]) {
        const acct = derive(id, prog, shard);
        const info = await MAINNET.getAccountInfo(acct);
        if (info) {
          const ownedBy = info.owner.toBase58();
          const expected = ownedBy === prog.toBase58();
          const tag = expected ? ok("FOUND") : bad("FOUND?");
          console.log(
            `${tag} ${symbol.padEnd(26)} ${label.padEnd(8)} shard=${shard} len=${info.data.length}` +
              `  ${acct.toBase58()}${expected ? "" : `  owner=${ownedBy}`}`,
          );
          found.push(`${label}:${shard}`);
        }
      }
    }

    if (found.length === 0) {
      console.log(`${bad("ABSENT")} ${symbol.padEnd(24)} ${dim("no account at shards 0-3")}`);
      summary.push([symbol, "absent"]);
    } else {
      summary.push([symbol, found.join(",")]);
    }
  }

  console.log("\n\x1b[1m=== summary ===\x1b[0m");
  for (const [sym, res] of summary) console.log(`  ${res.includes("absent") ? bad("✗") : ok("✓")} ${sym.padEnd(26)} ${res}`);
}

main().catch((e) => {
  console.error(bad("probe failed:"), e?.message ?? e);
  process.exit(1);
});
