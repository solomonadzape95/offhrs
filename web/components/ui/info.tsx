"use client";

import { useState } from "react";
import { Info as InfoGlyph } from "@phosphor-icons/react";

import { Icon } from "@/components/ui/icon";

/**
 * A small "i" that reveals an explanation. Used wherever a number needs a
 * definition rather than a paragraph in the layout — basis points, the migration
 * threshold, the curve fee.
 *
 * Opens on hover for pointer devices and toggles on click for touch; Escape and a
 * click elsewhere close it.
 */
export function Info({
  label = "More information",
  side = "top",
  children,
}: {
  label?: string;
  side?: "top" | "bottom";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="inline-flex text-ink-faint transition-colors hover:text-signal"
      >
        <Icon icon={InfoGlyph} size={13} dither={false} />
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute left-1/2 z-50 w-60 -translate-x-1/2 border border-edge bg-surface p-3 text-left font-mono text-[0.6875rem] leading-relaxed font-normal tracking-normal text-ink-dim normal-case shadow-xl ${
            side === "top" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
