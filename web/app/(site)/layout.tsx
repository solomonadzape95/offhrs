import { Nav } from "@/components/site/nav";
import { SiteFooter } from "@/components/site/site-footer";
import { fetchAllPreStocks, universeStatus } from "@/lib/market";

/**
 * Chrome for the public marketing surfaces.
 *
 * This lives in a `(site)` route group rather than the root layout so the
 * signed-in `/app` tree can have its own header. In the App Router every
 * parent layout wraps every child, so putting the marketing nav at the root meant
 * the dashboard rendered *both* headers.
 *
 * The group changes no URLs; it only changes who wraps whom.
 */
export const revalidate = 60;

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // This fetch is still needed: it populates the module cache that
  // `universeStatus()` reads, and the layout renders before the page.
  await fetchAllPreStocks().catch(() => []);

  // If the issuer API was unreachable we are rendering a captured snapshot, and
  // say so. Silently showing stale marks as live would be the one dishonest thing
  // this page could do.
  const universe = universeStatus();

  return (
    <>
      <Nav />

      {universe.stale && (
        <div className="border-b border-ember/40 bg-ember/8">
          <p className="mx-auto max-w-app px-5 py-2.5 font-mono text-[0.6875rem] tracking-[0.08em] text-ember sm:px-8">
            Issuer API unreachable — showing a snapshot captured {universe.capturedAt}. Marks are not
            live.
          </p>
        </div>
      )}

      <main className="flex-1">{children}</main>

      <SiteFooter />
    </>
  );
}
