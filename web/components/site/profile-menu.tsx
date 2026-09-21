"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, SignOut, SquaresFour, User, Vault, Wallet } from "@phosphor-icons/react";

import { DitherAvatar } from "@/components/site/dither-avatar";
import { Icon } from "@/components/ui/icon";
import { USER_AVATAR_HUE } from "@/lib/avatar";
import { useWalletUi, shortAddress } from "@/lib/wallet";

/**
 * The header identity control.
 *
 * Nothing is shown until `isReady`, because on the server there is no wallet to
 * read and rendering "Connect" first would flash for anyone already connected.
 *
 * The panel is a plain absolutely-positioned element with a click-outside
 * listener rather than a portal and a spring. Nebula needs the portal because its
 * header carries `backdrop-blur`, which makes the header the containing block for
 * fixed descendants; ours does too, so the panel is `fixed`-free and anchored
 * inside its own `relative` wrapper instead.
 */
export function ProfileMenu() {
  const { address, status, isReady, disconnect, connectorId, connectors } = useWalletUi();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!isReady) {
    return <span className="h-9 w-28 animate-pulse border border-edge bg-surface" aria-hidden />;
  }

  if (!address) {
    return (
      <Link
        href="/connect"
        aria-label="Connect wallet"
        className="btn btn-primary !rounded-none !px-3.5 !py-2.5 !text-xs sm:!px-4"
      >
        <Icon icon={Wallet} size={14} dither={false} />
        <span className="hidden sm:inline">
          {status === "connecting" ? "Connecting…" : "Connect"}
        </span>
      </Link>
    );
  }

  const name = connectors.find((c) => c.id === connectorId)?.name ?? "Wallet";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard permission denied — the address is visible in the panel anyway.
    }
  };

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 border border-edge py-1.5 pr-1.5 pl-1.5 transition-colors hover:border-ink-faint sm:pr-3"
      >
        <DitherAvatar name={address} hue={USER_AVATAR_HUE} size={26} />
        <span className="hidden font-mono text-xs text-ink-dim sm:inline">
          {shortAddress(address)}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="panel absolute right-0 z-50 mt-2 w-[min(88vw,19rem)] overflow-hidden"
        >
          <div className="flex items-center gap-3.5 border-b border-edge p-4">
            <DitherAvatar name={address} hue={USER_AVATAR_HUE} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-xs break-all text-ink">
                {shortAddress(address, 6, 6)}
              </span>
              <span className="mt-1 block font-mono text-[0.625rem] tracking-wider text-ink-faint uppercase">
                {name}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void copy()}
              aria-label="Copy address"
              className="shrink-0 text-ink-faint transition-colors hover:text-signal"
            >
              {copied ? <Icon icon={Check} size={15} /> : <Icon icon={Copy} size={15} />}
            </button>
          </div>

          <div className="flex flex-col p-1.5">
            <MenuLink href="/app" icon={<Icon icon={SquaresFour} size={15} dither={false} />}>
              Dashboard
            </MenuLink>
            <MenuLink href="/app/vault" icon={<Icon icon={Vault} size={15} dither={false} />}>
              Vault
            </MenuLink>
            <MenuLink href="/app/profile" icon={<Icon icon={User} size={15} dither={false} />}>
              Profile
            </MenuLink>
          </div>

          <div className="border-t border-edge p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void disconnect();
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left font-mono text-xs tracking-wider text-ink-dim uppercase transition-colors hover:bg-raised hover:text-ember"
            >
              <Icon icon={SignOut} size={15} dither={false} />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex items-center gap-2.5 px-3 py-2.5 font-mono text-xs tracking-wider text-ink-dim uppercase transition-colors hover:bg-raised hover:text-signal"
    >
      {icon}
      {children}
    </Link>
  );
}
