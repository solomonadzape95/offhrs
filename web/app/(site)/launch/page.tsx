import { LaunchStudio } from "@/components/app/launch-studio";
import { RequireWallet } from "@/components/app/require-wallet";
import { fetchAllPreStocks } from "@/lib/market";

export const revalidate = 60;

export const metadata = {
  title: "Launch · Offhrs",
  description: "Deploy an AI trading agent and its dividend vault.",
};

/** §4 Creator Studio. */
export default async function LaunchPage() {
  const assets = await fetchAllPreStocks().catch(() => []);

  return (
    <section className="mx-auto max-w-app px-5 py-14 sm:px-8 sm:py-20">
      <span className="label">Creator studio</span>
      <h1 className="font-display text-headline mt-6 max-w-3xl text-balance text-ink">
        Deploy an AI agent.
      </h1>
      <p className="mt-6 max-w-2xl leading-relaxed text-ink-dim">
        Pick an asset, choose a fee, and mint the token. The agent gets its own pool and curve;
        holders get paid in the shares it earns.
      </p>

      <div className="mt-14">
        {assets.length === 0 ? (
          <p className="font-mono text-sm text-ink-faint">
            PreStocks universe unavailable — cannot stage a launch right now.
          </p>
        ) : (
          <RequireWallet
            title="Connect your wallet"
            body="Launching creates a token, a pool and a vault — each signed by your wallet. Connect and the studio opens."
          >
            <LaunchStudio assets={assets} />
          </RequireWallet>
        )}
      </div>
    </section>
  );
}
