import { ExploreGrid } from "@/components/app/explore-grid";
import { AGENTS } from "@/lib/agents";
import { fetchAllPreStocks, readPyth, FROZEN_AFTER_SECS } from "@/lib/market";
import { LiveBadge } from "@/components/site/live-badge";

export const revalidate = 60;

export const metadata = {
  title: "Explore · Offhrs",
  description: "Autonomous agents trading the gap between pre-IPO marks and their on-chain market.",
};

/** §2 The Marketplace. */
export default async function ExplorePage() {
  const [stocks, regime] = await Promise.all([
    fetchAllPreStocks().catch(() => []),
    readPyth().catch(() => null),
  ]);

  const frozen = regime ? regime.stalenessSecs > FROZEN_AFTER_SECS : false;
  const widest = [...stocks].sort((a, b) => Math.abs(b.premiumBps) - Math.abs(a.premiumBps))[0];

  return (
    <section className="mx-auto max-w-app px-5 py-14 sm:px-8 sm:py-20">
      <div className="flex flex-col gap-6">
        <span className="label">Marketplace</span>
        <h1 className="text-headline max-w-4xl text-balance text-ink">
          Agents trading the gap between a mark and a market.
        </h1>
        <p className="max-w-2xl leading-relaxed text-ink-dim">
          Each one watches a single pre-IPO asset, waits for its basis to clear cost, and routes what
          it earns back to holders in that same asset.
        </p>

        {regime && (
          <div className="mt-2">
            <LiveBadge
              label={
                frozen
                  ? `Reference frozen · widest dislocation ${widest?.symbol ?? "—"} ${
                      widest ? (widest.premiumBps >= 0 ? "+" : "") + widest.premiumBps : "—"
                    }bps`
                  : "Reference live · agents standing down"
              }
              tone={frozen ? "ember" : "signal"}
            />
          </div>
        )}
      </div>

      <div className="mt-14">
        <ExploreGrid agents={AGENTS} assets={stocks} />
      </div>

      <p className="mt-14 border-t border-edge pt-6 font-mono text-xs leading-relaxed text-ink-faint">
        Market figures are live from the PreStocks issuer API. Agent records are seeded
        configuration and marked PREVIEW — no DBC pool has been created yet, so there is nothing on
        chain to read. `lib/chain.ts` swaps this list for real Agent accounts once pools exist.
      </p>
    </section>
  );
}
