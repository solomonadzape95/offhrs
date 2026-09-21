"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
  CaretDown,
  ChartLineUp,
  ClockCounterClockwise,
  GearSix,
  Question,
  Robot,
  RocketLaunch,
  SquaresFour,
  Storefront,
  Table,
  User,
  Vault,
} from "@phosphor-icons/react";

import { Logo } from "@/components/site/logo";
import { ProfileMenu } from "@/components/site/profile-menu";
import { DitherIcon } from "@/components/ui/dither-icon";
import { Icon } from "@/components/ui/icon";
import { useWalletUi } from "@/lib/wallet";

/**
 * The header, shared by the public and signed-in surfaces.
 *
 * The centre control is not a button that opens a separate panel: the card itself
 * grows — only its height, never its width — so the trigger and the panel are the
 * same object. It is taken out of flow and its top edge is pinned, so expanding it
 * can never size the header row. Centring uses `left-0 right-0 mx-auto w-fit`
 * rather than a `translate-x` — a transform on a `backdrop-filter`ed element is
 * what skewed the menu's size on Brave.
 *
 * What changes between surfaces is only the item list: `SITE_ITEMS` on the public
 * pages, `APP_ITEMS` behind the wallet gate. The lockup, the menu mechanics and the
 * account control are identical, so moving between the marketing site and the app
 * feels like the same product. The account control resolves to a connect button
 * when no wallet is present and to the account panel once one is.
 *
 * The bar hides on the way down and returns on the way up, so it never covers the
 * content you are reading. It stays put while the menu is open.
 */
export interface NavItem {
  href: string;
  label: string;
  hint: string;
  icon: PhosphorIcon;
}

export const SITE_ITEMS: NavItem[] = [
  { href: "/explore", label: "Markets", hint: "Pre-IPO marks against their feeds", icon: ChartLineUp },
  { href: "/#board", label: "Dislocation board", hint: "Every SPV mark, live", icon: Table },
  { href: "/#mechanics", label: "Mechanics", hint: "How the gap gets traded", icon: GearSix },
  { href: "/vault", label: "Vault", hint: "Stake and claim dividends", icon: Vault },
  { href: "/#faq", label: "FAQ", hint: "The short answers", icon: Question },
  { href: "/launch", label: "Launch an agent", hint: "Four steps to a live pool", icon: RocketLaunch },
  { href: "/app", label: "Dashboard", hint: "Your position and payouts", icon: SquaresFour },
];

export const APP_ITEMS: NavItem[] = [
  { href: "/app", label: "Position", hint: "Stake and accrued equity", icon: SquaresFour },
  { href: "/app/vault", label: "Vault", hint: "Stake and claim dividends", icon: Vault },
  { href: "/app/activity", label: "Activity", hint: "Agent executions", icon: ClockCounterClockwise },
  { href: "/app/agents", label: "Agents", hint: "Agents you launched", icon: Robot },
  { href: "/app/profile", label: "Profile", hint: "Wallet and deployment status", icon: User },
  { href: "/explore", label: "Market", hint: "Browse every agent", icon: Storefront },
  { href: "/launch", label: "Launch an agent", hint: "Deploy a new desk", icon: RocketLaunch },
];

