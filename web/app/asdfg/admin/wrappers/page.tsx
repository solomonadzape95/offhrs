"use client";

import { Power } from "@phosphor-icons/react";

import { buildSetPausedForWrapperTx } from "@/app/actions";
import { getAdminWrappers } from "@/app/asdfg/admin/actions";
import { Icon } from "@/components/ui/icon";
import { amount, shortAddr } from "@/lib/format";
import { useServerData } from "@/lib/use-server-data";
import { useWriteTx } from "@/lib/use-write-tx";
import { useWalletUi } from "@/lib/wallet";

export default function AdminWrappersPage() {
  const { address } = useWalletUi();
  const data = useServerData("admin:wrappers", getAdminWrappers);
  const { state, run } = useWriteTx();
  const busy = state.status === "signing" || state.status === "sending";
  const rows = data.status === "ready" ? data.data : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="label">Wrapped PreStocks</span>
        <span className="font-mono text-xs text-ink-faint">
          supply must equal the reserve. Pause halts wrap and unwrap.
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-230 border-collapse">
          <thead>
            <tr className="border-b border-edge">
              {["Asset", "Prestock", "Reserve", "Backed", "Fees paid in", "State", ""].map((h, i) => (
                <th key={h} className={`label py-3 ${i === 0 ? "text-left" : "text-right"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.pda} className="border-b border-edge/60">
                <td className="py-3.5">
                  <span className="font-mono text-sm text-ink">{w.symbol}</span>
                  <span className="ml-3 font-mono text-[0.625rem] text-ink-faint">
                    {shortAddr(w.wrappedMint)}
                  </span>
                </td>
                <td className="py-3.5 text-right font-mono text-xs text-ink-faint">
                  {shortAddr(w.prestockMint, 5)}
                </td>
                <td className="tabular py-3.5 text-right font-mono text-sm text-ink-dim">
                  {amount(w.reserveAmount, 9, 2)}
                </td>
                <td className="py-3.5 text-right">
                  <span
                    className={`font-mono text-[0.625rem] tracking-[0.14em] uppercase ${
                      w.invariantOk ? "text-signal" : "text-ember"
                    }`}
                    title={
                      w.invariantOk
                        ? "wrapped supply equals the reserve"
                        : `supply ${w.wrappedSupply} ≠ reserve ${w.reserveAmount}`
                    }
                  >
                    {w.invariantOk ? "1:1" : "broken"}
                  </span>
                </td>
                <td className="tabular py-3.5 text-right font-mono text-sm text-ink-faint">
                  {amount(w.totalFeePaidIn, 9, 4)}
                </td>
                <td className="py-3.5 text-right">
                  <span
                    className={`font-mono text-[0.625rem] tracking-[0.14em] uppercase ${
                      w.paused ? "text-ember" : "text-signal"
                    }`}
                  >
                    {w.paused ? "paused" : "live"}
                  </span>
                </td>
                <td className="py-3.5 text-right">
                  <button
                    type="button"
                    disabled={busy || address !== w.admin}
                    title={
                      address !== w.admin
                        ? "Only this wrapper's admin can pause it"
                        : w.paused
                          ? "Resume wrap and unwrap"
                          : "Halt wrap and unwrap"
                    }
                    onClick={() =>
                      address &&
                      void run(() => buildSetPausedForWrapperTx(address, w.prestockMint, !w.paused))
                    }
                    className="inline-flex items-center gap-1.5 font-mono text-[0.625rem] tracking-wider text-signal uppercase disabled:opacity-30"
                  >
                    <Icon icon={Power} size={11} dither={false} />
                    {busy ? "…" : w.paused ? "Resume" : "Pause"}
                  </button>
                </td>
              </tr>
            ))}
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
