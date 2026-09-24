"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Lock, Wallet } from "@phosphor-icons/react";
import {
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
} from "@solana/kit";
import { useWalletSession } from "@solana/react-hooks";

import {
  buildBuyAgentTx,
  buildSellAgentTx,
  buildUnstakeTx,
  buildWrapTx,
  getAgentTradeInfo,
  quoteAgentTrade,
  submitTx,
} from "@/app/actions";
import { Icon } from "@/components/ui/icon";
import { Presets } from "@/components/ui/presets";
import { compactNumber } from "@/lib/format";
import { useServerData } from "@/lib/use-server-data";
import { describeWalletError, useWalletUi } from "@/lib/wallet";
import {
  USDC,
  USDC_DECIMALS,
  jupiterQuote,
  jupiterSwapTransaction,
  signAndSendJupiter,
  type JupiterSigner,
} from "@/lib/jupiter";
import type { AgentTradeInfo, BuildTxResult, SellPayout, TradeQuote } from "@/lib/portfolio";

/**
 * The `$AGENT` buy box and sell box — items 1–4 of the build queue.
 *
 * The panel the agent page used to carry traded the *underlying PreStock*. This
 * one trades the agent's own token on its Meteora DBC curve, and the two product
 * decisions are wired into the transaction rather than left to the buyer:
 *
 *   1. buying is a DBC swap, metered in `wPreStock`;
 *   2. the buy can be paid for in USDC, routed USDC → PreStock → wrap → buy;
 *   3. the bought `$AGENT` is auto-staked in the same transaction (item 3);
 *   4. a sale can settle as `wPreStock`, raw `PreStock`, or USDC (item 4).
 *
 * Multi-transaction routes (USDC buy, USDC sell) run each leg in order and report
 * the signature of every one, so "one flow" never means "one opaque signature".
 */
type Side = "buy" | "sell";
type PayWith = "wprestock" | "usdc";

type QuoteState =
  | { k: "idle" }
  | { k: "loading" }
  | { k: "ready"; quote: TradeQuote; usdcRoute?: string[]; usdcOut?: string }
  | { k: "error"; error: string };

type RouteStep = { label: string; signature?: string };
type RouteState =
  | { k: "idle" }
  | { k: "running"; steps: RouteStep[]; index: number }
  | { k: "done"; steps: RouteStep[] }
  | { k: "error"; steps: RouteStep[]; error: string };

const human = (raw: bigint | string, decimals: number) => Number(raw) / 10 ** decimals;

const fmt = (raw: bigint | string, decimals: number, max = 6) => {
  const n = human(raw, decimals);
  if (!Number.isFinite(n) || n === 0) return "0";
  if (Math.abs(n) >= 1e6) return compactNumber(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: max });
};

