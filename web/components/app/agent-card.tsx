import Link from "next/link";

import { Basis } from "@/components/app/basis";
import { Curve } from "@/components/app/curve";
import { usd } from "@/lib/format";
import type { AgentSeed } from "@/lib/agents";
import type { PreStock } from "@/lib/market";

/**
 * Agent card for the /explore grid.
 *
 * §8 asks for: avatar, name, ticker, a dividend badge naming the asset it pays
 * out in, the bonding-curve progress, a 24h arbitrage signal and a quick buy.
 *
 * The market figures are real. The agent record is seeded — `lib/agents.ts`
 * explains why and the badge at the top says PREVIEW.
 */
export function AgentCard({ agent, asset }: { agent: AgentSeed; asset?: PreStock }) {
  const premiumBps = asset?.premiumBps ?? 0;

  return (
    <Link
      href={`/agent/${agent.id}`}
      className="panel group relative flex flex-col gap-5 p-5 transition-colors hover:border-ink-faint"
    >
      {/* Header: avatar / name / ticker, then the payout badge */}
      <div className="flex items-start gap-3.5">
        <Avatar ticker={agent.ticker} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-lg leading-tight font-medium text-ink">{agent.name}</h3>
            <span className="font-mono text-[0.6875rem] tracking-[0.16em] text-ink-faint uppercase">
              ${agent.ticker}
            </span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-ink-dim">{agent.thesis}</p>
        </div>
      </div>

      {/* Dividend badge — names the exact asset the vault streams */}
      <div className="flex items-center gap-2">
        <span className="border border-signal-dim/60 px-2 py-1 font-mono text-[0.625rem] tracking-[0.14em] text-signal uppercase">
          yields {asset?.symbol ?? agent.asset}
        </span>
        <span className="font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
          {agent.feeBps / 100}% curve fee
        </span>
      </div>

      {/* The number the card is actually about */}
      <div className="flex items-end justify-between gap-4 border-t border-edge pt-4">
        <div className="flex flex-col gap-1.5">
          <span className="label">Mark vs market</span>
          <Basis premiumBps={premiumBps} />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="label">Mark value</span>
          <span className="tabular font-mono text-sm text-ink-dim">
            {asset ? usd(asset.markValuation, { compact: true }) : "—"}
          </span>
        </div>
      </div>

      <Curve progress={agent.curveProgress} compact />

      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
          preview · no pool yet
        </span>
        <span className="font-mono text-xs tracking-[0.14em] text-signal uppercase opacity-70 transition-opacity group-hover:opacity-100">
          Quick buy →
        </span>
      </div>
    </Link>
  );
}

/**
 * A dithered monogram rather than a logo file.
 *
 * Real launches would carry an image; until then a generated mark keeps the grid
 * from filling with broken-image boxes and reads as intentionally unfinished
 * rather than as a bug.
 */
function Avatar({ ticker }: { ticker: string }) {
  return (
    <span
      aria-hidden
      className="dither relative grid size-11 shrink-0 place-items-center border border-edge bg-raised"
    >
      <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-ink-dim">
        {ticker.slice(0, 2)}
      </span>
    </span>
  );
}
