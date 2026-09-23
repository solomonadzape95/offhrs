"use client";

import { getAdminAgents, getAdminUsers } from "@/app/asdfg/admin/actions";
import { Bars, ChartCard } from "@/components/admin/charts";
import { Stat } from "@/components/site/stat";
import { compactAmount, compactNumber, shortAddr } from "@/lib/format";
import { useServerData } from "@/lib/use-server-data";

/**
 * Users.
 *
 * There is no user table and no database. The holder set *is* the protocol's user
 * record: every `UserStake` account carries an owner, so the unique-owner count
 * below is a real, on-chain number rather than an analytics guess. What we cannot
 * know without a database is anything before a wallet stakes — visits, intent,
 * a waitlist conversion — and this page does not pretend otherwise.
 */
export default function AdminUsersPage() {
  const data = useServerData("admin:users", getAdminUsers);
  const agents = useServerData("admin:agents", getAdminAgents);

  const nameOf = (id: string) =>
    agents.status === "ready"
      ? (agents.data.find((a) => a.pda === id)?.name ?? shortAddr(id))
      : shortAddr(id);

  const users = data.status === "ready" ? data.data.users : [];
  const byAgent = data.status === "ready" ? data.data.byAgent : [];
  const holders = byAgent.slice(0, 8).map((b) => ({ label: nameOf(b.agentId), value: b.holders }));
  const stake = byAgent.slice(0, 8).map((b) => ({ label: nameOf(b.agentId), value: Number(b.staked) / 1e6 }));

  return (
    <div className="flex flex-col gap-10">
      <div className="grid grid-cols-2 gap-x-8 gap-y-10 border-t border-edge pt-8 sm:grid-cols-3">
        <Stat label="Holders" value={data.status === "ready" ? String(data.data.totalHolders) : "—"} loading={data.status === "loading"} hint="unique staker wallets" />
        <Stat
          label="Positions"
          value={data.status === "ready" ? String(users.reduce((n, u) => n + u.positions, 0)) : "—"}
          loading={data.status === "loading"}
          hint="stake accounts"
        />
        <Stat
          label="Avg stake"
          value={
            data.status === "ready" && users.length > 0
              ? compactAmount(
                  String(
                    users.reduce((s, u) => s + BigInt(u.totalStaked), 0n) / BigInt(users.length),
                  ),
                  6,
                )
              : "—"
          }
          unit="$AGENT"
          loading={data.status === "loading"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard label="Holders per agent" hint="unique staker wallets">
          <Bars data={holders} format={(n) => `${n} holders`} />
        </ChartCard>
        <ChartCard label="Stake per agent" hint="raw $AGENT">
          <Bars data={stake} format={(n) => `${compactNumber(n)} $AGENT`} />
        </ChartCard>
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="label">Holders</span>
          <span className="font-mono text-xs text-ink-faint">
            derived from on-chain stake accounts, not a database
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-140 border-collapse">
            <thead>
              <tr className="border-b border-edge">
                {["Wallet", "Staked", "Positions"].map((h, i) => (
                  <th key={h} className={`label py-3 ${i === 0 ? "text-left" : "text-right"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.owner} className="border-b border-edge/60">
                  <td className="py-3.5 font-mono text-sm text-ink-dim">{shortAddr(u.owner, 6)}</td>
                  <td className="tabular py-3.5 text-right font-mono text-sm text-ink">
                    {compactAmount(u.totalStaked, 6)}
                  </td>
                  <td className="tabular py-3.5 text-right font-mono text-sm text-ink-faint">
                    {u.positions}
                  </td>
                </tr>
              ))}
              {data.status === "loading" &&
                [0, 1, 2].map((i) => (
                  <tr key={i} className="border-b border-edge/60">
                    <td colSpan={3} className="py-4">
                      <span className="block h-4 w-full animate-pulse bg-raised" />
                    </td>
                  </tr>
                ))}
              {data.status === "ready" && users.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 font-mono text-sm text-ink-faint">
                    No wallets are staked on this cluster yet. A holder appears the moment a stake
                    account exists.
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
