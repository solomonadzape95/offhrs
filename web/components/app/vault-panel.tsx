"use client";

import { ArrowsClockwise, Coins, Hourglass, LockKey, Vault as VaultIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { Stat } from "@/components/site/stat";
import { Icon } from "@/components/ui/icon";

/**
 * The vault: stake, accrue, claim.
 *
 * This is the loop the whole product promises — curve fees and arbitrage spread
 * land in the vault and stream to stakers over time, paid in the wrapped share
 * itself. The surface is built now, in full, so the shape the numbers arrive into
 * is settled; the numbers themselves are em dashes because the program is not
 * deployed, and an em dash is what an unavailable reading honestly looks like.
 *
 * The income ledger on the right is the same four facts the landing page states,
 * restated here because this is where they become actionable.
 */
export function VaultPanel() {
  const [amount, setAmount] = useState("");

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
        <Stat label="Staked" value="—" hint="no vault funded" />
        <Stat label="Accrued" value="—" tone="signal" hint="streams over time" />
        <Stat label="Claimable" value="—" hint="redeemable 1:1" />
        <Stat label="Income to date" value="—" hint="fees + spread" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.05fr]">
        {/* Stake form. Disabled, and says why. */}
        <div className="panel flex flex-col p-6 lg:p-7">
          <span className="label">Stake an agent token</span>

          <div className="mt-5 flex items-center gap-3 border border-edge bg-void px-4 py-3.5">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Amount to stake"
              className="w-full bg-transparent font-mono text-lg text-ink outline-none placeholder:text-ink-faint"
            />
            <span className="shrink-0 font-mono text-xs tracking-wider text-ink-faint uppercase">
              wPreStock
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {["25%", "50%", "Max"].map((p) => (
              <button
                key={p}
                type="button"
                disabled
                className="border border-edge px-3 py-1.5 font-mono text-[0.625rem] tracking-wider text-ink-faint uppercase disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>

          <button type="button" disabled className="btn btn-primary mt-5 w-full disabled:opacity-50">
            Stake
          </button>

          <p className="mt-4 font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
            The vault program is written and tested but not deployed, so staking is disabled.
            Rewards accrue per slot staked, not per epoch snapshot.
          </p>
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
        Claims are signed by your wallet; the vault never holds your keys. When the program is
        deployed, this page reads your position from the chain rather than from an API.
      </p>
    </div>
  );
}
