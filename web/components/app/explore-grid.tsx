"use client";

import { useMemo, useState } from "react";

import { AgentCard } from "@/components/app/agent-card";
import { underlyingSymbol } from "@/lib/mock";
import type { AgentSeed } from "@/lib/agents";
import type { PreStock } from "@/lib/market";

/**
 * The marketplace grid with its hero filter bar.
 *
 * Client-side because filtering is instant and there is no reason to round-trip
 * for it. The pills are built from the assets actually present rather than a
 * hard-coded list — the doc's original filter row named Canva and Stripe, neither
 * of which exist in the PreStocks universe.
 */
export function ExploreGrid({
  agents,
  assets,
}: {
  agents: AgentSeed[];
  assets: PreStock[];
}) {
  const bySymbol = useMemo(
    () => new Map(assets.map((a) => [a.symbol, a])),
    [assets],
  );

  const assetSymbols = useMemo(
    () => [...new Set(agents.map((a) => a.asset))].sort(),
    [agents],
  );

  const [filter, setFilter] = useState<string>("All");

  const rows = useMemo(() => {
    // The card shows the real underlying's market figures, so a devnet `offSPACEX`
    // agent reads the same numbers as its terminal.
    const withAsset = agents.map((a) => ({
      agent: a,
      asset: bySymbol.get(underlyingSymbol(a.asset)),
    }));

    switch (filter) {
      case "All":
        return withAsset;
      case "Trending":
        return withAsset
          .slice()
          .sort((x, y) => Math.abs(y.asset?.premiumBps ?? 0) - Math.abs(x.asset?.premiumBps ?? 0));
      case "Graduated":
        return withAsset.filter((r) => r.agent.curveProgress >= 1);
      default:
        return withAsset.filter((r) => r.agent.asset === filter);
    }
  }, [agents, bySymbol, filter]);

  const pills = ["All", ...assetSymbols, "Trending", "Graduated"];

  return (
    <>
      {/* Hero filter bar */}
      <div className="flex flex-wrap gap-2">
        {pills.map((p) => (
          <button
            key={p}
            onClick={() => setFilter(p)}
            className={`pill ${filter === p ? "pill-active" : ""}`}
            aria-pressed={filter === p}
          >
            {p === "All" ? "All" : p.charAt(0) + p.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Grid: three-up on desktop, single column of swipeable cards on mobile */}
      {rows.length === 0 ? (
        <p className="mt-12 font-mono text-sm text-ink-faint">
          Nothing matches {filter}. No agent has graduated yet.
        </p>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ agent, asset }) => (
            <AgentCard key={agent.id} agent={agent} asset={asset} />
          ))}
        </div>
      )}
    </>
  );
}
