"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import { useWalletSession } from "@solana/react-hooks";

import {
  USDC,
  USDC_DECIMALS,
  jupiterQuote,
  jupiterSwapTransaction,
  signAndSendJupiter,
  type JupiterQuote,
  type JupiterSigner,
} from "@/lib/jupiter";
import { useWalletUi, describeWalletError } from "@/lib/wallet";

/**
 * Swap module with real signing.
 *
 * The whole path is live: a Jupiter quote for the PreStock on one side, a
 * versioned transaction on the other, signed by the connected wallet. Jupiter
 * returns a v0 transaction with address lookup tables, and kit's decoder hands
 * that to the wallet session untouched — the message stays opaque, which is
 * exactly why the wallet can check and sign it without us ever holding a key.
 *
 * Nothing here is a simulation of a swap; it is a swap. What it is not is
 * *guaranteed* — routes and slippage move, and an unfunded wallet gets a
 * quote and then a failed send.
 */
type Status =
  | { kind: "idle" }
  | { kind: "quoting" }
  | {
      kind: "ready";
      out: string;
      route: string[];
      priceImpactPct: number;
      /** The raw quote, kept so the swap call sends back exactly what was shown. */
      quote: JupiterQuote;
    }
  | { kind: "signing" }
  | { kind: "sending" }
  | { kind: "done"; signature: string }
  | { kind: "error"; message: string };

export function Swap({
  symbol,
  mint,
  decimals = 9,
}: {
  symbol: string;
  mint: string;
  decimals?: number;
}) {
  const { address, isReady } = useWalletUi();
  const session = useWalletSession();

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("100");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const inputMint = side === "buy" ? USDC : mint;
  const outputMint = side === "buy" ? mint : USDC;
  const inputDecimals = side === "buy" ? USDC_DECIMALS : decimals;
  const raw = useMemo(() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return null;
    return BigInt(Math.floor(n * 10 ** inputDecimals));
  }, [amount, inputDecimals]);

  // Quote as you type. 400ms is long enough to skip the intermediate keystrokes
  // of a number and short enough that the figure feels attached to the field.
  useEffect(() => {
    if (raw === null) {
      setStatus({ kind: "idle" });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus({ kind: "quoting" });
      try {
        const q = await jupiterQuote(inputMint, outputMint, raw, 100, controller.signal);
        setStatus({
          kind: "ready",
          out: q.outAmount,
          route: q.route,
          priceImpactPct: q.priceImpactPct,
          quote: q,
        });
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setStatus({ kind: "error", message: e?.message ?? "quote failed" });
      }
    }, 400);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [raw, inputMint, outputMint]);

  const display = (v: string, d: number) =>
    (Number(v) / 10 ** d).toLocaleString(undefined, { maximumFractionDigits: 6 });

  const onSwap = async () => {
    if (!session || raw === null || status.kind !== "ready") return;

    // Not every Wallet Standard wallet implements both features. Saying so is
    // better than a `undefined is not a function` in a signature prompt.
    if (!session.signTransaction || !session.sendTransaction) {
      setStatus({
        kind: "error",
        message: `${session.connector.name} does not support signing transactions in this browser.`,
      });
      return;
    }

    const quote = status.quote;
    setStatus({ kind: "signing" });

    try {
      const swapTransaction = await jupiterSwapTransaction(quote.raw, address as string);
      setStatus({ kind: "sending" });
      const signature = await signAndSendJupiter(session as unknown as JupiterSigner, swapTransaction);
      setStatus({ kind: "done", signature });
    } catch (e) {
      setStatus({ kind: "error", message: describeWalletError(e) });
    }
  };

  const busy =
    status.kind === "signing" || status.kind === "sending" || status.kind === "quoting";
  const outLabel = side === "buy" ? symbol : "USDC";
  const outDecimals = side === "buy" ? decimals : USDC_DECIMALS;

  return (
    <div className="panel flex flex-col">
      <div className="grid grid-cols-2 border-b border-edge">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              setSide(s);
              setStatus({ kind: "idle" });
            }}
            className={`py-3 font-mono text-xs tracking-[0.18em] uppercase transition-colors ${
              side === s ? "bg-raised text-signal" : "text-ink-faint hover:text-ink"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-5 p-6">
        <label className="flex flex-col gap-2">
          <span className="label">{side === "buy" ? "You pay (USDC)" : `You pay (${symbol})`}</span>
          <input
            value={amount}
            disabled={busy}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            className="tabular w-full border-b border-edge bg-transparent pb-2 font-mono text-2xl text-ink outline-none focus:border-signal disabled:opacity-60"
            placeholder="0"
          />
        </label>

        <div className="flex items-baseline justify-between gap-4">
          <span className="label">You receive ({outLabel})</span>
          <span className="tabular truncate font-mono text-lg text-signal">
            {status.kind === "ready"
              ? display(status.out, outDecimals)
              : status.kind === "quoting"
                ? "…"
                : "—"}
          </span>
        </div>

        {status.kind === "ready" && (
          <>
            <Row k="Route" v={status.route.join(" → ") || "—"} />
            <Row k="Price impact" v={`${(status.priceImpactPct * 100).toFixed(3)}%`} />
          </>
        )}

        {/* Action */}
        {!isReady ? (
          <button disabled className="btn btn-primary w-full opacity-50">
            Loading wallet…
          </button>
        ) : !address ? (
          <a href="/connect" className="btn btn-primary w-full">
            Connect wallet
          </a>
        ) : (
          <button
            onClick={() => void onSwap()}
            disabled={busy || status.kind !== "ready"}
            className="btn btn-primary w-full disabled:opacity-50"
          >
            {status.kind === "signing"
              ? "Confirm in wallet…"
              : status.kind === "sending"
                ? "Sending…"
                : status.kind === "quoting"
                  ? "Quoting…"
                  : `Swap for ${outLabel}`}
          </button>
        )}

        {status.kind === "done" && (
          <div className="border border-signal-dim/40 bg-signal/[0.04] px-4 py-3">
            <span className="label">Confirmed</span>
            <a
              href={`https://solscan.io/tx/${status.signature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 flex items-center gap-1.5 font-mono text-xs break-all text-signal"
            >
              {status.signature.slice(0, 24)}… <ArrowUpRight size={12} />
            </a>
          </div>
        )}

        {status.kind === "error" && (
          <div className="border border-ember/30 bg-ember/[0.06] px-4 py-3">
            <p className="text-sm leading-relaxed text-ink-dim">
              <span className="text-ember">Swap failed.</span> {status.message}
            </p>
          </div>
        )}

        <p className="font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
          Quoted and routed through Jupiter on Solana. The route shown is the real one; the swap is
          signed by your wallet.
        </p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="label shrink-0">{k}</span>
      <span className="truncate font-mono text-xs text-ink-faint">{v}</span>
    </div>
  );
}
