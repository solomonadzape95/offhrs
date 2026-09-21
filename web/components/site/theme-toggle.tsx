"use client";

import { PaintBrush } from "@phosphor-icons/react";

import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/components/site/theme-provider";

/**
 * The nav palette control.
 *
 * A single button that steps through the palettes rather than a popover. The
 * switch is a five-line visual change, and a popover to choose between four
 * swatches costs more attention than the choice is worth; the footer carries the
 * full picker for anyone who wants to jump straight to one.
 *
 * The mark is drawn in the *current* signal, so it is also a live read-out of
 * which palette is on. The ring of the button lights on hover with the same
 * bloom as every other primary control.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, themeId, setTheme, themes } = useTheme();

  const next = themes[(themes.findIndex((t) => t.id === themeId) + 1) % themes.length];

  return (
    <button
      type="button"
      onClick={() => setTheme(next.id)}
      className={`icon-btn relative ${className ?? ""}`}
      title={`Palette — ${theme.label}`}
      aria-label={`Change colour palette. Current: ${theme.label}`}
    >
      <Icon icon={PaintBrush} size={16} />
      <span
        aria-hidden
        className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border border-void"
        style={{ background: theme.swatch }}
      />
    </button>
  );
}

/**
 * The footer picker: every palette, named, with its chip. This is where the
 * design system is legible as a system rather than as one person's preference.
 */
export function ThemeSwatches({ className }: { className?: string }) {
  const { themeId, setTheme, themes } = useTheme();

  return (
    <div className={className}>
      <span className="label">Palette</span>
      <div className="mt-4 flex flex-wrap gap-2">
        {themes.map((t) => {
          const active = t.id === themeId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              aria-pressed={active}
              className={`group flex items-center gap-2 rounded-[var(--radius-pill)] border px-3 py-2 text-xs transition-colors ${
                active
                  ? "border-ink/40 bg-ink/10 text-ink"
                  : "border-edge/70 text-ink-dim hover:border-ink/30 hover:text-ink"
              }`}
            >
              <span
                aria-hidden
                className="size-3 rounded-full"
                style={{
                  background: t.swatch,
                  boxShadow: active ? `0 0 14px -2px ${t.swatch}` : undefined,
                }}
              />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
