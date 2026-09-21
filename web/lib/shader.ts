/**
 * The selectable field shader.
 *
 * `WarpField` used to be one shader. It is now one of two, chosen by the visitor,
 * because the field is the page's signature and swapping it is the cheapest way to
 * let someone make the site theirs. Both read the same palette stops and the same
 * reduced-motion setting, so the choice is only ever about the pattern, never
 * about a second set of colours to keep in sync.
 */
export type ShaderKind = "warp" | "voronoi";

export const SHADER_STORAGE_KEY = "offhours-shader";
export const DEFAULT_SHADER: ShaderKind = "warp";

export const SHADERS: { id: ShaderKind; label: string }[] = [
  { id: "warp", label: "Warp" },
  { id: "voronoi", label: "Voronoi" },
];

export function shaderById(id: string | null | undefined): ShaderKind {
  return id === "voronoi" ? "voronoi" : "warp";
}
