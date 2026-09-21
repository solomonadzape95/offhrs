"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { useShaderChoice } from "@/components/site/shader-provider";
import { useTheme } from "@/components/site/theme-provider";

/**
 * The field.
 *
 * WebGL only exists in the browser, so the shader is loaded client-side. Doing it
 * with `dynamic({ ssr: false })` rather than a `mounted` flag avoids a render pass
 * that exists purely to be thrown away.
 *
 * Sized by CSS rather than the fixed `width`/`height` in the reference snippet:
 * the field has to fill whatever box it is given, and a 1280x720 canvas stretched
 * to fit would distort the pattern on both phones and wide monitors.
 *
 * There are **two** fields — Warp and Voronoi — and the visitor picks one
 * (`components/site/shader-toggle.tsx`). Both read the same active palette
 * (`lib/theme.ts`), so a palette switch repaints whichever is live; a shader with
 * its own hard-coded stops would be the one thing on the page that ignored the
 * switch.
 *
 * Three placements share the component. `hero` is the composition's subject and
 * runs at full brightness; `footer` is the ground the closing statement sits on,
 * so it is the same image read from the deep end; `band` is a quieter, shorter
 * mid-page field where a statement lands.
 *
 * `lazy` exists because a fragment shader is fill-rate bound and a mid-page band
 * is off screen for almost the whole visit. When set, the canvas is not mounted
 * until the box is near the viewport.
 *
 * It is the only animation on the page, so `prefers-reduced-motion` stops it by
 * pinning the speed — the colour and the pattern stay, the motion does not.
 */
const WarpShader = dynamic(
  () => import("@paper-design/shaders-react").then((mod) => mod.Warp),
  { ssr: false },
);

const VoronoiShader = dynamic(
  () => import("@paper-design/shaders-react").then((mod) => mod.Voronoi),
  { ssr: false },
);

const VARIANT = {
  hero: { proportion: 0.45, distortion: 0.25, swirl: 0.8 },
  footer: { proportion: 0.6, distortion: 0.3, swirl: 1.1 },
  band: { proportion: 0.5, distortion: 0.18, swirl: 0.6 },
} as const;

export function WarpField({
  className,
  variant = "hero",
  lazy = false,
}: {
  className?: string;
  variant?: "hero" | "footer" | "band";
  /** Defer mounting until the field is near the viewport. */
  lazy?: boolean;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(!lazy);
  // Respect the OS setting. The colour and the pattern stay; the motion stops.
  const [reduced, setReduced] = useState(false);
  const { theme } = useTheme();
  const { shader } = useShaderChoice();

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!lazy || visible || !host.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(host.current);
    return () => io.disconnect();
  }, [lazy, visible]);

  const cfg = VARIANT[variant];
  // The footer reads the stops in the other order so it is the deep end of the
  // same image rather than a copy of the hero.
  const colors =
    variant === "footer"
      ? [theme.warp[0], theme.warp[3], theme.warp[0], theme.warp[1]]
      : [...theme.warp];

  return (
    <span ref={host} className={className}>
      {visible &&
        (shader === "voronoi" ? (
          <VoronoiShader
            className="h-full w-full"
            width="100%"
            height="100%"
            colors={[theme.signal, theme.violet]}
            colorGap={theme.warp[0]}
            colorGlow={theme.signalBright}
            stepsPerColor={2}
            distortion={cfg.distortion + 0.15}
            gap={0.04}
            glow={0.25}
            scale={variant === "band" ? 0.65 : 0.5}
            speed={reduced ? 0 : 0.45}
            /* A full-bleed fragment shader is fill-rate bound, and at DPR 3 a phone
               would push ~3x the pixels for no visible gain. Cap the ratio. */
            minPixelRatio={1}
          />
        ) : (
          <WarpShader
            className="h-full w-full"
            width="100%"
            height="100%"
            colors={colors}
            proportion={cfg.proportion}
            softness={1}
            distortion={cfg.distortion}
            swirl={cfg.swirl}
            swirlIterations={10}
            shape="checks"
            shapeScale={0.1}
            speed={reduced ? 0 : 1}
            minPixelRatio={1}
          />
        ))}
    </span>
  );
}
