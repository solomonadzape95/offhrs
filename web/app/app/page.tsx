"use client";

import Link from "next/link";
import { useState } from "react";

import { buildClaimTx, getUserPosition } from "@/app/actions";
import { DevnetFaucet } from "@/components/app/devnet-faucet";
import { RequireWallet } from "@/components/app/require-wallet";
import { SessionClock } from "@/components/site/session-clock";
import { Stat } from "@/components/site/stat";
import { useServerData } from "@/lib/use-server-data";
import { useWriteTx } from "@/lib/use-write-tx";
import { useWalletUi, shortAddress } from "@/lib/wallet";
import { useBalance } from "@solana/react-hooks";
import { lamportsToSolString } from "@solana/client";

/**
 * Position.
 *
 * Every figure here is read from the chain: the stakes and the accrued wrapped
 * PreStock come from `UserStake` and `DividendVault` accounts via the
 * `getUserPosition` server action. Where there is genuinely nothing yet — no
 * stake, no vault — it stays an em dash rather than a reassuring zero.
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

  const [nonce, setNonce] = useState(0);
  const pos = useServerData(address ? `${address}:${nonce}` : null, () =>
    getUserPosition(address as string),
  );
  const { state: write, run } = useWriteTx(() => setNonce((n) => n + 1));
  const busy = write.status === "signing" || write.status === "sending";
  const data = pos.status === "ready" ? pos.data : null;
  const sol = lamports != null ? lamportsToSolString(lamports) : null;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-8">
        <div className="flex flex-col gap-3">
          <span className="label">Position</span>
          <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Your position</h1>
          <p className="max-w-lg text-sm leading-relaxed text-ink-dim">
            The agent tokens you hold, plus the share equity they have earned for you. Both sides
            move: the tokens trade, the equity builds up.
          </p>
        </div>
        <SessionClock variant="hero" />
      </div>

      <DevnetFaucet />

      <div className="grid grid-cols-2 gap-10 border-t border-edge pt-10 lg:grid-cols-4">
        <Stat
          label="Agent tokens"
          value={data?.totals.staked ?? "—"}
          hint={pos.status === "loading" ? "reading the chain…" : "staked across your agents"}
        />
        <Stat
          label="Equity accrued"
          value={data?.totals.accrued ?? "—"}
          unit="wPreStock"
          tone="signal"
          hint="streams over time"
        />
        <Stat
          label="Claimable"
          value={data?.totals.claimable ?? "—"}
          unit="wPreStock"
          hint="redeemable 1:1"
        />
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
          <span className="label">Your share inventory</span>
          <span className="font-mono text-xs text-ink-faint">redeemable 1:1 for raw PreStock</span>
        </div>
        {data && data.equity.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.equity.map((e) => (
              <div key={e.wrappedMint} className="panel flex flex-col gap-3 p-5">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-sm text-ink">{e.symbol}</span>
                  <span className="font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
                    w{e.symbol}
                  </span>
                </div>
                <span className="tabular font-mono text-lg text-ink-dim">{e.claimable}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="font-mono text-sm text-ink-faint">
            {pos.status === "loading"
              ? "Reading the chain…"
              : "No wrapped equity accrued behind your stakes yet."}
          </p>
        )}
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
              {(data?.rows ?? []).map((r) => (
                <tr key={r.agentId} className="border-b border-edge/60">
                  <td className="py-3.5">
                    <Link
                      href={`/agent/${r.agentId}`}
                      className="font-mono text-sm text-ink transition-colors hover:text-signal"
                    >
                      {r.name}
                    </Link>
                    <span className="ml-3 font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
                      ${r.ticker}
                    </span>
                  </td>
                  <td className="tabular py-3.5 text-right font-mono text-sm text-ink-dim">
                    {r.staked}
                  </td>
                  <td className="tabular py-3.5 text-right font-mono text-sm text-ink-dim">
                    {r.accrued}
                  </td>
                  <td className="py-3.5 text-right font-mono text-sm text-ink-faint">{r.asset}</td>
                  <td className="py-3.5 text-right">
                    <button
                      type="button"
                      disabled={busy || Number(r.staked) <= 0}
                      onClick={() => address && void run(() => buildClaimTx(address, r.agentId))}
                      className="font-mono text-[0.625rem] tracking-wider text-signal uppercase disabled:opacity-40"
                    >
                      {busy ? "…" : "Claim"}
                    </button>
                  </td>
                </tr>
              ))}
              {data && data.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 font-mono text-sm text-ink-faint">
                    No agents registered on this cluster yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="panel flex flex-col gap-3 p-5">
          <span className="label">
            {data?.onChain ? "Where these numbers come from" : "Why these are empty"}
          </span>
          <p className="max-w-2xl text-sm leading-relaxed text-ink-dim">
            {data?.onChain
              ? "Read directly from your on-chain stake. Rewards build up for every moment you hold, so the figure grows without anyone claiming."
              : "The vault program isn't deployed to the network this build points at, so there's nothing to stake into yet. Dashes are what an unavailable reading honestly looks like."}
          </p>
          {write.status === "done" && (
            <p className="font-mono text-[0.6875rem] break-all text-signal">
              Claim confirmed: {write.signature}
            </p>
          )}
          {write.status === "error" && (
            <p className="text-xs leading-relaxed text-ember">{write.error}</p>
          )}
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
