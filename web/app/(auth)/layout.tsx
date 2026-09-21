/**
 * Chrome for the authentication surface.
 *
 * Deliberately bare: no marketing header, no footer. Connecting a wallet is a
 * task, not a browse, and the lockup lives inside the page itself. This sits in
 * its own route group so `/connect` can exist without the `(site)` chrome
 * wrapping it — the same reason the dashboard has its own layout.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex-1">{children}</div>;
}
