import { ArrowsClockwise, Cube, Gauge, WaveSine } from "@phosphor-icons/react/dist/ssr";

import { DitherChart } from "@/components/site/dither-chart";
import { HalftoneImage } from "@/components/site/halftone-image";
import { Icon } from "@/components/ui/icon";
import { BASIS, LUMP_STEP, STREAM_RAMP } from "@/lib/chart-data";

/** Drop a halftone plate at this path; until it exists the schematic stands in. */
const WRAPPER_IMAGE = "/art/wrapper.jpg";

/**
 * The mechanics, as a bento.
 *
 * Three ideas that only make sense read together: the wrapper makes the pool
 * possible, the agent is what trades it, the vault is where the proceeds land.
 * A bento says that — one large cell for the idea that carries the most weight,
 * two smaller ones beside it — where three identical cards said "these are three
 * unrelated features".
 *
 * The two small cells carry dithered plots (`DitherChart`), because a signal and
 * a payout *are* curves and the page's print language can draw them honestly. The
 * large cell carries a halftone plate: the wrapper is a physical thing — a mass
 * passing through an aperture — and a photograph dithered into the palette says
 * that better than a vector. Until the plate exists, the drawn schematic below
 * stands in, so the layout is never empty and never breaks.
 */
export function MechanicsGrid() {
  return (
    <div className="mt-12 grid gap-5 lg:grid-cols-6">
      {/* 01 — the wrapper. The large cell. */}
      <article className="panel group relative flex flex-col overflow-hidden p-7 lg:col-span-4 lg:row-span-2 lg:p-9">
        <div className="flex items-baseline justify-between gap-4">
          <span className="label flex items-center gap-2">
            <Icon icon={Cube} size={14} className="text-signal" />
            Step one
          </span>
          <span className="figure text-sm text-signal-dim">01</span>
        </div>

        <h3 className="font-display mt-6 max-w-md text-3xl leading-tight text-ink lg:text-4xl">
          A wrapper that unlocks DeFi.
        </h3>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-dim">
          PreStocks are Token-2022 with a non-zero transfer fee, so Meteora&rsquo;s DBC rejects them
          outright. Offhrs mints a zero-fee 1:1 wrapper, and the stock-paired curve becomes possible
          at all.
        </p>

        <div className="mt-10 aspect-[27/10] w-full lg:mt-auto">
          <HalftoneImage
            src={WRAPPER_IMAGE}
            className="h-full w-full"
            fallback={<WrapperArt />}
          />
        </div>
      </article>

      {/* 02 — the agent. */}
      <article className="panel group flex flex-col overflow-hidden p-6 lg:col-span-2 lg:p-7">
        <div className="flex items-baseline justify-between gap-4">
          <span className="label flex items-center gap-2">
            <Icon icon={Gauge} size={14} className="text-signal" />
            Step two
          </span>
          <span className="figure text-sm text-signal-dim">02</span>
        </div>

        <h3 className="mt-5 text-lg leading-snug font-medium text-ink">
          Agents that trade the gap.
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Only acts once the basis clears cost — and only while the reference is frozen.
        </p>

        <DitherChart
          className="mt-7 h-44 w-full"
          lines={[{ data: BASIS, mode: "area", opacity: 0.95 }]}
          threshold={0.62}
          markers={[0.28, 0.72]}
        />
      </article>

      {/* 03 — the vault. */}
      <article className="panel group flex flex-col overflow-hidden p-6 lg:col-span-2 lg:p-7">
        <div className="flex items-baseline justify-between gap-4">
          <span className="label flex items-center gap-2">
            <Icon icon={WaveSine} size={14} className="text-signal" />
            Step three
          </span>
          <span className="figure text-sm text-signal-dim">03</span>
        </div>

        <h3 className="mt-5 text-lg leading-snug font-medium text-ink">
          Dividends paid for time held.
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Fees and spread stream to stakers over time, so patience is what earns.
        </p>

        <DitherChart
          className="mt-7 h-44 w-full"
          lines={[
            { data: STREAM_RAMP, mode: "area", opacity: 0.95 },
            { data: LUMP_STEP, mode: "dashed", tone: "dim", opacity: 0.8 },
          ]}
        />
      </article>

      <div className="flex flex-wrap items-center gap-4 border-t border-edge pt-8 lg:col-span-6">
        <span className="flex items-center gap-2 text-xs text-ink-faint">
          <Icon icon={ArrowsClockwise} size={14} className="text-signal" />
          Same signal, three different jobs.
        </span>
      </div>
    </div>
  );
}

