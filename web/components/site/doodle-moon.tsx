/**
 * A doodle moon.
 *
 * Drawn as an open crescent outline rather than a filled shape, and drawn twice
 * — a second pass offset by a hair at lower opacity. That doubling is what makes
 * it read as a pen sketch rather than as an icon: a single clean stroke looks
 * manufactured, and two that almost agree look like someone's hand.
 *
 * Strokes only, so it inherits `currentColor` and sits on the shader without
 * punching a hole in it.
 */
export function DoodleMoon({
  size = 32,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <g
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Outer edge — the long way round, bulging left. */}
        <path d="M30.4 8.6c-18.6 1.2-25 18.4-17.6 29.4 4 6 11 9.4 17.8 8.6" />
        {/* Inner edge — back up the right side, a tighter curve. */}
        <path d="M30.6 46.4c-7.4-4.2-10.6-12-9.2-20.2 1.2-7 4.6-13.4 9-17.6" />
      </g>

      {/* A second, looser pass. The analogue of a pen going round twice. */}
      <g
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        opacity="0.4"
        transform="rotate(-4 24 24) translate(-0.6 0.5)"
      >
        <path d="M30.4 8.6c-18.6 1.2-25 18.4-17.6 29.4 4 6 11 9.4 17.8 8.6" />
      </g>

      {/* Sparkle in the gap, the way a doodled moon usually gets one. */}
      <path
        d="M35.8 27.4l1.9 4 4 1.9-4 1.9-1.9 4-1.9-4-4-1.9 4-1.9z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}
