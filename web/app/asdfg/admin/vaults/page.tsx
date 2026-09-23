"use client";

import { getAdminAgents, getAdminStats, getAdminVaults } from "@/app/asdfg/admin/actions";
import { Bars, ChartCard } from "@/components/admin/charts";
import { compactAmount, compactNumber, shortAddr } from "@/lib/format";
import { useServerData } from "@/lib/use-server-data";

export default function AdminVaultsPage() {
  const data = useServerData("admin:vaults", getAdminVaults);
  const agents = useServerData("admin:agents", getAdminAgents);
  const stats = useServerData("admin:stats", getAdminStats);

  const nameOf = (id: string) =>
    agents.status === "ready"
      ? (agents.data.find((a) => a.pda === id)?.name ?? shortAddr(id))
      : shortAddr(id);

  const rows = data.status === "ready" ? data.data : [];
  const staked = (stats.status === "ready" ? stats.data.holdersByAgent : []).map((h) => ({
    label: nameOf(h.agentId),
    value: Number(h.staked) / 1e6,
  }));
  const reserves = rows
    .map((v) => ({ label: nameOf(v.agent), value: Number(v.rewardReserve) / 1e9 }))
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          label="Stake per agent"
          hint="raw $AGENT"
          value={stats.status === "ready" ? compactAmount(stats.data.totals.staked, 6) : undefined}
        >
          <Bars data={staked} format={(n) => `${compactNumber(n)} $AGENT`} />
        </ChartCard>
        <ChartCard
          label="Reward reserve"
          hint="wPreStock waiting to stream"
          value={stats.status === "ready" ? compactAmount(stats.data.totals.distributed, 9) : undefined}
        >
          <Bars data={reserves} format={(n) => `${compactNumber(n)} wPreStock`} />
        </ChartCard>
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="label">Dividend vaults</span>
          <span className="font-mono text-xs text-ink-faint">
            the token accounts must cover what the accounting claims
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-230 border-collapse">
            <thead>
              <tr className="border-b border-edge">
                {["Agent", "Staked", "Reward reserve", "Rate / slot", "Streamed", "Hold", "Backed"].map(
                  (h, i) => (
                    <th key={h} className={`label py-3 ${i === 0 ? "text-left" : "text-right"}`}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const backed = v.stakedBacked && v.rewardsBacked;
                return (
                  <tr key={v.pda} className="border-b border-edge/60">
                    <td className="py-3.5">
                      <span className="font-mono text-sm text-ink">{nameOf(v.agent)}</span>
                    </td>
                    <td className="tabular py-3.5 text-right font-mono text-sm text-ink-dim">
                      {compactAmount(v.totalStaked, 6)}
                    </td>
                    <td className="tabular py-3.5 text-right font-mono text-sm text-ink-dim">
                      {compactAmount(v.rewardReserve, 9)}
                    </td>
                    <td className="tabular py-3.5 text-right font-mono text-sm text-ink-faint">
                      {compactAmount(v.rewardRate, 9)}
                    </td>
                    <td className="tabular py-3.5 text-right font-mono text-sm text-ink-faint">
                      {compactAmount(v.totalDistributed, 9)}
                    </td>
                    <td className="tabular py-3.5 text-right font-mono text-xs text-ink-faint">
                      {v.minHoldSlots}
                    </td>
                    <td className="py-3.5 text-right">
                      <span
                        className={`font-mono text-[0.625rem] tracking-[0.14em] uppercase ${
                          backed ? "text-signal" : "text-ember"
                        }`}
                        title={
                          backed
                            ? "stake and reward balances cover the accounting"
                            : `stake ${v.stakeVaultBalance} vs ${v.totalStaked} · reward ${v.rewardVaultBalance} vs ${v.rewardReserve}`
                        }
                      >
                        {backed ? "backed" : "short"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {data.status === "loading" &&
                [0, 1, 2].map((i) => (
                  <tr key={i} className="border-b border-edge/60">
                    <td colSpan={7} className="py-4">
                      <span className="block h-4 w-full animate-pulse bg-raised" />
                    </td>
                  </tr>
                ))}
              {data.status === "error" && (
                <tr>
                  <td colSpan={7} className="py-6 font-mono text-sm text-ember">
                    {data.error}
                  </td>
                </tr>
              )}
              {data.status === "ready" && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 font-mono text-sm text-ink-faint">
                    No vaults registered on this cluster yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
