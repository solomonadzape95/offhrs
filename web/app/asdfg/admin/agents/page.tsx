"use client";

import Link from "next/link";
import { ArrowSquareOut, Trash } from "@phosphor-icons/react";

import { buildCloseAgentTx } from "@/app/actions";
import { getAdminAgents } from "@/app/asdfg/admin/actions";
import { Icon } from "@/components/ui/icon";
import type { AdminAgent } from "@/lib/admin";
import { compactAmount, shortAddr } from "@/lib/format";
import { useServerData } from "@/lib/use-server-data";
import { useWriteTx } from "@/lib/use-write-tx";
import { useWalletUi } from "@/lib/wallet";

export default function AdminAgentsPage() {
  const { address } = useWalletUi();
  const data = useServerData("admin:agents", getAdminAgents);
  const { state, run } = useWriteTx();
  const busy = state.status === "signing" || state.status === "sending";
  const rows = data.status === "ready" ? data.data : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="label">Registered agents</span>
        <span className="font-mono text-xs text-ink-faint">
          logged is the execution record; routed is what reached the vault
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-240 border-collapse">
          <thead>
            <tr className="border-b border-edge">
              {["Agent", "Asset", "Creator", "Execs", "Logged", "Routed", "Fee", ""].map((h, i) => (
                <th key={h} className={`label py-3 ${i === 0 ? "text-left" : "text-right"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <AgentRow key={a.pda} a={a} address={address} busy={busy} run={run} />
            ))}
            {data.status === "loading" &&
              [0, 1, 2].map((i) => (
                <tr key={i} className="border-b border-edge/60">
                  <td colSpan={8} className="py-4">
                    <span className="block h-4 w-full animate-pulse bg-raised" />
                  </td>
                </tr>
              ))}
            {data.status === "error" && (
              <tr>
                <td colSpan={8} className="py-6 font-mono text-sm text-ember">
                  {data.error}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {state.status === "done" && (
        <p className="font-mono text-[0.6875rem] break-all text-signal">
          Confirmed: {state.signature}
        </p>
      )}
      {state.status === "error" && <p className="text-xs leading-relaxed text-ember">{state.error}</p>}
    </div>
  );
}

function AgentRow({
  a,
  address,
  busy,
  run,
}: {
  a: AdminAgent;
  address?: string | null;
  busy: boolean;
  run: (build: () => Promise<{ tx: string } | { error: string }>) => Promise<boolean>;
}) {
  const routed = BigInt(a.totalProfitsRouted);
  const logged = BigInt(a.totalProfitLogged);
  const gap = logged > 0n && routed === 0n;

  return (
    <tr className="border-b border-edge/60">
      <td className="py-3.5">
        <Link
          href={`/agent/${a.pda}`}
          className="inline-flex items-center gap-1.5 font-mono text-sm text-ink transition-colors hover:text-signal"
        >
          {a.name}
          <Icon icon={ArrowSquareOut} size={11} dither={false} />
        </Link>
        <span className="ml-3 font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
          ${a.ticker}
        </span>
        {a.hidden && (
          <span className="ml-3 border border-edge px-1.5 py-0.5 font-mono text-[0.5625rem] tracking-wider text-ink-faint uppercase">
            hidden
          </span>
        )}
      </td>
      <td className="py-3.5 text-right font-mono text-sm text-ink-dim">{a.asset}</td>
      <td className="py-3.5 text-right font-mono text-xs text-ink-faint">
        {shortAddr(a.creator, 4)}
      </td>
      <td className="tabular py-3.5 text-right font-mono text-sm text-ink-dim">{a.executionCount}</td>
      <td className="tabular py-3.5 text-right font-mono text-sm text-ink-dim">
        {compactAmount(a.totalProfitLogged, 9)}
      </td>
      <td
        className={`tabular py-3.5 text-right font-mono text-sm ${gap ? "text-ember" : "text-ink-dim"}`}
        title={gap ? "logged but never routed to the vault" : undefined}
      >
        {compactAmount(a.totalProfitsRouted, 9)}
      </td>
      <td className="tabular py-3.5 text-right font-mono text-sm text-ink-faint">
        {(a.feeBps / 100).toFixed(1)}%
      </td>
      <td className="py-3.5 text-right">
        {address === a.creator ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => address && void run(() => buildCloseAgentTx(address, a.pda))}
            title="Deregister and return the rent"
            className="inline-flex items-center gap-1.5 font-mono text-[0.625rem] tracking-wider text-ember uppercase disabled:opacity-40"
          >
            <Icon icon={Trash} size={11} dither={false} />
            Close
          </button>
        ) : (
          <span className="font-mono text-[0.625rem] text-ink-faint">—</span>
        )}
      </td>
    </tr>
  );
}
