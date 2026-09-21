/**
 * A deterministic identity mark for an agent.
 *
 * Every agent needs a face, and eight hand-drawn ones would be eight things to
 * maintain. This derives the mark from the agent's own id instead: the same seed
 * always yields the same disc, its voids and its orbit of dots, so the board is
 * consistent across renders and reviews while still reading as eight different
 * desks rather than one repeated icon.
 *
 * It follows the logo's construction — a solid body, negative-space voids, an
 * orbit of satellites — so the agent marks look like they were printed by the
 * same press as the brand rather than borrowed from an icon set.
 */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Trig differs in the last bit between Node and the browser; rounding keeps the
 *  server and client SVGs byte-identical and silences the hydration warning. */
function round(n: number, places = 3): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function AgentSigil({
  seed,
  size = 96,
  className,
  ground = "#0b0b0d",
}: {
  seed: string;
  size?: number;
  className?: string;
  ground?: string;
}) {
  const h = hash(seed);
  const uid = `sigil-${hash(seed).toString(36)}-${size}`;

  const orbitCount = 4 + (h % 6); // 4–9 satellites
  const orbitRadius = 30 + ((h >> 3) % 10); // 30–39
  const bodyRadius = 12 + ((h >> 5) % 8); // 12–19
  const rotation = h % 360;
  const cell = size >= 64 ? 3 : size >= 32 ? 2.5 : 2;

  const satellites = Array.from({ length: orbitCount }, (_, i) => {
    const a = (i / orbitCount) * Math.PI * 2 + (h % 100) / 40;
    const wobble = 2 + (((h >> (i % 12)) & 7) / 7) * 5;
    return {
      cx: round(50 + Math.cos(a) * (orbitRadius + wobble)),
      cy: round(50 + Math.sin(a) * (orbitRadius + wobble)),
      r: round(1.4 + (((h >> (i % 12 + 2)) & 3) / 3) * 2.2),
    };
  });

  const voids = [
    { cx: 50 + 9, cy: 50 - 8, r: 7 + ((h >> 7) % 3) },
    { cx: 50 - 8, cy: 50 + 9, r: 4 + ((h >> 11) % 3) },
  ];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <defs>
        <mask id={`${uid}-voids`}>
          <circle cx="50" cy="50" r={bodyRadius + 6} fill="white" />
          {voids.map((v, i) => (
            <circle key={i} cx={v.cx} cy={v.cy} r={v.r} fill="black" />
          ))}
        </mask>
        <pattern id={`${uid}-dots`} width={cell} height={cell} patternUnits="userSpaceOnUse">
          <rect width={cell} height={cell} fill="black" />
          <circle cx={cell / 2} cy={cell / 2} r={cell * 0.32} fill="white" />
        </pattern>
        <mask id={`${uid}-lattice`}>
          <rect width="100" height="100" fill={`url(#${uid}-dots)`} />
        </mask>
      </defs>

      <g mask={`url(#${uid}-voids)`} fill="currentColor">
        <circle cx="50" cy="50" r={bodyRadius + 6} />
        <rect width="100" height="100" fill={ground} mask={`url(#${uid}-lattice)`} opacity="0.82" />
      </g>

      <g fill="currentColor" opacity="0.75">
        {satellites.map((s, i) => (
          <circle key={i} cx={s.cx} cy={s.cy} r={s.r} />
        ))}
      </g>
    </svg>
  );
}
