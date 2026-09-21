/**
 * A reserved space for a graphic that does not exist yet.
 *
 * Every section that will eventually carry generated art or a chart holds one of
 * these, so the layout is final before the art is. Dropping the real graphic in
 * later means swapping the children — no section moves, no spacing is retuned, no
 * reflow between "before" and "after" the art.
 *
 * The slot is honest about being empty: it is dashed, it is labelled, and it says
 * what belongs there (`brief`). An empty box that pretends to be finished is the
 * failure mode this avoids.
 */
export function FigureSlot({
  brief,
  note,
  className,
  children,
}: {
  /** What will live here, e.g. "Isometric of the wrapper mint". */
  brief?: string;
  /** The art direction note, for whoever generates it. */
  note?: string;
  className?: string;
  /** When provided, the slot renders this instead of the placeholder. */
  children?: React.ReactNode;
}) {
  return (
    <div className={`figure-slot ${className ?? ""}`}>
      {children ?? (
        <div className="relative z-10 flex h-full min-h-44 flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="dither flex size-9 items-center justify-center rounded-full border border-signal/40 text-signal [--dither-cell:2px] [--dither-dot:0.8px]">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M10 3v14M3 10h14"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="label">Graphic slot</span>
          {brief && <span className="max-w-xs text-sm leading-relaxed text-ink-dim">{brief}</span>}
          {note && (
            <span className="max-w-xs font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
              {note}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
