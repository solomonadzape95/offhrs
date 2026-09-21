/**
 * The signal engine.
 *
 * This is the quantitative core: turn a market snapshot into a decision, and say
 * why. Kept deliberately pure and dependency-free so it can be unit-tested and
 * reasoned about without a network or a wallet.
 */
import type { MarketSnapshot } from "./market.js";

export type Direction = "buy_prestock" | "sell_prestock" | "hold";

export type Decision = {
  direction: Direction;
  /** Absolute basis being traded, in bps. */
  edgeBps: number;
  /** Edge expected to survive fees and slippage. */
  netEdgeBps: number;
  regime: "live" | "frozen";
  reason: string;
  /**
   * Whether the regime supports acting. Mean-reversion on a frozen reference is
   * the whole thesis: on-chain stock tokens detach while the reference is
   * closed, and snap back when it reopens.
   */
  regimeAllows: boolean;
  warnings: string[];
};

export type SignalParams = {
  minEdgeBps: number;
  frozenAfterSecs: number;
  /** Round-trip cost: DEX fee + the wrapper's wrap/unwrap PreStock transfer fee. */
  costBps: number;
  /** Reject the snapshot if the two independent price reads disagree by more. */
  maxDataQualityBps: number;
};

export const DEFAULT_PARAMS: SignalParams = {
  minEdgeBps: 150,
  frozenAfterSecs: 3600,
  // ~5% DBC dynamic fee tier on the agent side + ~100bps of PreStock transfer
  // fee on wrap/unwrap. Deliberately pessimistic.
  costBps: 600,
  maxDataQualityBps: 200,
};

/**
 * The PreStocks `markPrice` is the SPV reference; the DEX price is what you can
 * actually trade against.
 *
 * `premiumBps = (mark - market) / market`:
 *   positive -> the token trades *below* its mark, so buy and hold for convergence
 *   negative -> it trades *above* its mark, so sell / stand aside
 *
 * Computed from the issuer's own published premium so it is scale-invariant and
 * unimpeachable — PreStocks displays this same number on their products page.
 */
export function decide(snap: MarketSnapshot, p: SignalParams = DEFAULT_PARAMS): Decision {
  const warnings: string[] = [];
  const edgeBps = snap.prestock.premiumBps;
  const regimeAllows = snap.regime === "frozen";

  if (snap.dataQualityBps > p.maxDataQualityBps) {
    warnings.push(
      `price reads disagree by ${snap.dataQualityBps}bps ` +
        `(api-implied $${snap.impliedDexPrice.toFixed(2)} vs quoted $${snap.dex.priceUsd.toFixed(2)})`,
    );
  }
  if (snap.effectiveMultiplier <= 0) {
    warnings.push("could not derive scaledUiAmount multiplier from the quote");
  }
  if (snap.dex.priceImpactPct > 0.01) {
    warnings.push(`price impact ${(snap.dex.priceImpactPct * 100).toFixed(2)}%`);
  }

  const netEdgeBps = Math.abs(edgeBps) - p.costBps;

  const direction: Direction =
    Math.abs(edgeBps) < p.minEdgeBps
      ? "hold"
      : edgeBps > 0
        ? "buy_prestock"
        : "sell_prestock";

  let reason: string;
  if (direction === "hold") {
    reason = `basis ${edgeBps}bps is inside the ${p.minEdgeBps}bps threshold`;
  } else if (!regimeAllows) {
    reason =
      `basis ${edgeBps}bps clears the threshold, but the reference feed is LIVE ` +
      `(${snap.pyth.stalenessSecs}s stale). Waiting for a frozen reference.`;
  } else if (netEdgeBps <= 0) {
    reason =
      `basis ${edgeBps}bps does not survive ~${p.costBps}bps of round-trip cost ` +
      `(net ${netEdgeBps}bps)`;
  } else {
    reason =
      `${snap.prestock.symbol} trades ${edgeBps}bps ${edgeBps > 0 ? "below" : "above"} its SPV mark ` +
      `on a frozen reference — net ${netEdgeBps}bps after costs`;
  }

  return { direction, edgeBps, netEdgeBps, regime: snap.regime, reason, regimeAllows, warnings };
}

export function shouldExecute(d: Decision): boolean {
  return d.direction !== "hold" && d.regimeAllows && d.netEdgeBps > 0;
}
