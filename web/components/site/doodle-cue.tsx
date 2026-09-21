/**
 * The hand-drawn cue that points at the navigation.
 *
 * The Owambe header earns its discoverability from a scribble rather than from a
 * conventional hamburger: a drawn arrow and a handwritten note. That is the whole
 * reason it works — a hamburger is a control, and a doodle is an aside from
 * whoever made the page, which is a far friendlier thing to follow.
 *
 * Drawn in strokes only, so it inherits `currentColor` and never punches a hole
 * in whatever is behind it. The double pass over the arrow is deliberate, as on
 * the moon: one clean stroke reads as an icon, two that almost agree read as a
 * pen.
 *
 * `aria-hidden` throughout — it is decoration around a button that already has a
 * real accessible name.
 */
export function DoodleCue({
  label = "open the menu",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none flex items-end gap-2 text-signal ${className ?? ""}`}
    >
      <svg width="34" height="48" viewBox="0 0 34 48" fill="none" className="shrink-0">
        <g
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        >
          {/* Up and curling left, toward the trigger. */}
          <path d="M24 44C10 36 4 22 9 4" />
          {/* Arrowhead. */}
          <path d="M3 12l6-9 7 6" />
        </g>
        {/* A second, looser pass — the analogue of a pen going round twice. */}
        <g
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.4"
          transform="translate(2.5 1) rotate(-3 17 24)"
        >
          <path d="M24 44C10 36 4 22 9 4" />
        </g>
      </svg>

      <span
        className="font-display text-lg leading-none whitespace-nowrap italic pb-1.5"
        style={{ transform: "rotate(-4deg)" }}
      >
        {label}
      </span>
    </div>
  );
}
