/**
 * Oversized typographic marks floating behind sections.
 *
 * Purely decorative. They exist so the long scroll between the hero and the
 * footer is not flat black, and they are set in the display face so the page
 * keeps a single loud voice even when the marks are only 4% opaque.
 *
 * Each is masked through the same halftone lattice as the icons, so it reads as
 * part of the print rather than as a watermark dropped on top. Always
 * `aria-hidden` — a screen reader announcing a giant "?" is noise.
 */
export function Glyph({
  char,
  className,
  rotate = -12,
  opacity = 0.045,
  drift = true,
}: {
  char: string;
  className?: string;
  /** Degrees. Kept off-axis deliberately — a straight glyph looks like a mistake. */
  rotate?: number;
  /** 0–1. These should sit at the very edge of visibility. */
  opacity?: number;
  drift?: boolean;
}) {
  return (
    <span
      aria-hidden
      /* Hidden below `md`: at phone widths these either overlap the copy or push
         the page wide, and neither is worth the decoration. */
      className={`font-display pointer-events-none absolute hidden leading-none select-none md:block ${className ?? ""}`}
      style={{
        opacity,
        color: "var(--color-signal)",
        WebkitMaskImage: "radial-gradient(circle at 1px 1px, #000 0.9px, transparent 0)",
        maskImage: "radial-gradient(circle at 1px 1px, #000 0.9px, transparent 0)",
        WebkitMaskSize: "3px 3px",
        maskSize: "3px 3px",
        transform: `rotate(${rotate}deg)`,
        ...(drift
          ? {
              ["--glyph-rotate" as string]: `${rotate}deg`,
              animation: "glyph-drift 14s ease-in-out infinite",
            }
          : {}),
      }}
    >
      {char}
    </span>
  );
}
