import type { Metadata } from "next";

import { ConnectPanel } from "@/components/site/connect-panel";

export const metadata: Metadata = {
  title: "Connect · Offhrs",
  description: "Connect a Solana wallet to stake, claim and trade.",
};

export default function ConnectPage() {
  return <ConnectPanel />;
}
