"use client";

import Link from "next/link";

import { RequireWallet } from "@/components/app/require-wallet";
import { AGENTS } from "@/lib/agents";
import { useWalletUi, shortAddress } from "@/lib/wallet";

/**
 * Agents.
 *
 * Splits the seeded launch set from the ones this wallet actually deployed.
 * There are none in the second list because the registry program is not
 * deployed, and showing seeded rows under a "yours" heading would be the one
 * genuinely misleading thing this page could do.
 */
export default function AgentsPage() {
  const { address } = useWalletUi();

  return (
    <section className="mx-auto max-w-app px-5 py-10 sm:px-8 sm:py-14">
      <RequireWallet
        title="Connect to see your agents"
        body="Agents are registered against a creator wallet, so there is nothing to list until one is connected."
      >
        <div className="flex flex-col gap-12">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex flex-col gap-3">
              <span className="label">Agents</span>
              <h1 className="text-3xl leading-none font-medium text-ink sm:text-4xl">Your agents</h1>
              <p className="max-w-xl text-sm leading-relaxed text-ink-dim">
                Creators earn the curve fee on every secondary trade of their agent token, on top of
                the dividends their stakers accrue.
              </p>
            </div>
            <Link href="/launch" className="btn btn-primary">
              Launch an agent
            </Link>
          </div>

          {/* Yours */}
          <div className="flex flex-col gap-5">
            <span className="label">Created by {address ? shortAddress(address) : "you"}</span>
            <div className="panel flex flex-col gap-4 p-6">
              <p className="max-w-2xl text-sm leading-relaxed text-ink-dim">
                None yet. Deploying creates three things: the zero-fee wrapper mint for the PreStock,
                the agent record, and the dividend vault — then the DBC pool that trades against it.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/launch" className="btn btn-ghost !px-4 !py-2.5 !text-xs">
                  Open the creator studio
                </Link>
              </div>
            </div>
          </div>

          {/* The seeded set, labelled as such */}
          <div className="flex flex-col gap-5">
            <div className="flex items-baseline justify-between">
              <span className="label">Staged launch set</span>
              <span className="font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
                seeded config, not on chain
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-150 border-collapse">
                <thead>
                  <tr className="border-b border-edge">
                    {["Agent", "Creator", "Curve fee", "Yield asset", "Curve"].map((h, i) => (
                      <th key={h} className={`label py-3 ${i === 0 ? "text-left" : "text-right"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AGENTS.map((a) => (
                    <tr key={a.id} className="border-b border-edge/60">
                      <td className="py-3.5">
                        <Link
                          href={`/agent/${a.id}`}
                          className="font-mono text-sm text-ink transition-colors hover:text-signal"
                        >
                          {a.name}
                        </Link>
                        <span className="ml-3 font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
                          ${a.ticker}
                        </span>
                      </td>
                      <td className="py-3.5 text-right font-mono text-xs text-ink-faint">
                        {shortAddress(a.creator)}
                      </td>
                      <td className="tabular py-3.5 text-right font-mono text-sm text-ink-dim">
                        {(a.feeBps / 100).toFixed(1)}%
                      </td>
                      <td className="py-3.5 text-right font-mono text-sm text-ink-faint">
                        {a.asset}
                      </td>
                      <td className="py-3.5 text-right">
                        <span className="tabular font-mono text-xs text-ink-dim">
                          {(a.curveProgress * 100).toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </RequireWallet>
    </section>
  );
}
