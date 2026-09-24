"use client";

/**
 * Quick-pick percentage buttons for amount fields.
 *
 * Typing a number is the slow path; most of the time you want a round share of
 * what you have (or, at launch, of the supply). These render as a small row of
 * bordered pills next to the field. 100 is labelled "Max" by default.
 */
export function Presets({
  onPick,
  values = [25, 50, 75, 100],
  label,
  disabled,
}: {
  onPick: (pct: number) => void;
  values?: number[];
  /** Override the label for a value, e.g. { 100: "Max" }. */
  label?: Record<number, string>;
  disabled?: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      {values.map((p) => (
        <button
          key={p}
          type="button"
          disabled={disabled}
          onClick={() => onPick(p)}
          className="border border-edge px-1.5 py-0.5 font-mono text-[0.625rem] tracking-[0.08em] text-ink-faint uppercase transition-colors hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:opacity-40"
        >
          {label?.[p] ?? (p === 100 ? "Max" : `${p}%`)}
        </button>
      ))}
    </span>
  );
}
