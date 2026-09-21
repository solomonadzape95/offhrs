"use client";

import Link from "next/link";

import { RequireWallet } from "@/components/app/require-wallet";
import { Terminal, type TerminalRow } from "@/components/app/terminal";
import { useWalletUi } from "@/lib/wallet";

/**
 * Activity — the execution log.
 *
 * §8 wants a live terminal of the agent's on-chain arbitrage executions. Those
 * records are `ArbExecution` accounts on the `stock_vault` program, and the
 * program is not deployed, so there are none to read. Rather than fill the
 * terminal with invented fills, this states the schema and shows nothing until
 * there is something true to show.
 *
 * The wiring is `getProgramAccounts` against the program id filtered on the
 * `ArbExecution` discriminator, decoded with the same field order as
 * `programs/stock_vault/src/state.rs`. That is a small amount of code that
 * cannot be written honestly until the program has an address to point at.
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
  const rows: TerminalRow[] = [];

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
              Every fill an agent makes is written on chain with the Pyth read that justified it. The
              oracle fields are copied from the agent&apos;s signal by the program, so a logged trade
              cannot be separated from the data behind it.
            </p>
          </div>

          <Terminal rows={rows} title="arb.log" />

          <div className="panel flex flex-col gap-5 p-6">
            <span className="label">What a record will contain</span>
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
              Written and tested in{" "}
              <span className="text-ink-dim">programs/stock_vault/src/execution.rs</span>, with 7
              integration tests covering the attestation copy, the index ordering, and the
              authorisation. None of it can be read from a browser until the program has an address.
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
