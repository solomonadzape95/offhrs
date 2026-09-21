/**
 * The palette registry.
 *
 * The site ships one ground (near-black) and a family of signal palettes. A
 * palette is not a "light mode" — it is the same design with a different emitter:
 * the accent, its hover, its quiet end, the deep weight colour, and the four
 * stops the Warp shader reads. Everything else in the design system is
 * derived from these values, so switching a palette changes the whole page at
 * once and nothing is left pointing at the old hue.
 *
 * Keep each palette to five colours: the tokens below plus ember, which never
 * changes because a warning must stay a warning in every palette.
 */
export type ThemeId = "ultraviolet" | "ion" | "acid" | "rose";

export interface Theme {
  id: ThemeId;
  /** Shown to humans. */
  label: string;
  /** The chip in the picker. Usually `signal`. */
  swatch: string;
  /** `--color-signal`. Live, actionable, moving. */
  signal: string;
  /** `--color-signal-bright`. Hover only. */
  signalBright: string;
  /** `--color-signal-dim`. The quiet end. */
  signalDim: string;
  /** `--color-violet`. Weight and depth, not status. */
  violet: string;
  /** Warp stops, in the shader's own order. Ground first. */
  warp: [string, string, string, string];
}

export const THEMES: Theme[] = [
  {
    id: "ultraviolet",
    label: "Ultraviolet",
    swatch: "#9470ff",
    signal: "#9470ff",
    signalBright: "#a487ff",
    signalDim: "#6d4fd6",
    violet: "#8838ff",
    warp: ["#121212", "#9470ff", "#121212", "#8838ff"],
  },
  {
    id: "ion",
    label: "Ion",
    swatch: "#5ad8ff",
    signal: "#5ad8ff",
    signalBright: "#86e6ff",
    signalDim: "#2f9fce",
    violet: "#3f6dff",
    warp: ["#121212", "#5ad8ff", "#121212", "#3f6dff"],
  },
  {
    id: "acid",
    label: "Acid",
    swatch: "#c6f24e",
    signal: "#c6f24e",
    signalBright: "#d8ff72",
    signalDim: "#8fbf2f",
    violet: "#5fd48a",
    warp: ["#121212", "#c6f24e", "#121212", "#5fd48a"],
  },
  {
    id: "rose",
    label: "Rose",
    swatch: "#ff6ea9",
    signal: "#ff6ea9",
    signalBright: "#ff92bf",
    signalDim: "#d1427c",
    violet: "#b44bff",
    warp: ["#121212", "#ff6ea9", "#121212", "#b44bff"],
  },
];

export const DEFAULT_THEME: ThemeId = "ultraviolet";

/** Storage key. Read by the pre-paint script in the root layout. */
export const THEME_STORAGE_KEY = "offhours-theme";

export function themeById(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** The CSS custom properties a palette overrides, as a style object. */
export function themeVars(theme: Theme): Record<string, string> {
  return {
    "--color-signal": theme.signal,
    "--color-signal-bright": theme.signalBright,
    "--color-signal-dim": theme.signalDim,
    "--color-violet": theme.violet,
  };
}