const toRaw = (text: string, decimals: number): bigint | null => {
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return null;
  return BigInt(Math.floor(n * 10 ** decimals));
};

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function AgentTrade({
  agentId,
  ticker,
  asset: assetProp,
}: {
  agentId: string;
  ticker: string;
  /** The PreStocks symbol the vault pays out in, e.g. OPENAI. */
  asset: string;
}) {
  const { address, isReady } = useWalletUi();
  const session = useWalletSession();

  const [nonce, setNonce] = useState(0);
  const info = useServerData(`${address ?? "anon"}:${agentId}:${nonce}`, () =>
    getAgentTradeInfo(address, agentId),
  );
  const data: AgentTradeInfo | null = info.status === "ready" ? info.data : null;
  // The server resolves a short label for a quote asset that is not in the
  // issuer's universe (a devnet mock), so prefer its answer to the prop.
  const asset = data?.asset ?? assetProp;

  const [side, setSide] = useState<Side>("buy");
  const [payWith, setPayWith] = useState<PayWith>("wprestock");
  const [payout, setPayout] = useState<SellPayout>("wprestock");
  const [autoStake, setAutoStake] = useState(true);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<QuoteState>({ k: "idle" });
  const [route, setRoute] = useState<RouteState>({ k: "idle" });

  const wSymbol = `w${asset}`;
  const buyInputDecimals = payWith === "usdc" ? USDC_DECIMALS : (data?.quoteDecimals ?? 9);
  const inputDecimals = side === "buy" ? buyInputDecimals : (data?.baseDecimals ?? 6);
  const outDecimals = side === "buy" ? (data?.baseDecimals ?? 6) : (data?.quoteDecimals ?? 9);
  const outLabel = side === "buy" ? ticker : wSymbol;

  const busy = route.k === "running";
  const actionLabel = side === "buy" ? `Buy ${ticker}` : `Sell ${ticker}`;

  // Reset the route when the user changes their mind mid-flight.
  useEffect(() => {
    setRoute({ k: "idle" });
  }, [side, payWith, payout, autoStake]);

  const raw = useMemo(() => toRaw(amount, inputDecimals), [amount, inputDecimals]);

  // Quote on a debounce. USDC buys quote the Jupiter leg first, then size the
  // DBC leg from the PreStock that leg would deliver.
  useEffect(() => {
    if (!data?.poolExists || raw === null) {
      setQuote({ k: "idle" });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setQuote({ k: "loading" });
      try {
        if (side === "buy" && payWith === "usdc") {
          if (!data.prestockMint) throw new Error("No PreStock mint for this agent.");
          const j = await jupiterQuote(USDC, data.prestockMint, raw.toString(), 100, controller.signal);
          const r = await quoteAgentTrade(agentId, "buy", j.outAmount);
          if ("error" in r) throw new Error(r.error);
          setQuote({ k: "ready", quote: r.quote, usdcRoute: j.route, usdcOut: j.outAmount });
        } else {
          const r = await quoteAgentTrade(agentId, side, raw.toString());
          if ("error" in r) throw new Error(r.error);
          setQuote({ k: "ready", quote: r.quote });
        }
      } catch (e) {
        if (!controller.signal.aborted) setQuote({ k: "error", error: msg(e) });
      }
    }, 400);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [raw, side, payWith, agentId, data?.poolExists, data?.prestockMint]);

  // -------------------------------------------------------------------------
  // The route runner. Each leg signs, sends, and records a signature.
  // -------------------------------------------------------------------------
  const sendBuilt = useCallback(
    async (build: () => Promise<BuildTxResult>): Promise<string> => {
      if (!session?.signTransaction) throw new Error("This wallet cannot sign in the browser.");
      const built = await build();
      if ("error" in built) throw new Error(built.error);
      const decoded = getTransactionDecoder().decode(getBase64Encoder().encode(built.tx));
      const signed = await session.signTransaction(decoded as never);
      const wire = getBase64EncodedWireTransaction(signed as never);
      const res = await submitTx(wire);
      if ("error" in res) throw new Error(res.error);
      return res.signature;
    },
    [session],
  );

  const sendJupiter = useCallback(
    async (inputMint: string, outputMint: string, amountRaw: bigint): Promise<string> => {
      if (!session) throw new Error("No wallet session.");
      const q = await jupiterQuote(inputMint, outputMint, amountRaw.toString());
      const tx = await jupiterSwapTransaction(q.raw, address as string);
      return signAndSendJupiter(session as unknown as JupiterSigner, tx);
    },
    [session, address],
  );

  const runRoute = useCallback(
    async (labels: string[], run: (step: (label: string, fn: () => Promise<string>) => Promise<void>) => Promise<void>) => {
      setRoute({ k: "running", steps: labels.map((label) => ({ label })), index: 0 });
      const steps: RouteStep[] = labels.map((label) => ({ label }));
      let i = 0;
      const step = async (label: string, fn: () => Promise<string>) => {
        setRoute({ k: "running", steps: [...steps], index: i });
        const signature = await fn();
        steps[i] = { label, signature };
        i += 1;
        setRoute({ k: "running", steps: [...steps], index: i });
      };
      try {
        await run(step);
        setRoute({ k: "done", steps: [...steps] });
        setNonce((n) => n + 1);
      } catch (e) {
        setRoute({ k: "error", steps: [...steps], error: describeWalletError(e) });
      }
    },
    [],
  );

  const onBuy = useCallback(() => {
    if (!address || !data || raw === null) return;
    const stake = autoStake;
    if (payWith === "wprestock") {
      void runRoute([`Buy ${ticker}${stake ? " + stake" : ""}`], async (step) => {
        await step(`Buy ${ticker}${stake ? " + stake" : ""}`, () =>
          sendBuilt(() => buildBuyAgentTx(address, agentId, raw.toString(), stake)),
        );
      });
      return;
    }
    if (!data.prestockMint) return;
    void runRoute(
      [`Route USDC → ${asset}`, `Wrap ${asset} → ${wSymbol}`, `Buy ${ticker}${stake ? " + stake" : ""}`],
      async (step) => {
        await step(`Route USDC → ${asset}`, () =>
          sendJupiter(USDC, data.prestockMint as string, raw),
        );
        const afterRoute = await getAgentTradeInfo(address, agentId);
        const prestock = BigInt(afterRoute.balances.prestock);
        if (prestock <= 0n) throw new Error(`No ${asset} arrived to wrap.`);
        await step(`Wrap ${asset} → ${wSymbol}`, () =>
          sendBuilt(() => buildWrapTx(address, data.prestockMint as string, prestock.toString())),
        );
        const afterWrap = await getAgentTradeInfo(address, agentId);
        const wrapped = BigInt(afterWrap.balances.wrapped);
        if (wrapped <= 0n) throw new Error(`No ${wSymbol} arrived to trade.`);
        await step(`Buy ${ticker}${stake ? " + stake" : ""}`, () =>
          sendBuilt(() => buildBuyAgentTx(address, agentId, wrapped.toString(), stake)),
        );
      },
    );
  }, [address, agentId, autoStake, data, payWith, raw, runRoute, sendBuilt, sendJupiter, ticker, wSymbol, asset]);

  const onSell = useCallback(() => {
    if (!address || !data || raw === null) return;
    const liquid = BigInt(data.balances.liquidAgent);
    const staked = BigInt(data.balances.stakedAgent);
    let unstake = 0n;
    if (liquid < raw) {
      const short = raw - liquid;
      if (staked < short) {
        setRoute({
          k: "error",
          steps: [],
          error: `Not enough ${ticker}: liquid ${fmt(liquid, data.baseDecimals)} + staked ${fmt(
            staked,
            data.baseDecimals,
          )} is short of ${amount}.`,
        });
        return;
      }
      unstake = short;
    }

    const payoutLabel =
      payout === "wprestock" ? `Sell ${ticker} → ${wSymbol}` : `Sell ${ticker} → ${asset}`;
    const labels = [
      ...(unstake > 0n ? ["Unstake $AGENT"] : []),
      payoutLabel,
      ...(payout === "usdc" ? [`Route ${asset} → USDC`] : []),
    ];

    void runRoute(labels, async (step) => {
      if (unstake > 0n) {
        await step("Unstake $AGENT", () =>
          sendBuilt(() => buildUnstakeTx(address, agentId, unstake.toString())),
        );
      }
      const before = await getAgentTradeInfo(address, agentId);
      await step(payoutLabel, () =>
        sendBuilt(() =>
          buildSellAgentTx(address, agentId, raw.toString(), payout === "usdc" ? "prestock" : payout),
        ),
      );
      if (payout === "usdc") {
        if (!data.prestockMint) throw new Error("No PreStock mint for this agent.");
        const after = await getAgentTradeInfo(address, agentId);
        const proceeds =
          BigInt(after.balances.prestock) - BigInt(before.balances.prestock);
        if (proceeds <= 0n) throw new Error(`No ${asset} proceeds arrived to route.`);
        await step(`Route ${asset} → USDC`, () => sendJupiter(data.prestockMint as string, USDC, proceeds));
      }
    });
  }, [address, agentId, amount, data, payout, raw, runRoute, sendBuilt, sendJupiter, ticker, wSymbol, asset]);

  /** Fill the amount with a share of whatever the wallet is spending. */
  const onPct = (pct: number) => {
    if (!data) return;
    if (side === "sell") {
      const bal = BigInt(data.balances.liquidAgent) + BigInt(data.balances.stakedAgent);
      setAmount(String(human((bal * BigInt(pct)) / 100n, data.baseDecimals)));
    } else if (payWith === "wprestock") {
      const bal = BigInt(data.balances.wrapped);
      setAmount(String(human((bal * BigInt(pct)) / 100n, data.quoteDecimals)));
    }
  };

  const routeStepState = (i: number): "pending" | "done" | "failed" | "active" => {
    if (route.k === "idle") return "pending";
    if (route.k === "done") return "done";
    if (route.k === "error") {
      const doneUpTo = route.steps.findIndex((s) => !s.signature);
      if (doneUpTo === -1) return "done";
      return i < doneUpTo ? "done" : i === doneUpTo ? "failed" : "pending";
    }
    if (i < route.index) return "done";
    return i === route.index ? "active" : "pending";
  };

  return (
    <div className="panel flex flex-col">
      <div className="grid grid-cols-2 border-b border-edge">
        {(["buy", "sell"] as Side[]).map((s) => (
          <button
            key={s}
            onClick={() => {
              setSide(s);
              setAmount("");
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
        <div className="flex items-baseline justify-between gap-4">
          <span className="label">Trade ${ticker}</span>
          <span className="flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
            <Icon icon={Lock} size={13} dither={false} />
            {data?.poolExists ? "Live pool" : "no pool"}
          </span>
        </div>

        {/* Pay-with (buy) / payout (sell) selectors */}
        {side === "buy" ? (
          <Segmented
            value={payWith}
            onChange={(v) => setPayWith(v as PayWith)}
            options={[
              { value: "wprestock", label: `Pay ${wSymbol}` },
              { value: "usdc", label: "Pay USDC" },
            ]}
          />
        ) : (
          <Segmented
            value={payout}
            onChange={(v) => setPayout(v as SellPayout)}
            options={[
              { value: "wprestock", label: `Hold ${wSymbol}` },
              { value: "prestock", label: `Get ${asset}` },
              { value: "usdc", label: "Get USDC" },
            ]}
          />
        )}

        <label className="flex flex-col gap-2">
          <span className="flex items-center justify-between gap-3">
            <span className="label">
              You pay ({side === "buy" ? (payWith === "usdc" ? "USDC" : wSymbol) : ticker})
            </span>
            {!(side === "buy" && payWith === "usdc") && (
              <Presets onPick={onPct} disabled={busy || !data} />
            )}
          </span>
          <input
            value={amount}
            disabled={busy}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="0"
            className="tabular w-full border-b border-edge bg-transparent pb-2 font-mono text-2xl text-ink outline-none focus:border-signal disabled:opacity-60"
          />
        </label>

        <div className="flex items-baseline justify-between gap-4">
          <span className="label">You receive ({outLabel})</span>
          <span className="tabular truncate font-mono text-lg text-signal">
            {quote.k === "ready"
              ? fmt(quote.quote.outAmount, outDecimals)
              : quote.k === "loading"
                ? "…"
                : "0"}
          </span>
        </div>

        {quote.k === "ready" && (
          <>
            <Row k="Price" v={`${quote.quote.price.toLocaleString(undefined, { maximumSignificantDigits: 6 })} ${wSymbol} / ${ticker}`} />
            {quote.usdcRoute && (
              <Row k="USDC route" v={quote.usdcRoute.join(" → ") || "n/a"} />
            )}
            {side === "sell" && payout !== "wprestock" && (
              <Row k="Settlement" v={`unwrapped to ${asset} in the same transaction`} />
            )}
            {side === "buy" && autoStake && (
              <Row k="Auto-stake" v="on, staked in the same transaction" />
            )}
            <Row
              k="Curve fee"
              v={fmt(quote.quote.tradingFee, quote.quote.quoteDecimals)}
            />
          </>
        )}

        {quote.k === "error" && (
          <p className="font-mono text-[0.6875rem] leading-relaxed text-ember">{quote.error}</p>
        )}

        {!data?.poolExists && info.status !== "loading" && (
          <div className="border border-ember/30 bg-ember/[0.06] px-4 py-3">
            <p className="text-sm leading-relaxed text-ink-dim">
              <span className="text-ember">No live pool yet.</span> This agent&apos;s pool is not
              deployed on this cluster, so there is nothing to quote against.
            </p>
          </div>
        )}

        {/* Auto-stake toggle (buy only) */}
        {side === "buy" && (
          <button
            type="button"
            onClick={() => setAutoStake((v) => !v)}
            className="flex items-center justify-between border border-edge bg-void px-4 py-3 text-left"
          >
            <span className="flex flex-col gap-0.5">
              <span className="label">Auto-stake on purchase</span>
            </span>
            <span
              className={`ml-4 h-5 w-9 shrink-0 rounded-full border transition-colors ${
                autoStake ? "border-signal bg-signal/25" : "border-edge bg-raised"
              }`}
            >
              <span
                className={`block size-4 translate-y-[1px] rounded-full transition-transform ${
                  autoStake ? "translate-x-[17px] bg-signal" : "translate-x-[2px] bg-ink-faint"
                }`}
              />
            </span>
          </button>
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
            onClick={side === "buy" ? onBuy : onSell}
            disabled={busy || raw === null || !data?.poolExists}
            className="btn btn-primary w-full disabled:opacity-50"
          >
            {busy
              ? route.k === "running" && route.index < route.steps.length
                ? `${route.steps[route.index]?.label ?? "Working"}…`
                : "Working…"
              : actionLabel}
          </button>
        )}

        {/* Route progress */}
        {route.k !== "idle" && (
          <div className="flex flex-col gap-2 border-t border-edge pt-4">
            {route.steps.map((s, i) => {
              const state = routeStepState(i);
              return (
                <div key={`${s.label}-${i}`} className="flex items-center justify-between gap-3">
                  <span
                    className={`truncate font-mono text-xs ${
                      state === "failed" ? "text-ember" : state === "pending" ? "text-ink-faint" : "text-ink"
                    }`}
                  >
                    {state === "active" ? "◐ " : state === "done" ? "● " : state === "failed" ? "✕ " : "○ "}
                    {s.label}
                  </span>
                  {s.signature && (
                    <a
                      href={`https://solscan.io/tx/${s.signature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex shrink-0 items-center gap-1 font-mono text-[0.625rem] text-signal"
                    >
                      {s.signature.slice(0, 8)}… <ArrowUpRight size={11} />
                    </a>
                  )}
                </div>
              );
            })}
            {route.k === "error" && (
              <p className="text-xs leading-relaxed text-ember">{route.error}</p>
            )}
          </div>
        )}

        {/* Wallet balances */}
        {address && (
          <div className="flex flex-col gap-3 border-t border-edge pt-4">
            <span className="label">Your balances</span>
            {info.status === "loading" ? (
              <div className="grid grid-cols-2 gap-px border border-edge bg-edge">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-[4.5rem] animate-pulse bg-raised ${i < 2 ? "col-span-2" : ""}`}
                  />
                ))}
              </div>
            ) : data?.onChain ? (
              <div className="grid grid-cols-2 gap-px border border-edge bg-edge">
                <BalanceCell
                  className="col-span-2"
                  label={`Liquid ${ticker}`}
                  value={fmt(data.balances.liquidAgent, data.baseDecimals)}
                />
                <BalanceCell
                  className="col-span-2"
                  label={`Staked ${ticker}`}
                  value={fmt(data.balances.stakedAgent, data.baseDecimals)}
                />
                <BalanceCell label={wSymbol} value={fmt(data.balances.wrapped, data.quoteDecimals)} />
                <BalanceCell label={asset} value={fmt(data.balances.prestock, data.quoteDecimals)} />
              </div>
            ) : null}
          </div>
        )}

        <p className="flex items-start gap-2 font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
          <Icon icon={Wallet} size={14} dither={false} />
          <span>Each step is signed in your wallet.</span>
        </p>
      </div>
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="grid border border-edge" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-2 py-2 font-mono text-[0.6875rem] tracking-[0.08em] uppercase transition-colors ${
            value === o.value ? "bg-raised text-signal" : "text-ink-faint hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
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

/** A single bordered balance cell — the figure carries the cell. */
function BalanceCell({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 bg-void p-4 ${className}`}>
      <span className="label">{label}</span>
      <span className="tabular font-mono text-xl leading-none text-ink">{value}</span>
    </div>
  );
}
