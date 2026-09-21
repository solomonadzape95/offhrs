# Offhrs — art prompts

Prompts for the **abstract halftone plates** that fill the graphic slots and the
bento cells. These are not screenshots and not charts: no UI, no axes, no
numbers. They are print, and they exist to give the empty wells the same texture
as the rest of the page.

Generate the whole set from **one seed / one style reference** so it reads as a
single series rather than six unrelated images.

---

## The master style (append to every prompt)

> abstract halftone screenprint, dense stochastic dot matrix, duotone, near-black
> `#121212` ground with luminous violet `#9470ff` and deep violet `#8838ff` ink,
> soft phosphor bloom, fine film grain, risograph misregistration, heavy ink
> coverage, high contrast, flat print, no depth of field
>
> **negative:** text, letters, numbers, words, user interface, dashboard, chart,
> graph, axis, grid of data, icon, logo, watermark, person, face, hands, 3d
> render, glossy plastic, neon tubes, lens flare, stock-photo

**Aspect ratios:** reference and vault `5:4` · bento-large `27:10` · bento-small `3:2`.

**Palette swaps** (replace the two violets above to match the theme):
- Ion — `#5ad8ff` / `#3f6dff`
- Acid — `#c6f24e` / `#5fd48a`
- Rose — `#ff6ea9` / `#b44bff`

---

## 1 · Reference slot — "the frozen reference" (`5:4`)

> A horizontal current of travelling halftone dots that suddenly flattens into a
> dead-still plateau; the left half is a dense moving wave, the right half a
> perfectly still field of finer dots, and a thin luminous seam divides them.
> Abstract, no axes, no labels.

The subject is the product: one thing stops moving while the other keeps going.

## 2 · Vault slot — "streamed, not dumped" (`5:4`)

> Two overlapping laminar ribbons of halftone ink converge and braid into one
> slow-rising column; heavy dots settle at the base and dissolve upward into a
> fine drifting mist. Abstract, organic flow, no axes.

## 3 · Bento · Wrapper (`27:10`)

> A solid mass of coarse halftone dots passes left-to-right through a clean
> circular aperture and emerges on the right as a finer, tidier lattice, leaving
> a short trail of stripped coarse dots behind the ring. Abstract, horizontal.

The aperture is the wrapper; the stripped dots are the transfer fee.

## 4 · Bento · Agent / signal (`3:2`)

> A dark halftone gradient broken by a single luminous rupture — one bright vein
> of signal cutting across the frame, where the dots ignite, bloom and scatter.
> Abstract, no waveform, no axes.

## 5 · Bento · Vault / stream (`3:2`)

> A single heavy drop of halftone ink at the left stretches into a long, even
> thread of dots across the frame, thinning but never breaking. Abstract.

---

## Optional sixth plate — mid-page warp band overlay

> A slow vortex of halftone dots spiralling toward a calm eye, edges dissolving
> into grain. Abstract, no subject.

## Wiring them in

The slots already accept a child and swap in place:

```tsx
<FigureSlot className="aspect-[5/4] min-h-72">
  <img src="/art/vault.webp" alt="" className="h-full w-full object-cover" />
</FigureSlot>
```

For the bento, replace `<WrapperArt />`, `<ScopeArt />`, `<StreamArt />` in
`components/site/mechanics.tsx` with the same `<img className="h-full w-full
object-cover" />` and give the wrapping cell an aspect ratio.

Drop the files in `web/public/art/`, export at 2× the display size, WebP, and keep
the ground `#121212` so the plates sit flush with the page.

---

## The big bento plate — from Unsplash

The wrapper cell is the one that wants a *photograph*, not a chart: a physical mass
passing through an aperture. `HalftoneImage` already sits at `/art/wrapper.jpg`
and dithers whatever is there into the palette, falling back to the drawn
schematic until the file exists. So: pick a photo, save it, done.

**Best subjects (search terms on Unsplash):**

- `vortex ring` / `smoke ring` — a ring of matter travelling through itself. The
  closest literal read of "a wrapper".
- `ink drop in water` / `ink in water black background` — a mass blooming and
  shedding its edges, which is the fee being stripped.
- `aperture blades macro` — a literal iris; the cleanest "passing through" shape.
- `milk crown splash` / `liquid splash black background` — high-contrast, reads
  well after dithering.
- `marble through hole` / `sphere tunnel` — a token through a gate.

**Pick for:** dark background, one centered subject, high contrast, horizontal
crop, no text or faces. Download it — don't hotlink — and save as
`web/public/art/wrapper.jpg`. Local files avoid any CORS question when the shader
uploads the texture, and the component auto-upgrades with no code change.

Tune the dither in `components/site/halftone-image.tsx`: `type` (`8x8` is fine,
`4x4` is chunkier), `size` (2–4), `colorSteps` (2–4).
