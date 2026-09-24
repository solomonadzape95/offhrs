"use client";

import { ArrowsClockwise, Coins, Hourglass, LockKey, Vault as VaultIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { buildClaimTx, buildStakeTx, buildUnstakeTx, getUserPosition } from "@/app/actions";
import { Stat } from "@/components/site/stat";
import { Icon } from "@/components/ui/icon";
import { Presets } from "@/components/ui/presets";
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
  const selectedRow = rows.find((r) => r.agentId === target);

  /** Fill the stake amount with a share of the wallet's liquid $AGENT. */
  const onPct = (pct: number) => {
    const bal = Number(selectedRow?.liquid ?? 0);
    if (!Number.isFinite(bal) || bal <= 0) return;
    setAmount(String(+(bal * (pct / 100)).toFixed(6)));
  };

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
            Stake an agent&apos;s token and it pays you over time from what the agent earns — in the
            wrapped share, redeemable 1:1.
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
          loading={pos.status === "loading"}
          hint="agent tokens"
        />
        <Stat
          label="Accrued"
          value={totals?.accrued ?? "—"}
          unit="wPreStock"
          tone="signal"
          loading={pos.status === "loading"}
          hint="streams over time"
        />
        <Stat
          label="Claimable"
          value={totals?.claimable ?? "—"}
          unit="wPreStock"
          loading={pos.status === "loading"}
          hint="redeemable 1:1"
        />
        <Stat
          label="Income to date"
          value={totals?.incomeToDate ?? "—"}
          unit="wPreStock"
          loading={pos.status === "loading"}
          hint="fees + gains"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.05fr]">
        {/* Stake / claim */}
        <div className="panel flex flex-col p-6 lg:p-7">
          <span className="label">Stake an agent token</span>

          {pos.status === "loading" ? (
            <div className="mt-5 flex flex-col gap-3">
              <span className="h-12 w-full animate-pulse bg-raised" />
              <span className="h-14 w-full animate-pulse bg-raised" />
              <div className="flex gap-3">
                <span className="h-11 flex-1 animate-pulse bg-raised" />
                <span className="h-11 flex-1 animate-pulse bg-raised" />
                <span className="h-11 w-20 animate-pulse bg-raised" />
              </div>
            </div>
          ) : rows.length === 0 ? (
            <p className="mt-5 text-sm leading-relaxed text-ink-dim">
              You don&apos;t hold any agent tokens yet. Buy one and it can start earning for you
              straight away.
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

              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <span className="font-mono text-[0.6875rem] text-ink-faint">
                  Liquid {selectedRow?.liquid ?? "0"} · Staked {selectedRow?.staked ?? "0"}
                </span>
                <Presets onPick={onPct} disabled={busy} />
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
                Signed in your wallet; the vault never holds your keys. Rewards build up for every
                moment you&apos;re staked.
              </p>
            </>
          )}
        </div>

        {/* Income ledger — the four facts, made legible. */}
        <div className="panel overflow-hidden">
          <div className="grid gap-px bg-edge">
            {[
              { k: "Income", v: "Curve fees + gap capture", icon: Coins },
              { k: "Payout", v: "Paid out for how long you hold", icon: Hourglass },
              { k: "Denomination", v: "The wrapped share, redeemable 1:1", icon: LockKey },
              { k: "Rule", v: "No snapshots. No deadline.", icon: ArrowsClockwise },
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
        from your on-chain stake — nothing here is an estimate.
      </p>
    </div>
  );
}
