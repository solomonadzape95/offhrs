#!/usr/bin/env python3
"""
Rasterise the brand assets.

Same Voronoi as scripts/generate-brand.mjs, drawn with Pillow so the output is a
PNG (X does not take SVG). Supersampled 2x and downscaled with Lanczos so the
cell edges and the wordmark are clean. The wordmark is set in the real Manosque
face, decompressed from the woff2 the site ships.
"""
import random
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = ROOT / "public" / "brand"
OUT.mkdir(parents=True, exist_ok=True)

GROUND = (10, 15, 24)
RAMP = ["#0d1b33", "#123a6b", "#1c5fa8", "#2f86d6", "#5ad8ff", "#8fe8ff"]
SIGNAL = (90, 216, 255)


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


RAMP_RGB = [hexrgb(c) for c in RAMP]


def clip(poly, A, B, C):
    out = []
    n = len(poly)
    for i in range(n):
        p = poly[i]
        q = poly[(i + 1) % n]
        dp = A * p[0] + B * p[1] - C
        dq = A * q[0] + B * q[1] - C
        pin, qin = dp <= 0, dq <= 0
        if pin:
            out.append(p)
        if pin != qin:
            t = dp / (dp - dq)
            out.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
    return out


def voronoi(seeds, W, H):
    cells = []
    for si in seeds:
        poly = [(0, 0), (W, 0), (W, H), (0, H)]
        for sj in seeds:
            if sj is si:
                continue
            A = 2 * (sj[0] - si[0])
            B = 2 * (sj[1] - si[1])
            C = sj[0] ** 2 + sj[1] ** 2 - (si[0] ** 2 + si[1] ** 2)
            poly = clip(poly, A, B, C)
            if not poly:
                break
        cells.append(poly)
    return cells


def banner():
    SS = 2
    W, H = 1500, 500
    rnd = random.Random(0x0FF5)
    count = 90
    seeds = [(rnd.random() * W, rnd.random() * H, rnd.random()) for _ in range(count)]
    cells = voronoi(seeds, W, H)

    img = Image.new("RGB", (W * SS, H * SS), GROUND)
    draw = ImageDraw.Draw(img)

    for poly, s in zip(cells, seeds):
        if len(poly) < 3:
            continue
        t = min(
            0.999,
            max(0.0, 0.1 + 0.85 * (0.55 * s[0] / W + 0.45 * s[1] / H) + (s[2] - 0.5) * 0.22),
        )
        fill = RAMP_RGB[int(t * len(RAMP_RGB))]
        draw.polygon([(x * SS, y * SS) for x, y in poly], fill=fill)

    # Cell gaps.
    for poly in cells:
        if len(poly) < 3:
            continue
        pts = [(x * SS, y * SS) for x, y in poly]
        draw.line(pts + [pts[0]], fill=GROUND, width=int(2.5 * SS), joint="curve")

    # The wordmark plate: the mark and the name, as one lockup.
    rx, ry, rw, rh = 375, 170, 750, 160
    draw.rectangle([rx * SS, ry * SS, (rx + rw) * SS, (ry + rh) * SS], fill=(0, 0, 0))

    draw_lockup(
        draw,
        cx=(rx + rw / 2) * SS,
        cy=(ry + rh / 2) * SS,
        size=132 * SS,
        mark_r=52 * SS,
        gap=30 * SS,
    )

    img.resize((W, H), Image.LANCZOS).save(OUT / "banner.png")
    return OUT / "banner.png"


def draw_lockup(draw, cx, cy, size, mark_r, gap):
    """The mark and the name, centred together — the same lockup as the site."""
    text = "offhrs"
    font = ImageFont.truetype(str(manosque_ttf()), int(size))
    widths = [draw.textlength(ch, font=font) for ch in text]
    tracking = -size * 0.038
    text_w = sum(widths) + tracking * (len(text) - 1)
    total = mark_r * 2 + gap + text_w
    x = cx - total / 2

    # The disc, with its voids punched back to the plate's black.
    mcx = x + mark_r
    draw.ellipse([mcx - mark_r, cy - mark_r, mcx + mark_r, cy + mark_r], fill=SIGNAL)
    scale = mark_r / 18.5
    for vx, vy, vr in [(25.5, 13, 7.2), (13, 26.5, 4.6), (27, 28.5, 2.6)]:
        ox, oy, rr = (vx - 20) * scale, (vy - 20) * scale, vr * scale
        draw.ellipse([mcx + ox - rr, cy + oy - rr, mcx + ox + rr, cy + oy + rr], fill=(0, 0, 0))

    x += mark_r * 2 + gap
    for ch, w in zip(text, widths):
        draw.text((x, cy), ch, font=font, fill=(246, 245, 248), anchor="lm")
        x += w + tracking


def draw_tracked(draw, text, font, cx, cy, fill, tracking):
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = cx - total / 2
    for ch, w in zip(text, widths):
        draw.text((x, cy), ch, font=font, fill=fill, anchor="lm")
        x += w + tracking


def pfp():
    SS = 2
    S = 1024
    img = Image.new("RGB", (S * SS, S * SS), (11, 11, 13))
    draw = ImageDraw.Draw(img)
    draw.ellipse(circle(512, 512, 440, SS), fill=SIGNAL)
    for cx, cy, r in [(642, 350, 172), (350, 636, 110), (650, 672, 62)]:
        draw.ellipse(circle(cx, cy, r, SS), fill=(11, 11, 13))
    img.resize((S, S), Image.LANCZOS).save(OUT / "pfp.png")
    return OUT / "pfp.png"


def circle(cx, cy, r, ss):
    return [cx * ss - r * ss, cy * ss - r * ss, cx * ss + r * ss, cy * ss + r * ss]


_TTF = ROOT / "scripts" / ".Manosque-Regular.ttf"


def manosque_ttf():
    if not _TTF.exists():
        f = TTFont(str(ROOT / "app" / "fonts" / "Manosque-Regular.woff2"))
        f.flavor = None
        f.save(str(_TTF))
    return _TTF


if __name__ == "__main__":
    print("wrote", banner())
    print("wrote", pfp())
