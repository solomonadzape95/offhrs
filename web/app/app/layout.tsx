import { SiteFooter } from "@/components/site/site-footer";
import { AppShell } from "@/components/app/app-shell";

export const metadata = {
  title: "Dashboard · Offhrs",
  description: "Your stakes, the share equity they've earned, and the trades behind them.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <SiteFooter />
    </>
  );
}
