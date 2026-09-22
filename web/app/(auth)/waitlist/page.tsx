import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

import { Logo } from "@/components/site/logo";
import { WaitlistForm } from "@/components/site/waitlist-form";
import { WarpField } from "@/components/site/warp-field";
import { WAITLIST_CAP, waitlistSize } from "@/lib/waitlist";

export const revalidate = 60;

export const metadata = {
  title: "Join the waitlist · Offhrs",
  description:
    "Early access to Offhrs — AI agents that trade tokenized shares of private companies after the market closes, and pay holders in the shares themselves.",
};

/**
 * The waitlist.
 *
 * One screen, no scroll: the Voronoi field is the whole background, an overlay
 * keeps the form legible over it, and the form is the only thing to do. It sits
 * in the `(auth)` group so it carries none of the marketing chrome — arriving
 * from the landing page's call to action should feel like a task, not a detour.
 *
 * The count is read live from Resend, so the cap is a fact rather than a
 * marketing number; if Resend is unreachable the page still renders the form.
 */
export default async function WaitlistPage() {
  const size = await waitlistSize();
  const remaining = size === null ? null : Math.max(0, WAITLIST_CAP - size);

  return (
    <div className="relative flex h-svh items-center justify-center overflow-hidden px-5 py-10">
      {/* The field runs edge to edge behind everything. */}
      <WarpField shader="voronoi" variant="hero" className="absolute inset-0" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-void/60" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 74% 62% at 50% 48%, transparent 0%, rgba(11,11,13,0.55) 66%, rgba(11,11,13,0.9) 100%)",
        }}
      />

      <div className="relative flex max-h-full w-full max-w-md flex-col overflow-y-auto">
        <div className="mb-9 flex items-center justify-between gap-4">
          <Link href="/" className="brand flex items-center gap-3">
            <Logo size={30} cell={1.7} className="brand-mark text-signal" />
            <span className="brand-name font-wordmark text-xl leading-none tracking-tight">
              offhrs
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 font-mono text-xs tracking-wider text-ink-faint uppercase transition-colors hover:text-ink"
          >
            <ArrowLeft size={13} /> Back
          </Link>
        </div>

        <h1 className="font-display text-3xl leading-tight text-balance text-ink sm:text-4xl">
          Get in before
          <br />
          <span className="text-signal">the market does.</span>
        </h1>
        <p className="mt-4 max-w-sm leading-relaxed text-ink-dim">
          AI agents trade tokenized shares of private companies once the regular market closes. The
          people holding each agent&apos;s token get paid in the shares themselves.
        </p>

        <div className="mt-8">
          <WaitlistForm />
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 px-1">
          <span className="tabular font-mono text-xs text-ink-dim">
            {size === null ? "—" : size} / {WAITLIST_CAP}
          </span>
          <span className="font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
            {remaining === null
              ? "spots claimed"
              : remaining > 0
                ? `${remaining} spots left`
                : "cohort full"}
          </span>
        </div>

        <p className="mt-6 px-1 font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
          Already have a wallet?{" "}
          <Link href="/connect" className="text-signal hover:text-ink">
            Connect
          </Link>{" "}
          to look around the devnet build.
        </p>
      </div>
    </div>
  );
}
