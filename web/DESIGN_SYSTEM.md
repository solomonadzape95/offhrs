# Offhrs — Design System

The landing page is the specification. Every token below is already in
`app/globals.css`, and every component in `components/ui` and `components/site`
is an implementation of it. If a value is not in this file it should not be
hard-coded anywhere — add it here first.

---

## 1. Ground

A near-black stack, ordered by elevation. Nothing on the page is pure black;
the lightest ground is still `#121212` so the warp's dark stops sit flush
against it.

| Token | Value | Use |
|---|---|---|
| `--color-void` | `#121212` | Page background. The shader's own ground. |
| `--color-void-deep` | `#0b0b0d` | Ink that sits **on** signal; the deepest wells (terminals, the footer wordmark). |
| `--color-surface` | `#1a1a1c` | Panels. |
| `--color-raised` | `#232326` | Hover states, nested rows. |
| `--color-edge` | `#2e2e33` | Hairline borders. The only line weight in the system. |

Ground, ink, radii and type are **constant across every palette**. A palette
changes the signal family only.

## 2. Ink

| Token | Value | Use |
|---|---|---|
| `--color-ink` | `#f6f5f8` | Primary text and figures. Also the primary button's hover fill. |
| `--color-ink-dim` | `#b8b5c2` | Body copy. |
| `--color-ink-faint` | `#7e7b89` | Labels, hints, metadata. |

## 3. Signal — the palette system

Signal is still the only colour on the page, but it is no longer one fixed hue.
A **palette** is five tokens — `signal`, `signal-bright`, `signal-dim`, `violet`,
and four Warp shader stops — declared in `lib/theme.ts` and mirrored as
`:root[data-theme="…"]` overrides in `globals.css`. Switching the palette
repaints the buttons, the shader, the logo and every icon at once, because
nothing names a hue directly.

| Token | Meaning |
|---|---|
| `--color-signal` | **Live, actionable, moving.** Primary buttons, active nav, positive basis, the logo, shader front. |
| `--color-signal-bright` | Hover only. Never static. |
| `--color-signal-dim` | The quiet end — step numbers, resting marks. |
| `--color-violet` | **Weight and depth.** Not status. Gradients, the deep end of the warp. |

Shipped palettes: **Ultraviolet** (default), **Ion**, **Acid**, **Rose**. Adding
one means one entry in `lib/theme.ts` and one `:root[data-theme]` block; nothing
else changes.

**Ember** — `--color-ember: #f0a868` — is reserved for warnings and "down". It is
the only warm colour and it does **not** change with the palette; a warning must
stay a warning in every theme.

### Rules

- Signal means *state*, not emphasis. A heading is not signal because it is
  important; a figure is signal because it is live or positive.
- Never place `--color-ink` on `--color-signal` at rest. Use `--color-void-deep`.
  On hover the primary button resolves the other way: ink fill, void-deep text.
- A shader may never hard-code its stops. The Warp reads them from `lib/theme.ts`
  through `useTheme()`, which is why the toggle can repaint it.

## 4. Type

| Face | Variable | Role |
|---|---|---|
| Satoshi | `--font-sans` | Body, buttons, UI. |
| Manosque | `--font-display` | **The** display face. Headlines, the wordmark, the nav trigger, the footer mark. |
| Geist Mono | `--font-mono` | Labels, figures, terminal. |
| Geist Pixel | `--font-pixel-face` | Reserved for figures large enough to survive it. |

Scale, as classes in `globals.css`:

- `.text-display` — `clamp(2.75rem, 8vw, 7rem)`. The hero only.
- `.text-headline` — `clamp(2.25rem, 5vw, 4rem)`. Page titles and the warp band.
- `.text-statement` — `clamp(1.75rem, 3.6vw, 3rem)`. Section headings.
- `.label` — mono, `0.75rem`, `0.16em` tracking, uppercase, `ink-faint`. Every
  section and field is introduced by one.
- `.figure` — mono with `tnum`. All numbers that could be compared vertically.

## 5. Shape & elevation

| Token | Value | Use |
|---|---|---|
| `--radius-pill` | `999px` | Anything clickable, the nav shell, the collapsed menu. |
| `--radius-card` | `20px` | Panels, and the menu once it is open. |
| `--radius-soft` | `14px` | Nested surfaces, menu rows. |

Nothing is sharp. Surfaces are `--color-surface` at 88% with a 12px backdrop
blur and a wide, low-opacity shadow (`0 18px 50px -22px`). Panels that are
destinations rather than containers get `.panel-interactive`: the edge warms
toward signal and the surface lifts 2px on hover.

### Cards carry one graphic

A card has **one** visual anchor, never an icon and a chart competing at its
head. The mechanics cells carry a drawn diagram; the agent cards carry a
generated sigil; the reserved slots carry the slot placeholder. If a card needs
two marks, it is two cards.

### Layout variety is a rule

The page must not be one repeated card. Each section has a different shape, and
a new section should pick one that is not already in use:

| Section | Shape |
|---|---|
| `#reference` | Two-column proof + figure slot |
| `#board` | Full-width table |
| `#mechanics` | **Bento** — one large cell, two small |
| `#agents` | **Carousel** — horizontal snap rail |
| warp band | Full-bleed shader statement |
| `#vault` | Two-column ledger |
| `#faq` | Two-column accordion |

## 6. Motion

Three motions exist, all optional under `prefers-reduced-motion`:

1. **The warp.** The hero's shader, a mid-page band, and the footer — one
   component, one palette, three variants. Speed pins to `0` under reduced
   motion; the colour remains.
2. **The glow.** Hover on a primary control *lights* it — the fill resolves to
   ink and `box-shadow: var(--glow-signal-strong)` blooms. The button never
   changes shape. This is the Nebula signature and the page's only hover
   vocabulary.
