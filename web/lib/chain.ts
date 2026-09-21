/**
 * On-chain reads for the `stock_vault` program.
 *
 * The frontend was built against `lib/agents.ts`, a seeded PREVIEW set, because
 * the program had no address. It has one now: `FoVBZ…VLw` on **devnet**. This is
 * the module that reads the real thing.
 *
 * Two things it deliberately does not do:
 *
 *  - **It does not import Anchor.** The browser bundle must not carry an Anchor
 *    client, and the account layouts are fixed in `programs/stock_vault/src/
 *    state.rs`. So the decoders here are small, explicit Borsh readers and every
 *    one asserts the 8-byte discriminator before trusting a byte.
 *  - **It does not assume mainnet.** `market.ts` reads mainnet (PreStocks, Jupiter,
 *    Pyth only exist there). The program is deployed to devnet first, so this uses
 *    its own `PROGRAM_RPC_URL`. Set both env vars to point at mainnet when the
 *    program is deployed there.
 *
 * What is *not* on chain: an agent's display name, ticker and thesis. `Agent`
 * carries the treasury addresses, the fee tier and the counters — the human-facing
 * metadata lives in the DBC token's Metaplex metadata. `describeAgent()` below is
 * the honest interim: it labels an on-chain agent by its asset and short mint
 * rather than inventing a name.
 */
import { Connection, PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  process.env.ANGEL_PROGRAM_ID ?? "FoVBZRFCamH1HNMiVpNZV2QJxk9bSxWtQvKgmqZ1rVLw",
);

/**
 * Where the *program* lives. Separate from `market.ts`'s `RPC_URL` on purpose:
 * the market is mainnet and the program is devnet until the mainnet deploy.
 */
export const PROGRAM_RPC_URL =
  process.env.PROGRAM_RPC_URL ?? "https://api.devnet.solana.com";

let cached: Connection | null = null;
const connection = () => (cached ??= new Connection(PROGRAM_RPC_URL, "confirmed"));

// ---------------------------------------------------------------------------
// Discriminators — copied from target/idl/stock_vault.json. The decoders assert
// these, so a layout change fails loudly instead of decoding garbage.
// ---------------------------------------------------------------------------
const DISC = {
  Agent: Uint8Array.from([47, 166, 112, 147, 155, 197, 86, 7]),
  ArbExecution: Uint8Array.from([226, 159, 254, 18, 155, 95, 73, 170]),
  DividendVault: Uint8Array.from([50, 106, 134, 112, 43, 207, 200, 150]),
  UserStake: Uint8Array.from([102, 53, 163, 107, 9, 138, 87, 153]),
  WrapperConfig: Uint8Array.from([83, 239, 35, 66, 9, 218, 15, 226]),
} as const;

/** Account sizes from `state.rs`. Uniquely identify an account type per program. */
const SIZE = {
  Agent: 195,
  ArbExecution: 175,
  DividendVault: 241,
  UserStake: 121,
  WrapperConfig: 172,
} as const;

const VENUES = [
  "Jupiter",
  "Raydium",
  "MeteoraDlmm",
  "MeteoraDammV2",
  "Orca",
  "Clawpump",
  "Other",
] as const;
const REGIMES = ["Live", "Frozen"] as const;

export type ArbVenueName = (typeof VENUES)[number];
export type RegimeName = (typeof REGIMES)[number];

// ---------------------------------------------------------------------------
// Borsh reader
// ---------------------------------------------------------------------------
class Reader {
  private o: number;
  constructor(
    private readonly b: Buffer,
    offset = 0,
  ) {
    this.o = offset;
  }
  pubkey(): string {
    const k = new PublicKey(this.b.subarray(this.o, this.o + 32));
    this.o += 32;
    return k.toBase58();
  }
  u8(): number {
    return this.b.readUInt8(this.o++);
  }
  bool(): boolean {
    return this.u8() === 1;
  }
  u16(): number {
    const v = this.b.readUInt16LE(this.o);
    this.o += 2;
    return v;
  }
  i32(): number {
    const v = this.b.readInt32LE(this.o);
    this.o += 4;
    return v;
  }
  u64(): bigint {
    const v = this.b.readBigUInt64LE(this.o);
    this.o += 8;
    return v;
  }
  i64(): bigint {
    const v = this.b.readBigInt64LE(this.o);
    this.o += 8;
    return v;
  }
  u128(): bigint {
    const lo = this.b.readBigUInt64LE(this.o);
    const hi = this.b.readBigUInt64LE(this.o + 8);
    this.o += 16;
    return lo | (hi << 64n);
  }
  bytes(n: number): Uint8Array {
    const v = this.b.subarray(this.o, this.o + n);
    this.o += n;
    return v;
  }
}