export function Nav({ items = SITE_ITEMS }: { items?: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  // Hover-open only on real pointer devices. Using JS rather than a CSS `:hover`
  // is what lets a click *close* the menu: `:hover` would keep re-opening it
  // while the pointer sat on the trigger.
  const canHover = useRef(false);

  useEffect(() => {
    canHover.current = window.matchMedia("(hover: hover)").matches;
  }, []);

  // Close on navigation. A menu that survives a route change lands you on a new
  // page with the menu still over it.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - last;
      // Ignore sub-pixel jitter; only a real gesture flips the bar.
      if (Math.abs(delta) > 8) {
        setHidden(delta > 0 && y > 96);
        last = y;
      }
      if (y <= 8) setHidden(false);
      setScrolled(y > 24);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Exact match: `/app` must not stay lit on `/app/vault`.
  const active = (href: string) => !href.startsWith("/#") && pathname === href;

  // Only the landing page has a full-viewport hero for the bar to float over. Every
  // other route starts with content, so the bar stays in flow there and takes its
  // own ground rather than covering the heading.
  const isHome = pathname === "/";
  const surface = isHome
    ? scrolled
      ? "border-b border-edge/70 bg-void/80 backdrop-blur-xl"
      : "border-b border-transparent"
    : "border-b border-edge/70 bg-void/80 backdrop-blur-xl";

  return (
    <header
      className={`${isHome ? "fixed" : "sticky"} inset-x-0 top-0 z-50 transition-[transform,background-color,border-color] duration-300 ${
        hidden && !open ? "-translate-y-full" : "translate-y-0"
      } ${surface}`}
    >
      <div className="relative mx-auto flex h-[4.75rem] max-w-app items-center justify-between gap-2 px-5 sm:px-8">
        <Link href="/" className="brand flex items-center gap-2.5">
          <Logo size={30} cell={1.8} className="brand-mark text-signal" title="Offhrs" />
          <span className="brand-name font-display text-xl leading-none tracking-tight sm:text-2xl">
            offhrs
          </span>
        </Link>

        {/* Mobile: pinned right. Desktop: centred without a transform. */}
        <div
          ref={wrap}
          className="absolute top-4 right-5 sm:left-0 sm:right-0 sm:mx-auto sm:w-fit"
          onPointerEnter={() => {
            if (canHover.current) setOpen(true);
          }}
          onPointerLeave={() => {
            if (canHover.current) setOpen(false);
          }}
        >
          <div className="center-menu" data-open={open}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-haspopup="menu"
              aria-controls="site-menu"
              className="center-menu-trigger"
            >
              <span className="font-mono text-xs tracking-[0.22em] text-ink-dim uppercase">
                Menu
              </span>
              <CaretDown
                size={13}
                weight="bold"
                aria-hidden
                className="center-menu-caret text-ink-faint"
              />
            </button>

            <div id="site-menu" role="menu" className="center-menu-body">
              <div className="center-menu-inner">
                <div className="center-menu-pad">
                  {items.map((item) => (
                    <MenuRow
                      key={item.href}
                      item={item}
                      current={active(item.href)}
                      onNavigate={() => setOpen(false)}
                    />
                  ))}

                  {/* The wallet lives in the header on desktop; on a phone it moves
                      in here as a button beside the main action. */}
                  <div className="sm:hidden">
                    <MobileWalletButton onNavigate={() => setOpen(false)} />
                  </div>

                  <div className="mt-1 space-y-2 border-t border-edge px-1 pt-2.5 pb-1">
                    <Link
                      href="/explore"
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className="btn btn-primary w-full !py-3 !text-sm"
                    >
                      Explore markets
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop control. Hidden on a phone, where the wallet is in the menu. */}
        <div className="flex items-center gap-2">
          <span className="hidden sm:contents">
            <ProfileMenu />
          </span>
        </div>
      </div>
    </header>
  );
}

function MobileWalletButton({ onNavigate }: { onNavigate: () => void }) {
  const { address, isReady } = useWalletUi();
  if (!isReady) return null;

  const href = address ? "/app" : "/connect";
  const label = address ? "Dashboard" : "Connect wallet";

  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className="btn btn-primary w-full !py-3 !text-sm"
    >
      {label}
    </Link>
  );
}

function MenuRow({
  item,
  current,
  onNavigate,
}: {
  item: NavItem;
  current: boolean;
  onNavigate: () => void;
}) {
  const { icon: Glyph } = item;

  const shared = `group flex items-center gap-3.5 rounded-[14px] px-3 py-3 transition-colors ${
    current ? "cursor-default bg-raised" : "hover:bg-raised focus-visible:bg-raised"
  }`;

  const inner = (
    <>
      {/* Resting: a dim, dithered mark. Hover resolves it to solid signal, and an
          active item is already resolved. */}
      <span
        className={`relative flex size-8 shrink-0 items-center justify-center transition-colors ${
          current ? "text-signal" : "text-ink-faint group-hover:text-signal"
        }`}
      >
        <span className="group-hover:hidden">
          <DitherIcon icon={Glyph} size={22} tone={current ? "signal" : "ink"} />
        </span>
        <span className="hidden group-hover:block">
          <Icon icon={Glyph} size={22} dither={false} weight="regular" />
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block text-[0.9375rem] transition-colors ${
            current ? "text-signal" : "text-ink-dim group-hover:text-ink"
          }`}
        >
          {item.label}
        </span>
        <span className="hidden font-mono text-[0.6875rem] text-ink-faint sm:block">
          {item.hint}
        </span>
      </span>
    </>
  );

  // The current page is a span, not a link with a dead href: navigating to where
  // you already are re-runs every server read on the page for an identical result.
  if (current) {
    return (
      <span aria-current="page" className={shared}>
        {inner}
      </span>
    );
  }

  return (
    <Link href={item.href} role="menuitem" onClick={onNavigate} className={shared}>
      {inner}
    </Link>
  );
}
