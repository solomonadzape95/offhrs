"use client";

import { ArrowsClockwise, Coins, Hourglass, LockKey, Vault as VaultIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { buildClaimTx, buildStakeTx, buildUnstakeTx, getUserPosition } from "@/app/actions";
import { Stat } from "@/components/site/stat";
import { Icon } from "@/components/ui/icon";
import { useServerData } from "@/lib/use-server-data";
import { useWriteTx } from "@/lib/use-write-tx";
import { useWalletUi } from "@/lib/wallet";

/** `$AGENT` base decimals from the DBC config. */
const AGENT_DECIMALS = 6;

/**
 * The vault: stake, accrue, claim.
 *
 * The figures are read from the chain, and the two buttons are live: they build
 * an unsigned transaction on the server, have the connected wallet sign it, and
 * relay it back. Rewards stream per slot held, so the accrued figure grows
 * between claims without anyone touching the vault.
 */
export function VaultPanel() {
  const { address } = useWalletUi();
  const [nonce, setNonce] = useState(0);
  const [amount, setAmount] = useState("");
  const [selected, setSelected] = useState("");

  const pos = useServerData(address ? `${address}:${nonce}` : null, () =>
    getUserPosition(address as string),
  );
  const rows = pos.status === "ready" ? pos.data.rows : [];
  const totals = pos.status === "ready" ? pos.data.totals : null;

  const { state, run, reset } = useWriteTx(() => setNonce((n) => n + 1));
  const busy = state.status === "signing" || state.status === "sending";

  // Default the selector to the first agent once the registry has loaded.
  useEffect(() => {
    if (!selected && rows.length > 0) setSelected(rows[0].agentId);
  }, [rows, selected]);

  const target = selected || rows[0]?.agentId || "";

  const onStake = () => {
    if (!address || !target) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    const raw = BigInt(Math.floor(n * 10 ** AGENT_DECIMALS)).toString();
    void run(() => buildStakeTx(address, target, raw));
    setAmount("");
  };

  const onClaim = () => {
    if (!address || !target) return;
    void run(() => buildClaimTx(address, target));
  };

  const onUnstake = () => {
    if (!address || !target) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    const raw = BigInt(Math.floor(n * 10 ** AGENT_DECIMALS)).toString();
    void run(() => buildUnstakeTx(address, target, raw));
    setAmount("");
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-8">
        <div className="flex flex-col gap-3">
          <span className="label">Vault</span>
          <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">
            Stake, accrue, claim.
          </h1>
          <p className="max-w-lg text-sm leading-relaxed text-ink-dim">
            Stake an agent token, and its share of curve fees and arbitrage spread streams to you
            over time. Payouts are denominated in the wrapped share itself, redeemable 1:1.
          </p>
        </div>
        <span className="text-signal">
          <Icon icon={VaultIcon} size={44} dither={false} />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-10 border-t border-edge pt-10 lg:grid-cols-4">
        <Stat
          label="Staked"
          value={totals?.staked ?? "—"}
          hint={pos.status === "loading" ? "reading the chain…" : "agent tokens"}
        />
        <Stat
          label="Accrued"
          value={totals?.accrued ?? "—"}
          unit="wPreStock"
          tone="signal"
          hint="streams over time"
        />
        <Stat
          label="Claimable"
          value={totals?.claimable ?? "—"}
          unit="wPreStock"
          hint="redeemable 1:1"
        />
        <Stat
          label="Income to date"
          value={totals?.incomeToDate ?? "—"}
          unit="wPreStock"
          hint="fees + spread"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.05fr]">
        {/* Stake / claim */}
        <div className="panel flex flex-col p-6 lg:p-7">
          <span className="label">Stake an agent token</span>

          {rows.length === 0 ? (
            <p className="mt-5 text-sm leading-relaxed text-ink-dim">
              {pos.status === "loading"
                ? "Reading the registry…"
                : "No agent is registered on this cluster yet, so there is nothing to stake into."}
            </p>
          ) : (
            <>
              <select
                value={target}
                onChange={(e) => {
                  setSelected(e.target.value);
                  reset();
                }}
                aria-label="Agent to stake"
                className="mt-5 w-full border border-edge bg-void px-4 py-3 font-mono text-sm text-ink outline-none"
              >
                {rows.map((r) => (
                  <option key={r.agentId} value={r.agentId}>
                    {r.name} (${r.ticker}) — staked {r.staked}
                  </option>
                ))}
              </select>

              <div className="mt-3 flex items-center gap-3 border border-edge bg-void px-4 py-3.5">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label="Amount to stake"
                  className="w-full bg-transparent font-mono text-lg text-ink outline-none placeholder:text-ink-faint"
                />
                <span className="shrink-0 font-mono text-xs tracking-wider text-ink-faint uppercase">
                  $AGENT
                </span>
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={onStake}
                  disabled={busy || !amount || Number(amount) <= 0}
                  className="btn btn-primary flex-1 disabled:opacity-50"
                >
                  {state.status === "signing"
                    ? "Sign…"
                    : state.status === "sending"
                      ? "Sending…"
                      : "Stake"}
                </button>
                <button
                  type="button"
                  onClick={onUnstake}
                  disabled={busy || !amount || Number(amount) <= 0}
                  className="btn btn-ghost flex-1 disabled:opacity-50"
                >
                  Unstake
                </button>
                <button
                  type="button"
                  onClick={onClaim}
                  disabled={busy || !target}
                  className="btn btn-ghost disabled:opacity-50"
                >
                  Claim
                </button>
              </div>

              {state.status === "done" && (
                <p className="mt-3 font-mono text-[0.6875rem] break-all text-signal">
                  Confirmed: {state.signature}
                </p>
              )}
              {state.status === "error" && (
                <p className="mt-3 text-xs leading-relaxed text-ember">{state.error}</p>
              )}

              <p className="mt-4 font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
                Signed in your wallet; the vault never holds your keys. Rewards accrue per slot
                staked, not per epoch snapshot.
              </p>
            </>
          )}
        </div>

        {/* Income ledger — the four facts, made legible. */}
        <div className="panel overflow-hidden">
          <div className="grid gap-px bg-edge">
            {[
              { k: "Income", v: "DBC curve fees + basis capture", icon: Coins },
              { k: "Payout", v: "Streamed pro-rata over time held", icon: Hourglass },
              { k: "Denomination", v: "wPreStock, redeemable 1:1", icon: LockKey },
              { k: "Rule", v: "Snapshot-free. No staking deadline.", icon: ArrowsClockwise },
            ].map((f) => (
              <div key={f.k} className="flex items-center gap-5 bg-void px-6 py-6">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-signal/8 text-signal">
                  <Icon icon={f.icon} size={26} dither={false} />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="label">{f.k}</span>
                  <p className="mt-1 text-base leading-snug text-ink-dim">{f.v}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="font-mono text-xs leading-relaxed text-ink-faint">
        Claims are signed by your wallet; the vault never holds your keys. The figures above are read
        from your on-chain stake rather than from an API.
      </p>
    </div>
  );
}
