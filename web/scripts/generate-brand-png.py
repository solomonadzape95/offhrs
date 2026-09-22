#!/usr/bin/env python3
"""
Rasterise the brand assets.

Same Voronoi as the site, drawn with Pillow so the output is a PNG (X and Open
Graph do not take SVG). Supersampled 2x and downscaled with Lanczos so the cell
edges and the wordmark are clean.

The wordmark is set in **Skyscrapers**, the same face the site uses for it, and the
Open Graph headline in **EB Garamond**, the display serif. Both are read from the
real files the site ships; the woff2 ones are decompressed to a cached `.ttf` for
Pillow, and EB Garamond's variable axis is pinned so the headline can sit heavier
than its 400 default.

Outputs:
  public/brand/banner.png   1500x500   X profile banner
  public/brand/pfp.png      1024x1024  profile picture (the mark only)
  public/brand/og.png       1200x630   Open Graph / Twitter card
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
VOID = (11, 11, 13)
INK = (246, 245, 248)
INK_DIM = (182, 182, 189)
RAMP = ["#0d1b33", "#123a6b", "#1c5fa8", "#2f86d6", "#5ad8ff", "#8fe8ff"]
SIGNAL = (90, 216, 255)

WORDMARK = ROOT / "public" / "Skyscapers.ttf"
# Skyscrapers is a static medium; the site applies no tracking to the wordmark.
WORDMARK_TRACKING = -0.015


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


RAMP_RGB = [hexrgb(c) for c in RAMP]


# ── Fonts ────────────────────────────────────────────────────────────────────
def ttf_from_woff2(rel, weight=None):
    """Decompress a woff2 to a cached `.ttf` Pillow can read.

    `weight` pins a variable axis (EB Garamond is 400–800) so a headline can be
    heavier than the default instance. Cached beside this script, gitignored.
    """
    src = ROOT / rel
    out = HERE / f".{src.stem}{f'-{weight}' if weight else ''}.ttf"
    if not out.exists():
        f = TTFont(str(src))
        f.flavor = None
        if weight is not None:
            from fontTools.varLib import instancer

            instancer.instantiateVariableFont(f, {"wght": weight})
        f.save(str(out))
    return out


def display_font(size, weight=500):
    return ImageFont.truetype(str(ttf_from_woff2("app/fonts/EBGaramond.woff2", weight)), int(size))


def sans_font(size, weight=500):
    return ImageFont.truetype(str(ttf_from_woff2(f"app/fonts/Satoshi-{weight}.woff2")), int(size))


# ── Voronoi ──────────────────────────────────────────────────────────────────
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


def paint_voronoi(img, draw, W, H, SS, count, seed, gap=True):
    rnd = random.Random(seed)
    seeds = [(rnd.random() * W, rnd.random() * H, rnd.random()) for _ in range(count)]
    cells = voronoi(seeds, W, H)
    for poly, s in zip(cells, seeds):
        if len(poly) < 3:
            continue
        t = min(
            0.999,
            max(0.0, 0.1 + 0.85 * (0.55 * s[0] / W + 0.45 * s[1] / H) + (s[2] - 0.5) * 0.22),
        )
        draw.polygon([(x * SS, y * SS) for x, y in poly], fill=RAMP_RGB[int(t * len(RAMP_RGB))])
    if gap:
        for poly in cells:
            if len(poly) < 3:
                continue
            pts = [(x * SS, y * SS) for x, y in poly]
            draw.line(pts + [pts[0]], fill=GROUND, width=int(2.5 * SS), joint="curve")
    return cells


# ── The lockup ───────────────────────────────────────────────────────────────
def lockup_width(draw, size, mark_r, gap):
    font = ImageFont.truetype(str(WORDMARK), int(size))
    widths = [draw.textlength(ch, font=font) for ch in "offhrs"]
    tracking = size * WORDMARK_TRACKING
    text_w = sum(widths) + tracking * (len("offhrs") - 1)
    return mark_r * 2 + gap + text_w


def draw_lockup(draw, x, cy, size, mark_r, gap, plate=None):
    """The mark and the name, left-aligned at `x`, centred vertically on `cy`."""
    if plate is not None:
        total = lockup_width(draw, size, mark_r, gap)
        pad = mark_r * 0.9
        draw.rectangle(
            [x - pad, cy - (mark_r + pad), x + total + pad, cy + (mark_r + pad)],
            fill=plate,
        )

    font = ImageFont.truetype(str(WORDMARK), int(size))
    text = "offhrs"
    widths = [draw.textlength(ch, font=font) for ch in text]
    tracking = size * WORDMARK_TRACKING

    mcx = x + mark_r
    draw.ellipse([mcx - mark_r, cy - mark_r, mcx + mark_r, cy + mark_r], fill=SIGNAL)
    scale = mark_r / 18.5
    for vx, vy, vr in [(25.5, 13, 7.2), (13, 26.5, 4.6), (27, 28.5, 2.6)]:
        ox, oy, rr = (vx - 20) * scale, (vy - 20) * scale, vr * scale
        draw.ellipse([mcx + ox - rr, cy + oy - rr, mcx + ox + rr, cy + oy + rr], fill=VOID)

    x += mark_r * 2 + gap
    for ch, w in zip(text, widths):
        draw.text((x, cy), ch, font=font, fill=INK, anchor="lm")
        x += w + tracking


# ── Assets ───────────────────────────────────────────────────────────────────
def banner():
    SS = 2
    W, H = 1500, 500
    img = Image.new("RGB", (W * SS, H * SS), GROUND)
    draw = ImageDraw.Draw(img)
    paint_voronoi(img, draw, W, H, SS, count=90, seed=0x0FF5)

    # The wordmark plate: the mark and the name, as one lockup.
    rx, ry, rw, rh = 375, 170, 750, 160
    draw.rectangle([rx * SS, ry * SS, (rx + rw) * SS, (ry + rh) * SS], fill=(0, 0, 0))
    total = lockup_width(draw, 132 * SS, 52 * SS, 30 * SS)
    draw_lockup(draw, (rx + rw / 2) * SS - total / 2, (ry + rh / 2) * SS, 132 * SS, 52 * SS, 30 * SS)

    img.resize((W, H), Image.LANCZOS).save(OUT / "banner.png")
    return OUT / "banner.png"


def pfp():
    SS = 2
    S = 1024
    img = Image.new("RGB", (S * SS, S * SS), VOID)
    draw = ImageDraw.Draw(img)
    draw.ellipse(circle(512, 512, 440, SS), fill=SIGNAL)
    for cx, cy, r in [(642, 350, 172), (350, 636, 110), (650, 672, 62)]:
        draw.ellipse(circle(cx, cy, r, SS), fill=VOID)
    img.resize((S, S), Image.LANCZOS).save(OUT / "pfp.png")
    return OUT / "pfp.png"


def og():
    """1200x630 Open Graph card: the field on the right, the claim on the left."""
    SS = 2
    W, H = 1200, 630
    img = Image.new("RGBA", (W * SS, H * SS), VOID)
    draw = ImageDraw.Draw(img)
    paint_voronoi(img, draw, W, H, SS, count=64, seed=0x0FF5, gap=False)

    # Darken the left two-thirds so the type reads, leaving the pattern on the right.
    overlay = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for x in range(W * SS):
        t = x / (W * SS)
        a = int(242 * max(0.0, 1.0 - (t / 0.74) ** 1.35))
        od.line([(x, 0), (x, H * SS)], fill=(*VOID, a))
    img = Image.alpha_composite(img, overlay).convert("RGB")
    draw = ImageDraw.Draw(img)

    M = 78 * SS

    # Wordmark, top-left.
    draw_lockup(draw, M, 116 * SS, 54 * SS, 21 * SS, 13 * SS)

    # The claim.
    head = display_font(84 * SS, weight=500)
    draw.text((M, 250 * SS), "The market is closed.", font=head, fill=INK, anchor="ls")
    draw.text((M, 342 * SS), "But we're offhrs.", font=head, fill=SIGNAL, anchor="ls")

    # The one-liner, and the domain.
    sub = sans_font(27 * SS, weight=500)
    draw.text(
        (M, 438 * SS),
        "Tokenized pre-IPO equity, traded after the bell.",
        font=sub,
        fill=INK_DIM,
        anchor="ls",
    )
    domain = sans_font(24 * SS, weight=700)
    draw.text((M, 528 * SS), "offhrs.fun", font=domain, fill=SIGNAL, anchor="ls")

    img.resize((W, H), Image.LANCZOS).save(OUT / "og.png")
    return OUT / "og.png"


def circle(cx, cy, r, ss):
    return [cx * ss - r * ss, cy * ss - r * ss, cx * ss + r * ss, cy * ss + r * ss]


if __name__ == "__main__":
    print("wrote", banner())
    print("wrote", pfp())
    print("wrote", og())
