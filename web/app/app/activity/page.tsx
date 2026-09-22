"use client";

import Link from "next/link";

import { getUserExecutions } from "@/app/actions";
import { RequireWallet } from "@/components/app/require-wallet";
import { Terminal, type TerminalRow } from "@/components/app/terminal";
import { useServerData } from "@/lib/use-server-data";
import { useWalletUi } from "@/lib/wallet";

/**
 * Activity — the execution log.
 *
 * Reads the agent's `ArbExecution` accounts on chain through the
 * `getUserExecutions` server action and renders them in the same terminal the
 * public agent page uses. Each row carries the Pyth read that justified it,
 * copied onto the record by the program — so a fill cannot be shown without the
 * oracle data behind it.
 */
const SCHEMA = [
  ["index", "u64", "monotonic per agent; also the PDA seed"],
  ["venue", "enum", "which DEX the fill landed on"],
  ["amount_in / amount_out", "u64", "the two legs"],
  ["profit", "u64", "derived on-chain, not asserted"],
  ["pyth_price / pyth_exponent", "i64 / i32", "copied from the agent's Signal"],
  ["pyth_publish_time / staleness", "i64 / u64", "the attestation behind the trade"],
  ["regime", "enum", "live or frozen at execution time"],
];

export default function ActivityPage() {
  const { address } = useWalletUi();
  const execs = useServerData(address, () => getUserExecutions(address as string));

  const rows: TerminalRow[] = (execs.status === "ready" ? execs.data : []).map((e) => ({
    t: e.executedAt,
    kind: "fill",
    text:
      `${e.agentName} #${e.index} ${e.venue}  ${e.amountIn} → ${e.amountOut}  profit ${e.profit}` +
      `  ·  pyth ${e.pythPrice}e${e.pythExponent} ${e.regime} stale ${e.stalenessSecs}s`,
  }));

  return (
    <section className="mx-auto max-w-app px-5 py-10 sm:px-8 sm:py-14">
      <RequireWallet
        title="Connect to see executions"
        body="Executions are logged against your wallet's agent registrations, so there is nothing to read until one is connected."
      >
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <span className="label">Activity</span>
            <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Executions</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-ink-dim">
              Every trade an agent makes is written on chain together with the price read that
              justified it. The two are stored together, so a logged trade can&apos;t be separated
              from the price data behind it.
            </p>
          </div>

          <Terminal rows={rows} title="arb.log" />

          <div className="panel flex flex-col gap-5 p-6">
            <span className="label">What a record contains</span>
            <dl className="flex flex-col divide-y divide-edge/60">
              {SCHEMA.map(([field, type, note]) => (
                <div key={field} className="grid gap-1 py-3 sm:grid-cols-[14rem_5rem_1fr] sm:gap-4">
                  <dt className="font-mono text-xs text-ink">{field}</dt>
                  <dd className="font-mono text-xs text-ink-faint">{type}</dd>
                  <dd className="text-sm leading-snug text-ink-dim">{note}</dd>
                </div>
              ))}
            </dl>
            <p className="max-w-2xl font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
              {execs.status === "ready" && execs.data.length > 0
                ? `${execs.data.length} execution${execs.data.length === 1 ? "" : "s"} logged for your agents on this cluster.`
                : "No executions logged for your agents on this cluster yet. Written and tested in " +
                  "programs/stock_vault/src/execution.rs, with 7 integration tests covering the " +
                  "attestation copy, the index ordering and the authorisation."}
            </p>
          </div>

          <Link
            href="/app/profile"
            className="font-mono text-xs tracking-wider text-signal uppercase"
          >
            Deployment status →
          </Link>
        </div>
      </RequireWallet>
    </section>
  );
}
