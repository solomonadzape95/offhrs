import { sessionAt, formatCountdown, nyLabel } from "../lib/session";

/** Known-good instants, checked against the NYSE regular-hours calendar. */
const CASES: Array<[string, boolean, string]> = [
  // iso instant                          open?  expected next change (NY label)
  ["2026-09-16T15:00:00Z", true,  "Wed 16:00"], // Wed 11:00 ET, mid-session
  ["2026-09-16T19:30:00Z", true,  "Wed 16:00"], // Wed 15:30 ET, 30m to the bell
  ["2026-09-16T20:01:00Z", false, "Thu 09:30"], // Wed 16:01 ET, just closed
  ["2026-09-18T21:00:00Z", false, "Mon 09:30"], // Fri 17:00 ET -> weekend
  ["2026-09-19T18:50:00Z", false, "Mon 09:30"], // Sat, mid-weekend
  ["2026-09-20T23:00:00Z", false, "Mon 09:30"], // Sun 19:00 ET
  ["2026-09-21T13:00:00Z", false, "Mon 09:30"], // Mon 09:00 ET, pre-open
  ["2026-09-21T13:35:00Z", true,  "Mon 16:00"], // Mon 09:35 ET, just opened
];

let fail = 0;
for (const [iso, wantOpen, wantNext] of CASES) {
  const s = sessionAt(new Date(iso));
  const got = nyLabel(s.nextChangeAt);
  const ok = s.open === wantOpen && got === wantNext;
  if (!ok) fail++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${iso}  open=${String(s.open).padEnd(5)} (want ${String(wantOpen).padEnd(5)})` +
      `  next=${got} (want ${wantNext})  in ${formatCountdown(s.msUntil)}  ${Math.round(s.progress * 100)}% through`,
  );
}

// A closed window should always run longer than an open one.
const weekend = sessionAt(new Date("2026-09-19T18:50:00Z"));
const midweek = sessionAt(new Date("2026-09-16T15:00:00Z"));
console.log(
  `\nclosed window ${(weekend.durationMs / 3_600_000).toFixed(1)}h` +
    ` vs open window ${(midweek.durationMs / 3_600_000).toFixed(1)}h` +
    ` -> ${weekend.durationMs > midweek.durationMs ? "PASS" : "FAIL"}`,
);
if (weekend.durationMs <= midweek.durationMs) fail++;

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
