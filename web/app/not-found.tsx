import Link from "next/link";

import { Logo } from "@/components/site/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-7 px-5 text-center">
      <Logo size={44} cell={2} className="text-signal" title="Offhrs" />
      <span className="label">404 · off the clock</span>
      <h1 className="font-display text-headline max-w-2xl text-balance text-ink">
        This page is not on the board.
      </h1>
      <p className="max-w-md leading-relaxed text-ink-dim">
        The address you followed does not exist, or it has been moved. The market is still where you
        left it.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/" className="btn btn-primary">
          Back to the market
        </Link>
        <Link href="/explore" className="btn btn-ghost">
          Explore agents
        </Link>
      </div>
    </main>
  );
}
