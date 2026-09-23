import Link from "next/link";
import { ArrowUpRight, GithubLogo, XLogo } from "@phosphor-icons/react/dist/ssr";

import { Icon } from "@/components/ui/icon";
import { WarpField } from "@/components/site/warp-field";
import { APP_ENTRY_HREFS, BETA } from "@/lib/beta";

/**
 * The closing statement.
 *
 * One full-bleed field, the small print and the columns over it, and the brand set
 * enormous across the bottom edge. The wordmark is just the name — it is already
 * the page's last sentence, and underlining it with a slogan was one line of type
 * doing another's job.
 *
 * The warp is the *same shader as the hero and the mid-page band*, lazy-mounted.
 * The page opens, breathes and closes on the same image, which is the cheapest way
 * to make a long page feel like one object.
 *
 * The columns are the site's index: product, protocol, and the pages that carry
 * the small print.
 */
const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/explore", label: "Markets" },
      { href: "/vault", label: "Vault" },
      { href: "/launch", label: "Launch an agent" },
      { href: "/app", label: "Dashboard" },
    ],
  },
  {
    title: "Protocol",
    links: [
      { href: "/docs", label: "Docs" },
      { href: "/#reference", label: "The gap" },
      { href: "/#mechanics", label: "Mechanics" },
      { href: "/#agents", label: "The agents" },
    ],
  },
  {
    title: "Elsewhere",
    links: [
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
      { href: "https://pyth.network", label: "Pyth", external: true },
      { href: "https://solana.com", label: "Solana", external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative isolate overflow-hidden border-t border-edge">
      {/* The warp, laid under everything. Lazy so it is not a second live context
          until the visitor is nearly here. */}
      <WarpField variant="footer" lazy className="absolute inset-0 -z-10" />

      {/* A wash and a bottom fade, so the giant wordmark has something quiet to sit
          on. The top third stays lighter so the footer does not read as a slab. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-void/70" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, transparent 28%, rgba(11,11,13,0.6) 60%, rgba(11,11,13,0.9) 82%, rgba(11,11,13,0.98) 100%)",
        }}
      />

      <div className="relative mx-auto max-w-app px-5 pt-20 sm:px-8 sm:pt-24">
        {/* ── Pills ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <Pill href="https://x.com/Offhrsdotfun" icon={<XLogo size={16} weight="fill" aria-hidden />} external>
            offhrs
          </Pill>
          <Pill
            href="https://github.com/solomonadzape95/offhrs"
            icon={<GithubLogo size={16} weight="fill" aria-hidden />}
            external
          >
            GitHub
          </Pill>
        </div>

        {/* ── Small print + columns ─────────────────────────────────────── */}
        <div className="mt-12 grid gap-12 lg:grid-cols-[1.1fr_1.4fr] lg:gap-20">
          <div>
            <p className="max-w-sm font-mono text-xs leading-relaxed text-ink-dim">
              Offhrs is a hackathon build for Stocklana. Prices come live from the PreStocks issuer
              API, Jupiter and Pyth. The agents registered on chain are real. The four on the landing
              page are a showcase.
            </p>
            <p className="mt-6 max-w-sm font-mono text-xs leading-relaxed text-ink-faint">
              This isn&apos;t investment advice. Pre-IPO marks are illiquid, and the price they track
              can gap when the real market reopens.
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <span className="label">{column.title}</span>
                <ul className="mt-5 space-y-3">
                  {column.links
                    .filter((link) => !BETA || !APP_ENTRY_HREFS.includes(link.href))
                    .map((link) => (
                    <li key={link.label}>
                      {"external" in link && link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="group inline-flex items-center gap-1.5 text-sm text-ink-dim transition-colors hover:text-signal"
                        >
                          {link.label}
                          <span className="opacity-0 transition-opacity group-hover:opacity-100">
                            <Icon icon={ArrowUpRight} size={13} dither={false} />
                          </span>
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-sm text-ink-dim transition-colors hover:text-signal"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </div>

      {/* ── The wordmark, as a picture ──────────────────────────────────── */}
      <div className="relative mt-20 overflow-hidden px-5 pt-6 sm:mt-24 sm:px-8 sm:pt-8">
        <h2
          aria-label="Offhrs"
          className="font-wordmark mx-auto max-w-app text-ink"
          style={{
            fontSize: "clamp(5rem, 24vw, 22rem)",
            lineHeight: 1.08,
            letterSpacing: "-0.04em",
          }}
        >
          offhrs
        </h2>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-void-deep/80 to-transparent"
        />
      </div>

      <div className="h-10 sm:h-14" />
    </footer>
  );
}

function Pill({
  href,
  icon,
  children,
  external,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  external?: boolean;
}) {
  const cls =
    "inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-ink/15 bg-ink/10 px-4 py-2.5 text-sm font-medium text-ink backdrop-blur-md transition-colors hover:bg-ink/30";

  return (
    <a
      href={href}
      className={cls}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {icon}
      {children}
    </a>
  );
}
