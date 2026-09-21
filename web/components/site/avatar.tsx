/**
 * A deterministic dithered avatar.
 *
 * Generated from the address rather than fetched, so a wallet has one stable
 * mark everywhere with no request and no broken-image state. The 5x5 cell grid
 * is the same lattice the rest of the site is printed on, and mirroring the left
 * two columns onto the right keeps it from reading as random noise — the way
 * GitHub identicons do.
 */
export function Avatar({ seed, size = 32 }: { seed: string; size?: number }) {
  const cells: boolean[] = [];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  // Left three columns, then mirrored — 3 + 2 = 5.
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      cells[y * 5 + x] = (h >>> 0) % 100 < 46;
    }
    cells[y * 5 + 3] = cells[y * 5 + 1];
    cells[y * 5 + 4] = cells[y * 5 + 0];
  }

  const cell = size / 5;

  return (
    <span
      aria-hidden
      className="relative block shrink-0 border border-edge bg-raised"
      style={{ width: size, height: size }}
    >
      {cells.map((on, i) =>
        on ? (
          <span
            key={i}
            className="absolute bg-signal"
            style={{
              left: (i % 5) * cell,
              top: Math.floor(i / 5) * cell,
              width: cell,
              height: cell,
            }}
          />
        ) : null,
      )}
    </span>
  );
}
