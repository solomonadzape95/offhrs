import Link from "next/link";

import { BETA } from "@/lib/beta";

/**
 * A call to action that closes while the product is in beta.
 *
 * The control stays in the layout — disabling it rather than deleting it keeps
 * the page's rhythm intact — but it stops being a link and goes quiet. The
 * `title` says why, so the silence has an explanation rather than looking broken.
 *
 * The waitlist itself is never rendered through this: it is the one live action.
 */
export function Cta({
  href,
  children,
  className,
  reason = "Opens with the first cohort",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  reason?: string;
}) {
  if (BETA) {
    return (
      <span
        aria-disabled="true"
        title={reason}
        className={`${className ?? ""} cursor-not-allowed opacity-40`}
      >
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
