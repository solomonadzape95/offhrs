"use client";

import { getAdminAgents, getAdminExecutionLog, getAdminStats } from "@/app/asdfg/admin/actions";
import { Bars, ChartCard } from "@/components/admin/charts";
import { compactAmount, compactNumber, pythPrice, shortAddr, timeAgo, utc } from "@/lib/format";
import { useServerData } from "@/lib/use-server-data";

export default function AdminActivityPage() {
  const execs = useServerData("admin:executions", () => getAdminExecutionLog(100));
  const agents = useServerData("admin:agents", getAdminAgents);
  const stats = useServerData("admin:stats", getAdminStats);

  const byId = new Map((agents.status === "ready" ? agents.data : []).map((a) => [a.pda, a]));
  const rows = execs.status === "ready" ? execs.data : [];
  const days = (stats.status === "ready" ? stats.data.days : []).map((d) => ({
    label: d.day.slice(5),
    value: d.count,
  }));
  const profit = (stats.status === "ready" ? stats.data.days : []).map((d) => ({
    label: d.day.slice(5),
    value: Number(d.profit) / 1e9,
  }));

  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          label="Executions per day"
          hint="UTC"
          value={stats.status === "ready" ? String(stats.data.days.reduce((n, d) => n + d.count, 0)) : undefined}
        >
          <Bars data={days} />
        </ChartCard>
        <ChartCard
          label="Profit logged per day"
          hint="wPreStock"
          value={stats.status === "ready" ? compactAmount(stats.data.totals.logged, 9) : undefined}
        >
          <Bars data={profit} format={(n) => `${compactNumber(n)} wPreStock`} />
        </ChartCard>
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="label">Execution log</span>
          <span className="font-mono text-xs text-ink-faint">
            the Pyth fields are copied from the signal, not claimed
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-220 border-collapse">
            <thead>
              <tr className="border-b border-edge">
                {["Agent", "Venue", "In", "Out", "Profit", "Pyth", "Stale", "When"].map((h, i) => (
                  <th key={h} className={`label py-3 ${i === 0 ? "text-left" : "text-right"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const a = byId.get(e.agentId);
                return (
                  <tr key={`${e.agentId}:${e.index}`} className="border-b border-edge/60">
                    <td className="py-3.5">
                      <span className="font-mono text-sm text-ink">{a?.name ?? shortAddr(e.agentId)}</span>
                      {a && (
                        <span className="ml-3 font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
                          ${a.ticker}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 text-right font-mono text-xs text-ink-dim">{e.venue}</td>
                    <td className="tabular py-3.5 text-right font-mono text-sm text-ink-faint">
                      {compactAmount(e.amountIn, 9)}
                    </td>
                    <td className="tabular py-3.5 text-right font-mono text-sm text-ink-dim">
                      {compactAmount(e.amountOut, 9)}
                    </td>
                    <td className="tabular py-3.5 text-right font-mono text-sm text-signal">
                      {compactAmount(e.profit, 9)}
                    </td>
                    <td className="tabular py-3.5 text-right font-mono text-xs text-ink-faint">
                      {pythPrice(e.pythPrice, e.pythExponent).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="tabular py-3.5 text-right font-mono text-xs text-ink-faint">
                      {e.stalenessSecs}s
                    </td>
                    <td
                      className="py-3.5 text-right font-mono text-xs text-ink-faint"
                      title={utc(e.executedAt)}
                    >
                      {timeAgo(e.executedAt)}
                    </td>
                  </tr>
                );
              })}
              {execs.status === "loading" &&
                [0, 1, 2].map((i) => (
                  <tr key={i} className="border-b border-edge/60">
                    <td colSpan={8} className="py-4">
                      <span className="block h-4 w-full animate-pulse bg-raised" />
                    </td>
                  </tr>
                ))}
              {execs.status === "ready" && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 font-mono text-sm text-ink-faint">
                    No executions logged on this cluster yet.
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
