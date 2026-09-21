"use client";

import Link from "next/link";
import { Wallet } from "@phosphor-icons/react";

import { useWalletUi } from "@/lib/wallet";
import { Icon } from "@/components/ui/icon";

/**
 * Gate for the signed-in surfaces.
 *
 * Every dashboard page is a client component reading the connected address, so
 * the alternative to this is each page inventing its own empty state. One gate
 * keeps the copy and the not-connected case identical everywhere.
 *
 * It renders nothing until `isReady` — on the server there is no wallet, and
 * flashing "connect" at someone who is already connected is worse than a beat of
 * quiet.
 */
export function RequireWallet({
  children,
  title = "Connect to see this",
  body = "Your stakes and dividends live against your wallet, so there is nothing to show until one is connected.",
}: {
  children: React.ReactNode;
  title?: string;
  body?: string;
}) {
  const { address, isReady, status } = useWalletUi();

  if (!isReady) {
    return (
      <div className="flex flex-col gap-6" aria-busy>
        <div className="skeleton h-8 w-56 bg-surface" />
        <div className="skeleton h-32 w-full bg-surface" />
      </div>
    );
  }

  if (!address) {
    return (
      <div className="panel flex max-w-xl flex-col gap-6 p-8">
        <span className="dither grid size-12 place-items-center border border-edge bg-raised">
          <Icon icon={Wallet} size={18} className="text-ink-dim" />
        </span>
        <div className="flex flex-col gap-3">
          <h2 className="text-xl leading-snug font-medium text-ink">{title}</h2>
          <p className="leading-relaxed text-ink-dim">{body}</p>
        </div>
        <Link href="/connect" className="btn btn-primary self-start">
          {status === "connecting" ? "Connecting…" : "Connect a wallet"}
        </Link>
        <p className="font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
          No account, no email. Offhrs reads the wallet you already have.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
