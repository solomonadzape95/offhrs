import { notFound } from "next/navigation";

import { AgentManage, type ManageData } from "@/components/app/agent-manage";
import { RequireWallet } from "@/components/app/require-wallet";
import { AGENTS, findAgent } from "@/lib/agents";
import { fetchAgentByPda, fetchLiveAgentByPda, fetchWrappers } from "@/lib/chain";
import { fetchUniverse } from "@/lib/universe";

export function generateStaticParams() {
  return AGENTS.map((a) => ({ id: a.id }));
}

/**
 * A manage route is either a seeded slug or an on-chain agent PDA. On-chain
 * records carry the fields this page actually operates on: the wrapper's paused
 * flag, the lifetime routed profit, and the execution count.
 */
async function resolve(id: string): Promise<{ agent: any; onchain: ManageData | null } | null> {
  const seed = findAgent(id);
  if (seed) return { agent: seed, onchain: null };

  const stocks = await fetchUniverse().catch(() => []);
  const live = await fetchLiveAgentByPda(
    id,
    stocks.map((s) => ({ symbol: s.symbol, mint: s.mint })),
  ).catch(() => null);
  if (!live) return null;

  const [raw, wrappers] = await Promise.all([
    fetchAgentByPda(id).catch(() => null),
    fetchWrappers().catch(() => []),
  ]);
  const wrapper = wrappers.find((w) => w.wrappedMint === live.wrappedMint);

  return {
    agent: live,
    onchain: {
      pda: live.pda,
      agentTokenMint: live.agentTokenMint,
      totalProfitRouted: raw?.totalProfitsRouted.toString() ?? "0",
      executionCount: live.executionCount,
      paused: wrapper?.paused ?? false,
    },
  };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolve(id);
  return { title: resolved ? `Manage ${resolved.agent.name} · Offhrs` : "Manage · Offhrs" };
}

export default async function ManageAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolve(id);
  if (!resolved) notFound();

  return (
    <section className="mx-auto max-w-app px-5 py-10 sm:px-8 sm:py-14">
      <RequireWallet
        title="Connect to manage this desk"
        body="Agents are registered to a creator wallet, so there is nothing to control until one is connected."
      >
        <AgentManage agent={resolved.agent} onchain={resolved.onchain} />
      </RequireWallet>
    </section>
  );
}
