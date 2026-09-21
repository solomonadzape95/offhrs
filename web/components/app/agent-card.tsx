"use client";

import Link from "next/link";
import { useState } from "react";

import { Basis } from "@/components/app/basis";
import { Curve } from "@/components/app/curve";
import { DitherAvatar } from "@/components/site/dither-avatar";
import { useTheme } from "@/components/site/theme-provider";
import { usd } from "@/lib/format";
import { AGENT_AVATAR_COLOR } from "@/lib/avatar";
import type { AgentSeed } from "@/lib/agents";
import type { PreStock } from "@/lib/market";

/**
 * Agent card for the /explore grid.
 *
 * Same standards as the landing carousel: a square card, a generative dithered
 * avatar in white, and a hover that is only the name and the avatar warming to the
 * active signal. No lift, no glow, no border change — the card is a document, not
 * a button that wants attention.
 *
 * The market figures are real. The agent record is seeded — `lib/agents.ts`
 * explains why, and the badge at the bottom says PREVIEW.
 */
export function AgentCard({ agent, asset }: { agent: AgentSeed; asset?: PreStock }) {
  const { theme } = useTheme();
  const [hover, setHover] = useState(false);
  const premiumBps = asset?.premiumBps ?? 0;

  return (
    <Link
      href={`/agent/${agent.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className="panel flex flex-col gap-5 rounded-none p-5"
    >
      {/* Header: avatar / name / ticker */}
      <div className="flex items-start gap-4">
        <DitherAvatar
          name={agent.id}
          color={hover ? theme.signal : AGENT_AVATAR_COLOR}
          className="size-12 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              className={`font-display truncate text-xl leading-none transition-colors duration-200 ${
                hover ? "text-signal" : "text-ink"
              }`}
            >
              {agent.name}
            </h3>
            <span className="font-mono text-[0.6875rem] tracking-[0.16em] text-ink-faint uppercase">
              ${agent.ticker}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-snug text-ink-dim">{agent.thesis}</p>
        </div>
      </div>

      {/* Dividend badge — names the exact asset the vault streams */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="border border-signal-dim/60 px-2 py-1 font-mono text-[0.625rem] tracking-[0.14em] text-signal uppercase">
          yields {asset?.symbol ?? agent.asset}
        </span>
        <span className="font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
          {agent.feeBps / 100}% curve fee
        </span>
      </div>

      {/* The number the card is actually about */}
      <div className="flex items-end justify-between gap-4 border-t border-edge pt-4">
        <div className="flex flex-col gap-1.5">
          <span className="label">Mark vs market</span>
          <Basis premiumBps={premiumBps} />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="label">Mark value</span>
          <span className="tabular font-mono text-sm text-ink-dim">
            {asset ? usd(asset.markValuation, { compact: true }) : "—"}
          </span>
        </div>
      </div>

      <Curve progress={agent.curveProgress} compact />

      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
          preview · no pool yet
        </span>
        <span className="font-mono text-xs tracking-[0.14em] text-signal uppercase">
          Open terminal →
        </span>
      </div>
    </Link>
  );
}
