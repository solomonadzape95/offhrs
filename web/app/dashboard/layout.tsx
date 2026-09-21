import { AppShell } from "@/components/app/app-shell";

export const metadata = {
  title: "Dashboard · Offhrs",
  description: "Your stakes, accrued pre-IPO equity, and the agent executions behind them.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
