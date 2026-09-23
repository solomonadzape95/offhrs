"use client";

import Link from "next/link";
import { Robot } from "@phosphor-icons/react";

import { getLiveAgents, getUserAgents } from "@/app/actions";
import { AgentCard } from "@/components/app/agent-card";
import { RequireWallet } from "@/components/app/require-wallet";
import { Icon } from "@/components/ui/icon";
import { useServerData } from "@/lib/use-server-data";
import { useWalletUi, shortAddress } from "@/lib/wallet";

/**
 * Agents.
 *
 * "Yours" is read from the chain — agents whose `creator` or `agent_signer` is
 * the connected wallet. Below it, the agents other people have registered, shown
 * as the same cards the marketplace uses, because that is what they are: things
 * you can buy into. The seeded preview set is gone from this page; a list that
 * cannot be bought is not a marketplace.
 */
export default function AgentsPage() {
  const { address } = useWalletUi();
  const mine = useServerData(address, () => getUserAgents(address as string));
  const all = useServerData(address ? "live-agents" : null, () => getLiveAgents());

  const rows = mine.status === "ready" ? mine.data : [];
  const loadingMine = mine.status === "loading";
  const errorMine = mine.status === "error" ? mine.error : null;
  const mineIds = new Set(rows.map((r) => r.id));
  const others = (all.status === "ready" ? all.data : []).filter((a) => !mineIds.has(a.id));
  const loadingOthers = all.status === "loading";
  const errorOthers = all.status === "error" ? all.error : null;

  return (
    <section className="mx-auto max-w-app px-5 py-10 sm:px-8 sm:py-14">
      <RequireWallet
        title="Connect to see your agents"
        body="Agents are registered to a creator wallet, so there is nothing to list until one is connected."
      >
        <div className="flex flex-col gap-12">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex flex-col gap-3">
              <span className="label">Agents</span>
              <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Your agents</h1>
              <p className="max-w-xl text-sm leading-relaxed text-ink-dim">
                Launch an agent and you earn a fee on every trade of its token, while the people
                staking it earn dividends.
              </p>
            </div>
            <Link href="/launch" className="btn btn-primary">
              Launch an agent
            </Link>
          </div>

          {/* Yours */}
          <div className="flex flex-col gap-5">
            <span className="label">Created by {address ? shortAddress(address) : "you"}</span>

            {loadingMine ? (
              <div className="panel overflow-x-auto rounded-none p-2 sm:p-3">
                <table className="w-full min-w-150 border-collapse">
                  <thead>
                    <tr className="border-b border-edge">
                      {["Agent", "Mint", "Curve fee", "Yield asset", ""].map((h, i) => (
                        <th key={h} className={`label py-3 ${i === 0 ? "pl-2 text-left" : "text-right"}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[0, 1, 2].map((i) => (
                      <tr key={i} className="even:bg-signal/5">
                        <td className="py-3.5 pl-2">
                          <span className="block h-4 w-32 animate-pulse bg-raised" />
                        </td>
                        <td className="py-3.5 text-right">
                          <span className="ml-auto block h-3 w-24 animate-pulse bg-raised" />
                        </td>
                        <td className="py-3.5 text-right">
                          <span className="ml-auto block h-3 w-10 animate-pulse bg-raised" />
                        </td>
                        <td className="py-3.5 text-right">
                          <span className="ml-auto block h-3 w-20 animate-pulse bg-raised" />
                        </td>
                        <td className="py-3.5 pr-2 text-right">
                          <span className="ml-auto block h-3 w-12 animate-pulse bg-raised" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : errorMine ? (
              <div className="panel flex flex-col gap-2 p-6">
                <p className="text-sm leading-relaxed text-ember">
                  Could not read the registry.
                </p>
                <p className="font-mono text-xs leading-relaxed text-ink-faint">
                  {errorMine} — the RPC may be rate-limiting. Reload to retry.
                </p>
              </div>
            ) : rows.length > 0 ? (
              <div className="panel overflow-x-auto rounded-none p-2 sm:p-3">
                <table className="w-full min-w-150 border-collapse">
                  <thead>
                    <tr className="border-b border-edge">
                      {["Agent", "Mint", "Curve fee", "Yield asset", ""].map((h, i) => (
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
                        <td className="py-3.5 pr-2 text-right">
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
              <div className="panel flex flex-col gap-6 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-8">
                <div className="flex items-start gap-5">
                  <span className="dither grid size-12 shrink-0 place-items-center border border-edge bg-raised">
                    <Icon icon={Robot} size={20} className="text-signal" />
                  </span>
                  <div className="flex flex-col gap-2">
                    <h2 className="text-lg leading-snug font-medium text-ink">
                      You haven&apos;t launched an agent yet
                    </h2>
                    <p className="max-w-md text-sm leading-relaxed text-ink-dim">
                      An agent gets its own token, curve and dividend vault, registered to your
                      wallet. You take a fee on every trade; the people who stake it take the
                      dividends.
                    </p>
                  </div>
                </div>
                <Link href="/launch" className="btn btn-primary shrink-0">
                  Launch an agent
                </Link>
              </div>
            )}
          </div>

          {/* Other agents — the same cards as the marketplace, because that is what they are. */}
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-2">
                <span className="label">Marketplace</span>
                <h2 className="font-display text-2xl leading-none text-ink">
                  Other agents to buy into
                </h2>
                <p className="max-w-xl text-sm leading-relaxed text-ink-dim">
                  Every agent has a token. Buy it to bet on the desk, or stake it to have its
                  dividends stream to you.
                </p>
              </div>
              <Link href="/explore" className="btn btn-ghost !px-4 !py-2.5 !text-xs">
                See all agents
              </Link>
            </div>

            {loadingOthers ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="panel h-72 animate-pulse bg-surface" />
                ))}
              </div>
            ) : errorOthers ? (
              <p className="font-mono text-sm leading-relaxed text-ember">
                Could not read the marketplace. {errorOthers}
              </p>
            ) : others.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {others.map((a) => (
                  <AgentCard key={a.id} agent={a} />
                ))}
              </div>
            ) : (
              <p className="font-mono text-sm text-ink-faint">
                No other agents are registered on chain yet.
              </p>
            )}
          </div>
        </div>
      </RequireWallet>
    </section>
  );
}
