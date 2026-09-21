import { MIGRATION_THRESHOLD_WPRESTOCK } from "@/lib/agents";

/**
 * Bonding-curve progress.
 *
 * §8 asks for "0% -> 100% -> AMM migration" and the distance to the threshold.
 * The threshold is denominated in **quote-token (wPreStock) units**, not dollars,
 * which is why the label carries the unit rather than a currency symbol — the
 * source-of-truth doc's earlier "$750 equivalent" was never sourced.
 */
export function Curve({
  progress,
  staked = 0,
  compact = false,
}: {
  progress: number;
  staked?: number;
  compact?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, progress));
  const remaining = Math.max(0, MIGRATION_THRESHOLD_WPRESTOCK - staked);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="label">Curve</span>
        <span className="tabular font-mono text-xs text-ink-dim">
          {(pct * 100).toFixed(1)}%
          {!compact && (
            <span className="text-ink-faint">
              {"  "}
              {remaining.toFixed(0)} wPreStock to migration
            </span>
          )}
        </span>
      </div>
      <div className="curve-track">
        <div className="curve-fill" style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
