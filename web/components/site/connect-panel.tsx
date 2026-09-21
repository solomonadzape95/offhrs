"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeft, ArrowUpRight } from "@phosphor-icons/react";

import { Logo } from "@/components/site/logo";
import { SessionClock } from "@/components/site/session-clock";
import { useWalletUi, walletNote, shortAddress } from "@/lib/wallet";

/**
 * Wallet picker.
 *
 * Structured like Nebula's: a two-column page where the left half argues and the
 * right half does the one thing you came for, with the lockup living on the side
 * you actually act on because that is the only column that exists on a phone.
 *
 * The difference from Nebula is that Offhrs does not curate the list. Wallet
 * Standard discovery reports what the browser actually has, so the panel shows
 * real availability instead of six rows that each open an install page. Wallets
 * that are not installed are still listed, but as an install link rather than a
 * button that will fail.
 */
export function ConnectPanel() {
  const router = useRouter();
  const { address, connectorId, connectors, status, error, connect, disconnect, isReady } =
    useWalletUi();

  // A restored session never runs `connect`, so landing here already connected
  // used to park you on a dead end. Send people on instead.
  useEffect(() => {
    if (address) router.replace("/dashboard");
  }, [address, router]);

  const onSelect = async (id: string, ready: boolean | undefined, url: string) => {
    if (ready === false && url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const next = await connect(id);
    if (next) router.push("/dashboard");
  };

  return (
    <div className="grid min-h-[calc(100svh-4.5rem)] lg:grid-cols-[1.05fr_1fr]">
      {/* ── Aside ─────────────────────────────────────────────────────── */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-edge p-10 lg:flex xl:p-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--color-signal) 45%, transparent) 0.5px, transparent 0)",
            backgroundSize: "4px 4px",
            maskImage: "radial-gradient(ellipse 80% 70% at 30% 35%, #000 0%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 70% at 30% 35%, #000 0%, transparent 75%)",
          }}
        />

        <Link href="/" className="brand relative flex items-center gap-3.5">
          <Logo size={34} cell={1.8} className="brand-mark text-signal" />
          <span className="brand-name font-mono text-sm tracking-[0.22em] uppercase">Offhrs</span>
        </Link>

        <div className="relative flex flex-col gap-8 py-16">
          <h2 className="text-statement max-w-md text-balance text-ink">
            No accounts. No passwords. No email.
          </h2>
          <p className="max-w-md leading-relaxed text-ink-dim">
            The vault is non-custodial, so there is nothing to log in to. Your wallet is your
            identity and your keys never leave it — every stake, claim and trade is signed by you.
          </p>
        </div>

        <div className="relative">
          <SessionClock variant="hero" />
        </div>
      </aside>

      {/* ── The panel ─────────────────────────────────────────────────── */}
      <main className="flex items-center justify-center px-5 py-12 sm:px-10 lg:py-16">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center justify-between gap-4">
            <Link href="/" className="brand flex items-center gap-3 lg:hidden">
              <Logo size={30} cell={1.7} className="brand-mark text-signal" />
              <span className="brand-name font-mono text-sm tracking-[0.2em] uppercase">
                Offhrs
              </span>
            </Link>
            <Link
              href="/"
              className="ml-auto inline-flex items-center gap-1.5 font-mono text-xs tracking-wider text-ink-faint uppercase transition-colors hover:text-ink"
            >
              <ArrowLeft size={13} /> Back
            </Link>
          </div>

          <h1 className="text-3xl leading-tight font-medium tracking-tight text-balance text-ink sm:text-4xl">
            {address ? "Wallet connected" : "Connect your wallet"}
          </h1>
          <p className="mt-4 leading-relaxed text-ink-dim">
            {address
              ? "You are ready to stake, claim and trade."
              : "Offhrs reads whatever Solana wallets you already have installed."}
          </p>

          {address ? (
            <div className="mt-10 border border-signal-dim/40 bg-signal/[0.04] p-6">
              <span className="label">Connected address</span>
              <p className="mt-3 font-mono text-base break-all text-ink">
                {shortAddress(address, 8, 8)}
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href="/dashboard" className="btn btn-primary w-full sm:w-auto">
                  Go to dashboard
                </Link>
                <button type="button" onClick={() => void disconnect()} className="btn btn-ghost">
                  Disconnect
                </button>
              </div>
            </div>
          ) : !isReady ? (
            /* `isReady` exists for exactly this: wallet discovery has not run during
               SSR, so rendering the list now would either be empty or hydrate
               mismatched. */
            <div className="mt-10 space-y-px border border-edge bg-edge">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton flex items-center gap-4 bg-surface px-5 py-4">
                  <span className="size-9 bg-raised" />
                  <span className="h-3 w-32 bg-raised" />
                </div>
              ))}
            </div>
          ) : connectors.length === 0 ? (
            <div className="mt-10 border border-edge p-6">
              <p className="text-sm leading-relaxed text-ink-dim">
                No Solana wallet detected in this browser. Install one to continue.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href="https://phantom.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost !px-4 !py-2.5 !text-xs"
                >
                  Phantom <ArrowUpRight size={13} />
                </a>
                <a
                  href="https://solflare.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost !px-4 !py-2.5 !text-xs"
                >
                  Solflare <ArrowUpRight size={13} />
                </a>
              </div>
            </div>
          ) : (
            <div className="mt-10 space-y-px border border-edge bg-edge">
              {connectors.map((c) => {
                const note = walletNote(c.id);
                const busy = connectorId === c.id && status === "connecting";
                const missing = c.ready === false;

                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void onSelect(c.id, c.ready, note.url)}
                    className="flex w-full items-center gap-4 bg-surface px-5 py-4 text-left transition-colors hover:bg-raised disabled:opacity-60"
                  >
                    {c.icon ? (
                      // wallet-standard hands back a data URI; next/image cannot
                      // optimise one and would need a remote-pattern config.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.icon} alt="" className="size-9 shrink-0" />
                    ) : (
                      <span className="dither grid size-9 shrink-0 place-items-center border border-edge bg-raised font-mono text-[0.625rem] text-ink-dim">
                        {c.name.slice(0, 2)}
                      </span>
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm text-ink">{c.name}</span>
                        {note.recommended && !missing && (
                          <span className="border border-signal-dim/60 px-1.5 py-0.5 font-mono text-[0.5625rem] tracking-wider text-signal uppercase">
                            Recommended
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[0.6875rem] text-ink-faint">
                        {missing
                          ? "Not installed — opens the install page"
                          : busy
                            ? "Waiting for approval…"
                            : note.blurb || "Detected in this browser"}
                      </span>
                    </span>

                    <span className="shrink-0 font-mono text-[0.625rem] tracking-wider text-ink-faint uppercase">
                      {missing ? "Install" : busy ? "…" : "Connect"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {error && !address && (
            <div className="mt-6 border border-ember/30 bg-ember/[0.06] px-5 py-4">
              <p className="text-sm leading-relaxed text-ink-dim">
                <span className="text-ember">Could not connect.</span> {error}
              </p>
            </div>
          )}

          <p className="mt-8 font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
            Offhrs never asks for a seed phrase or a private key. If anything claiming to be this
            site does, it is not this site.
          </p>
        </div>
      </main>
    </div>
  );
}
