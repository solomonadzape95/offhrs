"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { useTheme } from "@/components/site/theme-provider";

/**
 * A photograph reduced to halftone in the page's own signal.
 *
 * Uses the library's `ImageDithering` shader — the same family as the Warp — so
 * the plate is a real dither of the image rather than a CSS dot screen laid over
 * it. The colours come from the active palette, so a plate is repainted with the
 * theme like everything else.
 *
 * It is careful about a missing file: the source is preloaded, and until it
 * resolves (or if it 404s) the component renders `fallback`. That means the
 * layout can ship with the hand-drawn schematic and upgrade to a plate the moment
 * an image is dropped at the path, with no code change and no broken frame.
 *
 * `speed={0}`: this is a still print, not a second animation.
 *
 * **Serve the image from this origin.** A WebGL texture from a cross-origin host
 * needs that host to send permissive CORS headers, and not every image CDN does.
 * Drop the file in `public/art/` and pass `/art/name.jpg`.
 */
const ImageDithering = dynamic(
  () => import("@paper-design/shaders-react").then((m) => m.ImageDithering),
  { ssr: false },
);

export function HalftoneImage({
  src,
  alt = "",
  className,
  fallback,
  type = "8x8",
  size = 2,
  colorSteps = 3,
}: {
  src: string;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
  type?: "random" | "2x2" | "4x4" | "8x8";
  size?: number;
  colorSteps?: number;
}) {
  const { theme } = useTheme();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    if (!src) {
      setStatus("error");
      return;
    }
    let alive = true;
    const img = new window.Image();
    img.onload = () => alive && setStatus("ok");
    img.onerror = () => alive && setStatus("error");
    img.src = src;
    return () => {
      alive = false;
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  if (status === "error") {
    return <div className={className}>{fallback}</div>;
  }

  return (
    <div className={className}>
      {status === "ok" ? (
        <ImageDithering
          className="h-full w-full"
          width="100%"
          height="100%"
          image={src}
          colorFront={theme.signal}
          colorBack={theme.warp[0]}
          colorHighlight={theme.signalBright}
          type={type}
          size={size}
          colorSteps={colorSteps}
          originalColors={false}
          inverted={false}
          fit="cover"
          speed={0}
          minPixelRatio={1}
        />
      ) : (
        <div className="h-full w-full animate-pulse bg-signal/5" aria-label={alt} />
      )}
    </div>
  );
}
