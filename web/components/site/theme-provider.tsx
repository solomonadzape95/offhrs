"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import {
  DEFAULT_THEME,
  THEMES,
  THEME_STORAGE_KEY,
  themeById,
  themeVars,
  type Theme,
  type ThemeId,
} from "@/lib/theme";

interface ThemeContextValue {
  theme: Theme;
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
  themes: Theme[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * The palette lives on `<html data-theme>` and in CSS variables.
 *
 * The variables are applied at runtime rather than only through the stylesheet
 * because the same values also have to reach the Warp shader, which takes real
 * colour strings and cannot read a CSS variable. One source (`lib/theme.ts`)
 * feeds both, so the buttons and the shader can never disagree about the hue.
 *
 * The matching pre-paint script is in the root layout: it sets `data-theme`
 * before React boots so there is no flash of the default palette on a returning
 * visit.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME);

  // Adopt whatever the pre-paint script already resolved.
  useEffect(() => {
    const held = document.documentElement.dataset.theme as ThemeId | undefined;
    if (held && THEMES.some((t) => t.id === held)) setThemeId(held);
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    const theme = themeById(id);
    setThemeId(theme.id);
    const root = document.documentElement;
    root.dataset.theme = theme.id;
    for (const [key, value] of Object.entries(themeVars(theme))) {
      root.style.setProperty(key, value);
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme.id);
    } catch {
      // Private mode — the palette still applies for this visit.
    }
  }, []);

  // Keep the variables in sync when the id changes by any path (e.g. hydration).
  useEffect(() => {
    const theme = themeById(themeId);
    const root = document.documentElement;
    root.dataset.theme = theme.id;
    for (const [key, value] of Object.entries(themeVars(theme))) {
      root.style.setProperty(key, value);
    }
  }, [themeId]);

  return (
    <ThemeContext.Provider value={{ theme: themeById(themeId), themeId, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Components can render outside the provider during a build; fall back rather
    // than throw, and switch palette only when a real provider is present.
    return {
      theme: themeById(DEFAULT_THEME),
      themeId: DEFAULT_THEME,
      setTheme: () => {},
      themes: THEMES,
    };
  }
  return ctx;
}
