/**
 * Jupiter, from the browser.
 *
 * The USDC legs of the trade flow (USDC → PreStock on buy, PreStock → USDC on
 * sell) go through Jupiter because it is the only venue that routes the raw
 * PreStock, and it is **mainnet-only**. Everything here therefore runs
 * client-side with the connected wallet's signature; the DBC legs, which are
 * cluster-agnostic, are built server-side in `lib/trade.ts`.
 *
 * Shared with `components/app/swap.tsx` so there is exactly one Jupiter URL, one
 * quote shape, and one place to change when the API moves.
 */
import { getBase64Encoder, getTransactionDecoder } from "@solana/kit";

const QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
const SWAP_URL = "https://lite-api.jup.ag/swap/v1/swap";

export const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;

export type JupiterQuote = {
  /** Raw output units, as Jupiter reports them. */
  outAmount: string;
  route: string[];
  priceImpactPct: number;
  /** The untouched quote, sent back verbatim when building the swap. */
  raw: unknown;
};

export async function jupiterQuote(
  inputMint: string,
  outputMint: string,
  amountRaw: string | bigint,
  slippageBps = 100,
  signal?: AbortSignal,
): Promise<JupiterQuote> {
  const res = await fetch(
    `${QUOTE_URL}?inputMint=${inputMint}&outputMint=${outputMint}` +
      `&amount=${amountRaw}&slippageBps=${slippageBps}`,
    { signal },
  );
  if (!res.ok) throw new Error(`no route (${res.status})`);
  const q = await res.json();
  if (!q.outAmount) throw new Error("no route for this pair");
  return {
    outAmount: String(q.outAmount),
    route: (q.routePlan ?? []).map((s: any) => s.swapInfo?.label).filter(Boolean),
    priceImpactPct: Number(q.priceImpactPct ?? 0),
    raw: q,
  };
}

/** Build the unsigned swap transaction for a quote. Returns base64. */
export async function jupiterSwapTransaction(quote: unknown, userPublicKey: string): Promise<string> {
  const res = await fetch(SWAP_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    }),
  });
  if (!res.ok) throw new Error(`swap build failed (${res.status})`);
  const { swapTransaction } = await res.json();
  return swapTransaction as string;
}

/** The slice of the wallet session this module needs to sign and send. */
export type JupiterSigner = {
  connector: { name: string };
  signTransaction?: (tx: never) => Promise<never>;
  sendTransaction?: (tx: never) => Promise<unknown>;
};

/**
 * Sign and send a Jupiter-built versioned transaction. The message is decoded
 * with kit and handed to the wallet untouched, so the wallet signs exactly what
 * Jupiter built and we never see a key.
 */
export async function signAndSendJupiter(
  session: JupiterSigner,
  swapTransactionBase64: string,
): Promise<string> {
  if (!session.signTransaction || !session.sendTransaction) {
    throw new Error(`${session.connector.name} does not support signing in this browser.`);
  }
  const decoded = getTransactionDecoder().decode(
    getBase64Encoder().encode(swapTransactionBase64),
  );
  const signed = await session.signTransaction(decoded as never);
  const signature = await session.sendTransaction(signed as never);
  return String(signature);
}
