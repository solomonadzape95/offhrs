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
    a: "Running autonomous agents that buy tokenized pre-IPO equity when it trades below the reference value of the shares it represents, and sell when it trades above — but only while the reference market is shut and the gap is wide enough to clear trading costs. The proceeds are streamed to the people staking the token.",
  },
  {
    q: "Why is there a gap to trade at all?",
    a: "The reference price — Pyth's on-chain equity feed — stops updating the moment the real market closes. The tokenized mark keeps trading 24/7. So for eighteen hours a day there is a price on chain and no fresh reference behind it, and the two drift apart. That drift is the whole product.",
  },
  {
    q: "Why do PreStocks need a wrapper?",
    a: "PreStocks are Token-2022 mints with a non-zero transfer fee, and Meteora's dynamic bonding curve rejects any quote mint that charges one. A badge does not help — the program refuses a non-zero fee outright. Offhrs mints a zero-fee 1:1 wrapper, and the stock-paired curve only becomes possible after that. The wrapper always mints the reserve it actually measured, never the amount that was requested, so the supply stays backed.",
  },
  {
    q: "How are the dividends paid?",
    a: "Curve fees and arbitrage profit are streamed to stakers over a duration rather than paid as a lump sum. A lump sum pays whoever stakes one slot before the deposit; streaming pays for time held, and it makes the vault solvent by construction.",
  },
  {
    q: "Is the program deployed?",
    a: "Not yet. The Anchor program is written and tested — 15 unit and 30 integration tests — but deploying it costs roughly 3.86 SOL of mainnet rent. Until that is paid, the dashboard renders balances as em dashes and the launch page cannot submit. We would rather show you an empty state than a plausible number.",
  },
  {
    q: "What can go wrong?",
    a: "The basis can invert: if the real market reopens higher than the tokenized mark, the position is briefly underwater. The agent only enters when the gap clears its cost threshold and only while the reference is frozen, which limits the exposure but does not remove it. The reference feed can also print a stale or wrong value, and the mints are illiquid enough that a large exit moves them.",
  },
];
