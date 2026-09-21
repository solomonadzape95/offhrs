/**
 * The US equity session clock.
 *
 * The product is named after the hours the reference market is closed, and that
 * is a fact about a calendar, not about a price feed. Deriving it here means the
 * countdown is exact and works with no network at all — which matters, because
 * the Pyth read is the *evidence* that the market is shut, not the definition of
 * it. If the feed were the only source, a Pyth outage would look like an open
 * market.
 *
 * Regular hours only: 09:30–16:00 America/New_York, Monday to Friday. Market
 * holidays are not modelled — a holiday would read as an open session with no
 * price movement, and the regime classification would still say `frozen`.
 */

const NY = "America/New_York";
const OPEN_MINUTES = 9 * 60 + 30; // 09:30
const CLOSE_MINUTES = 16 * 60; // 16:00

export type Session = {
  /** Whether regular-hours trading is underway. */
  open: boolean;
  /** When the current state ends. */
  nextChangeAt: Date;
  /** When the current state began — the previous bell, whatever it was. */
  sinceAt: Date;
  /** Milliseconds until `nextChangeAt`. Negative if already past. */
  msUntil: number;
  /** Total length of the current state, in ms. */
  durationMs: number;
  /** Fraction of the current state elapsed, 0-1. */
  progress: number;
  /** "closes" while open, "opens" while shut. */
  nextVerb: "closes" | "opens";
};

type Parts = {
  year: number;
  month: number; // 1-12
  day: number;
  weekday: number; // 0 = Sunday
  minutes: number; // minutes since midnight, NY wall clock
};

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function nyParts(date: Date): Parts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const p: Record<string, string> = {};
  for (const { type, value } of dtf.formatToParts(date)) p[type] = value;

  // `hour12: false` can render midnight as "24" in some ICU versions.
  const hour = Number(p.hour) % 24;

  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    weekday: WEEKDAYS[p.weekday] ?? 0,
    minutes: hour * 60 + Number(p.minute),
  };
}

/**
 * The UTC instant for a New York wall-clock time.
 *
 * Guesses, measures the zone's actual offset at that guess, and corrects once.
 * One correction is enough outside a DST transition and converges on the right
 * side of one, which a fixed -4/-5 assumption would not.
 */
function zonedToUtc(
  year: number,
  month: number,
  day: number,
  minutes: number,
  tz = NY,
): Date {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  let guess = Date.UTC(year, month - 1, day, h, m, 0, 0);
  for (let i = 0; i < 2; i++) {
    const offset = offsetMs(new Date(guess), tz);
    const corrected = Date.UTC(year, month - 1, day, h, m, 0, 0) - offset;
    if (corrected === guess) break;
    guess = corrected;
  }
  return new Date(guess);
}

/** The zone's offset from UTC at a given instant, in ms. Negative west of UTC. */
function offsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const { type, value } of dtf.formatToParts(date)) p[type] = value;

  const asIfUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return asIfUtc - date.getTime();
}

const isWeekday = (wd: number) => wd >= 1 && wd <= 5;

/** Walk the calendar forward to the next regular session open. */
function nextOpen(from: Date): Date {
  const p = nyParts(from);

  // Later today, if we are before the bell on a weekday.
  if (isWeekday(p.weekday) && p.minutes < OPEN_MINUTES) {
    return zonedToUtc(p.year, p.month, p.day, OPEN_MINUTES);
  }

  // Otherwise step forward a day at a time until a weekday.
  const cursor = new Date(zonedToUtc(p.year, p.month, p.day, 12 * 60).getTime());
  for (let i = 0; i < 8; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const q = nyParts(cursor);
    if (isWeekday(q.weekday)) {
      return zonedToUtc(q.year, q.month, q.day, OPEN_MINUTES);
    }
  }
  // Unreachable: seven consecutive non-weekdays do not exist.
  return cursor;
}

/** Walk the calendar backward to the previous regular session close. */
function prevClose(from: Date): Date {
  const p = nyParts(from);

  // Earlier today, if the bell has already rung on a weekday.
  if (isWeekday(p.weekday) && p.minutes >= CLOSE_MINUTES) {
    return zonedToUtc(p.year, p.month, p.day, CLOSE_MINUTES);
  }

  // Otherwise step back a day at a time until a weekday.
  const cursor = new Date(zonedToUtc(p.year, p.month, p.day, 12 * 60).getTime());
  for (let i = 0; i < 8; i++) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const q = nyParts(cursor);
    if (isWeekday(q.weekday)) {
      return zonedToUtc(q.year, q.month, q.day, CLOSE_MINUTES);
    }
  }
  return cursor;
}

export function sessionAt(now: Date = new Date()): Session {
  const p = nyParts(now);
  const open = isWeekday(p.weekday) && p.minutes >= OPEN_MINUTES && p.minutes < CLOSE_MINUTES;

  const nextChangeAt = open
    ? zonedToUtc(p.year, p.month, p.day, CLOSE_MINUTES)
    : nextOpen(now);

  const sinceAt = open
    ? zonedToUtc(p.year, p.month, p.day, OPEN_MINUTES)
    : prevClose(now);

  const durationMs = Math.max(1, nextChangeAt.getTime() - sinceAt.getTime());
  const elapsed = now.getTime() - sinceAt.getTime();

  return {
    open,
    nextChangeAt,
    sinceAt,
    msUntil: nextChangeAt.getTime() - now.getTime(),
    durationMs,
    progress: Math.min(1, Math.max(0, elapsed / durationMs)),
    nextVerb: open ? "closes" : "opens",
  };
}

/** "42h 13m", "13m 04s", "2d 6h". Coarse on purpose — this is a caption. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);

  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

/** New York wall-clock time of an instant, e.g. "Mon 09:30". */
export function nyLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
