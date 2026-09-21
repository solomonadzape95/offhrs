import { LaunchStudio } from "@/components/app/launch-studio";
import { RequireWallet } from "@/components/app/require-wallet";
import { fetchAllPreStocks } from "@/lib/market";

export const revalidate = 60;

export const metadata = {
  title: "Launch · Offhrs",
  description: "Deploy an autonomous pre-IPO arbitrage agent and its dividend vault.",
};

/** §4 Creator Studio. */
export default async function LaunchPage() {
  const assets = await fetchAllPreStocks().catch(() => []);

  return (
    <section className="mx-auto max-w-app px-5 py-14 sm:px-8 sm:py-20">
      <span className="label">Creator studio</span>
      <h1 className="font-display text-headline mt-6 max-w-3xl text-balance text-ink">
        Give a strategy a market, a fee and a dividend.
      </h1>
      <p className="mt-6 max-w-2xl leading-relaxed text-ink-dim">
        Five steps. The agent gets its own keypair and its own curve; holders get paid in the equity
        the agent earns.
      </p>

      <div className="mt-14">
        {assets.length === 0 ? (
          <p className="font-mono text-sm text-ink-faint">
            PreStocks universe unavailable — cannot stage a launch right now.
          </p>
        ) : (
          <RequireWallet
            title="Connect to launch"
            body="Launching deploys a token, a curve and a vault, and every one of those is signed by your wallet. Connect one and the studio opens."
          >
            <LaunchStudio assets={assets} />
          </RequireWallet>
        )}
      </div>
    </section>
  );
}
