"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { DEFAULT_SHADER, SHADER_STORAGE_KEY, shaderById, type ShaderKind } from "@/lib/shader";

interface ShaderContextValue {
  shader: ShaderKind;
  setShader: (shader: ShaderKind) => void;
}

const ShaderContext = createContext<ShaderContextValue | null>(null);

/**
 * Which field shader the page draws, remembered across visits.
 *
 * Kept separate from the palette provider on purpose: the palette is a colour
 * decision expressed in CSS custom properties, while this is a choice of WebGL
 * component and has to be read in JavaScript. It does not need a pre-paint
 * script — the field is client-only, so it simply mounts as the chosen shader.
 */
export function ShaderProvider({ children }: { children: React.ReactNode }) {
  const [shader, setShaderState] = useState<ShaderKind>(DEFAULT_SHADER);

  useEffect(() => {
    try {
      const held = window.localStorage.getItem(SHADER_STORAGE_KEY);
      if (held !== null) setShaderState(shaderById(held));
    } catch {
      // Private mode — the default stands.
    }
  }, []);

  const setShader = useCallback((next: ShaderKind) => {
    setShaderState(next);
    try {
      window.localStorage.setItem(SHADER_STORAGE_KEY, next);
    } catch {
      // Private mode — the choice still applies for this visit.
    }
  }, []);

  return (
    <ShaderContext.Provider value={{ shader, setShader }}>{children}</ShaderContext.Provider>
  );
}

export function useShaderChoice(): ShaderContextValue {
  const ctx = useContext(ShaderContext);
  if (!ctx) return { shader: DEFAULT_SHADER, setShader: () => {} };
  return ctx;
}
