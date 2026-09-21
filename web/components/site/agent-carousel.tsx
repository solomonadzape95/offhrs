"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AgentSigil } from "@/components/site/agent-sigil";
import { Icon } from "@/components/ui/icon";
import type { AgentSeed } from "@/lib/agents";

/**
 * The agent board, as a carousel.
 *
 * The mechanics above are a bento because their three ideas are read together.
 * The agents are the opposite: eight peers where the job is to browse. A
 * horizontal rail does that without pretending each row is a different kind of
 * thing, and it gives the page one gesture that is not vertical scroll.
 *
 * Every card is the same wide shape — sigil top-left in a well with room to
 * breathe, the name and thesis beside it, the read-outs below. Eight equal cards
 * read as one catalogue rather than a featured item plus filler.
 *
 * Native scroll-snap does the work — no animation library, no measuring. The
 * track carries vertical padding so a card's hover lift and its bloom are not
 * clipped by the scroller's own overflow.
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

      {/* The vertical padding is load-bearing: `overflow-x: auto` makes the y-axis
          clip too, and without it the hover lift and bloom get sliced off. */}
      <div
        ref={track}
        className="-mx-5 mt-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 py-5 sm:-mx-8 sm:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {agents.map((agent, i) => (
          <article
            key={agent.id}
            data-card
            className="panel panel-interactive flex w-[min(90vw,40rem)] shrink-0 snap-start flex-col p-7 sm:p-8"
          >
            <div className="flex flex-col gap-7 sm:flex-row sm:items-start">
              <span className="flex size-32 shrink-0 items-center justify-center rounded-[22px] bg-signal/6 ring-1 ring-signal/15 sm:size-40">
                <span className="text-signal">
                  <AgentSigil seed={agent.id} size={116} />
                </span>
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-4">
                  <span className="label">Desk {String(i + 1).padStart(2, "0")}</span>
                  <span className="figure text-xs text-ink-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="font-display mt-4 text-4xl leading-none text-ink lg:text-5xl">
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
                <p className="figure mt-2 text-lg text-ink">
                  {Math.round(agent.curveProgress * 100)}%
                </p>
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
              className="group mt-7 inline-flex items-center gap-1.5 font-mono text-xs tracking-[0.14em] text-signal uppercase"
            >
              Open terminal
              <Icon icon={ArrowUpRight} size={13} />
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
