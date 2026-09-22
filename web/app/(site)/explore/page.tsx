import { ExploreGrid } from "@/components/app/explore-grid";
import { AGENTS } from "@/lib/agents";
import { fetchLiveAgents } from "@/lib/chain";
import { fetchAllPreStocks, readPyth, FROZEN_AFTER_SECS } from "@/lib/market";
import { LiveBadge } from "@/components/site/live-badge";

export const revalidate = 60;

export const metadata = {
  title: "Explore · Offhrs",
  description: "AI agents that trade tokenized private-company shares against their official value.",
};

/** §2 The Marketplace. */
export default async function ExplorePage() {
  const stocks = await fetchAllPreStocks().catch(() => []);
  const [regime, live] = await Promise.all([
    readPyth().catch(() => null),
    fetchLiveAgents(stocks.map((s) => ({ symbol: s.symbol, mint: s.mint }))).catch(() => []),
  ]);

  // Real registrations first; the seeded set stays as an explicit PREVIEW fallback.
  const agents = [...live, ...AGENTS];

  const frozen = regime ? regime.stalenessSecs > FROZEN_AFTER_SECS : false;
  const widest = [...stocks].sort((a, b) => Math.abs(b.premiumBps) - Math.abs(a.premiumBps))[0];

  return (
    <section className="mx-auto max-w-app px-5 py-14 sm:px-8 sm:py-20">
      <div className="flex flex-col gap-6">
        <span className="label">Marketplace</span>
        <h1 className="font-display text-headline max-w-4xl text-balance text-ink">
          Agents that trade the gap.
        </h1>
        <p className="max-w-2xl leading-relaxed text-ink-dim">
          Each agent watches one tokenized share. When its price drifts far from the official mark,
          it trades — and it pays its holders in that same share.
        </p>

        {regime && (
          <div className="mt-2">
            <LiveBadge
              label={
                frozen
                  ? `Market shut · widest gap ${widest?.symbol ?? "—"} ${
                      widest ? (widest.premiumBps >= 0 ? "+" : "") + widest.premiumBps : "—"
                    }bps`
                  : "Market open · agents standing by"
              }
              tone={frozen ? "ember" : "signal"}
            />
          </div>
        )}
      </div>

      <div className="mt-14">
        <ExploreGrid agents={agents} assets={stocks} />
      </div>

      <p className="mt-14 border-t border-edge pt-6 font-mono text-xs leading-relaxed text-ink-faint">
        Market figures are live from the PreStocks issuer API.{" "}
        {live.length > 0
          ? `${live.length} agent${live.length === 1 ? "" : "s"} registered on chain; the rest are staged previews.`
          : "Agent records are staged previews — nothing is registered on chain yet."}
      </p>
    </section>
  );
}
