interface StatProps {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: "default" | "signal" | "ember";
}

export function Stat({ label, value, unit, hint, tone = "default" }: StatProps) {
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
        {value}
        {unit && <span className="ml-1.5 text-sm text-ink-faint">{unit}</span>}
      </span>
      {hint && <span className="font-mono text-xs text-ink-faint">{hint}</span>}
    </div>
  );
}
