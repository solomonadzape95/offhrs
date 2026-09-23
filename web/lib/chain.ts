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

import { AGENT_IDENTITY_BY_ASSET } from "./agents";
import { underlyingSymbol } from "./mock";

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

/**
 * `getProgramAccounts` is the one expensive call this module makes, and a single
 * page can ask for the same set several times at once. `getUserPosition` calls
 * `fetchAgents` and `fetchWrappers` directly *and* through `fetchLiveAgents`, so
 * one dashboard load used to fire four concurrent full-program scans. The public
 * devnet RPC answers that burst with a 429 storm, the `catch` returns the empty
 * portfolio, and the vault renders "nothing to stake into" — which is a lie.
 *
 * De-duplicate the in-flight scan and keep the result for a short window. The
 * registry changes rarely, and single-account reads (a stake, a wrapper, an
 * execution) are deliberately *not* cached, so a write is still visible at once.
 */
const SCAN_TTL_MS = 30_000;
const scanCache = new Map<number, { at: number; value: unknown }>();
const scanInflight = new Map<number, Promise<unknown>>();

function scan<T>(size: number, fn: () => Promise<T>): Promise<T> {
  const hit = scanCache.get(size);
  if (hit && Date.now() - hit.at < SCAN_TTL_MS) return Promise.resolve(hit.value as T);
  const pending = scanInflight.get(size);
  if (pending) return pending as Promise<T>;
  const promise = fn()
    .then((value) => {
      scanCache.set(size, { at: Date.now(), value });
      scanInflight.delete(size);
      return value;
    })
    .catch((error) => {
      scanInflight.delete(size);
      throw error;
    });
  scanInflight.set(size, promise);
  return promise;
}

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
  string(): string {
    const len = this.b.readUInt32LE(this.o);
    this.o += 4;
    const s = this.b.subarray(this.o, this.o + len).toString("utf8");
    this.o += len;
    return s;
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
export const wrapperConfigPda = (prestockMint: string | PublicKey) =>
  pda([Buffer.from("wrapper"), new PublicKey(prestockMint).toBuffer()]);
export const reservePda = (wrapperConfig: string | PublicKey) =>
  pda([Buffer.from("reserve"), new PublicKey(wrapperConfig).toBuffer()]);
export const vaultPda = (mint: string | PublicKey) =>
  pda([Buffer.from("vault"), new PublicKey(mint).toBuffer()]);
export const stakePda = (vault: string | PublicKey, owner: string | PublicKey) =>
  pda([
    Buffer.from("stake"),
    new PublicKey(vault).toBuffer(),
    new PublicKey(owner).toBuffer(),
  ]);
export const stakeVaultPda = (vault: string | PublicKey) =>
  pda([Buffer.from("stake_vault"), new PublicKey(vault).toBuffer()]);
export const rewardVaultPda = (vault: string | PublicKey) =>
  pda([Buffer.from("reward_vault"), new PublicKey(vault).toBuffer()]);
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
  const accounts = await scan(size, () =>
    connection().getProgramAccounts(PROGRAM_ID, {
      filters: [{ dataSize: size }],
    }),
  );
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

async function decodeAt<T>(
  key: PublicKey,
  disc: Uint8Array,
  decode: (k: PublicKey, d: Buffer) => T,
): Promise<T | null> {
  const info = await connection().getAccountInfo(key);
  if (!info || !hasDisc(info.data as Buffer, disc)) return null;
  return decode(key, info.data as Buffer);
}

/** By PDA — the agent's own address, which is what the UI routes on. */
export const fetchAgentByPda = (pda: string | PublicKey) =>
  decodeAt(new PublicKey(pda), DISC.Agent, decodeAgent);
/** By the `$AGENT` mint, from which the PDA is derived. */
export const fetchAgentByMint = (mint: string | PublicKey) =>
  decodeAt(agentPda(mint), DISC.Agent, decodeAgent);
export const fetchVaultByPda = (pda: string | PublicKey) =>
  decodeAt(new PublicKey(pda), DISC.DividendVault, decodeVault);
export const fetchVaultByMint = (mint: string | PublicKey) =>
  decodeAt(vaultPda(mint), DISC.DividendVault, decodeVault);

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
export async function fetchExecutions(agentPda: string | PublicKey, limit = 20) {
  const a = await fetchAgentByPda(agentPda);
  if (!a) return [];
  const count = Number(a.executionCount);
  const from = Math.max(0, count - limit);
  const out: OnChainExecution[] = [];
  for (let i = from; i < count; i++) {
    const key = execPda(agentPda, i);
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
 * Current cluster slot. The vault's accumulator only advances when an instruction
 * settles it, so readers project streaming rewards from the slot delta rather than
 * showing a stale figure between interactions.
 */
export const fetchSlot = () => connection().getSlot("confirmed");

// ---------------------------------------------------------------------------
// Token balances — for the trade box, which needs to know what the connected
// wallet actually holds before it offers a size.
// ---------------------------------------------------------------------------
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

export type TokenFlavour = "spl" | "token-2022";

/**
 * Raw balance of `mint` held by `owner`, or null when the account does not exist.
 * Reads the SPL token-account layout directly (amount is a u64 at offset 64) so
 * one code path serves both the classic `$AGENT`/`wPreStock` and the Token-2022
 * PreStock.
 */
export async function fetchTokenBalance(
  mint: string,
  owner: string,
  flavour: TokenFlavour = "spl",
): Promise<bigint | null> {
  const program = flavour === "token-2022" ? TOKEN_2022_PROGRAM : TOKEN_PROGRAM;
  const [ata] = PublicKey.findProgramAddressSync(
    [new PublicKey(owner).toBuffer(), program.toBuffer(), new PublicKey(mint).toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM,
  );
  const info = await connection().getAccountInfo(ata);
  if (!info) return null;
  return (info.data as Buffer).readBigUInt64LE(64);
}

/** Mint decimals (offset 44 in both the SPL and Token-2022 mint layouts). */
export async function fetchMintDecimals(mint: string): Promise<number | null> {
  const info = await connection().getAccountInfo(new PublicKey(mint));
  if (!info) return null;
  return (info.data as Buffer)[44];
}

/**
 * Map a `wrapped_mint` back to the raw PreStock it wraps, using the wrapper
 * registry. Callers join the result against the PreStocks universe to recover the
 * symbol (`prestock_mint === PreStock.mint`).
 */
export const assetByWrappedMint = (wrappers: OnChainWrapper[]) =>
  new Map(wrappers.map((w) => [w.wrappedMint, w.prestockMint]));

// ---------------------------------------------------------------------------
// Metaplex token metadata — names and tickers live here, not in the Agent account.
// ---------------------------------------------------------------------------
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);

export type TokenMetadata = { name: string; symbol: string; uri: string };

/**
 * Read a mint's Metaplex metadata. A DBC-created SPL base mint gets its metadata
 * in the same instruction that creates the pool, so this is where a launched
 * agent's name and ticker actually live.
 */
export async function readTokenMetadata(mint: string | PublicKey): Promise<TokenMetadata | null> {
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      new PublicKey(mint).toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  );
  const info = await connection().getAccountInfo(metadataPda);
  if (!info) return null;
  // key(1) + update_authority(32) + mint(32), then the Data struct.
  const r = new Reader(info.data as Buffer, 1 + 32 + 32);
  return {
    name: r.string().replace(/\0/g, "").trim(),
    symbol: r.string().replace(/\0/g, "").trim(),
    uri: r.string().replace(/\0/g, "").trim(),
  };
}

// ---------------------------------------------------------------------------
// Live agents — an on-chain record joined with its asset symbol and its token
// metadata, shaped to drop into the same UI slot as a seeded `AgentSeed`.
// ---------------------------------------------------------------------------
export type LiveAgent = {
  id: string;
  name: string;
  ticker: string;
  asset: string;
  thesis: string;
  creator: string;
  agentSigner: string;
  feeBps: number;
  curveProgress: number;
  lastTradeSecsAgo: number;
  onchain: true;
  pda: string;
  agentTokenMint: string;
  wrappedMint: string;
  vault: string;
  executionCount: number;
};

type UniverseEntry = { symbol: string; mint: string };

export async function toLiveAgent(
  agent: OnChainAgent,
  byWrappedMint: Map<string, string>,
  byPrestockMint: Map<string, UniverseEntry>,
): Promise<LiveAgent> {
  const prestockMint = byWrappedMint.get(agent.wrappedMint);
  const prestock = prestockMint ? byPrestockMint.get(prestockMint) : undefined;

  let meta: TokenMetadata | null = null;
  try {
    meta = await readTokenMetadata(agent.agentTokenMint);
  } catch {
    // No metadata account — fall back to a derived label rather than inventing one.
  }

  const short = agent.agentTokenMint.slice(0, 4).toUpperCase();
  const identity = prestock ? AGENT_IDENTITY_BY_ASSET[underlyingSymbol(prestock.symbol)] : undefined;
  return {
    id: agent.pda,
    name: meta?.name || identity?.name || (prestock ? `${prestock.symbol} desk` : `Agent ${short}`),
    ticker: (meta?.symbol || identity?.ticker || short).toUpperCase(),
    asset: prestock?.symbol ?? "—",
    thesis:
      "On-chain agent. Its vault streams the wrapped PreStock it was registered against.",
    creator: agent.creator,
    agentSigner: agent.agentSigner,
    feeBps: agent.dynamicFeeBps,
    curveProgress: 0,
    lastTradeSecsAgo: 0,
    onchain: true,
    pda: agent.pda,
    agentTokenMint: agent.agentTokenMint,
    wrappedMint: agent.wrappedMint,
    vault: agent.vault,
    executionCount: Number(agent.executionCount),
  };
}

/**
 * Devnet demo curation. The browser checks (`scripts/browser-launch-check.ts`)
 * leave real agents behind, each created by a throwaway wallet, and the program
 * has no close instruction — so they cannot be deleted on-chain. They are hidden
 * from the *list* only: a direct `/agent/<pda>` link still resolves. Remove an
 * address here if it ever becomes a real agent.
 */
const HIDDEN_AGENT_CREATORS = new Set([
  "7fnhz4V3Wdax3r8yGU8zfE1sG4BNKcwLxVfwHJUbFEhv",
  "EAzreuDuUYYhVGUKadmqLPgxbzHBqfScmsxbzsNhZ4pV",
  "2Tf4FM8XAzG15hmyi2b5WU5nm2HaJxJr6tKmarn5rCPn",
  "Cxrg8bzNJ31ASS2D1o2F2kgZWnwgFs1i2PmKXUUr6jU",
  "FtsN8Z4Jreokop6ieszp43tTYHGqv7fryJ67o3khBGpE",
]);

/**
 * Every registered agent, joined with its asset symbol and token metadata. Pass
 * the PreStocks universe (from `market.ts`) to resolve symbols; without it agents
 * still appear, labelled by mint.
 */
export async function fetchLiveAgents(prestocks: UniverseEntry[] = []): Promise<LiveAgent[]> {
  const [agents, wrappers] = await Promise.all([fetchAgents(), fetchWrappers()]);
  const byWrappedMint = assetByWrappedMint(wrappers);
  const byPrestockMint = new Map(prestocks.map((p) => [p.mint, p]));
  const live = await Promise.all(agents.map((a) => toLiveAgent(a, byWrappedMint, byPrestockMint)));
  return live.filter((a) => !HIDDEN_AGENT_CREATORS.has(a.creator));
}

/** Resolve one agent by its PDA — the `/agent/[id]` route key. */
export async function fetchLiveAgentByPda(
  pda: string,
  prestocks: UniverseEntry[] = [],
): Promise<LiveAgent | null> {
  const agent = await fetchAgentByPda(pda);
  if (!agent) return null;
  const wrappers = await fetchWrappers();
  const byWrappedMint = assetByWrappedMint(wrappers);
  const byPrestockMint = new Map(prestocks.map((p) => [p.mint, p]));
  return toLiveAgent(agent, byWrappedMint, byPrestockMint);
}
