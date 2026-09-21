"use client";

import Link from "next/link";

import { APP_ITEMS, Nav } from "@/components/site/nav";

/**
 * Chrome for the signed-in surfaces.
 *
 * Uses the same header as the public site, with `APP_ITEMS` instead of
 * `SITE_ITEMS` — the menu bar stays, only its contents change. That is the whole
 * point: moving from the market into your own position should not feel like
 * arriving at a different product. The account control in the header already
 * resolves to the wallet panel once connected.
 *
 * The footer is deliberately thin. Someone reading their own balance does not need
 * the marketing footer; they need the three links that get them back out.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <Nav items={APP_ITEMS} />

      <main className="flex-1">{children}</main>

      <footer className="border-t border-edge">
        <div className="mx-auto flex max-w-app flex-col gap-3 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="font-mono text-xs text-ink-faint">
            Solana mainnet. The vault program is not deployed yet — see Profile.
          </span>
          <div className="flex gap-6">
            <Link
              href="/explore"
              className="font-mono text-xs text-ink-faint transition-colors hover:text-signal"
            >
              Market
            </Link>
            <Link
              href="/terms"
              className="font-mono text-xs text-ink-faint transition-colors hover:text-signal"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="font-mono text-xs text-ink-faint transition-colors hover:text-signal"
            >
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
