/**
 * The devnet faucet — server-signed test tokens for beta testers.
 *
 * A tester should be able to use their **own** wallet, not import ours. This is
 * the standard testnet-faucet pattern: the server holds a keypair, and on request
 * it sends the connected wallet enough to actually use the product —
 *
 *   - a little SOL, to pay transaction fees and rent;
 *   - mock PreStock, the Token-2022 asset with the real transfer-fee extensions;
 *   - wPreStock, the zero-fee wrapper, which is what the `$AGENT` buy box quotes.
 *
 * The wallet signature path is untouched: the tester still signs their own trades,
 * stakes and launches. The faucet only removes the "I have no tokens" wall.
 *
 * **Safety.** The faucet key never reaches the browser. It defaults to the deploy
 * wallet because that wallet is the mint authority for the mock PreStocks; for a
 * public beta, set `FAUCET_KEYPAIR` to a dedicated wallet and give *that* wallet
 * the mint authority (or fund it with a stock of PreStock/wPreStock) so the
 * upgrade authority is not the hot key. Everything here is devnet-gated: on a
 * mainnet `PROGRAM_RPC_URL` the action refuses before touching a key.
 *
 * Cooldown state is in-process and best-effort — it resets on redeploy. It is a
 * courtesy limit, not a security boundary; the real boundary is the funding
 * wallet's balance, which is why the low-water check exists.
 */
import fs from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import { PROGRAM_RPC_URL, fetchWrappers } from "./chain";
import { buildWrapTransaction } from "./program-tx";

const ONE = 10n ** 9n;
/** Whole tokens, human units. */
const STOCK_PER_REQUEST = 10n * ONE;
/** Replenish the quote stock when the faucet wallet drops below this. */
const QUOTE_LOW_WATER = 40n * ONE;
const SOL_PER_REQUEST = 500_000_000; // 0.5 SOL
const SOL_BELOW = 100_000_000; // top up under 0.1 SOL
const PROVIDER_FLOOR = 1_000_000_000; // never drain the faucet wallet below 1 SOL
const COOLDOWN_MS = 10 * 60_000;

export type FaucetResult = { signature: string } | { error: string };

/** Best-effort, in-process. Resets on redeploy. */
const lastDrop = new Map<string, number>();

export function faucetEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_DEVNET_FAUCET !== "false" && PROGRAM_RPC_URL.includes("devnet")
  );
}

/**
 * The faucet's signing key. An inline secret wins: a deployed server has no
 * keypair file, and the host's env vars are its only secret store. Accepts the
 * JSON array a `solana-keygen` file holds, or the base58 secret-key form.
 */
