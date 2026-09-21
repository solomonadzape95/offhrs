"use client";

import { useEffect, useState } from "react";

import { formatCountdown, nyLabel, sessionAt } from "@/lib/session";

/**
 * The session clock.
 *
 * Named after the hours the reference market is shut, so the site leads with how
 * long until the bell. Ticks client-side from the visitor's own clock; the
 * closed/open *definition* is a calendar fact, not a price feed, so this works
 * with no network at all.
 *
 * The countdown text is marked `suppressHydrationWarning` because it is computed
 * from `new Date()` on the server and again on the client, and a second can pass
 * between the two. The open/closed state itself is stable and is not suppressed —
 * if that ever disagreed, I would want to know.
 */
export function SessionClock({ variant = "compact" }: { variant?: "compact" | "hero" }) {
  const [session, setSession] = useState(() => sessionAt());

  useEffect(() => {
    const id = setInterval(() => setSession(sessionAt()), 1000);
    return () => clearInterval(id);
  }, []);

  if (variant === "compact") {
    // Used as a hero read-out now, not in the header, so it is left-aligned and
    // always visible rather than hidden behind a breakpoint.
    return (
      <div className="flex flex-col gap-1.5">
        <span className="label">Session</span>
        <span
          className={`flex items-center gap-2 font-mono text-sm ${session.open ? "text-signal" : "text-ink"}`}
          suppressHydrationWarning
        >
          <span
            aria-hidden
            className={`block size-1.5 rounded-full ${session.open ? "bg-signal" : "bg-violet"}`}
            style={{ animation: "telemetry 2.4s ease-in-out infinite" }}
          />
          {session.open ? "OPEN" : "SHUT"}
          <span className="text-ink-dim">
            · {session.open ? "bell in" : "opens in"} {formatCountdown(session.msUntil)}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="panel flex w-full max-w-md flex-col gap-5 p-6">
      <div className="flex items-baseline justify-between">
        <span className="label">Regular session</span>
        <span
          className={`flex items-center gap-2 font-mono text-xs tracking-[0.2em] uppercase ${
            session.open ? "text-signal" : "text-ember"
          }`}
        >
          <span
            aria-hidden
            className={`block size-1.5 ${session.open ? "bg-signal" : "bg-ember"}`}
            style={{ animation: "telemetry 2.4s ease-in-out infinite" }}
          />
          {session.open ? "Open" : "Shut"}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="label">
          {session.open ? "Bell in" : "Offhrs for another"}
        </span>
        <span
          className="figure text-4xl leading-none text-ink"
          suppressHydrationWarning
        >
          {formatCountdown(session.msUntil)}
        </span>
      </div>

      {/* Progress through the current state, dithered like everything else. */}
      <div className="curve-track">
        <div className="curve-fill" style={{ width: `${session.progress * 100}%` }} />
      </div>

      <div className="flex items-baseline justify-between font-mono text-xs text-ink-faint">
        <span suppressHydrationWarning>{session.nextVerb} {nyLabel(session.nextChangeAt)} ET</span>
        <span suppressHydrationWarning>
          {Math.round(session.progress * 100)}% through
        </span>
      </div>
    </div>
  );
}