const hasDisc = (data: Buffer, disc: Uint8Array) =>
  data.length >= 8 && disc.every((b, i) => data[i] === b);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type OnChainAgent = {
  pda: string;
  creator: string;
  agentSigner: string;
  agentTokenMint: string;
  wrappedMint: string;
  dynamicFeeBps: number;
  totalProfitsRouted: bigint;
  executionCount: bigint;
  totalProfitLogged: bigint;
  vault: string;
};

export type OnChainVault = {
  pda: string;
  stakingMint: string;
  rewardMint: string;
  stakeVault: string;
  rewardVault: string;
  agent: string;
  totalStaked: bigint;
  accRewardPerShare: bigint;
  rewardRate: bigint;
  rewardReserve: bigint;
  totalDistributed: bigint;
  lastUpdateSlot: bigint;
  minHoldSlots: bigint;
};

export type OnChainStake = {
  pda: string;
  owner: string;
  vault: string;
  stakedAmount: bigint;
  rewardDebt: bigint;
  accrued: bigint;
  totalClaimed: bigint;
  lastStakeSlot: bigint;
};

export type OnChainWrapper = {
  pda: string;
  prestockMint: string;
  wrappedMint: string;
  reserve: string;
  admin: string;
  prestockDecimals: number;
  wrappedDecimals: number;
  paused: boolean;
  totalRequestedIn: bigint;
  totalReceivedIn: bigint;
  totalFeePaidIn: bigint;
  totalUnwrapped: bigint;
};

export type OnChainExecution = {
  pda: string;
  agent: string;
  index: number;
  venue: ArbVenueName;
  amountIn: bigint;
  amountOut: bigint;
  profit: bigint;
  oracle: string;
  feedId: string;
  pythPrice: bigint;
  pythExponent: number;
  pythPublishTime: bigint;
  pythStalenessSecs: bigint;
  regime: RegimeName;
  executedAt: bigint;
};

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------
function decodeAgent(pda: PublicKey, data: Buffer): OnChainAgent {
  const r = new Reader(data, 8);
  return {
    pda: pda.toBase58(),
    creator: r.pubkey(),
    agentSigner: r.pubkey(),
    agentTokenMint: r.pubkey(),
    wrappedMint: r.pubkey(),
    dynamicFeeBps: r.u16(),
    totalProfitsRouted: r.u64(),
    executionCount: r.u64(),
    totalProfitLogged: r.u64(),
    vault: r.pubkey(),
  };
}

function decodeVault(pda: PublicKey, data: Buffer): OnChainVault {
  const r = new Reader(data, 8);
  const stakingMint = r.pubkey();
  const rewardMint = r.pubkey();
  const stakeVault = r.pubkey();
  const rewardVault = r.pubkey();
  const agent = r.pubkey();
  const totalStaked = r.u64();
  const accRewardPerShare = r.u128();
  const rewardRate = r.u128();
  const rewardReserve = r.u64();
  const totalDistributed = r.u64();
  const lastUpdateSlot = r.u64();
  const minHoldSlots = r.u64();
  r.u8(); // bump
  return {
    pda: pda.toBase58(),
    stakingMint,
    rewardMint,
    stakeVault,
    rewardVault,
    agent,
    totalStaked,
    accRewardPerShare,
    rewardRate,
    rewardReserve,
    totalDistributed,
    lastUpdateSlot,
    minHoldSlots,
  };
}

