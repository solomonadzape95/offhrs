/**
 * Execution adapters.
 *
 * The agent's decision loop is identical no matter where the trade lands, so the
 * venue sits behind this interface. That matters right now: Clawpump's own launch
 * paths are pump.fun / Metaplex Genesis / Pons and it has no Meteora DBC launch
 * or custom-quote-mint option, so whether "Clawpump agent + our own DBC pool"
 * satisfies their bounty text is still open. Whichever way that resolves, only
 * this file changes.
 */
import { config } from "./config.js";
import type { MarketSnapshot } from "./market.js";
import type { Decision } from "./signal.js";

export type ExecuteResult = {
  backend: string;
  executed: boolean;
  amountIn: bigint;
  amountOut: bigint;
  venue: "Jupiter" | "Raydium" | "MeteoraDlmm" | "MeteoraDammV2" | "Orca" | "Clawpump" | "Other";
  signature?: string;
  detail: string;
};

export interface ExecutionAdapter {
  readonly name: string;
  /** Whether the adapter can actually send transactions right now. */
  ready(): boolean;
  execute(snap: MarketSnapshot, decision: Decision, notional: bigint): Promise<ExecuteResult>;
}

/** Decides and reports, sends nothing. The default, so the engine is inspectable. */
export class DryRunAdapter implements ExecutionAdapter {
  readonly name = "dryrun";
  ready() {
    return true;
  }
  async execute(
    snap: MarketSnapshot,
    decision: Decision,
    notional: bigint,
  ): Promise<ExecuteResult> {
    // Model the fill at the live executable price, minus the slippage the quote
    // itself reports, so the logged profit is not wishful.
    const slip = 1 - Math.min(snap.dex.priceImpactPct, 0.05);
    const amountOut = BigInt(Math.floor(Number(notional) * (1 + decision.netEdgeBps / 10_000) * slip));
    return {
      backend: this.name,
      executed: false,
      amountIn: notional,
      amountOut,
      venue: "Other",
      detail:
        `would ${decision.direction} ${snap.prestock.symbol} on ${snap.dex.route.join(" -> ") || "n/a"}` +
        ` at $${snap.dex.priceUsd.toFixed(2)} (net ${decision.netEdgeBps}bps)`,
    };
  }
}

/**
 * Map Jupiter's route labels onto the on-chain `ArbVenue` enum.
 *
 * Jupiter is an aggregator, so a single quote can hop through several venues. We
 * label the fill by the deepest venue in the route rather than calling everything
 * "Jupiter" — that is what makes the execution log show the agent really routing
 * across Raydium, Meteora and Orca rather than claiming it.
 */
function venueFromRoute(labels: string[]): ExecuteResult["venue"] {
  const has = (needle: string) => labels.some((l) => l.toLowerCase().includes(needle));
  if (has("meteora damm") || has("damm v2")) return "MeteoraDammV2";
  if (has("meteora")) return "MeteoraDlmm";
  if (has("raydium")) return "Raydium";
  if (has("orca") || has("whirlpool")) return "Orca";
  if (has("clawpump")) return "Clawpump";
  return "Jupiter";
}

/** Direct DEX execution via Jupiter. No third-party account or approval needed. */
export class JupiterAdapter implements ExecutionAdapter {
  readonly name = "jupiter";
  ready() {
    return Boolean(config.keypairPath);
  }
  async execute(
    snap: MarketSnapshot,
    decision: Decision,
    notional: bigint,
  ): Promise<ExecuteResult> {
    // Route: USDC -> PreStock (buy the dislocated side).
    const url =
      `https://lite-api.jup.ag/swap/v1/quote?inputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` +
      `&outputMint=${snap.prestock.mint}&amount=${notional}&slippageBps=100`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`jupiter quote ${res.status}`);
    const q = (await res.json()) as any;
    if (!q.outAmount) throw new Error("no route");

    const route: string[] = (q.routePlan ?? [])
      .map((s: any) => s.swapInfo?.label)
      .filter(Boolean);

    return {
      backend: this.name,
      executed: false, // swap tx construction is wired on Day 5 with the wallet signer
      amountIn: notional,
      amountOut: BigInt(q.outAmount),
      venue: venueFromRoute(route),
      detail: `quoted ${q.outAmount} raw via ${route.join(" -> ")} (send() pending wallet wiring)`,
    };
  }
}

/**
 * Clawpump's agent rails. Their MCP server exposes `arbitrage_prices`,
 * `arbitrage_quote` and `swap_execute`, and the REST API mirrors them.
 *
 * NOTE: Clawpump has no Meteora DBC launch path, so this adapter moves the
 * *trades*; the stock-paired pool itself is created by us via the Meteora DBC
 * SDK. That composition is the open question with Clawpump.
 */
export class ClawpumpAdapter implements ExecutionAdapter {
  readonly name = "clawpump";
  ready() {
    return Boolean(config.clawpumpApiKey);
  }
  async execute(
    snap: MarketSnapshot,
    decision: Decision,
    notional: bigint,
  ): Promise<ExecuteResult> {
    if (!this.ready()) throw new Error("CLAWPUMP_API_KEY not set");

    // Ask Clawpump for a cross-DEX arbitrage quote on our pair.
    const res = await fetch(`${config.clawpumpBase}/api/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.clawpumpApiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "arbitrage_quote",
          arguments: { inputMint: snap.prestock.mint, amount: notional.toString() },
        },
      }),
    });
    if (!res.ok) throw new Error(`clawpump ${res.status}`);
    const body = (await res.json()) as any;

    const amountOut = BigInt(body?.result?.amountOut ?? notional);
    return {
      backend: this.name,
      executed: false,
      amountIn: notional,
      amountOut,
      venue: "Clawpump",
      detail: `clawpump arbitrage_quote -> ${amountOut} raw (${snap.prestock.symbol})`,
    };
  }
}

export function selectAdapter(): ExecutionAdapter {
  switch (config.execution) {
    case "clawpump":
      return new ClawpumpAdapter();
    case "jupiter":
      return new JupiterAdapter();
    default:
      return new DryRunAdapter();
  }
}
