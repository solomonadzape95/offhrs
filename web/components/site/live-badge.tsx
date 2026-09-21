"use client";

import { useEffect, useState } from "react";

/**
 * Network/regime telemetry, as a signal rather than a sticker.
 *
 * A bordered pill with a pulsing dot is what every crypto page reaches for. This
 * says the same thing in the design's own language: a dot-matrix strip filling
 * and emptying, hairlines either side, no chrome. It reads as telemetry.
 */
const CELLS = 5;
const TICK_MS = 420;

export function LiveBadge({
  label,
  tone = "signal",
}: {
  label: string;
  tone?: "signal" | "ember";
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % (CELLS + 3)), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const dot = tone === "ember" ? "bg-ember" : "bg-signal";

  return (
    <div className="flex items-center gap-4">
      <span aria-hidden className="hidden h-px w-12 bg-edge sm:block" />
      <span className="flex items-center gap-3">
        <span aria-hidden className="flex items-center gap-[3px]">
          {Array.from({ length: CELLS }, (_, i) => (
            <span
              key={i}
              className={`block size-[3px] ${dot} transition-opacity duration-300`}
              style={{ opacity: i <= step ? 1 : 0.18 }}
            />
          ))}
        </span>
        <span className="font-mono text-xs tracking-[0.22em] text-ink-dim uppercase">{label}</span>
      </span>
      <span aria-hidden className="hidden h-px w-12 bg-edge sm:block" />
    </div>
  );
}
