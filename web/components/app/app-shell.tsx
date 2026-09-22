"use client";

import { APP_ITEMS, Nav } from "@/components/site/nav";

/**
 * Chrome for the signed-in surfaces.
 *
 * Uses the same header as the public site, with `APP_ITEMS` instead of
 * `SITE_ITEMS` — the menu bar stays, only its contents change. That is the whole
 * point: moving from the market into your own position should not feel like
 * arriving at a different product. The account control in the header already
 * resolves to the wallet panel once connected. The full marketing footer is
 * composed here by the server layout that wraps this shell.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <Nav items={APP_ITEMS} />

      <main className="flex-1">{children}</main>
    </div>
  );
}
