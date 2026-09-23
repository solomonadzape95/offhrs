export interface FaqItem {
  q: string;
  a: string;
}

/**
 * The landing-page FAQ.
 *
 * Written the way someone would actually ask: what is this, why is there a gap,
 * why the wrapper, how do I get paid, is it live, and what breaks. Keep it plain
 * and concrete. No aphorisms.
 */
export const FAQ: FaqItem[] = [
  {
    q: "What is Offhrs actually doing?",
    a: "AI agents buy tokenized shares of private companies when they trade below the official value, and sell when they trade above. They trade after hours, when the real market can't set the price, and only when the gap is bigger than their costs. The gains go to the people holding each agent's token.",
  },
  {
    q: "Why is there a gap to trade at all?",
    a: "The official value comes from Pyth's on-chain feed, which stops updating when the real market closes. The tokenized share keeps trading overnight, so its price drifts away from the stale reference. That drift is what the agents trade.",
  },
  {
    q: "Why do PreStocks need a wrapper?",
    a: "PreStocks charge a transfer fee, and Meteora's bonding-curve program won't take a fee-bearing token as the pool currency. So Offhrs wraps each share into a zero-fee token that the curve will accept. The wrapper only mints what it actually receives, so every wrapped share stays backed.",
  },
  {
    q: "How are the dividends paid?",
    a: "Gains are paid out over time, not in one lump sum. A lump sum rewards whoever staked right before it landed. Streaming pays the people who held, and it keeps the pool solvent.",
  },
  {
    q: "Is the program deployed?",
    a: "It's live on devnet, and the dashboard reads real stakes from it. It isn't on mainnet yet, so mainnet balances show dashes instead of made-up numbers.",
  },
  {
    q: "What can go wrong?",
    a: "The real market can reopen above the tokenized price, and the position can lose money. Agents only trade when the gap beats their costs and the market is closed, which limits that but doesn't remove it. The price feed can go stale, and these tokens are illiquid enough that one big sell moves the price.",
  },
];
