"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Coins, Pause, Play } from "@phosphor-icons/react";

import { buildSetPausedTx } from "@/app/actions";
import { Curve } from "@/components/app/curve";
import { DitherAvatar } from "@/components/site/dither-avatar";
import { Stat } from "@/components/site/stat";
import { useTheme } from "@/components/site/theme-provider";
import { Icon } from "@/components/ui/icon";
import { AGENT_AVATAR_COLOR } from "@/lib/avatar";
import type { AgentSeed } from "@/lib/agents";
import { useWriteTx } from "@/lib/use-write-tx";
import { useWalletUi } from "@/lib/wallet";

/**
 * Creator view of a single agent.
 *
 * The only "manage" instruction the program actually has is `set_paused` on the
 * **wrapper** — a circuit breaker mirroring PreStocks' `pausableConfig` that
 * halts wrapping/unwrapping, not the agent's trading or the vault. So that is
 * what the control does, and it is labelled as such. Creator fees have no
 * on-chain instruction: Clawpump collects and distributes them, so the button
 * links there rather than pretending to withdraw.
 */
export type ManageData = {
  pda: string;
  agentTokenMint: string;
  totalProfitRouted: string;
  executionCount: number;
  paused: boolean;
};

const fmtWPreStock = (raw: string) => {
  const n = Number(raw) / 1e9;
  if (!Number.isFinite(n) || n === 0) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

export function AgentManage({ agent, onchain }: { agent: AgentSeed; onchain?: ManageData | null }) {
  const { theme } = useTheme();
  const { address } = useWalletUi();
  const [hover, setHover] = useState(false);
  const [paused, setPaused] = useState(onchain?.paused ?? false);
  const { state: write, run } = useWriteTx(() => setPaused((p) => !p));

  const busy = write.status === "signing" || write.status === "sending";

  const onTogglePause = () => {
    if (!address || !onchain) return;
    void run(() => buildSetPausedTx(address, onchain.pda, !paused));
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <span
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            className="shrink-0"
          >
            <DitherAvatar
              name={agent.id}
              color={hover ? theme.signal : AGENT_AVATAR_COLOR}
              className="size-16"
            />
          </span>
          <div>
            <span className="label">Manage desk</span>
            <h1 className="font-display mt-2 text-3xl leading-none text-ink sm:text-4xl">
              {agent.name}
            </h1>
            <p className="mt-2 font-mono text-[0.6875rem] tracking-[0.16em] text-ink-faint uppercase">
              {agent.ticker} · {agent.asset}
            </p>
          </div>
        </div>
        <Link href={`/agent/${agent.id}`} className="btn btn-ghost">
          Public terminal
          <Icon icon={ArrowUpRight} size={14} dither={false} />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-10 border-t border-edge pt-10 lg:grid-cols-4">
        <Stat
          label="Curve filled"
          value={`${Math.round(agent.curveProgress * 100)}%`}
          hint="of the bonding curve"
        />
        <Stat
          label="Fee tier"
          value={`${(agent.feeBps / 100).toFixed(1)}%`}
          tone="signal"
          hint="your creator fee"
        />
        <Stat
          label="Fees routed"
          value={onchain ? fmtWPreStock(onchain.totalProfitRouted) : "—"}
          unit={onchain ? "wPreStock" : undefined}
          hint={onchain ? "lifetime, into the vault" : "not on chain"}
        />
        <Stat
          label="Executions"
          value={onchain ? String(onchain.executionCount) : "—"}
          hint={onchain ? "Pyth-attested" : "no agent"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="panel flex flex-col p-6 lg:p-7">
          <span className="label">Curve</span>
          <div className="mt-6">
            <Curve progress={agent.curveProgress} />
          </div>
          <p className="mt-6 text-sm leading-relaxed text-ink-dim">{agent.thesis}</p>
        </div>

        <div className="panel overflow-hidden">
          <div className="grid gap-px bg-edge">
            <div className="flex items-center justify-between gap-4 bg-void px-6 py-5">
              <div>
                <span className="label">Wrapper transfers</span>
                <p className="mt-1 text-sm text-ink-dim">{paused ? "Paused" : "Open"}</p>
              </div>
              <button
                type="button"
                disabled={!onchain || busy}
                onClick={onTogglePause}
                className="btn btn-ghost !px-4 !py-2.5 !text-xs disabled:opacity-50"
              >
                <Icon icon={paused ? Play : Pause} size={14} dither={false} />
                {busy ? "…" : paused ? "Resume" : "Pause"}
              </button>
            </div>
            <div className="flex items-center justify-between gap-4 bg-void px-6 py-5">
              <div>
                <span className="label">Creator fees</span>
                <p className="mt-1 text-sm text-ink-dim">Curve fee on secondary trades</p>
              </div>
              {onchain ? (
                <a
                  href={`https://clawpump.tech/tokens/${onchain.agentTokenMint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary !px-4 !py-2.5 !text-xs"
                >
                  <Icon icon={Coins} size={14} dither={false} />
                  Clawpump
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="btn btn-primary !px-4 !py-2.5 !text-xs disabled:opacity-50"
                >
                  <Icon icon={Coins} size={14} dither={false} />
                  Withdraw
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {write.status === "done" && (
        <p className="font-mono text-[0.6875rem] break-all text-signal">
          Confirmed: {write.signature}
        </p>
      )}
      {write.status === "error" && (
        <p className="text-xs leading-relaxed text-ember">{write.error}</p>
      )}

      <p className="font-mono text-xs leading-relaxed text-ink-faint">
        {onchain
          ? "Pause halts wrapping and unwrapping for this asset, admin-only. It does not stop the agent or the vault. Creator fees are collected and distributed by Clawpump."
          : "This is a seeded preview record — there is no on-chain agent to manage yet."}
      </p>
    </div>
  );
}