function decodeStake(pda: PublicKey, data: Buffer): OnChainStake {
  const r = new Reader(data, 8);
  const owner = r.pubkey();
  const vault = r.pubkey();
  const stakedAmount = r.u64();
  const rewardDebt = r.u128();
  const accrued = r.u64();
  const totalClaimed = r.u64();
  const lastStakeSlot = r.u64();
  r.u8(); // bump
  return {
    pda: pda.toBase58(),
    owner,
    vault,
    stakedAmount,
    rewardDebt,
    accrued,
    totalClaimed,
    lastStakeSlot,
  };
}

function decodeWrapper(pda: PublicKey, data: Buffer): OnChainWrapper {
  const r = new Reader(data, 8);
  const prestockMint = r.pubkey();
  const wrappedMint = r.pubkey();
  const reserve = r.pubkey();
  const admin = r.pubkey();
  const prestockDecimals = r.u8();
  const wrappedDecimals = r.u8();
  const paused = r.bool();
  r.u8(); // bump — must be consumed before the u64 counters
  const totalRequestedIn = r.u64();
  const totalReceivedIn = r.u64();
  const totalFeePaidIn = r.u64();
  const totalUnwrapped = r.u64();
  return {
    pda: pda.toBase58(),
    prestockMint,
    wrappedMint,
    reserve,
    admin,
    prestockDecimals,
    wrappedDecimals,
    paused,
    totalRequestedIn,
    totalReceivedIn,
    totalFeePaidIn,
    totalUnwrapped,
  };
}

function decodeExecution(pda: PublicKey, data: Buffer): OnChainExecution {
  const r = new Reader(data, 8);
  const agent = r.pubkey();
  const index = Number(r.u64());
  const venue = VENUES[r.u8()] ?? "Other";
  const amountIn = r.u64();
  const amountOut = r.u64();
  const profit = r.u64();
  const oracle = r.pubkey();
  const feedId = Buffer.from(r.bytes(32)).toString("hex");
  const pythPrice = r.i64();
  const pythExponent = r.i32();
  const pythPublishTime = r.i64();
  const pythStalenessSecs = r.u64();
  const regime = REGIMES[r.u8()] ?? "Live";
  const executedAt = r.i64();
  return {
    pda: pda.toBase58(),
    agent,
    index,
    venue,
    amountIn,
    amountOut,
    profit,
    oracle,
    feedId,
    pythPrice,
    pythExponent,
    pythPublishTime,
    pythStalenessSecs,
    regime,
    executedAt,
  };
}

// ---------------------------------------------------------------------------
// PDA helpers — mirrors `programs/stock_vault/src/state.rs`
// ---------------------------------------------------------------------------
const pda = (seeds: (Buffer | Uint8Array)[]) =>
  PublicKey.findProgramAddressSync(
    seeds.map((s) => Buffer.from(s)),
    PROGRAM_ID,
  )[0];

export const agentPda = (mint: string | PublicKey) =>
  pda([Buffer.from("agent"), new PublicKey(mint).toBuffer()]);
export const vaultPda = (mint: string | PublicKey) =>
  pda([Buffer.from("vault"), new PublicKey(mint).toBuffer()]);
export const stakePda = (vault: string | PublicKey, owner: string | PublicKey) =>
  pda([
    Buffer.from("stake"),
    new PublicKey(vault).toBuffer(),
    new PublicKey(owner).toBuffer(),
  ]);
export const execPda = (agent: string | PublicKey, index: number) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(index));
  return pda([Buffer.from("exec"), new PublicKey(agent).toBuffer(), b]);
};
export const signalPda = (agent: string | PublicKey, feedIdHex: string) =>
  pda([
    Buffer.from("signal"),
    new PublicKey(agent).toBuffer(),
    Buffer.from(feedIdHex, "hex"),
  ]);

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------
async function fetchAll<T>(
  size: number,
  disc: Uint8Array,
  decode: (pda: PublicKey, data: Buffer) => T,
): Promise<T[]> {
  const accounts = await connection().getProgramAccounts(PROGRAM_ID, {
    filters: [{ dataSize: size }],
  });
  const out: T[] = [];
  for (const { pubkey, account } of accounts) {
    const data = account.data as Buffer;
    if (!hasDisc(data, disc)) continue;
    out.push(decode(pubkey, data));
  }
  return out;
}

