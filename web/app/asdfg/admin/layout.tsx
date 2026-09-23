import { Nav } from "@/components/site/nav";
import { SiteFooter } from "@/components/site/site-footer";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata = {
  title: "Admin · Offhrs",
  description: "Operator console for the devnet deployment.",
  // Never indexed: this is an operator surface, not a marketing page.
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <AdminShell>{children}</AdminShell>
      </main>
      <SiteFooter />
    </>
  );
}
