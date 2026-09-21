"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { DitherAvatar } from "@/components/site/dither-avatar";
import { useTheme } from "@/components/site/theme-provider";
import { Icon } from "@/components/ui/icon";
import { AGENT_AVATAR_COLOR } from "@/lib/avatar";
import type { AgentSeed } from "@/lib/agents";

/**
 * The agent board, as a carousel.
 *
 * The mechanics above are a bento because their three ideas are read together.
 * The agents are the opposite: a handful of peers where the job is to browse. A
 * horizontal rail does that without pretending each row is a different kind of
 * thing, and it gives the page one gesture that is not vertical scroll.
 *
 * The card is deliberately flat: square corners, no lift, no glow, no wash. The
 * only hover is the desk's own name and avatar warming from white to the active
 * signal — one move, in the content, rather than the whole surface reacting.
 *
 * Native scroll-snap does the work — no animation library, no measuring.
 */
export function AgentCarousel({ agents }: { agents: AgentSeed[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setProgress(max <= 0 ? 1 : el.scrollLeft / max);
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft >= max - 4);
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const move = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    const step = (card?.offsetWidth ?? 320) + 20;
    el.scrollBy({ left: step * dir, behavior: "smooth" });
  };

  return (
    <div className="mt-12">
      <div className="flex items-center justify-between gap-6">
        <div className="h-px max-w-sm flex-1 bg-edge">
          <div
            className="h-px bg-signal transition-[width] duration-200"
            style={{ width: `${Math.max(8, progress * 100)}%` }}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={atStart}
            aria-label="Previous agents"
            className="icon-btn disabled:opacity-35"
          >
            <Icon icon={ArrowLeft} size={16} />
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={atEnd}
            aria-label="Next agents"
            className="icon-btn disabled:opacity-35"
          >
            <Icon icon={ArrowRight} size={16} />
          </button>
        </div>
      </div>

      <div
        ref={track}
        className="-mx-5 mt-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 py-4 sm:-mx-8 sm:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {agents.map((agent, i) => (
          <AgentCard key={agent.id} agent={agent} index={i} />
        ))}
      </div>
    </div>
  );
}

function AgentCard({ agent, index }: { agent: AgentSeed; index: number }) {
  const { theme } = useTheme();
  const [hover, setHover] = useState(false);

  return (
    <article
      data-card
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className="panel flex w-[min(90vw,40rem)] shrink-0 snap-start flex-col rounded-none p-7 sm:p-8"
    >
      <div className="flex flex-col gap-7 sm:flex-row sm:items-start">
        <DitherAvatar
          name={agent.name}
          color={hover ? theme.signal : AGENT_AVATAR_COLOR}
          className="size-28 shrink-0 sm:size-36"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <span className="label">Desk {String(index + 1).padStart(2, "0")}</span>
            <span className="figure text-xs text-ink-faint">
              {String(index + 1).padStart(2, "0")}
            </span>
          </div>
          <h3
            className={`font-display mt-4 text-4xl leading-none transition-colors duration-200 lg:text-5xl ${
              hover ? "text-signal" : "text-ink"
            }`}
          >
            {agent.name}
          </h3>
          <p className="mt-2 font-mono text-[0.6875rem] tracking-[0.16em] text-ink-faint uppercase">
            {agent.ticker} · {agent.asset}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-ink-dim">{agent.thesis}</p>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-3 gap-6 border-t border-edge pt-6">
        <div className="col-span-3 sm:col-span-1">
          <span className="label">Curve filled</span>
          <p className="figure mt-2 text-lg text-ink">{Math.round(agent.curveProgress * 100)}%</p>
          <div className="curve-track mt-2.5">
            <span className="curve-fill" style={{ width: `${agent.curveProgress * 100}%` }} />
          </div>
        </div>
        <div>
          <span className="label">Fee tier</span>
          <p className="figure mt-2 text-lg text-signal">{(agent.feeBps / 100).toFixed(1)}%</p>
        </div>
        <div>
          <span className="label">Last trade</span>
          <p className="figure mt-2 text-lg text-ink-faint">
            {Math.round(agent.lastTradeSecsAgo / 60)}m
          </p>
        </div>
      </div>

      <Link
        href={`/agent/${agent.id}`}
        className="mt-7 inline-flex items-center gap-1.5 font-mono text-xs tracking-[0.14em] text-signal uppercase"
      >
        Open terminal
        <Icon icon={ArrowUpRight} size={13} dither={false} />
      </Link>
    </article>
  );
}
