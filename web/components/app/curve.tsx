import { MIGRATION_THRESHOLD_WPRESTOCK } from "@/lib/agents";
import { Info } from "@/components/ui/info";

/**
 * Bonding-curve progress.
 *
 * §8 asks for "0% -> 100% -> AMM migration" and the distance to the threshold.
 * The threshold is denominated in **quote-token (wPreStock) units**, not dollars,
 * which is why it lives behind the info icon rather than in the line — the
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
        <span className="flex items-center gap-1.5">
          <span className="label">Curve</span>
          {!compact && (
            <Info label="Migration threshold">
              Graduates to a DAMM v2 pool once {MIGRATION_THRESHOLD_WPRESTOCK} wPreStock have been
              raised ({remaining.toFixed(0)} to go). Denominated in quote-token units, not dollars.
            </Info>
          )}
        </span>
        <span className="tabular font-mono text-xs text-ink-dim">{(pct * 100).toFixed(1)}%</span>
      </div>
      <div className="curve-track">
        <div className="curve-fill" style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