/* ── Fallback plate ───────────────────────────────────────────────────
   Drawn rather than slotted: a schematic of the wrapper, in the page's own
   signal, used only until a halftone image exists at `WRAPPER_IMAGE`. */

function WrapperArt({ className }: { className?: string }) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <svg viewBox="0 0 680 250" className="h-auto w-full" aria-hidden>
        <defs>
          <pattern id="wrap-dots" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.7" fill="currentColor" opacity="0.16" />
          </pattern>
          <marker
            id="wrap-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <rect width="680" height="250" fill="url(#wrap-dots)" />

        <line x1="24" y1="214" x2="656" y2="214" stroke="currentColor" strokeWidth="1" opacity="0.22" />

        {/* Stage one: the raw PreStock, carrying the fee. */}
        <g transform="translate(24 54)">
          <rect width="168" height="120" rx="18" fill="currentColor" opacity="0.04" />
          <rect width="168" height="120" rx="18" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.55" />
          <text x="20" y="42" className="font-mono" fill="currentColor" fontSize="17" letterSpacing="0.5">
            PreStock
          </text>
          <text x="20" y="62" className="font-mono" fill="currentColor" fontSize="9.5" letterSpacing="2" opacity="0.5">
            TOKEN-2022
          </text>
          <line x1="20" y1="78" x2="148" y2="78" stroke="currentColor" strokeWidth="1" opacity="0.2" />
          <g transform="translate(20 88)">
            <rect width="128" height="22" rx="11" fill="currentColor" opacity="0.08" />
            <text x="12" y="15" className="font-mono" fill="currentColor" fontSize="10" letterSpacing="0.6" opacity="0.8">
              1.20% fee
            </text>
            <line x1="10" y1="11" x2="118" y2="11" stroke="currentColor" strokeWidth="1.4" opacity="0.9" />
          </g>
        </g>

        {/* Stage two: the wrapper machine. */}
        <g transform="translate(266 40)">
          <path d="M18 0h124l18 20v106l-18 20H18L0 126V20z" fill="currentColor" opacity="0.07" />
          <path d="M18 0h124l18 20v106l-18 20H18L0 126V20z" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.75" />
          <g transform="translate(74 34)" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.9">
            <circle cx="14" cy="14" r="9" />
            <circle cx="14" cy="14" r="3.2" />
            <path d="M14 1v5M14 22v5M1 14h5M22 14h5M5 5l3.5 3.5M19.5 19.5L23 23M23 5l-3.5 3.5M8.5 19.5L5 23" />
          </g>
          <text x="74" y="86" textAnchor="middle" className="font-mono" fill="currentColor" fontSize="12" letterSpacing="2">
            WRAP
          </text>
          <text x="74" y="108" textAnchor="middle" className="font-mono" fill="currentColor" fontSize="9" letterSpacing="1.5" opacity="0.55">
            1:1 · FEE STRIPPED
          </text>
        </g>

        {/* Stage three: the wrapper token. */}
        <g transform="translate(488 54)">
          <rect width="168" height="120" rx="18" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.95" />
          <text x="20" y="42" className="font-mono" fill="currentColor" fontSize="17" letterSpacing="0.5">
            wPreStock
          </text>
          <text x="20" y="62" className="font-mono" fill="currentColor" fontSize="9.5" letterSpacing="2" opacity="0.5">
            TRADEABLE
          </text>
          <line x1="20" y1="78" x2="148" y2="78" stroke="currentColor" strokeWidth="1" opacity="0.2" />
          <g transform="translate(20 88)">
            <rect width="128" height="22" rx="11" fill="currentColor" opacity="0.14" />
            <circle cx="14" cy="11" r="3" fill="currentColor" />
            <text x="24" y="15" className="font-mono" fill="currentColor" fontSize="10" letterSpacing="0.6">
              0.00% fee
            </text>
          </g>
        </g>

        {/* Flow. */}
        <g stroke="currentColor" strokeWidth="1.4" fill="none" opacity="0.75">
          <path d="M196 118 H248" markerEnd="url(#wrap-arrow)" />
          <path d="M418 118 H470" markerEnd="url(#wrap-arrow)" />
        </g>
        <g className="font-mono" fill="currentColor" fontSize="9" letterSpacing="1.6" opacity="0.45">
          <text x="196" y="152">DEPOSIT</text>
          <text x="418" y="152">MINT</text>
        </g>
      </svg>
    </div>
  );
}
