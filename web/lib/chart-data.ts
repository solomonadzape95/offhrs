/**
 * Deterministic shapes for the dither charts.
 *
 * These are *shapes*, not readings. The page's honesty rule is that it does not
 * print invented figures; a chart with no axis numbers, labelled "illustrative",
 * is a diagram of a mechanism rather than a claim about the market. Everything
 * here is seeded, so the same curve is drawn on every render and the shapes are
 * stable across a review.
 *
 * The reference/mark pair is the product in one picture: the reference advances,
 * then freezes flat, while the mark keeps drifting.
 */

/** Small deterministic PRNG — no `Math.random`, so server and client agree. */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = 96;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** The reference feed: alive for the first ~62%, then frozen flat. */
export const REFERENCE: number[] = (() => {
  const r = prng(11);
  const freeze = Math.floor(N * 0.62);
  let v = 0.52;
  return Array.from({ length: N }, (_, i) => {
    if (i < freeze) v = clamp(v + (r() - 0.5) * 0.05, 0.3, 0.8);
    return v;
  });
})();

/** The tokenized mark: keeps drifting through the freeze. */
export const MARK: number[] = (() => {
  const r = prng(29);
  let v = 0.52;
  return Array.from({ length: N }, (_, i) => {
    v = clamp(v + (r() - 0.5) * 0.07 + Math.sin(i / 9) * 0.012, 0.2, 0.88);
    return v;
  });
})();

/** Basis against a cost floor; two crossings become fire markers. */
export const BASIS: number[] = (() => {
  const r = prng(5);
  return Array.from({ length: N }, (_, i) => {
    const base = 0.4 + Math.sin(i / 7) * 0.18 + Math.sin(i / 3.1) * 0.06;
    return clamp(base + (r() - 0.5) * 0.06, 0.1, 0.95);
  });
})();

/** Cumulative curve fees: rising, with a late step. */
export const CURVE_FEES: number[] = (() => {
  const r = prng(3);
  let v = 0.06;
  return Array.from({ length: N }, (_, i) => {
    v += 0.006 + (r() - 0.5) * 0.004 + (i > 60 ? 0.004 : 0);
    return clamp(v, 0, 0.72);
  });
})();

/** Cumulative arbitrage spread: slower, steadier. */
export const ARBITRAGE: number[] = (() => {
  const r = prng(17);
  let v = 0.03;
  return Array.from({ length: N }, () => {
    v += 0.003 + (r() - 0.5) * 0.003;
    return clamp(v, 0, 0.45);
  });
})();

/** Streamed payout: an exponential ramp, never a cliff. */
export const PAYOUT: number[] = Array.from({ length: N }, (_, i) =>
  clamp(0.05 + 0.6 * (1 - Math.exp(-i / 26)) + Math.sin(i / 8) * 0.01),
);

/** The stream curve on its own. */
export const STREAM_RAMP: number[] = Array.from({ length: N }, (_, i) =>
  clamp(0.08 + 0.62 * (1 - Math.exp(-i / 22))),
);

/** The lump-sum alternative: flat, then a vertical cliff. */
export const LUMP_STEP: number[] = Array.from({ length: N }, (_, i) =>
  i < N * 0.46 ? 0.12 : 0.7,
);
