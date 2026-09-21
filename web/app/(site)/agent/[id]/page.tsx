import Link from "next/link";
import { notFound } from "next/navigation";

import { Basis } from "@/components/app/basis";
import { Curve } from "@/components/app/curve";
import { MarkVsMarket } from "@/components/app/mark-vs-market";
import { Swap } from "@/components/app/swap";
import { Terminal, type TerminalRow } from "@/components/app/terminal";
import { AGENTS, findAgent } from "@/lib/agents";
import { fetchLiveAgentByPda } from "@/lib/chain";
import { shortAddr, usd } from "@/lib/format";
import { FROZEN_AFTER_SECS, fetchAllPreStocks, fetchMarket } from "@/lib/market";

export const revalidate = 30;

export function generateStaticParams() {
  return AGENTS.map((a) => ({ id: a.id }));
}

/**
 * A route id is either a seeded agent slug or an on-chain agent PDA. Seeds win so
 * the staged demo keeps working; anything else is looked up on chain.
 */
async function resolveAgent(id: string) {
  const seed = findAgent(id);
  if (seed) return seed;
  const stocks = await fetchAllPreStocks().catch(() => []);
  return fetchLiveAgentByPda(
    id,
    stocks.map((s) => ({ symbol: s.symbol, mint: s.mint })),
  ).catch(() => null);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await resolveAgent(id);
  return { title: agent ? `${agent.name} · Offhrs` : "Agent · Offhrs" };
}

/** §3 Agent Terminal & Detail. */
export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await resolveAgent(id);
  if (!agent) notFound();

  const market = await fetchMarket(agent.asset).catch(() => null);
  if (!market) {
    return (
      <section className="mx-auto max-w-app px-5 py-20 sm:px-8">
        <p className="font-mono text-sm text-ink-faint">
          Market data unavailable for {agent.asset}. Try again shortly.
        </p>
      </section>
    );
  }

  const { prestock, dex, regime, regimeState, multiplier } = market;
  const frozen = regimeState === "frozen";
  const basisBps = prestock.premiumBps;
  const edge = Math.abs(basisBps);
  const costBps = 600;
  const netBps = edge - costBps;
  const actionable = frozen && netBps > 0 && edge > 150;

  // The terminal is built from the agent's real reasoning over real data. No
  // on-chain execution exists to show yet, so nothing here is dressed up as a
  // fill — `hold` rows say what the agent would do and why.
  const rows: TerminalRow[] = [
    { t: regime.publishTime, kind: "signal", text: `pyth ${regime.feed} → $${(
      regime.price * 10 ** regime.exponent
    ).toFixed(4)}  exp ${regime.exponent}  conf ±${regime.conf}` },
    { t: regime.publishTime, kind: "info", text: `oracle account ${regime.account}` },
    {
      t: Math.floor(Date.now() / 1000),
      kind: "attest",
      text:
        `regime ${regimeState.toUpperCase()} — reference stale ${(regime.stalenessSecs / 3600).toFixed(1)}h` +
        `  (last print ${new Date(regime.publishTime * 1000).toISOString()})`,
    },
    {
      t: Math.floor(Date.now() / 1000),
      kind: "signal",
      text: `spv mark $${prestock.markPrice.toFixed(2)}  vs  market ${
        dex ? `$${dex.priceUsd.toFixed(2)}` : "unavailable"
      }  →  basis ${basisBps >= 0 ? "+" : ""}${basisBps}bps`,
    },
    ...(multiplier
      ? [
          {
            t: Math.floor(Date.now() / 1000),
            kind: "info" as const,
            text: `scaledUiAmount multiplier ${multiplier.toFixed(4)}× recovered from quote/token-price`,
          },
        ]
      : []),
    {
      t: Math.floor(Date.now() / 1000),
      kind: actionable ? "signal" : "hold",
      text: actionable
        ? `edge ${edge}bps clears cost ${costBps}bps → net ${netBps}bps, executable while frozen`
        : `no action: ${!frozen ? "reference is live" : netBps <= 0 ? `net ${netBps}bps after ${costBps}bps cost` : `basis inside ${150}bps threshold`}`,
    },
  ];

  return (
    <section className="mx-auto max-w-app px-5 py-12 sm:px-8 sm:py-16">
      {/* Breadcrumb + identity */}
      <div className="flex flex-col gap-5">
        <Link
          href="/explore"
          className="font-mono text-xs tracking-[0.18em] text-ink-faint uppercase transition-colors hover:text-signal"
        >
          ← Explore
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">
                {agent.name}
              </h1>
              <span className="font-mono text-xs tracking-[0.16em] text-ink-faint uppercase">
                ${agent.ticker}
              </span>
              <span className="border border-signal-dim/60 px-2 py-1 font-mono text-[0.625rem] tracking-[0.14em] text-signal uppercase">
                yields {prestock.symbol}
              </span>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-ink-dim">{agent.thesis}</p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <span className="label">Basis</span>
            <Basis premiumBps={basisBps} size="lg" />
          </div>
        </div>
      </div>

      {/* Two-column split: 65 / 35 on desktop, stacked on mobile */}
      <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <MarkVsMarket
            markPrice={prestock.markPrice}
            marketPrice={dex?.priceUsd ?? prestock.markPrice}
            multiplier={multiplier}
          />
          <Terminal rows={rows} title={`${agent.ticker.toLowerCase()}.log`} />

          {dex && (
            <div className="panel flex flex-col gap-4 p-6">
              <span className="label">Market detail</span>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
                <Field k="Route" v={dex.route.join(" → ") || "—"} />
                <Field k="Price impact" v={`${(dex.priceImpactPct * 100).toFixed(3)}%`} />
                <Field
                  k="Issuer price"
                  v={`$${prestock.tokenPrice.toFixed(2)}`}
                  hint="unscaled"
                />
                <Field k="Supply" v={prestock.supply.toLocaleString(undefined, { maximumFractionDigits: 0 })} />
                <Field k="Implied valuation" v={usd(prestock.impliedValuation, { compact: true })} />
                <Field k="Mark valuation" v={usd(prestock.markValuation, { compact: true })} />
              </dl>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          <Swap symbol={prestock.symbol} mint={prestock.mint} decimals={9} />

          <div className="panel flex flex-col gap-5 p-6">
            <Curve progress={agent.curveProgress} />
            <div className="flex items-baseline justify-between border-t border-edge pt-4">
              <span className="label">Curve fee</span>
              <span className="tabular font-mono text-sm text-ink">{agent.feeBps / 100}%</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="label">Creator</span>
              <span className="font-mono text-xs text-ink-faint">{shortAddr(agent.creator)}</span>
            </div>
          </div>

          {/* Dividend claim box — §8 */}
          <div className="panel flex flex-col gap-4 p-6">
            <span className="label">Your dividends</span>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs text-ink-dim uppercase">Staked</span>
              <span className="tabular font-mono text-sm text-ink">—</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs text-ink-dim uppercase">Uncollected</span>
              <span className="tabular font-mono text-sm text-ink">—</span>
            </div>
            <button disabled className="btn btn-primary mt-1 w-full opacity-60">
              Claim {prestock.symbol}
            </button>
            <p className="font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
              Paid in w{prestock.symbol}, redeemable 1:1 for the raw PreStock. Rewards stream over
              time, so claiming later pays more — the vault is not a lump sum.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="label">{k}</dt>
      <dd className="tabular font-mono text-sm break-words text-ink-dim">
        {v}
        {hint && <span className="ml-2 text-ink-faint">{hint}</span>}
      </dd>
    </div>
  );
}
