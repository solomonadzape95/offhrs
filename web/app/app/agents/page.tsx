"use client";

import Link from "next/link";

import { getUserAgents } from "@/app/actions";
import { RequireWallet } from "@/components/app/require-wallet";
import { AGENTS } from "@/lib/agents";
import { useServerData } from "@/lib/use-server-data";
import { useWalletUi, shortAddress } from "@/lib/wallet";

/**
 * Agents.
 *
 * "Yours" is read from the chain — agents whose `creator` or `agent_signer` is
 * the connected wallet. The seeded launch set stays below, explicitly labelled,
 * as the staging list. Listing the seeded rows under "yours" would be the one
 * genuinely misleading thing this page could do.
 */
export default function AgentsPage() {
  const { address } = useWalletUi();
  const mine = useServerData(address, () => getUserAgents(address as string));
  const rows = mine.status === "ready" ? mine.data : [];

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
              <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Your agents</h1>
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

            {rows.length > 0 ? (
              <div className="panel overflow-x-auto rounded-none p-2 sm:p-3">
                <table className="w-full min-w-150 border-collapse">
                  <thead>
                    <tr className="border-b border-edge">
                      {["Agent", "Mint", "Curve fee", "Yield asset", "Executions"].map((h, i) => (
                        <th key={h} className={`label py-3 ${i === 0 ? "pl-2 text-left" : "text-right"}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id} className="even:bg-signal/5">
                        <td className="py-3.5 pl-2">
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
                          {shortAddress(a.id, 6, 6)}
                        </td>
                        <td className="tabular py-3.5 text-right font-mono text-sm text-ink-dim">
                          {(a.feeBps / 100).toFixed(1)}%
                        </td>
                        <td className="py-3.5 text-right font-mono text-sm text-ink-faint">
                          {a.asset}
                        </td>
                        <td className="py-3.5 pr-2 text-right font-mono text-xs text-ink-dim">
                          <Link
                            href={`/app/agents/${a.id}`}
                            className="font-mono text-[0.625rem] tracking-wider text-signal uppercase"
                          >
                            Manage
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="panel flex flex-col gap-4 p-6">
                <p className="max-w-2xl text-sm leading-relaxed text-ink-dim">
                  {mine.status === "loading"
                    ? "Reading the registry…"
                    : "None yet. Launching registers an Agent account against your wallet, and the vault that streams its equity to stakers."}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link href="/launch" className="btn btn-ghost !px-4 !py-2.5 !text-xs">
                    Open the creator studio
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* The seeded set, labelled as such */}
          <div className="flex flex-col gap-5">
            <div className="flex items-baseline justify-between">
              <span className="label">Staged launch set</span>
              <span className="font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
                seeded config, not on chain
              </span>
            </div>

            <div className="panel overflow-x-auto rounded-none p-2 sm:p-3">
              <table className="w-full min-w-150 border-collapse">
                <thead>
                  <tr className="border-b border-edge">
                    {["Agent", "Creator", "Curve fee", "Yield asset", "Curve"].map((h, i) => (
                      <th key={h} className={`label py-3 ${i === 0 ? "pl-2 text-left" : "text-right"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AGENTS.map((a) => (
                    <tr key={a.id} className="even:bg-signal/5">
                      <td className="py-3.5 pl-2">
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
                      <td className="py-3.5 pr-2 text-right">
                        <span className="tabular font-mono text-xs text-ink-dim">
                          {(a.curveProgress * 100).toFixed(0)}%
                        </span>
                        <Link
                          href={`/app/agents/${a.id}`}
                          className="ml-4 font-mono text-[0.625rem] tracking-wider text-signal uppercase"
                        >
                          Manage
                        </Link>
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
