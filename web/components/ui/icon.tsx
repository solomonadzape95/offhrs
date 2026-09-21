import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

/**
 * Every icon in the app, from Phosphor, punched through the halftone lattice.
 *
 * The mask cell scales with the icon, and that is the whole trick. A fixed 3px
 * grid reads as texture on a 40px mark and eats a 14px one alive. Below
 * `MIN_DITHER` the effect is skipped entirely: at that size there is not enough
 * glyph left to dither without it turning to mush.
 *
 * The stroke has to be heavier than usual because the mask keeps the ink *inside*
 * the dots — a regular-weight Phosphor glyph loses roughly half its fill to the
 * lattice and reads far lighter than the same icon undithered. So small icons go
 * bold and large ones go regular, and the halftone does the rest.
 *
 * The cost is a CSS mask on an inline SVG, composited on the GPU. It never
 * triggers layout and is cheap enough to apply everywhere.
 */

/** Below this an icon has too little surface to survive a mask. */
const MIN_DITHER = 13;

/** The lattice cell, in px, for a given icon size. */
export function cellFor(size: number): number {
  if (size >= 48) return 3;
  if (size >= 32) return 2.5;
  return 2;
}

/**
 * Dot radius as a fraction of the cell. Small icons get a larger fraction: the
 * mask keeps the ink inside the dots, so a bigger ratio leaves more glyph behind,
 * which is what a 16px mark needs.
 */
export function dotFor(size: number): number {
  return cellFor(size) * (size < 22 ? 0.38 : 0.34);
}

/** The inline style that turns the `.dither` class into the right lattice. */
export function ditherStyle(size: number): React.CSSProperties {
  return {
    "--dither-cell": `${cellFor(size)}px`,
    "--dither-dot": `${dotFor(size)}px`,
  } as React.CSSProperties;
}

export function Icon({
  icon: Glyph,
  size = 16,
  weight,
  className,
  /** Opt out where the shape has to stay crisp, such as a wallet brand mark. */
  dither = true,
}: {
  icon: PhosphorIcon;
  size?: number;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  className?: string;
  dither?: boolean;
}) {
  const on = dither && size >= MIN_DITHER;

  // Heavier than Phosphor's default: the mask removes roughly half the ink, so a
  // regular stroke at 16px would disappear piecewise.
  const resolvedWeight = weight ?? (on ? (size < 22 ? "bold" : "regular") : "regular");

  return (
    <Glyph
      size={size}
      weight={resolvedWeight}
      className={`${on ? "dither" : ""} ${className ?? ""}`.trim() || undefined}
      style={on ? ditherStyle(size) : undefined}
      aria-hidden
    />
  );
}
