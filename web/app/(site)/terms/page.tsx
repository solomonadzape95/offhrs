import { PageHero } from "@/components/site/page-hero";
import { Section } from "@/components/site/section";

export const metadata = {
  title: "Terms · Offhrs",
  description: "What Offhrs is, what it is not, and the terms of a hackathon build.",
};

const CLAUSES = [
  {
    h: "What Offhrs is",
    p: "Offhrs is a software build for the Stocklana hackathon. It reads public market data, presents it, and describes a mechanism for trading tokenized pre-IPO equity against a stale reference price. Nothing on this site is an offer to buy or sell any security.",
  },
  {
    h: "Not investment advice",
    p: "Nothing here is financial, legal or tax advice. Pre-IPO marks are illiquid, the reference price they track can gap when the real market reopens, and any position can lose value. Do your own research and, where relevant, talk to a professional.",
  },
  {
    h: "Not deployed",
    p: "The on-chain programs described on this site are written and tested, and deployed to the Solana devnet. They are not deployed to mainnet. Figures that depend on them are read from the chain where possible and shown as em dashes where not. Do not send funds expecting a vault to hold them.",
  },
  {
    h: "Your wallet, your keys",
    p: "Offhrs never asks for a seed phrase or a private key, and cannot move anything on your behalf. Every action is signed by you in your own wallet. If anything claiming to be this site asks for a key, it is not this site.",
  },
  {
    h: "No warranty",
    p: "The software is provided as is, without warranty of any kind. Market data is read from third parties and may be delayed, incomplete or wrong. Use it at your own risk.",
  },
  {
    h: "Changes",
    p: "This is an active build and these terms may change. Continued use after a change means you accept the new version.",
  },
] as const;

export default function TermsPage() {
  return (
    <>
      <PageHero
        eyebrow="Terms"
        title="The plain version."
        intro="A hackathon build, honestly described. If something here contradicts the rest of the site, the rest of the site is the more careful document."
      />

      <Section label="Terms of use">
        <div className="max-w-3xl">
          {CLAUSES.map((c) => (
            <div key={c.h} className="border-t border-edge py-8 first:border-t-0 first:pt-0">
              <h2 className="font-display text-xl text-ink">{c.h}</h2>
              <p className="mt-3 leading-relaxed text-ink-dim">{c.p}</p>
            </div>
          ))}
          <p className="mt-4 font-mono text-xs text-ink-faint">
            Last updated with the current build. Questions: hello@offhours.xyz
          </p>
        </div>
      </Section>
    </>
  );
}