3. **The dither drift.** `DitherBackdrop` runs the library's `Dithering` shader
   very slowly behind a section at low opacity, as texture rather than subject.

Expand/collapse — the menu and the FAQ — uses the `.expando` grid-row trick or a
`max-height` ease, both without measuring. No animation library is installed.

## 7. The print — dithering

Every graphic is punched through a halftone lattice, so the page reads as
printed onto the ground rather than assembled from vectors.

- The mask lives in the `.dither` class, driven by `--dither-cell` and
  `--dither-dot`.
- **Cell scales with size.** `components/ui/icon.tsx#cellFor`: 3px at ≥48px,
  2.5px at ≥32px, 2px below. A fixed cell reads as texture on a large mark and
  eats a small one.
- **Never dither below 13px.** There is not enough glyph left; the shape
  dissolves.
- **Thickness compensates.** The mask keeps the ink *inside* the dots, so
  dithered icons run `bold` at small sizes and `regular` at large ones.
- Same lattice, coarser: `components/site/glyph.tsx` sets oversized typographic
  marks behind sections at 4% opacity.

## 8. Marks

- **Logo** — `components/site/logo.tsx`. A disc with three voids punched through
  it (the Nebula construction, re-emitted in the palette's signal). The halftone
  is printed *onto* the body rather than masked out of it.
- **Agent sigil** — `components/site/agent-sigil.tsx`. Deterministic from the
  agent id: same seed, same disc, voids and orbit every render. Eight agents,
  eight marks, zero hand-drawn assets. Coordinates are rounded so server and
  client render byte-identical SVG.
- Phosphor icons, with two wrappers: `components/ui/icon.tsx` (small, dithered
  adaptively) and `components/ui/dither-icon.tsx` (the oversized two-pass mark).

## 9. Data graphics

The page does not print invented *figures*, but it does draw the *shapes* of its
mechanisms, and it draws them in the page's own print language:

- **`components/site/dither-chart.tsx`** — a low-resolution canvas where the area
  under each curve is an ordered-dither gradient (denser at the baseline) and the
  edge is a solid hairline. No axis text; the numbers live in the table beside it.
  Used for the reference plot, the vault plot, and the two smaller bento cells.
  Shapes come from `lib/chart-data.ts`, all seeded so they are stable.
- **`components/site/halftone-image.tsx`** — a photograph dithered into the active
  palette with the library's `ImageDithering` shader. It preloads its source and
  renders `fallback` if the file is missing, so a plate can be dropped in later
  with no code change. Used for the large bento cell.
- **`components/site/figure-slot.tsx`** — the older reserved, labelled well. No
  longer used on the landing page, kept for future slots.

Charts are labelled “illustrative”; they are diagrams of a mechanism, not claims
about the market.

## 10. Layout

- `.container-app` / `max-w-app` — `84rem`. The only page gutter.
- Section shell: `components/site/section.tsx`. A hairline label row, the
  container, and vertical rhythm `py-16 → sm:py-20 → lg:py-28`.
- **The header is fixed**, not sticky: the hero is a full viewport and chrome
  may not take a strip out of it. The bar is unbacked over the hero and takes a
  blurred ground once the page moves.
- Header is a three-track grid: wordmark left, expanding menu centre, controls
  right. On a phone the wordmark drops to the mark alone and the palette switch
  moves to the footer.
- **The centre menu is its own trigger.** `.center-menu` animates `max-height`
  and `width` so the pill grows into a card around its contents — never a
  separate panel. `:hover` and `:focus-within` open it on pointer devices;
  `[data-open]` opens it on touch. On a phone the brand and wallet fade out
  while it is open so nothing sits under the card.

## 11. Component inventory

| Component | File |
|---|---|
| Nav (fixed bar + expanding centre menu) | `components/site/nav.tsx` |
| Theme provider (palette state + Warp colours) | `components/site/theme-provider.tsx` |
| Theme toggle / footer swatches | `components/site/theme-toggle.tsx` |
| Logo / voided-disc mark | `components/site/logo.tsx` |
| Agent sigil (generative) | `components/site/agent-sigil.tsx` |
| Warp field (hero / band / footer, lazy) | `components/site/warp-field.tsx` |
| Dither backdrop (second shader) | `components/site/dither-backdrop.tsx` |
| Dither chart (canvas plots) | `components/site/dither-chart.tsx` |
| Halftone image (photo → dither) | `components/site/halftone-image.tsx` |
| Mechanics bento + diagrams | `components/site/mechanics.tsx` |
| Agent carousel | `components/site/agent-carousel.tsx` |
| Section shell | `components/site/section.tsx` |
| Figure slot | `components/site/figure-slot.tsx` |
| Glyph (background marks) | `components/site/glyph.tsx` |
| Stat | `components/site/stat.tsx` |
| Live badge | `components/site/live-badge.tsx` |
| Session clock | `components/site/session-clock.tsx` |
| FAQ accordion | `components/site/faq.tsx` |
| Footer | `components/site/site-footer.tsx` |
| Icon / dither icon | `components/ui/icon.tsx`, `dither-icon.tsx` |

## 12. Dead ends — do not rebuild

- **The font toggle.** Removed. Manosque only.
- **The mobile bottom tab bar.** Removed. One header serves every breakpoint.
- **The doodle cue.** Retired from the header. It was decoration outside the
  button and it pushed the hero's composition down; the menu now explains itself
  by expanding. `doodle-cue.tsx` / `doodle-moon.tsx` are unused.
- **The separate dropdown panel.** The menu is the same element as its trigger.
- **The repeated feature card.** Mechanics is a bento, agents is a carousel.
- **Green.** Removed everywhere, including the favicon.