export const fetchAgents = () => fetchAll(SIZE.Agent, DISC.Agent, decodeAgent);
export const fetchWrappers = () =>
  fetchAll(SIZE.WrapperConfig, DISC.WrapperConfig, decodeWrapper);
export const fetchVaults = () =>
  fetchAll(SIZE.DividendVault, DISC.DividendVault, decodeVault);

export async function fetchAgent(agent: string | PublicKey) {
  const info = await connection().getAccountInfo(agentPda(agent));
  if (!info || !hasDisc(info.data as Buffer, DISC.Agent)) return null;
  return decodeAgent(agentPda(agent), info.data as Buffer);
}

export async function fetchVault(mint: string | PublicKey) {
  const info = await connection().getAccountInfo(vaultPda(mint));
  if (!info || !hasDisc(info.data as Buffer, DISC.DividendVault)) return null;
  return decodeVault(vaultPda(mint), info.data as Buffer);
}

export async function fetchUserStake(vault: string | PublicKey, owner: string | PublicKey) {
  const info = await connection().getAccountInfo(stakePda(vault, owner));
  if (!info || !hasDisc(info.data as Buffer, DISC.UserStake)) return null;
  return decodeStake(stakePda(vault, owner), info.data as Buffer);
}

export async function fetchWrapper(prestockMint: string) {
  const pdaKey = pda([Buffer.from("wrapper"), new PublicKey(prestockMint).toBuffer()]);
  const info = await connection().getAccountInfo(pdaKey);
  if (!info || !hasDisc(info.data as Buffer, DISC.WrapperConfig)) return null;
  return decodeWrapper(pdaKey, info.data as Buffer);
}

/**
 * Walk the execution PDAs from `count - limit` to `count`. The PDA sequence is
 * capped at the agent's own counter, so a partial write is impossible to read as
 * a complete one.
 */
export async function fetchExecutions(agent: string | PublicKey, limit = 20) {
  const a = await fetchAgent(agent);
  if (!a) return [];
  const count = Number(a.executionCount);
  const from = Math.max(0, count - limit);
  const out: OnChainExecution[] = [];
  for (let i = from; i < count; i++) {
    const key = execPda(agentPda(agent), i);
    const info = await connection().getAccountInfo(key);
    if (info && hasDisc(info.data as Buffer, DISC.ArbExecution)) {
      out.push(decodeExecution(key, info.data as Buffer));
    }
  }
  return out;
}

/** Whether the program account exists on the configured cluster. */
export async function programDeployed(): Promise<boolean> {
  return Boolean(await connection().getAccountInfo(PROGRAM_ID));
}

/**
 * Map a `wrapped_mint` back to the raw PreStock it wraps, using the wrapper
 * registry. Callers join the result against the PreStocks universe to recover the
 * symbol (`prestock_mint === PreStock.mint`).
 */
export const assetByWrappedMint = (wrappers: OnChainWrapper[]) =>
  new Map(wrappers.map((w) => [w.wrappedMint, w.prestockMint]));

/**
 * The honest interim display record: on-chain agents have no name/ticker until
 * the DBC token metadata is read, so label them by asset + short mint rather
 * than inventing one. `id` is the agent PDA so `/agent/[id]` can resolve it.
 */
export function describeAgent(
  agent: OnChainAgent,
  assetSymbol: string | null,
): {
  id: string;
  name: string;
  ticker: string;
  asset: string;
  creator: string;
  feeBps: number;
  executionCount: number;
} {
  const short = agent.agentTokenMint.slice(0, 4).toUpperCase();
  return {
    id: agent.pda,
    name: assetSymbol ? `${assetSymbol} desk` : `Agent ${short}`,
    ticker: short,
    asset: assetSymbol ?? "—",
    creator: agent.creator,
    feeBps: agent.dynamicFeeBps,
    executionCount: Number(agent.executionCount),
  };
}
