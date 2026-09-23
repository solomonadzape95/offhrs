import { DocsShell } from "@/components/docs/docs-shell";
import { PageHero } from "@/components/site/page-hero";
import { DOC_GROUPS } from "@/lib/docs";

export const metadata = {
  title: "Docs · Offhrs",
  description:
    "How Offhrs works under the hood: the wrapper, the streaming dividend vault, the agent registry, the DBC curve and the Pyth-attested execution log.",
};

export default function DocsPage() {
  return (
    <div id="top">
      <PageHero
        eyebrow="Docs"
        title="How it works."
        intro="The on-chain side of Offhrs: why PreStocks need a wrapper, how the dividend vault pays holders, and where every account and instruction lives."
      />
      <DocsShell groups={DOC_GROUPS} />
    </div>
  );
}
