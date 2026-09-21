import { sessionAt, formatCountdown, nyLabel } from "../lib/session";
const s = sessionAt();
console.log(`open=${s.open} next=${nyLabel(s.nextChangeAt)} in ${formatCountdown(s.msUntil)} progress=${Math.round(s.progress*100)}%`);
console.log(`since=${s.sinceAt.toISOString()} duration=${(s.durationMs/3_600_000).toFixed(1)}h`);
