"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { useTheme } from "@/components/site/theme-provider";

/**
 * A second shader voice, from the same library as the warp.
 *
 * The warp is the page's subject; it cannot be used everywhere or it stops
 * meaning anything. `Dithering` is its quieter sibling and it shares the design's
 * own halftone logic, so it can sit *behind* a section as texture instead of as
 * another hero. The front colour is the active palette, laid at low opacity over
 * the ground, which keeps every section agreeing about the hue without any of them
 * shouting.
 *
 * Same lifecycle rules as `WarpField`: client-only, lazily mounted from an
 * intersection observer, and pinned to zero speed under reduced motion.
 */
const DitheringShader = dynamic(
  () => import("@paper-design/shaders-react").then((mod) => mod.Dithering),
  { ssr: false },
);

export function DitherBackdrop({
  className,
  shape = "wave",
  type = "4x4",
  size = 3,
  scale = 1.1,
  opacity = 0.16,
}: {
  className?: string;
  shape?: "sphere" | "wave" | "dots" | "ripple" | "swirl" | "warp";
  type?: "random" | "2x2" | "4x4" | "8x8";
  size?: number;
  scale?: number;
  opacity?: number;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (visible || !host.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(host.current);
    return () => io.disconnect();
  }, [visible]);

  return (
    <span
      ref={host}
      className={className}
      style={{ opacity }}
      aria-hidden
    >
      {visible && (
        <DitheringShader
          className="h-full w-full"
          width="100%"
          height="100%"
          colorBack="#121212"
          colorFront={theme.signal}
          shape={shape}
          type={type}
          size={size}
          scale={scale}
          speed={reduced ? 0 : 0.5}
          minPixelRatio={1}
        />
      )}
    </span>
  );
}
