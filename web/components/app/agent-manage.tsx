"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Coins, Pause, Play } from "@phosphor-icons/react";

import { Curve } from "@/components/app/curve";
import { DitherAvatar } from "@/components/site/dither-avatar";
import { Stat } from "@/components/site/stat";
import { useTheme } from "@/components/site/theme-provider";
import { Icon } from "@/components/ui/icon";
import { AGENT_AVATAR_COLOR } from "@/lib/avatar";
import type { AgentSeed } from "@/lib/agents";

/**
 * Creator view of a single agent.
 *
 * Distinct from the public `/agent/[id]` terminal: this is the control surface for
 * the desk you launched — its execution state, the fee it earns you, and the
 * curve. The public page is what a trader sees; this is what an operator sees.
 *
 * Same avatar standard as everywhere: white at rest, warming to the active signal
 * on hover. Controls are disabled and say why, because the registry program is not
 * deployed.
 */
export function AgentManage({ agent }: { agent: AgentSeed }) {
  const { theme } = useTheme();
  const [hover, setHover] = useState(false);
  const [paused, setPaused] = useState(false);

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
        <Stat label="Fees earned" value="—" hint="program not deployed" />
        <Stat label="Stakers" value="—" hint="no pool yet" />
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
                <span className="label">Execution</span>
                <p className="mt-1 text-sm text-ink-dim">{paused ? "Paused" : "Armed"}</p>
              </div>
              <button
                type="button"
                disabled
                onClick={() => setPaused((p) => !p)}
                className="btn btn-ghost !px-4 !py-2.5 !text-xs disabled:opacity-50"
              >
                <Icon icon={paused ? Play : Pause} size={14} dither={false} />
                {paused ? "Resume" : "Pause"}
              </button>
            </div>
            <div className="flex items-center justify-between gap-4 bg-void px-6 py-5">
              <div>
                <span className="label">Creator fees</span>
                <p className="mt-1 text-sm text-ink-dim">Curve fee on secondary trades</p>
              </div>
              <button
                type="button"
                disabled
                className="btn btn-primary !px-4 !py-2.5 !text-xs disabled:opacity-50"
              >
                <Icon icon={Coins} size={14} dither={false} />
                Withdraw
              </button>
            </div>
          </div>
        </div>
      </div>

      <p className="font-mono text-xs leading-relaxed text-ink-faint">
        The registry program is not deployed, so pause and withdraw are disabled. When it is, this
        page reads and writes your agent account directly rather than through an API.
      </p>
    </div>
  );
}
