"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  CaretDown,
  ChartLineUp,
  GearSix,
  Question,
  RocketLaunch,
  SquaresFour,
  Table,
} from "@phosphor-icons/react";

import { Logo } from "@/components/site/logo";
import { ProfileMenu } from "@/components/site/profile-menu";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { ShaderToggle } from "@/components/site/shader-toggle";
import { DitherIcon } from "@/components/ui/dither-icon";
import { Icon } from "@/components/ui/icon";

/**
 * The header, in Owambe's shape: a wordmark on the left, the wallet on the right,
 * and one menu in the middle that *is* its own trigger.
 *
 * The centre control is not a button that opens a separate panel. The card itself
 * grows — only its height, never its width — so the trigger and the panel are the
 * same object. Its top is pinned to the bar and it is taken out of flow, so
 * expanding it can never size the header row or shove the wordmark down. On a
 * device with a pointer it grows on hover; on touch it waits to be pressed.
 *
 * It is fixed rather than sticky on the landing page. The hero is a full viewport,
 * and a bar that takes 4.75rem out of that viewport is the thing that was pushing
 * the claim down. Over the hero the bar is unbacked, so the shader reads edge to
 * edge; once the page moves it takes a blurred ground so the type never fights it.
 */
const ITEMS = [
  {
    href: "/explore",
    label: "Markets",
    hint: "Pre-IPO marks against their feeds",
    icon: ChartLineUp,
  },
  {
    href: "/#board",
    label: "Dislocation board",
    hint: "Every SPV mark, live",
    icon: Table,
  },
  {
    href: "/#mechanics",
    label: "Mechanics",
    hint: "How the gap gets traded",
    icon: GearSix,
  },
  { href: "/#faq", label: "FAQ", hint: "The short answers", icon: Question },
  {
    href: "/launch",
    label: "Launch an agent",
    hint: "Four steps to a live pool",
    icon: RocketLaunch,
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    hint: "Your position and payouts",
    icon: SquaresFour,
  },
] as const;

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Close on navigation. A menu that survives a route change lands you on a new
  // page with the menu still over it.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
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

  const active = (href: string) =>
    href.startsWith("/#")
      ? false
      : href === "/dashboard"
        ? pathname.startsWith("/dashboard")
        : pathname === href;

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
      className={`${isHome ? "fixed" : "sticky"} inset-x-0 top-0 z-50 transition-colors duration-300 ${surface}`}
    >
      {/* The menu is absolutely positioned so its growth is invisible to this row:
          the bar keeps its 4.75rem and never moves. */}
      <div className="relative mx-auto flex h-[4.75rem] max-w-app items-center justify-between gap-2 px-5 sm:px-8">
        <Link href="/" className="brand flex items-center gap-2.5">
          <Logo size={30} cell={1.8} className="brand-mark text-signal" title="Offhrs" />
          <span className="brand-name font-display hidden text-2xl leading-none tracking-tight sm:inline">
            offhrs
          </span>
        </Link>

        <div ref={wrap} className="absolute top-4 left-1/2 -translate-x-1/2">
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
                {ITEMS.map((item) => (
                  <MenuRow
                    key={item.href}
                    item={item}
                    current={active(item.href)}
                    onNavigate={() => setOpen(false)}
                  />
                ))}

                <div className="mt-1 border-t border-edge px-1 pt-2.5 pb-1">
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

        {/* Wallet, right. The palette switch lives in the footer on a phone. */}
        <div className="flex items-center gap-2">
          <ShaderToggle className="hidden sm:inline-flex" />
          <ThemeToggle className="hidden sm:inline-flex" />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}

function MenuRow({
  item,
  current,
  onNavigate,
}: {
  item: (typeof ITEMS)[number];
  current: boolean;
  onNavigate: () => void;
}) {
  const { icon: Glyph } = item;

  const shared = `group flex items-center gap-3.5 rounded-[14px] px-3 py-3 transition-colors ${
    current ? "cursor-default bg-raised" : "hover:bg-raised focus-visible:bg-raised"
  }`;

  const inner = (
    <>
      {/* Resting: a dim, dithered mark. Hover resolves it to solid signal. */}
      <span className="relative flex size-8 shrink-0 items-center justify-center text-ink-faint transition-colors group-hover:text-signal">
        <span className="group-hover:hidden">
          <DitherIcon icon={Glyph} size={22} tone="ink" />
        </span>
        <span className="hidden group-hover:block">
          <Icon icon={Glyph} size={22} dither={false} weight="regular" />
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] text-ink-dim transition-colors group-hover:text-ink">
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
