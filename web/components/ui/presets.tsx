"use client";

/**
 * Quick-pick percentage buttons for amount fields.
 *
 * Typing a number is the slow path; most of the time you want a round share of
 * what you have (or, at launch, of the supply). These render as a small row of
 * bordered pills. 100 is labelled "Max" by default.
 *
 * `value` is the currently-picked percentage, so the active pill can stay lit
 * until the amount is edited by hand. Keep these **outside** a wrapping
 * `<label>`: a label whose first labelable child is a button will keep focusing
 * that button, which reads as a stuck selection.
 */
export function Presets({
  onPick,
  value = null,
  values = [25, 50, 75, 100],
  label,
  disabled,
}: {
  onPick: (pct: number) => void;
  value?: number | null;
  values?: number[];
  /** Override the label for a value, e.g. { 100: "Max" }. */
  label?: Record<number, string>;
  disabled?: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      {values.map((p) => {
        const active = value === p;
        return (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => onPick(p)}
            className={`border px-1.5 py-0.5 font-mono text-[0.625rem] tracking-[0.08em] uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              active
                ? "border-signal bg-signal/10 text-signal"
                : "border-edge text-ink-faint hover:border-signal hover:text-signal"
            }`}
          >
            {label?.[p] ?? (p === 100 ? "Max" : `${p}%`)}
          </button>
        );
      })}
    </span>
  );
}
