import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

import { ditherStyle } from "@/components/ui/icon";

/**
 * An oversized Phosphor icon reduced to halftone dots, for the graphic slot at
 * the head of a feature card.
 *
 * Two passes: a solid ghost underneath keeps the silhouette readable wherever
 * the lattice thins out, and the dithered copy on top gives it the printed
 * texture. The ghost is the reason this reads as a deliberate mark rather than
 * as a low-resolution asset.
 *
 * This is the placeholder inhabitant of a `.figure-slot` — when the generated
 * art for a card exists, this is what it replaces.
 */
export function DitherIcon({
  icon: Glyph,
  className,
  size = 64,
  tone = "signal",
}: {
  icon: PhosphorIcon;
  className?: string;
  size?: number;
  tone?: "signal" | "ink";
}) {
  const colour = tone === "signal" ? "text-signal" : "text-ink";

  return (
    <span className={`relative inline-flex ${colour} ${className ?? ""}`}>
      <Glyph aria-hidden size={size} weight="regular" className="absolute inset-0 opacity-20" />
      <Glyph
        aria-hidden
        size={size}
        weight="bold"
        className="dither relative"
        style={ditherStyle(size)}
      />
    </span>
  );
}
