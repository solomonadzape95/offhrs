interface StatProps {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: "default" | "signal" | "ember";
  /** While true, the figure is a skeleton instead of a stale or empty value. */
  loading?: boolean;
}

export function Stat({
  label,
  value,
  unit,
  hint,
  tone = "default",
  loading = false,
}: StatProps) {
  const color =
    tone === "signal" ? "text-signal" : tone === "ember" ? "text-ember" : "text-ink";
  return (
    <div className="flex flex-col gap-2">
      <span className="label">{label}</span>
      {/* Long values have to survive a 320px column, so the size steps down at the
          narrow end rather than wrapping mid-number. */}
      <span
        className={`figure text-[2rem] leading-none sm:text-4xl lg:text-[2.75rem] ${color}`}
      >
        {loading ? (
          <span
            aria-hidden
            className="block h-[1.85rem] w-28 animate-pulse bg-raised sm:h-8 lg:h-10"
          />
        ) : (
          <>
            {value}
            {unit && <span className="ml-1.5 text-sm text-ink-faint">{unit}</span>}
          </>
        )}
      </span>
      {hint && <span className="font-mono text-xs text-ink-faint">{hint}</span>}
    </div>
  );
}
