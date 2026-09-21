import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";

import { Providers } from "./providers";
import "./globals.css";

/**
 * Satoshi, self-hosted.
 *
 * Fontshare serve it under the ITF Free Font License, but loading it from their
 * CDN would mean a render-blocking third-party request on every visit. The four
 * weights are 24KB each and are inlined into the build instead.
 */
const satoshi = localFont({
  variable: "--font-satoshi",
  display: "swap",
  src: [
    { path: "./fonts/Satoshi-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Satoshi-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Satoshi-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/Satoshi-900.woff2", weight: "900", style: "normal" },
  ],
});

/**
 * Geist Mono, self-hosted too.
 *
 * `next/font/google` fetches at build time, which made this build fail on a 429
 * from Google — and would make an offline demo build impossible. Next ships this
 * latin subset for its own devtools, so it is already on disk.
 */
const geistMono = localFont({
  variable: "--font-geist-mono",
  display: "swap",
  src: [{ path: "./fonts/GeistMono-latin.woff2", weight: "400", style: "normal" }],
});

/**
 * Manosque — the default display face.
 *
 * Web-ready woff2 (39KB), self-hosted. A render-blocking fetch to a font host on
 * every visit is the thing worth avoiding, and this one is already on disk.
 */
const manosque = localFont({
  variable: "--font-manosque-face",
  display: "swap",
  src: [{ path: "./fonts/Manosque-Regular.woff2", weight: "400", style: "normal" }],
});

/**
 * Geist Pixel, for figures big enough to deserve it.
 *
 * Deliberately not the default for every figure: at 12-14px, where table cells
 * live, the gaps between the round pixels eat the stroke and it goes faint. So it
 * is bound to `.figure` for display figures only, and Geist Mono keeps the rest.
 */
const geistPixel = localFont({
  variable: "--font-pixel-face",
  display: "swap",
  src: [{ path: "./fonts/GeistPixel-Circle.woff2", weight: "400", style: "normal" }],
});

export const metadata: Metadata = {
  title: "Offhrs · Pre-IPO equity, arbitraged after the bell",
  description:
    "Autonomous agents arbitrage tokenized pre-IPO equity against its own mark while the reference market is closed, and stream the proceeds to holders as real shares of SpaceX and OpenAI.",
};

/**
 * The root holds only what *every* route needs: fonts, tokens, the Solana client
 * and the halftone. The marketing header lives in `(site)` and the app header in
 * `dashboard`, so neither tree renders the other's chrome.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      /* `dark` is fixed, not toggled: there is no light theme — only palettes.
         The display face is Manosque, bound to `--font-display` in globals.css,
         so no component ever names a family. `data-theme` is set pre-paint by
         the script below. */
      className={`dark ${satoshi.variable} ${geistMono.variable} ${geistPixel.variable} ${manosque.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        {/* The palette is fixed (Ion). Set it before first paint so the tokens are
            right from the first frame; the provider mirrors it. `beforeInteractive`
            is injected into the initial HTML. */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: `document.documentElement.dataset.theme='ion';` }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
