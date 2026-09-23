"use client";

import { useEffect, useState } from "react";

import { compactNumber } from "@/lib/format";

/**
 * Curve preview.
 *
 * This is not a mock-up of the DBC configuration — it *is* the configuration,
 * computed by Meteora's own SDK from the fee tier chosen in step 4. The numbers
 * below are the ones that would be written into `createConfig`, including the
 * initial price derived from the first curve point's sqrt price.
 *
 * Loaded with a dynamic import so ~500KB of bonding-curve maths only reaches a
 * browser that asked for it. The rest of the site has no reason to carry it.
 */
type Preview = {
  supply: string;
  threshold: string;
  points: number;
  startingFeeBps: number;
  endingFeeBps: number;
  initialPrice: string;
  migrationPrice: string;
  collectFeeMode: string;
};

export function CurvePreview({
  feeBps,
  symbol,
  threshold = 750,
}: {
  feeBps: number;
  symbol: string;
  /** Migration threshold in QUOTE-TOKEN units, i.e. wPreStock — not dollars. */
  threshold?: number;
}) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ok"; data: Preview } | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setState({ kind: "loading" });
      try {
        const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");

        const config = sdk.buildCurve({
          token: {
            tokenType: sdk.TokenType.SPLToken,
            tokenBaseDecimal: sdk.TokenDecimal.SIX,
            tokenQuoteDecimal: sdk.TokenDecimal.NINE,
            tokenAuthorityOption: sdk.TokenAuthorityOption.Immutable,
            totalTokenSupply: 1_000_000_000,
            leftover: 0,
          },
          fee: {
            baseFeeParams: {
              baseFeeMode: sdk.BaseFeeMode.FeeSchedulerLinear,
              feeSchedulerParam: {
                startingFeeBps: feeBps,
                endingFeeBps: 100,
                numberOfPeriod: 10,
                totalDuration: 86_400,
              },
            },
            dynamicFeeEnabled: true,
            // Fees accrue in the quote asset, which is wPreStock — this is the
            // setting that makes "dividends paid in equity" true rather than
            // aspirational.
            collectFeeMode: sdk.CollectFeeMode.QuoteToken,
            creatorTradingFeePercentage: 0,
            poolCreationFee: 0,
            enableFirstSwapWithMinFee: false,
          },
          migration: {
            migrationOption: sdk.MigrationOption.MET_DAMM_V2,
            migrationFeeOption: sdk.MigrationFeeOption.Customizable,
            migrationFee: { feePercentage: 10, creatorFeePercentage: 50 },
            migratedPoolFee: {
              collectFeeMode: sdk.MigratedCollectFeeMode.QuoteToken,
              dynamicFee: sdk.DammV2DynamicFeeMode.Enabled,
              poolFeeBps: 100,
              baseFeeMode: sdk.DammV2BaseFeeMode.FeeTimeSchedulerLinear,
            },
          },
          liquidityDistribution: {
            partnerLiquidityPercentage: 0,
            partnerPermanentLockedLiquidityPercentage: 100,
            creatorLiquidityPercentage: 0,
            creatorPermanentLockedLiquidityPercentage: 0,
          },
          lockedVesting: {
            totalLockedVestingAmount: 0,
            numberOfVestingPeriod: 0,
            cliffUnlockAmount: 0,
            totalVestingDuration: 0,
            cliffDurationFromMigrationTime: 0,
          },
          activationType: sdk.ActivationType.Timestamp,
          percentageSupplyOnMigration: 10,
          migrationQuoteThreshold: threshold,
        });

        const anyCfg = config as unknown as Record<string, any>;
        const curve = (anyCfg.curve ?? []) as Array<{ sqrtPrice: any }>;

        const first = curve[0]?.sqrtPrice;
        const last = curve[curve.length - 1]?.sqrtPrice;

        const price = (sp: any) =>
          sp
            ? String(
                sdk.getPriceFromSqrtPrice(
                  sp,
                  sdk.TokenDecimal.SIX,
                  sdk.TokenDecimal.NINE,
                ).toString(),
              )
            : "—";

        if (cancelled) return;
        setState({
          kind: "ok",
          data: {
            supply: compactNumber(Number(anyCfg.totalTokenSupply ?? 1_000_000_000)),
            threshold: String(anyCfg.migrationQuoteThreshold ?? threshold),
            points: curve.length,
            startingFeeBps: feeBps,
            endingFeeBps: 100,
            initialPrice: price(first),
            migrationPrice: price(last),
            collectFeeMode: "QuoteToken",
          },
        });
      } catch (e: any) {
        if (cancelled) return;
        setState({ kind: "error", message: e?.message ?? "could not compute the curve" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [feeBps, threshold]);

  return (
    <div className="panel flex flex-col gap-5 p-6">
      <div className="flex items-baseline justify-between">
        <span className="label">Curve configuration</span>
        <span className="font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
          computed by the DBC SDK
        </span>
      </div>

      {state.kind === "loading" && (
        <p className="font-mono text-xs text-ink-faint">Computing…</p>
      )}

      {state.kind === "error" && (
        <p className="font-mono text-xs text-ember">{state.message}</p>
      )}

      {state.kind === "ok" && (
        <>
          <dl className="flex flex-col divide-y divide-edge/60">
            <Row k="Total supply" v={`${state.data.supply} $AGENT`} />
            <Row k="Curve points" v={String(state.data.points)} />
            <Row
              k="Start → end fee"
              v={`${(state.data.startingFeeBps / 100).toFixed(2)}% → ${(state.data.endingFeeBps / 100).toFixed(2)}%`}
            />
            <Row k="Fee collected in" v={`${state.data.collectFeeMode} (w${symbol})`} />
            <Row k="Initial price" v={`${state.data.initialPrice} w${symbol}`} />
            <Row k="Migration at" v={`${state.data.migrationPrice} w${symbol}`} />
            <Row
              k="Migration threshold"
              v={`${state.data.threshold} w${symbol}`}
              hint="quote-token units, not dollars"
            />
          </dl>

          <p className="font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
            The threshold is denominated in the quote token, so it has to be sized against real
            w{symbol} liquidity rather than picked as a dollar figure. Migrates into a Meteora DAMM v2
            pool on completion, with the quote reserve becoming the permanent liquidity.
          </p>
        </>
      )}
    </div>
  );
}

function Row({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="label shrink-0">{k}</dt>
      <dd className="text-right font-mono text-xs text-ink-dim">
        {v}
        {hint && <span className="ml-2 text-ink-faint">{hint}</span>}
      </dd>
    </div>
  );
}
