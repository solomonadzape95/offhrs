"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { RequireWallet } from "@/components/app/require-wallet";
import { Icon } from "@/components/ui/icon";
import { ADMIN_ADDRESSES, isAdmin } from "@/lib/admin";
import { shortAddr } from "@/lib/format";
import { ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { useWalletUi } from "@/lib/wallet";

/**
 * The console shell: the gate, the title and the page nav.
 *
 * The route is one page per concern rather than client-side tabs, so each view
 * has its own URL, its own loading boundary and its own cache key. The gate is
 * still cosmetic — every read is public chain data — and it lives here so a
 * child page never has to re-check.
 */
const PAGES = [
  { href: "/asdfg/admin", label: "Overview" },
  { href: "/asdfg/admin/wrappers", label: "Wrappers" },
  { href: "/asdfg/admin/vaults", label: "Vaults" },
  { href: "/asdfg/admin/agents", label: "Agents" },
  { href: "/asdfg/admin/activity", label: "Activity" },
  { href: "/asdfg/admin/users", label: "Users" },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { address } = useWalletUi();

  return (
    <RequireWallet
      title="Connect an admin wallet"
      body="The console reads the deployment, so it needs to know which wallet is looking."
    >
      {isAdmin(address) ? (
        <div className="mx-auto max-w-app px-5 py-10 sm:px-8 sm:py-14">
          <header className="flex flex-wrap items-end justify-between gap-8">
            <div className="flex flex-col gap-3">
              <span className="label">Operator console</span>
              <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">
                Offhrs on chain
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-ink-dim">
                Wrappers, vaults, agents, executions and holders, read straight from the program.
              </p>
            </div>
            <span className="text-signal">
              <Icon icon={ShieldCheck} size={44} dither={false} />
            </span>
          </header>

          <nav className="mt-10 flex flex-wrap gap-2 border-b border-edge pb-4">
            {PAGES.map((p) => (
              <PageTab key={p.href} href={p.href} label={p.label} />
            ))}
          </nav>

          <div className="mt-10">{children}</div>
        </div>
      ) : (
        <Restricted address={address} />
      )}
    </RequireWallet>
  );
}

function PageTab({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link href={href} className={`pill ${active ? "pill-active" : ""}`} aria-current={active}>
      {label}
    </Link>
  );
}

function Restricted({ address }: { address?: string | null }) {
  return (
    <div className="mx-auto max-w-app px-5 py-10 sm:px-8 sm:py-14">
      <div className="panel flex max-w-xl flex-col gap-5 p-8">
        <span className="dither grid size-12 place-items-center border border-edge bg-raised">
          <Icon icon={WarningCircle} size={18} className="text-ember" />
        </span>
        <h2 className="text-xl leading-snug font-medium text-ink">This wallet is not an operator</h2>
        <p className="leading-relaxed text-ink-dim">
          {address ? (
            <>
              <span className="font-mono text-xs">{shortAddr(address, 6)}</span> is connected, but the
              console is limited to the deployment&apos;s admin keys.
            </>
          ) : (
            "No admin wallet is connected."
          )}
        </p>
        <div className="flex flex-col gap-1.5 border-t border-edge pt-5">
          <span className="label">Admins</span>
          {ADMIN_ADDRESSES.map((a) => (
            <span key={a} className="font-mono text-xs break-all text-ink-faint">
              {a}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
