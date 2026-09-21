"use client";

import { useEffect, useRef } from "react";

/**
 * A generative dithered avatar, ported from Nebula's dither-kit.
 *
 * An 8×8 cell grid mirrored across one axis, so a name maps to a stable glyph:
 * same name, same avatar, every render and every machine. Each cell is drawn with
 * the same ordered-dither texture the charts use, which is what makes it read as
 * part of the page rather than as a pixel-art sticker.
 *
 * The hue is passed in rather than derived from the palette on purpose — agents
 * need to stay their own colour no matter which palette is active (see
 * `lib/avatar.ts`). Everything else (pattern, mirror axis, per-cell density) is
 * derived from the name.
 *
 * The canvas is 32×32 backing pixels scaled up with `image-rendering: pixelated`,
 * so the cells stay crisp at any display size.
 */
const GRID = 8;
const CELL_PX = 4;
const PX = GRID * CELL_PX;

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16));

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function xorshift32(seed: number): () => number {
  let s = seed || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}

type Rgb = [number, number, number];

/** Hue (0–360) → an rgb fill tuned to sit alongside the chart palette. */
function hueFill(hue: number): Rgb {
  const h = ((hue % 360) + 360) % 360;
  const s = 0.85;
  const l = 0.58;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const rgba = ([r, g, b]: Rgb, a: number) => `rgba(${r},${g},${b},${a})`;

/** Parse `#rgb` / `#rrggbb` to rgb. Returns null for anything else. */
function hexToRgb(hex: string): Rgb | null {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

interface Model {
  on: boolean[];
  density: number[];
  fill: Rgb;
}

function buildModel(name: string, hue: number, color?: string): Model {
  const rand = xorshift32(fnv1a(name));
  const bits = Array.from({ length: 32 }, () => rand() < 0.5);
  const vertical = rand() < 0.5;
  const halfDensity = Array.from({ length: 32 }, () => 0.55 + rand() * 0.45);

  const on = new Array<boolean>(GRID * GRID);
  const density = new Array<number>(GRID * GRID);
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const i = vertical
        ? Math.min(r, GRID - 1 - r) * GRID + c
        : r * (GRID / 2) + Math.min(c, GRID - 1 - c);
      on[r * GRID + c] = bits[i];
      density[r * GRID + c] = halfDensity[i];
    }
  }
  return { on, density, fill: (color ? hexToRgb(color) : null) ?? hueFill(hue) };
}

export function DitherAvatar({
  name,
  color,
  hue = 0,
  size,
  className,
  animate = true,
}: {
  name: string;
  /** Any CSS hex. Takes precedence over `hue`; used for white → signal on hover. */
  color?: string;
  /** 0–360 fallback when `color` is omitted. */
  hue?: number;
  /** Square px. Omit to size via className. */
  size?: number;
  className?: string;
  animate?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = PX;
    canvas.height = PX;
    const model = buildModel(name, hue, color);

    const draw = (progress: number) => {
      ctx.clearRect(0, 0, PX, PX);
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          if (!model.on[r * GRID + c]) continue;
          const start = BAYER4[r % 4][c % 4] * 0.7;
          const cellAlpha = clamp01((progress - start) / 0.3);
          if (cellAlpha <= 0) continue;
          const density = model.density[r * GRID + c];
          const base = 0.35 + 0.65 * density;
          for (let py = 0; py < CELL_PX; py++) {
            for (let pxi = 0; pxi < CELL_PX; pxi++) {
              const gx = c * CELL_PX + pxi;
              const gy = r * CELL_PX + py;
              const lit = density > BAYER4[gy & 3][gx & 3];
              ctx.fillStyle = rgba(model.fill, (lit ? base : base * 0.35) * cellAlpha);
              ctx.fillRect(gx, gy, 1, 1);
            }
          }
        }
      }
    };

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (!animate || reduce) {
      draw(1);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = clamp01((now - start) / 600);
      draw(1 - (1 - t) ** 3);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [name, hue, color, animate]);

  return (
    <span
      role="img"
      aria-label={`${name} avatar`}
      className={`relative block ${className ?? ""}`}
      style={size != null ? { width: size, height: size } : undefined}
    >
      <canvas
        ref={ref}
        className="absolute inset-0 h-full w-full"
        style={{ imageRendering: "pixelated" }}
      />
    </span>
  );
}
