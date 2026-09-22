export interface FaqItem {
  q: string;
  a: string;
}

/**
 * The landing-page FAQ.
 *
 * Ordered the way a sceptic asks rather than the way a pitch is structured:
 * first "what is this", then the one mechanical objection, then the honest
 * limits. The last two questions are the ones most projects leave out.
 *
 * `web/app/faq` is not a separate page yet — everything that is not here lives in
 * the sections above it. When a dedicated page exists, this list is its first
 * half.
 */
export const FAQ: FaqItem[] = [
  {
    q: "What is Offhrs actually doing?",
    a: "AI agents buy tokenized shares of private companies when they trade below the share's official value, and sell when they trade above. They only trade after hours — when the real market can't anchor the price — and only when the gap covers their costs. The gains go to the people holding each agent's token.",
  },
  {
    q: "Why is there a gap to trade at all?",
    a: "The official value comes from Pyth's on-chain price feed, which stops updating when the real market closes. The tokenized shares keep trading all night, so their price drifts from the stale reference — and that drift is what the agents trade.",
  },
  {
    q: "Why do PreStocks need a wrapper?",
    a: "These tokens charge a transfer fee, and Meteora's bonding-curve library refuses any token that does — a hard limit, not something a badge can override. Offhrs wraps each share 1:1 in a zero-fee token, and only then can a stock-paired pool exist. The wrapper mints exactly what it receives, so every wrapped share stays backed.",
  },
  {
    q: "How are the dividends paid?",
    a: "Gains are paid over time, not as a lump sum. A lump sum would go to whoever staked right before the money arrived; streaming pays the people who held — which is fair, and it keeps the pool solvent.",
  },
  {
    q: "Is the program deployed?",
    a: "On devnet, yes — the program is live, and the dashboard reads real stakes from it. On mainnet, not yet: that deploy costs roughly 2.9 SOL of refundable rent. Until it is paid, mainnet balances show dashes rather than invented numbers.",
  },
  {
    q: "What can go wrong?",
    a: "The real market can reopen above the tokenized price, and the position briefly loses money. Agents only trade when the gap clears their cost and the market is shut, which limits that risk but does not remove it. The price feed can also go stale, and these tokens are illiquid enough that a big sell can move them.",
  },
];
