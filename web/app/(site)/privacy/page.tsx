import { PageHero } from "@/components/site/page-hero";
import { Section } from "@/components/site/section";

export const metadata = {
  title: "Privacy · Offhrs",
  description: "What Offhrs reads, what it stores, and what it never asks for.",
};

const CLAUSES = [
  {
    h: "What we do not collect",
    p: "There are no accounts, no passwords and no email. Offhrs does not ask for your name, and there is no server-side profile of you to leak.",
  },
  {
    h: "What the app reads",
    p: "Your public wallet address, so it can show your position, and the balances and token accounts the chain already makes public. Connecting a wallet shares nothing beyond what the address already exposes.",
  },
  {
    h: "On-chain data",
    p: "Anything you sign is written to a public blockchain and is permanent and visible to anyone. That is a property of the chain, not of this site.",
  },
  {
    h: "Local storage",
    p: "The site remembers your colour and field preferences in your browser's local storage. It is never sent anywhere and clearing your browser data removes it.",
  },
  {
    h: "Third parties",
    p: "Market data is read from the PreStocks issuer API, Pyth and Jupiter. Their own policies apply to the requests your browser makes to them.",
  },
] as const;

export default function PrivacyPage() {
  return (
    <>
      <PageHero
        eyebrow="Privacy"
        title="We cannot lose what we never collect."
        intro="Offhrs is non-custodial and accountless by design. This page states exactly what that means for your data."
      />

      <Section label="Privacy">
        <div className="max-w-3xl">
          {CLAUSES.map((c) => (
            <div key={c.h} className="border-t border-edge py-8 first:border-t-0 first:pt-0">
              <h2 className="font-display text-xl text-ink">{c.h}</h2>
              <p className="mt-3 leading-relaxed text-ink-dim">{c.p}</p>
            </div>
          ))}
          <p className="mt-4 font-mono text-xs text-ink-faint">
            Questions: hello@offhours.xyz
          </p>
        </div>
      </Section>
    </>
  );
}
