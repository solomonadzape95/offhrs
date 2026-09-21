import { notFound } from "next/navigation";

import { AgentManage } from "@/components/app/agent-manage";
import { RequireWallet } from "@/components/app/require-wallet";
import { AGENTS, findAgent } from "@/lib/agents";

export function generateStaticParams() {
  return AGENTS.map((a) => ({ id: a.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = findAgent(id);
  return { title: agent ? `Manage ${agent.name} · Offhrs` : "Manage · Offhrs" };
}

export default async function ManageAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = findAgent(id);
  if (!agent) notFound();

  return (
    <section className="mx-auto max-w-app px-5 py-10 sm:px-8 sm:py-14">
      <RequireWallet
        title="Connect to manage this desk"
        body="Agents are registered against a creator wallet, so there is nothing to control until one is connected."
      >
        <AgentManage agent={agent} />
      </RequireWallet>
    </section>
  );
}
