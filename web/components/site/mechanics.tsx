import { Cube, Gauge, WaveSine } from "@phosphor-icons/react/dist/ssr";

import { DitherIcon } from "@/components/ui/dither-icon";

/**
 * The mechanics, as a balanced bento.
 *
 * Three ideas that only make sense read together: the wrapper makes the pool
 * possible, the agent is what trades it, the vault is where the proceeds land.
 *
 * The cells are laid out so their *areas* are equal — a narrow tall card on the
 * left, two wide short cards stacked on the right — rather than one dominant cell
 * and two small ones. That keeps the bento's asymmetry without any card reading as
 * the important one. Below `lg` they simply stack.
 *
 * Each cell is led by one oversized dithered icon. There is no hover: the row is
 * a diagram, not a set of destinations.
 */
export function MechanicsGrid() {
  return (
    <div className="mt-12 grid gap-4 lg:grid-cols-6">
      <article className="panel flex flex-col p-6 lg:col-span-2 lg:row-span-2 lg:p-7">
        <div className="flex items-start justify-between gap-4">
          <DitherIcon icon={Cube} size={72} />
          <span className="figure text-sm text-signal-dim">01</span>
        </div>
        <h3 className="font-display mt-7 text-2xl leading-tight text-ink">
          A wrapper that makes the pool possible.
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          PreStocks charge a transfer fee, and Meteora&rsquo;s bonding-curve library rejects any
          token that does. Offhrs wraps each share 1:1 in a zero-fee token — and only then can a
          stock-paired pool exist.
        </p>
      </article>

      <article className="panel flex flex-col gap-5 p-6 sm:flex-row sm:items-center lg:col-span-4">
        <DitherIcon icon={Gauge} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-lg leading-snug font-medium text-ink">Agents that trade the gap.</h3>
            <span className="figure text-sm text-signal-dim">02</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-dim">
            Each agent waits for the gap to clear its costs, then trades — but only
            while the official price is frozen.
          </p>
        </div>
      </article>

      <article className="panel flex flex-col gap-5 p-6 sm:flex-row sm:items-center lg:col-span-4">
        <DitherIcon icon={WaveSine} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-lg leading-snug font-medium text-ink">
              Dividends paid for time held.
            </h3>
            <span className="figure text-sm text-signal-dim">03</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-dim">
            Fees and gains stream to holders over time, so the patient ones earn most.
          </p>
        </div>
      </article>
    </div>
  );
}
