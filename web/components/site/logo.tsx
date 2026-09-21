/**
 * The Offhrs mark: one solid disc with circular voids punched clean through it.
 *
 * Nebula's mark, re-emitted in the palette's signal. Three voids of descending
 * size read as depth inside the body rather than as three separate objects, which
 * is why it works at 20px as well as at 96px. Drawn in `currentColor`, so the
 * palette toggle repaints the mark along with every button on the page.
 *
 * The halftone is printed *onto* the body in the page's own ground colour rather
 * than masked out of it. Masking the body into dots means half its pixels are page
 * background, so the mark can never read as the same colour as the buttons — it
 * averages towards whatever is behind it and goes muddy.
 *
 * Baked into the SVG rather than applied with CSS so the mark keeps its texture as
 * a favicon or any other export; a CSS-masked version renders solid the moment it
 * leaves the DOM.
 *
 * `cell` exists because dithering does not scale: at 96px a 2px lattice reads as
 * texture, at 20px the same lattice closes the voids up.
 */
export function Logo({
  size = 28,
  cell = 2,
  dithered = true,
  ground = "#0b0b0d",
  className,
  title,
}: {
  size?: number;
  cell?: number;
  dithered?: boolean;
  ground?: string;
  className?: string;
  title?: string;
}) {
  // Ids must be unique per instance or a second copy on the page reuses the first's masks.
  const uid = `offhours-${size}-${cell}-${dithered ? "d" : "s"}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        {/* White keeps the body, black punches it away. */}
        <mask id={`${uid}-voids`}>
          <circle cx="20" cy="20" r="18.5" fill="white" />
          <circle cx="25.5" cy="13" r="7.2" fill="black" />
          <circle cx="13" cy="26.5" r="4.6" fill="black" />
          <circle cx="27" cy="28.5" r="2.6" fill="black" />
        </mask>

        {dithered && (
          <>
            <pattern id={`${uid}-dots`} width={cell} height={cell} patternUnits="userSpaceOnUse">
              <rect width={cell} height={cell} fill="black" />
              <circle cx={cell / 2} cy={cell / 2} r={cell * 0.32} fill="white" />
            </pattern>
            <mask id={`${uid}-lattice`}>
              <rect width="40" height="40" fill={`url(#${uid}-dots)`} />
            </mask>
          </>
        )}
      </defs>

      <g mask={`url(#${uid}-voids)`}>
        <rect width="40" height="40" fill="currentColor" />
        {dithered && (
          <rect width="40" height="40" fill={ground} mask={`url(#${uid}-lattice)`} opacity="0.82" />
        )}
      </g>
    </svg>
  );
}
