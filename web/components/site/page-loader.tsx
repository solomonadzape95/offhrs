"use client";

import { usePathname } from "next/navigation";

/**
 * Route-level loading state.
 *
 * Rendered by the `loading.tsx` files so a slow server render shows motion the
 * moment navigation starts, rather than a blank frame. The label is derived from
 * the pathname: one `loading.tsx` at the `(site)` group covers *every* route in
 * that group, so a hardcoded "Loading markets" was also showing on `/docs`,
 * `/terms` and `/privacy`.
 */
const LABELS: [RegExp, string][] = [
  [/^\/app\/agents\//, "Loading agent"],
  [/^\/app\/activity/, "Loading activity"],
  [/^\/app\/agents/, "Loading agents"],
  [/^\/app\/vault/, "Loading vault"],
  [/^\/app\/profile/, "Loading profile"],
  [/^\/explore/, "Loading markets"],
  [/^\/launch/, "Opening the studio"],
  [/^\/docs/, "Loading docs"],
  [/^\/agent\//, "Loading agent"],
  [/^\/vault/, "Loading vault"],
];

export function PageLoader({ label }: { label?: string }) {
  const pathname = usePathname();
  const text = label ?? LABELS.find(([re]) => re.test(pathname))?.[1] ?? "Loading";

  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-6">
      <div className="loader" role="status" aria-label={text} />
      <span className="font-mono text-[0.6875rem] tracking-[0.2em] text-ink-faint uppercase">
        {text}
      </span>
    </div>
  );
}
