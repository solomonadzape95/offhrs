"use client";

import { useEffect, useRef } from "react";

import { useTheme } from "@/components/site/theme-provider";

/**
 * A dithered chart, drawn on a low-resolution canvas.
 *
 * This is the same print language as the rest of the page, applied to a plot: the
 * area under each curve is not a flat fill but an ordered-dither gradient, denser
 * at the baseline and dissolving toward the edge, and the edge itself is a solid
 * hairline so the shape still reads at a glance.
 *
 * Canvas rather than SVG because ordered dithering is per-pixel work: the canvas
 * is sized to one pixel per dither cell (2 CSS px) and scaled up with
 * `image-rendering: pixelated`, so the dot grid stays crisp and the cost stays
 * flat no matter how wide the card gets.
 *
 * There is no animation and no axis text — these are shapes, and the numbers live
 * in the table beside them.
 */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16));

export interface DitherLine {
  data: number[];
  /** `area` dithers beneath the curve; `line`/`dashed` draw the edge only. */
  mode?: "area" | "line" | "dashed";
  opacity?: number;
  tone?: "signal" | "dim";
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function sample(data: number[], t: number): number {
  if (data.length === 0) return 0;
  if (data.length === 1) return data[0];
  const x = t * (data.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = data[i] ?? data[data.length - 1];
  const b = data[i + 1] ?? a;
  return a + (b - a) * f;
}

export function DitherChart({
  lines,
  threshold,
  markers,
  grid = true,
  className,
}: {
  lines: DitherLine[];
  /** A dashed floor, 0–1. */
  threshold?: number;
  /** Vertical fire lines, 0–1. */
  markers?: number[];
  grid?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const signal = hexToRgb(theme.signal);
    const dim = hexToRgb(theme.signalDim);

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const CELL = 2;
      const cols = Math.max(12, Math.round(rect.width / CELL));
      const rows = Math.max(12, Math.round(rect.height / CELL));
      canvas.width = cols;
      canvas.height = rows;
      ctx.clearRect(0, 0, cols, rows);

      const yOf = (v: number) => {
        const c = Math.min(1, Math.max(0, v));
        return rows - 1 - Math.round(c * (rows - 3));
      };
      const rgba = (rgb: [number, number, number], a: number) =>
        `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

      if (grid) {
        ctx.fillStyle = rgba(signal, 0.1);
        for (let y = 2; y < rows; y += 5) {
          for (let x = 2; x < cols; x += 5) ctx.fillRect(x, y, 1, 1);
        }
      }

      if (threshold !== undefined) {
        const y = yOf(threshold);
        ctx.fillStyle = rgba(signal, 0.5);
        for (let x = 0; x < cols; x += 4) ctx.fillRect(x, y, 2, 1);
      }

      for (const line of lines) {
        const rgb = line.tone === "dim" ? dim : signal;
        const css = rgba(rgb, line.opacity ?? 1);
        const mode = line.mode ?? "area";

        if (mode === "area") {
          for (let x = 0; x < cols; x++) {
            const top = yOf(sample(line.data, x / (cols - 1)));
            const h = rows - top;
            for (let y = top; y < rows; y++) {
              const d = h <= 1 ? 1 : (y - top) / (h - 1);
              if (d > BAYER4[y & 3][x & 3] * 0.95) {
                ctx.fillStyle = css;
                ctx.fillRect(x, y, 1, 1);
              }
            }
          }
        }

        // The edge, always solid so the shape survives the dither.
        ctx.fillStyle = css;
        for (let x = 0; x < cols; x++) {
          if (mode === "dashed" && (x & 3) >= 2) continue;
          ctx.fillRect(x, yOf(sample(line.data, x / (cols - 1))), 1, 1);
        }
      }

      if (markers) {
        const y = yOf(threshold ?? 0.5);
        for (const m of markers) {
          const x = Math.round(m * (cols - 1));
          ctx.fillStyle = rgba(signal, 0.4);
          for (let yy = 0; yy < rows; yy += 3) ctx.fillRect(x, yy, 1, 1);
          ctx.fillStyle = rgba(signal, 1);
          ctx.fillRect(x - 1, y - 1, 3, 3);
        }
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [lines, threshold, markers, grid, theme]);

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ display: "block", imageRendering: "pixelated" }}
      aria-hidden
    />
  );
}
