"use client";

import Link from "next/link";

import { RequireWallet } from "@/components/app/require-wallet";
import { SessionClock } from "@/components/site/session-clock";
import { Stat } from "@/components/site/stat";
import { useWalletUi, shortAddress } from "@/lib/wallet";
import { useBalance } from "@solana/react-hooks";
import { lamportsToSolString } from "@solana/client";
import { AGENTS } from "@/lib/agents";

/**
 * Position.
 *
 * Three of the four figures here are em dashes, and that is the honest answer:
 * the `stock_vault` program is not deployed, so no wallet can hold a stake or
 * accrue a dividend yet. The SOL balance is real, because that is the one thing
 * a connected Solana wallet genuinely has.
 *
 * The layout is the point — it is the shape the numbers will arrive into.
 */
export default function DashboardPage() {
  return (
    <section className="mx-auto max-w-app px-5 py-10 sm:px-8 sm:py-14">
      <RequireWallet>
        <Position />
      </RequireWallet>
    </section>
  );
}

function Position() {
  const { address } = useWalletUi();
  const { lamports } = useBalance(address as never);

  const sol = lamports != null ? lamportsToSolString(lamports) : null;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-8">
        <div className="flex flex-col gap-3">
          <span className="label">Position</span>
          <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Net wealth</h1>
          <p className="max-w-lg text-sm leading-relaxed text-ink-dim">
            Agent tokens plus the pre-IPO equity accumulated behind them. Both sides move: the tokens
            trade, the equity accrues.
          </p>
        </div>
        <SessionClock variant="hero" />
      </div>

      <div className="grid grid-cols-2 gap-10 border-t border-edge pt-10 lg:grid-cols-4">
        <Stat label="Agent tokens" value="—" hint="no stake yet" />
        <Stat label="Equity accrued" value="—" tone="signal" hint="no vault funded" />
        <Stat label="Claimable" value="—" hint="streams over time" />
        <Stat
          label="SOL balance"
          value={sol ?? "—"}
          unit="SOL"
          hint={address ? shortAddress(address) : ""}
        />
      </div>

      {/* Equity inventory, mirroring the public portfolio page. */}
      <div className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between">
          <span className="label">Real equity inventory</span>
          <span className="font-mono text-xs text-ink-faint">redeemable 1:1 for raw PreStock</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {["SPACEX", "OPENAI", "ANTHROPIC", "NEURALINK"].map((sym) => (
            <div key={sym} className="panel flex flex-col gap-3 p-5">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-sm text-ink">{sym}</span>
                <span className="font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
                  w{sym}
                </span>
              </div>
              <span className="tabular font-mono text-lg text-ink-dim">—</span>
            </div>
          ))}
        </div>
      </div>

      {/* Holdings table */}
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="label">Holdings</span>
          <button disabled className="btn btn-ghost !px-4 !py-2.5 !text-xs opacity-50">
            Claim all equity
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-150 border-collapse">
            <thead>
              <tr className="border-b border-edge">
                {["Agent", "Staked", "Accrued", "Yield asset", "Claim"].map((h, i) => (
                  <th key={h} className={`label py-3 ${i === 0 ? "text-left" : "text-right"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AGENTS.slice(0, 4).map((a) => (
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
                  <td className="tabular py-3.5 text-right font-mono text-sm text-ink-dim">—</td>
                  <td className="tabular py-3.5 text-right font-mono text-sm text-ink-dim">—</td>
                  <td className="py-3.5 text-right font-mono text-sm text-ink-faint">{a.asset}</td>
                  <td className="py-3.5 text-right font-mono text-xs text-ink-faint">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel flex flex-col gap-3 p-5">
          <span className="label">Why these are empty</span>
          <p className="max-w-2xl text-sm leading-relaxed text-ink-dim">
            The staking vault and the wrapper are written and tested, but the program is not deployed
            to mainnet yet, so there is no vault for a wallet to stake into. Nothing here is
            simulated — an em dash is what an unavailable reading looks like.
          </p>
          <Link
            href="/app/profile"
            className="font-mono text-xs tracking-wider text-signal uppercase"
          >
            Deployment status →
          </Link>
        </div>
      </div>

      <p className="font-mono text-xs text-ink-faint">
        Marks for the whole universe are on the{" "}
        <Link href="/explore" className="text-signal">
          market page
        </Link>
        .
      </p>
    </div>
  );
}
