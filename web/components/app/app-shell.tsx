"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/site/logo";
import { ProfileMenu } from "@/components/site/profile-menu";

/**
 * Chrome for the signed-in surfaces.
 *
 * Deliberately not the marketing header: no session clock, no distributed
 * ticker, no footer rail. Someone looking at their own position wants the
 * figures to hold still, and a scroll-reactive bar over a balance reads as
 * instability rather than as polish.
 *
 * Tabs are real routes rather than client state so a panel is linkable and the
 * back button does what it looks like it should.
 */
const NAV = [
  { href: "/dashboard", label: "Position" },
  { href: "/dashboard/activity", label: "Activity" },
  { href: "/dashboard/agents", label: "Agents" },
  { href: "/dashboard/profile", label: "Profile" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 border-b border-edge bg-void/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-app items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="brand flex items-center gap-3">
            <Logo size={28} cell={1.7} className="brand-mark text-signal" />
            <span className="brand-name hidden font-mono text-sm tracking-[0.2em] uppercase sm:block">
              Offhrs
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/explore"
              className="hidden font-mono text-xs tracking-wider text-ink-faint uppercase transition-colors hover:text-ink sm:block"
            >
              Market
            </Link>
            <ProfileMenu />
          </div>
        </div>

        {/* Tabs from `sm` up. Below that the horizontal strip would push
            destinations off the edge with no affordance saying so. */}
        <nav className="mx-auto hidden max-w-app gap-1 px-3 sm:flex sm:px-6">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const shared =
              "shrink-0 border-b-2 px-4 py-3.5 font-mono text-xs tracking-wider uppercase transition-colors";

            // The current tab is a span, not a link: navigating to where you
            // already are re-runs every server read on the page for an identical
            // result, and the loading state that follows reads as a fault.
            return active ? (
              <span
                key={item.href}
                aria-current="page"
                className={`${shared} cursor-default border-signal text-signal`}
              >
                {item.label}
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={`${shared} border-transparent text-ink-faint hover:text-ink`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-edge">
        <div className="mx-auto flex max-w-app flex-col gap-3 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="font-mono text-xs text-ink-faint">
            Solana mainnet. The vault program is not deployed yet — see Profile.
          </span>
          <div className="flex gap-6">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="font-mono text-xs text-ink-faint transition-colors hover:text-signal sm:hidden"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/explore"
              className="hidden font-mono text-xs text-ink-faint transition-colors hover:text-signal sm:block"
            >
              Back to the market
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
