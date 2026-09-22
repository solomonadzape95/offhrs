/**
 * Mark vs market.
 *
 * §8 asks for a price/bonding-curve candlestick chart. There is no pool trading
 * yet, so there is no price history, and drawing candles anyway would be
 * inventing data. This shows the same thing the chart would be looked at for —
 * the size of the gap between the SPV reference and the executable market — with
 * two measured bars instead of a fabricated series.
 *
 * It is replaced by the real candlestick once a DBC pool has trades.
 */
export function MarkVsMarket({
  markPrice,
  marketPrice,
  multiplier,
}: {
  markPrice: number;
  marketPrice: number;
  multiplier: number | null;
}) {
  /**
   * The two figures arrive in different units and MUST be reconciled before
   * being shown side by side.
   *
   * `markPrice` is the issuer's SPV reference, quoted *unscaled*. `marketPrice`
   * is a Jupiter quote for one whole token, which carries the mint's
   * `scaledUiAmount` multiplier (~4.93x on SPACEX). Comparing them raw produced
   * a "-74.77%" gap sitting next to a "+2433bps below mark" basis — two numbers
   * on the same panel disagreeing about the sign of the same fact.
   *
   * The multiplier converts the mark into the market's units. The basis is
   * multiplier-invariant, so scaling the mark this way makes the two agree: both
   * land on ~+24.3%.
   */
  const m = multiplier ?? 1;
  const markScaled = markPrice * m;

  const max = Math.max(markScaled, marketPrice) || 1;
  const markPct = (markScaled / max) * 100;
  const marketPct = (marketPrice / max) * 100;
  const gap = ((markScaled - marketPrice) / marketPrice) * 100;

  return (
    <div className="panel flex flex-col gap-6 p-6">
      <div className="flex items-baseline justify-between">
        <span className="label">Mark vs market</span>
        <span className="font-mono text-xs text-ink-faint">
          {multiplier ? `multiplier ${multiplier.toFixed(4)}×` : "multiplier unknown"}
        </span>
      </div>

      <Bar
        label="Official mark"
        sub={`$${markPrice.toFixed(2)} unscaled × ${m.toFixed(4)}`}
        value={markScaled}
        pct={markPct}
        tone="ink"
      />
      <Bar label="Market price" value={marketPrice} pct={marketPct} tone="signal" />

      <div className="flex items-baseline justify-between border-t border-edge pt-5">
        <span className="label">Gap</span>
        <span className={`figure text-2xl ${gap > 0 ? "basis-up" : "basis-down"}`}>
          {gap >= 0 ? "+" : ""}
          {gap.toFixed(2)}%
        </span>
      </div>

      <p className="font-mono text-xs leading-relaxed text-ink-faint">
        Both bars use the same units: the mark is scaled by the mint&apos;s multiplier before
        comparing. Compare them unscaled and the same fact shows up with opposite signs.
      </p>

      <p className="font-mono text-xs leading-relaxed text-ink-faint">
        No pool is trading yet, so there is no price history to chart. The market figure is a live
        Jupiter quote; the mark is the issuer&apos;s official reference.
      </p>
    </div>
  );
}

function Bar({
  label,
  sub,
  value,
  pct,
  tone,
}: {
  label: string;
  sub?: string;
  value: number;
  pct: number;
  tone: "ink" | "signal";
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-xs tracking-[0.14em] text-ink-dim uppercase">
          {label}
          {sub && <span className="ml-2 tracking-normal normal-case text-ink-faint">{sub}</span>}
        </span>
        <span className="tabular shrink-0 font-mono text-sm text-ink">
          ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className="h-2.5 w-full bg-raised">
        <div
          className={`relative h-2.5 ${tone === "signal" ? "bg-signal" : "bg-ink-faint"}`}
          style={{ width: `${pct}%` }}
        >
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, var(--color-void-deep) 0.5px, transparent 0)",
              backgroundSize: "3px 3px",
              opacity: 0.7,
            }}
          />
        </div>
      </div>
    </div>
  );
}
