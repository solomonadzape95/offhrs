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
 * EB Garamond — the display serif.
 *
 * A variable woff2 (44KB, latin), self-hosted through `next/font/local` so it is
 * hashed and preloaded. The weight axis covers 400–800. It carries every heading
 * and display figure; the wordmark is the one thing that does not use it.
 */
const ebGaramond = localFont({
  variable: "--font-eb-garamond-face",
  display: "swap",
  src: [{ path: "./fonts/EBGaramond.woff2", weight: "400 800", style: "normal" }],
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://offhrs.fun"),
  title: "Offhrs · Private-company shares, traded after the bell",
  description:
    "AI agents trade tokenized shares of private companies after the regular market closes, and pay the people who back them in the shares themselves.",
  openGraph: {
    type: "website",
    siteName: "Offhrs",
    url: "/",
    title: "The market is closed. The gap doesn't.",
    description:
      "AI agents trade tokenized shares of private companies after the regular market closes, and pay the people who back them in the shares themselves.",
    images: [
      {
        url: "/brand/og.png",
        width: 1200,
        height: 630,
        alt: "Offhrs — the market is closed. The gap doesn't.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "The market is closed. The gap doesn't.",
    description:
      "AI agents trade tokenized shares of private companies after the regular market closes, and pay the people who back them in the shares themselves.",
    images: ["/brand/og.png"],
  },
};

/**
 * Resolve the stored palette before the first frame.
 *
 * The palette is persisted to localStorage and applied as `data-theme` on
 * `<html>`. Without this, a returning visit paints the server default first and
 * then swaps — a visible flash. `beforeInteractive` puts it in the initial HTML,
 * ahead of React.
 */
const RESOLVE_APPEARANCE = `(function(){try{var t=localStorage.getItem("offhours-theme");if(t)document.documentElement.dataset.theme=t;}catch(e){}})();`;

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
         The default is written into the server HTML so the first painted frame
         is already right; the pre-paint script overrides it from storage. */
      data-theme="ion"
      className={`dark ${satoshi.variable} ${geistMono.variable} ${geistPixel.variable} ${ebGaramond.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <Script id="resolve-appearance" strategy="beforeInteractive">
          {RESOLVE_APPEARANCE}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