function faucetKeypair(): Keypair | null {
  const inline = process.env.FAUCET_SECRET_KEY?.trim();
  if (inline) {
    try {
      const bytes = inline.startsWith("[")
        ? Uint8Array.from(JSON.parse(inline) as number[])
        : base58Decode(inline);
      return Keypair.fromSecretKey(bytes);
    } catch {
      return null;
    }
  }

  const file =
    process.env.FAUCET_KEYPAIR ??
    process.env.ANCHOR_WALLET ??
    `${process.env.HOME}/.config/solana/id.json`;
  try {
    return Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))),
    );
  } catch {
    return null;
  }
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(s: string): Uint8Array {
  const bytes: number[] = [0];
  for (const ch of s) {
    let carry = B58.indexOf(ch);
    if (carry < 0) throw new Error("invalid base58");
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const ch of s) {
    if (ch !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

type DemoAsset = { agent?: string; prestockMint: string; wrappedMint: string };

/**
 * Every mock PreStock the faucet can hand out.
 *
 * The old single-asset version funded *one* wrapper — whichever
 * `.devnet-demo.json` named, or the first registered agent's. The launch and
 * trade surfaces list **every** wrapper on the cluster, so a tester who picked a
 * different asset got a wallet with none of the token that asset's curve is
 * quoted in; the buy then failed inside the SPL token program with
 * `custom program error: 0x1` ("insufficient funds"), which the old error mapper
 * reported as "not enough SOL". Funding the whole set removes the mismatch:
 * whichever asset the tester picks, the quote token is already there.
 */
async function resolveAssets(): Promise<DemoAsset[]> {
  const wrappers = await fetchWrappers();
  const seen = new Set<string>();
  const out: DemoAsset[] = [];
  for (const w of wrappers) {
    if (!w.prestockMint || !w.wrappedMint || seen.has(w.wrappedMint)) continue;
    seen.add(w.wrappedMint);
    out.push({ prestockMint: w.prestockMint, wrappedMint: w.wrappedMint });
  }
  return out;
}

/**
 * Keep the faucet wallet holding enough wPreStock to hand out. It mints fresh
 * mock PreStock (it is the mint authority) and wraps it, which is exactly the
 * product's own invariant — the wrapper mints against the measured reserve, so a
 * faucet top-up cannot create unbacked supply.
 */
async function ensureQuoteStock(
  conn: Connection,
  provider: Keypair,
  prestockMint: string,
  wrappedMint: string,
): Promise<void> {
  const prestock = new PublicKey(prestockMint);
  const wrapped = new PublicKey(wrappedMint);
  const providerRaw = getAssociatedTokenAddressSync(
    prestock,
    provider.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  const providerWrapped = getAssociatedTokenAddressSync(
    wrapped,
    provider.publicKey,
    false,
    TOKEN_PROGRAM_ID,
  );

  let balance = 0n;
  try {
    balance = BigInt((await conn.getTokenAccountBalance(providerWrapped)).value.amount);
  } catch {
    balance = 0n;
  }
  if (balance >= QUOTE_LOW_WATER) return;

  const need = QUOTE_LOW_WATER * 2n - balance;

  const mintTx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      provider.publicKey,
      providerRaw,
      provider.publicKey,
      prestock,
      TOKEN_2022_PROGRAM_ID,
    ),
    createMintToInstruction(
      prestock,
      providerRaw,
      provider.publicKey,
      need,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );
  const mintLatest = await conn.getLatestBlockhash("confirmed");
  mintTx.feePayer = provider.publicKey;
  mintTx.recentBlockhash = mintLatest.blockhash;
  mintTx.sign(provider);
  const mintSig = await conn.sendRawTransaction(mintTx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction(
    {
      signature: mintSig,
      blockhash: mintLatest.blockhash,
      lastValidBlockHeight: mintLatest.lastValidBlockHeight,
    },
    "confirmed",
  );

  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const wrapTx = await buildWrapTransaction(
    provider.publicKey.toBase58(),
    prestockMint,
    need,
    blockhash,
  );
  wrapTx.sign(provider);
  const wrapSig = await conn.sendRawTransaction(wrapTx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction(wrapSig, "confirmed");
}

export async function faucet(owner: string): Promise<FaucetResult> {
  if (!faucetEnabled()) {
    return { error: "The devnet faucet is off on this cluster." };
  }

  const provider = faucetKeypair();
  if (!provider) {
    return { error: "The faucet has no keypair configured (set FAUCET_SECRET_KEY)." };
  }

  let ownerKey: PublicKey;
  try {
    ownerKey = new PublicKey(owner);
  } catch {
    return { error: "That is not a valid wallet address." };
  }

  const now = Date.now();
  const last = lastDrop.get(ownerKey.toBase58()) ?? 0;
  if (now - last < COOLDOWN_MS) {
    const minutes = Math.ceil((COOLDOWN_MS - (now - last)) / 60_000);
    return { error: `This wallet already got tokens — try again in ~${minutes} min.` };
  }

  try {
    const assets = await resolveAssets();
    if (assets.length === 0) return { error: "No devnet mock assets are configured yet." };

    const conn = new Connection(PROGRAM_RPC_URL, "confirmed");
    if ((await conn.getBalance(provider.publicKey)) < PROVIDER_FLOOR + SOL_PER_REQUEST) {
      return { error: "The faucet wallet is low on SOL." };
    }

    // The SOL leg is sent once, with the first asset that lands.
    let needsSol = (await conn.getBalance(ownerKey)) < SOL_BELOW;
    let signature = "";
    let funded = 0;

    for (const asset of assets) {
      try {
        await ensureQuoteStock(conn, provider, asset.prestockMint, asset.wrappedMint);

        const prestock = new PublicKey(asset.prestockMint);
        const wrapped = new PublicKey(asset.wrappedMint);
        const ownerRaw = getAssociatedTokenAddressSync(
          prestock,
          ownerKey,
          false,
          TOKEN_2022_PROGRAM_ID,
        );
        const ownerWrapped = getAssociatedTokenAddressSync(
          wrapped,
          ownerKey,
          false,
          TOKEN_PROGRAM_ID,
        );
        const providerWrapped = getAssociatedTokenAddressSync(
          wrapped,
          provider.publicKey,
          false,
          TOKEN_PROGRAM_ID,
        );

        const tx = new Transaction();
        if (needsSol) {
          tx.add(
            SystemProgram.transfer({
              fromPubkey: provider.publicKey,
              toPubkey: ownerKey,
              lamports: SOL_PER_REQUEST,
            }),
          );
          needsSol = false;
        }
        tx.add(
          createAssociatedTokenAccountIdempotentInstruction(
            provider.publicKey,
            ownerRaw,
            ownerKey,
            prestock,
            TOKEN_2022_PROGRAM_ID,
          ),
          createAssociatedTokenAccountIdempotentInstruction(
            provider.publicKey,
            ownerWrapped,
            ownerKey,
            wrapped,
            TOKEN_PROGRAM_ID,
          ),
          createMintToInstruction(
            prestock,
            ownerRaw,
            provider.publicKey,
            STOCK_PER_REQUEST,
            [],
            TOKEN_2022_PROGRAM_ID,
          ),
          createTransferInstruction(
            providerWrapped,
            ownerWrapped,
            provider.publicKey,
            STOCK_PER_REQUEST,
            [],
            TOKEN_PROGRAM_ID,
          ),
        );

        const latest = await conn.getLatestBlockhash("confirmed");
        tx.feePayer = provider.publicKey;
        tx.recentBlockhash = latest.blockhash;
        tx.sign(provider);

        signature = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
        await conn.confirmTransaction(
          {
            signature,
            blockhash: latest.blockhash,
            lastValidBlockHeight: latest.lastValidBlockHeight,
          },
          "confirmed",
        );
        funded += 1;
      } catch {
        // One odd wrapper (paused, wrong authority) must not sink the rest.
        continue;
      }
    }

    if (funded === 0) return { error: "The faucet could not fund any asset on this cluster." };

    lastDrop.set(ownerKey.toBase58(), now);
    return { signature };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
