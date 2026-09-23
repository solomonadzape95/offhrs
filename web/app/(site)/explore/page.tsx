import { ExploreGrid } from "@/components/app/explore-grid";
import { fetchLiveAgents } from "@/lib/chain";
import { readPyth, FROZEN_AFTER_SECS } from "@/lib/market";
import { fetchUniverse, isDevnet } from "@/lib/universe";
import { LiveBadge } from "@/components/site/live-badge";

export const revalidate = 60;

export const metadata = {
  title: "Explore · Offhrs",
  description: "AI agents that trade tokenized private-company shares against their official value.",
};

/** §2 The Marketplace. */
export default async function ExplorePage() {
  const assets = await fetchUniverse().catch(() => []);
  const [regime, live] = await Promise.all([
    readPyth().catch(() => null),
    fetchLiveAgents(assets.map((s) => ({ symbol: s.symbol, mint: s.mint }))).catch(() => []),
  ]);

  // Only registrations that actually exist on chain. The preview set is gone.
  const agents = live;

  const frozen = regime ? regime.stalenessSecs > FROZEN_AFTER_SECS : false;
  const widest = [...assets].sort((a, b) => Math.abs(b.premiumBps) - Math.abs(a.premiumBps))[0];

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
      </div>

      <div className="mt-14">
        <ExploreGrid agents={agents} assets={assets} />
      </div>

      <p className="mt-14 border-t border-edge pt-6 font-mono text-xs leading-relaxed text-ink-faint">
        {isDevnet()
          ? "Devnet: the assets are mocks standing in for the real PreStocks, and only agents registered on chain appear here."
          : live.length > 0
            ? `${live.length} agent${live.length === 1 ? "" : "s"} registered on chain.`
            : "No agents are registered on chain yet."}
      </p>
    </section>
  );
}
