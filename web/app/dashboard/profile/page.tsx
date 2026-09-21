"use client";

import Link from "next/link";

import { RequireWallet } from "@/components/app/require-wallet";
import { Avatar } from "@/components/site/avatar";
import { SessionClock } from "@/components/site/session-clock";
import { useWalletUi, shortAddress, walletNote } from "@/lib/wallet";

/**
 * Profile.
 *
 * Mostly an inventory of what is real. A crypto product's profile page usually
 * collects a display name and an avatar and calls it identity; this one spends
 * the space saying which parts of the system are actually live, because that is
 * the question a judge or a user has and it is not answerable from the marketing
 * pages.
 */
const CAPABILITY = [
  { what: "Wallet connection", state: "live", note: "Wallet Standard discovery" },
  { what: "Live PreStocks marks", state: "live", note: "issuer API, revalidated every 60s" },
  { what: "Live DEX pricing", state: "live", note: "Jupiter quote, per asset" },
  { what: "On-chain Pyth reads", state: "live", note: "permissionless, no API key" },
  { what: "Market session clock", state: "live", note: "computed from the exchange calendar" },
  { what: "PreStock wrapper", state: "written", note: "7 tests; not deployed" },
  { what: "Dividend vault", state: "written", note: "9 unit + 7 integration tests; not deployed" },
  { what: "Execution log", state: "written", note: "7 tests; not deployed" },
  { what: "DBC pool creation", state: "blocked", note: "needs the wrapper deployed first" },
  { what: "Vault staking & claims", state: "blocked", note: "needs the program deployed" },
] as const;

const TONE = {
  live: "text-signal border-signal-dim/60",
  written: "text-ink-dim border-edge",
  blocked: "text-ember border-ember/40",
} as const;

export default function ProfilePage() {
  const { address, connectorId, connectors, status, disconnect, error } = useWalletUi();

  const name = connectors.find((c) => c.id === connectorId)?.name ?? "Wallet";
  const note = connectorId ? walletNote(connectorId) : null;

  return (
    <section className="mx-auto max-w-app px-5 py-10 sm:px-8 sm:py-14">
      <RequireWallet
        title="Connect to see your profile"
        body="The wallet is the identity here, so there is nothing to show until one is connected."
      >
        <div className="flex flex-col gap-12">
          <div className="flex flex-col gap-3">
            <span className="label">Profile</span>
            <h1 className="text-3xl leading-none font-medium text-ink sm:text-4xl">
              Your wallet is your account
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-ink-dim">
              There is no name to set and no email to verify. Offhrs stores nothing about you
              server-side, which is why the only identifying thing on this page is an address.
            </p>
          </div>

          {/* Identity */}
          <div className="panel flex flex-wrap items-center gap-6 p-6">
            <Avatar seed={address ?? ""} size={64} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="label">Address</span>
              <span className="font-mono text-sm break-all text-ink">{address}</span>
              <span className="font-mono text-xs text-ink-faint">
                {name}
                {note?.blurb ? ` — ${note.blurb}` : ""}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void disconnect()}
              className="btn btn-ghost !px-4 !py-2.5 !text-xs"
            >
              Disconnect
            </button>
          </div>

          {error && (
            <div className="border border-ember/30 bg-ember/[0.06] px-5 py-4">
              <p className="text-sm leading-relaxed text-ink-dim">
                <span className="text-ember">Wallet error.</span> {error}
              </p>
            </div>
          )}

          {status === "connecting" && (
            <p className="font-mono text-xs text-ink-faint">Connecting…</p>
          )}

          {/* What is real */}
          <div className="flex flex-col gap-5">
            <div className="flex items-baseline justify-between">
              <span className="label">System status</span>
              <span className="font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
                {CAPABILITY.filter((c) => c.state === "live").length} of {CAPABILITY.length} live
              </span>
            </div>

            <div className="divide-y divide-edge/60 border-y border-edge/60">
              {CAPABILITY.map((c) => (
                <div
                  key={c.what}
                  className="grid items-center gap-2 py-3 sm:grid-cols-[1fr_7rem_14rem] sm:gap-4"
                >
                  <span className="text-sm text-ink">{c.what}</span>
                  <span
                    className={`justify-self-start border px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.14em] uppercase ${TONE[c.state]}`}
                  >
                    {c.state}
                  </span>
                  <span className="font-mono text-xs text-ink-faint">{c.note}</span>
                </div>
              ))}
            </div>

            <p className="max-w-2xl font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
              &ldquo;Written&rdquo; means the code exists and is covered by tests. &ldquo;Blocked&rdquo;
              means it depends on a deployment that needs roughly 3.86 SOL of mainnet rent, which we
              have not had.
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <span className="label">Session</span>
              <SessionClock variant="hero" />
            </div>

            <div className="panel flex flex-col gap-3 p-6">
              <span className="label">Network</span>
              <p className="font-mono text-sm text-ink">Solana mainnet</p>
              <p className="text-sm leading-relaxed text-ink-dim">
                The client runs against mainnet because every market input this product uses —
                PreStocks tokens, Jupiter routes, Pyth accounts — only exists there. The vault
                program is the exception, and it is not deployed.
              </p>
              <p className="font-mono text-xs text-ink-faint">
                {process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 border-t border-edge pt-8">
            <Link href="/explore" className="btn btn-ghost">
              Back to the market
            </Link>
            <Link href="/launch" className="btn btn-primary">
              Launch an agent
            </Link>
          </div>
        </div>
      </RequireWallet>
    </section>
  );
}
