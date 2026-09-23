/** Formatting helpers. Small, pure, and used by every screen. */

export const bps = (n: number) => `${n >= 0 ? "+" : ""}${n}bps`;

export const pct = (n: number, digits = 2) => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;

/** Compact USD, for headline figures where the exact cents do not matter. */
export function usd(n: number, opts: { compact?: boolean; digits?: number } = {}) {
  const { compact = false, digits = 2 } = opts;
  if (compact) {
    if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  }
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/** Raw integer amount + decimals -> display string. */
export function amount(raw: string | bigint, decimals = 9, digits = 4) {
  const v = Number(raw) / 10 ** decimals;
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/**
 * Compact a plain number for display: 1_000_000_000 -> "1B", 28_416_314 ->
 * "28.42M". Below 1,000 it keeps decimals, so a small balance still reads as an
 * amount rather than being rounded to nothing.
 */
export function compactNumber(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(digits)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(digits)}K`;
  if (abs === 0) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

/** Raw integer amount + decimals -> compact display: `19675…` -> `196.75M`. */
export const compactAmount = (raw: string | bigint, decimals = 9): string =>
  compactNumber(Number(raw) / 10 ** decimals);

/** A Pyth price (value + exponent) as a readable number. */
export const pythPrice = (price: number | string, exponent: number) =>
  Number(price) * 10 ** exponent;

export const shortAddr = (a: string, n = 4) => `${a.slice(0, n)}…${a.slice(-n)}`;

export function timeAgo(unixSeconds: number) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const utc = (unixSeconds: number) => {
  if (!Number.isFinite(unixSeconds)) return "—";
  const d = new Date(unixSeconds * 1000);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
};
