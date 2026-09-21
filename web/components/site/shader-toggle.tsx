"use client";

import { CirclesFour, WaveSine } from "@phosphor-icons/react";

import { Icon } from "@/components/ui/icon";
import { useShaderChoice } from "@/components/site/shader-provider";
import { SHADERS } from "@/lib/shader";

/**
 * The nav field control.
 *
 * One button that steps between the two shaders, with the icon showing which one
 * is live. Like the palette button beside it, it is a flip rather than a menu:
 * there are only two choices, and a popover for two would cost more than it saves.
 */
export function ShaderToggle({ className }: { className?: string }) {
  const { shader, setShader } = useShaderChoice();
  const next = shader === "warp" ? "voronoi" : "warp";
  const label = SHADERS.find((s) => s.id === shader)?.label ?? "Warp";

  return (
    <button
      type="button"
      onClick={() => setShader(next)}
      className={`icon-btn ${className ?? ""}`}
      title={`Field — ${label}`}
      aria-label={`Change field effect. Current: ${label}`}
    >
      <Icon icon={shader === "warp" ? WaveSine : CirclesFour} size={16} />
    </button>
  );
}

/**
 * The footer picker: both shaders, named. Same construction as the palette
 * swatches, so the two appearance axes read as siblings.
 */
export function ShaderSwatches({ className }: { className?: string }) {
  const { shader, setShader } = useShaderChoice();

  return (
    <div className={className}>
      <span className="label">Field</span>
      <div className="mt-4 flex flex-wrap gap-2">
        {SHADERS.map((s) => {
          const active = s.id === shader;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setShader(s.id)}
              aria-pressed={active}
              className={`inline-flex items-center gap-2 rounded-[var(--radius-pill)] border px-3 py-2 text-xs transition-colors ${
                active
                  ? "border-ink/40 bg-ink/10 text-ink"
                  : "border-edge/70 text-ink-dim hover:border-ink/30 hover:text-ink"
              }`}
            >
              <Icon icon={s.id === "warp" ? WaveSine : CirclesFour} size={13} dither={false} />
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
