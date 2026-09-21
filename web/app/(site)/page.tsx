import Link from "next/link";
import {
  ArrowRight,
  ArrowsClockwise,
  Coins,
  Hourglass,
  Lightning,
  LockKey,
  Target,
} from "@phosphor-icons/react/dist/ssr";

import { AgentCarousel } from "@/components/site/agent-carousel";
import { DitherBackdrop } from "@/components/site/dither-backdrop";
import { DitherChart } from "@/components/site/dither-chart";
import { FaqList } from "@/components/site/faq";
import { Glyph } from "@/components/site/glyph";
import { LiveBadge } from "@/components/site/live-badge";
import { MechanicsGrid } from "@/components/site/mechanics";
import { Section } from "@/components/site/section";
import { SessionClock } from "@/components/site/session-clock";
import { Stat } from "@/components/site/stat";
import { WarpField } from "@/components/site/warp-field";
import { Icon } from "@/components/ui/icon";
import { AGENTS } from "@/lib/agents";
import { ARBITRAGE, CURVE_FEES, MARK, PAYOUT, REFERENCE } from "@/lib/chart-data";
import { FAQ } from "@/lib/faq";
import { usd } from "@/lib/format";
import { FROZEN_AFTER_SECS, fetchAllPreStocks, readPyth } from "@/lib/market";

export const revalidate = 60;

/**
 * Landing page.
 *
 * The hero is one full viewport and nothing else: the claim, then the field it is
 * about. The header floats over it rather than taking a strip out of it, so the
 * shader reads edge to edge and the claim is not pushed below the fold by chrome.
 *
 * Below the fold the page deliberately changes shape section by section — a
 * two-column proof, a table, a bento, a carousel, a warp band — so the scroll does
 * not become one repeated card. There are no invented figures anywhere: where a
 * chart would go but no series exists, the space is reserved and labelled.
 */
export default async function Home() {
  const [stocks, regime] = await Promise.all([
    fetchAllPreStocks().catch(() => []),
    readPyth().catch(() => null),
  ]);

  const frozen = regime ? regime.stalenessSecs > FROZEN_AFTER_SECS : false;
  const dislocated = [...stocks].sort((a, b) => Math.abs(b.premiumBps) - Math.abs(a.premiumBps));
  const widest = dislocated[0];

  const printed = regime
    ? new Date(regime.publishTime * 1000).toISOString().replace("T", " ").slice(0, 19) + "Z"
    : "—";

  const tracked = usd(stocks.reduce((s, x) => s + x.markValuation, 0), { compact: true });

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      {/* One viewport. The header is fixed over the top, so this is 100svh of
          composition rather than "100svh minus a bar". */}
      <div className="relative flex min-h-svh flex-col">
        {/* The claim. Centred in what is left of the viewport above the field. */}
        <section className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 pt-28 pb-6 text-center">
          <LiveBadge label="Pre-IPO equity · after the bell" />

          <h1 className="font-display text-display mt-7 max-w-4xl text-balance text-ink">
            The market is closed.
            <br />
            <span className="text-signal">But we&apos;re offhrs.</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-dim text-pretty sm:text-lg">
            Tokenized pre-IPO equity trades around the clock. The reference price it tracks stops at
            the closing bell. We run agents on the gap, and pay holders in the shares themselves.
          </p>

          <div className="mt-9 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            <Link href="/explore" className="btn btn-primary btn-lg w-full sm:w-auto">
              Explore markets
            </Link>
            <Link href="/launch" className="btn btn-ghost btn-lg w-full sm:w-auto">
              Launch an agent
            </Link>
          </div>
        </section>

        {/* The field. Its own band, so the type and the shader never touch. */}
        <section className="relative h-[42svh] min-h-[280px] w-full shrink-0">
          <WarpField className="absolute inset-0" />

          {/* Melt the dark of the claim into the shader at the top, and darken the
              bottom where the read-outs sit. The bottom wash is the one that
              matters: it is what buys the small mono type its contrast. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-void via-void/60 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-void via-void/85 to-transparent"
          />

          {/* Read-outs, sitting in the calm edge of the field. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-6 p-6 sm:p-9">
            <div className="pointer-events-auto">
              <SessionClock variant="compact" />
              <p className="mt-2 max-w-md font-mono text-xs leading-relaxed text-ink-faint">
                {frozen ? "Reference frozen" : "Reference live"} · last print {printed}
              </p>
            </div>

            {widest && (
              <div className="pointer-events-auto text-right">
                <span className="label">Widest dislocation</span>
                <p className="figure text-3xl leading-none text-ink">
                  {widest.premiumBps >= 0 ? "+" : ""}
                  {widest.premiumBps}
                  <span className="ml-1 text-sm text-ink-faint">bps</span>
                </p>
                <p className="mt-1.5 font-mono text-xs text-ink-faint">
                  {widest.symbol} · {widest.premiumBps >= 0 ? "below" : "above"} mark
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── Live evidence ────────────────────────────────────────────── */}
      <Section id="reference" label="Right now">
        <Glyph
          char="⌁"
          rotate={-13}
          opacity={0.04}
          className="top-1/2 -right-10 -translate-y-1/2 text-[22rem] lg:text-[30rem]"
        />

        <div className="relative grid items-start gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
          <div>
            <h2 className="font-display text-statement max-w-3xl text-balance text-ink">
              The proof is a timestamp.
            </h2>
            <p className="mt-6 max-w-2xl leading-relaxed text-ink-dim">
              Pyth publishes the Apple equity feed on chain with a{" "}
              <span className="font-mono text-ink">publish_time</span> anyone can read. When that
              stops advancing, the reference market is closed — and the tokenized marks drift.
            </p>

            <div className="mt-10 grid grid-cols-2 gap-8">
              <Stat
                label="Reference feed"
                value={regime ? (frozen ? "Frozen" : "Live") : "—"}
                tone={regime ? (frozen ? "ember" : "signal") : "default"}
                hint={regime ? `stale ${Math.floor(regime.stalenessSecs / 3600)}h` : "unavailable"}
              />
              <Stat
                label="Last print"
                value={
                  regime ? new Date(regime.publishTime * 1000).toISOString().slice(11, 16) : "—"
                }
                unit="UTC"
                hint={regime ? new Date(regime.publishTime * 1000).toISOString().slice(0, 10) : ""}
              />
            </div>
          </div>

          <div className="panel relative aspect-[5/4] min-h-64 overflow-hidden">
            <DitherChart
              className="absolute inset-0 h-full w-full"
              lines={[
                { data: MARK, mode: "area", opacity: 0.95 },
                { data: REFERENCE, mode: "dashed", tone: "dim", opacity: 0.8 },
              ]}
            />
            <div className="pointer-events-none absolute top-4 left-4">
              <span className="label">Reference vs mark · 24h</span>
            </div>
            <div className="pointer-events-none absolute bottom-3 left-4 flex items-center gap-4 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
              <span className="flex items-center gap-1.5 text-signal">
                <span aria-hidden className="h-px w-4 bg-signal" />
                Mark
              </span>
              <span className="flex items-center gap-1.5 text-ink-faint">
                <span aria-hidden className="h-px w-4 border-t border-dashed border-ink-faint" />
                Reference
              </span>
            </div>
          </div>
        </div>

        <div className="mt-14 grid grid-cols-2 gap-10 border-t border-edge pt-10 lg:grid-cols-4">
          <Stat
            label="Widest dislocation"
            value={`${widest?.premiumBps && widest.premiumBps >= 0 ? "+" : ""}${widest?.premiumBps ?? 0}`}
            unit="bps"
            tone="signal"
            hint={widest?.symbol ?? ""}
          />
          <Stat label="Pre-IPO tracked" value={tracked} hint={`${stocks.length} assets`} />
          <Stat label="Agents staged" value={String(AGENTS.length)} hint="registry seeded" />
          <Stat label="Assets with a feed" value={regime ? "1" : "—"} hint="Pyth equity feed" />
        </div>
      </Section>

      {/* ── The dislocation board ────────────────────────────────────── */}
      <Section id="board" label="The board">
        <div className="relative isolate">
          <DitherBackdrop
            className="pointer-events-none absolute -top-24 -right-24 -z-10 hidden h-[24rem] w-[36rem] lg:block"
            shape="wave"
            size={3}
            opacity={0.1}
          />
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-statement max-w-3xl text-balance text-ink">
              Every SPV mark, against its market.
            </h2>
            <Link href="/explore" className="nav-item">
              All agents →
            </Link>
          </div>
        </div>

        <div className="panel mt-10 overflow-x-auto p-2 sm:p-3">
          <table className="w-full min-w-160 border-collapse">
            <thead>
              <tr className="border-b border-edge">
                {["Asset", "SPV mark", "Issuer price", "Basis", "Mark value"].map((h, i) => (
                  <th
                    key={h}
                    className={`label py-3.5 ${i === 0 ? "pl-4 text-left" : "text-right"} ${
                      i === 4 ? "pr-4" : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dislocated.map((s) => (
                <tr key={s.symbol} className="border-b border-edge/50 last:border-0">
                  <td className="py-4 pl-4">
                    <span className="font-mono text-sm text-ink">{s.symbol}</span>
                    <span className="ml-3 text-sm text-ink-faint">{s.name}</span>
                  </td>
                  <td className="tabular py-4 text-right font-mono text-sm text-ink">
                    {usd(s.markPrice)}
                  </td>
                  <td className="tabular py-4 text-right font-mono text-sm text-ink-dim">
                    {usd(s.tokenPrice)}
                  </td>
                  <td
                    className={`tabular py-4 text-right font-mono text-sm ${
                      s.premiumBps > 0 ? "basis-up" : "basis-down"
                    }`}
                  >
                    {`${s.premiumBps >= 0 ? "+" : ""}${s.premiumBps}bps`}
                  </td>
                  <td className="tabular py-4 pr-4 text-right font-mono text-sm text-ink-faint">
                    {usd(s.markValuation, { compact: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 max-w-3xl font-mono text-xs leading-relaxed text-ink-faint">
          Basis is PreStocks&apos; own published premium, so it is scale-invariant — the mint&apos;s
          scaledUiAmount multiplier does not affect it. Positive means the token trades below its
          mark.
        </p>
      </Section>

      {/* ── Mechanics, as a bento ────────────────────────────────────── */}
      <Section id="mechanics" label="Mechanics">
        <Glyph
          char="↗"
          rotate={9}
          opacity={0.04}
          className="-top-16 -left-12 text-[20rem] lg:text-[26rem]"
        />

        <div className="relative">
          <h2 className="font-display text-statement max-w-3xl text-balance text-ink">
            Three moving parts, one of which had to be invented.
          </h2>

          <MechanicsGrid />

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <span className="label">{AGENTS.length} agents staged</span>
            <Link href="/explore" className="btn btn-primary ml-auto">
              Open the market
            </Link>
          </div>
        </div>
      </Section>

      {/* ── The agents, as a carousel ────────────────────────────────── */}
      <Section id="agents" label="The agents">
        <Glyph
          char="◎"
          rotate={-8}
          opacity={0.04}
          className="-bottom-24 right-0 text-[20rem] lg:text-[26rem]"
        />

        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="font-display text-statement max-w-2xl text-balance text-ink">
              Eight desks, one thesis each.
            </h2>
            <p className="mt-6 max-w-2xl leading-relaxed text-ink-dim">
              Every agent is a wrapper around the same signal with a different risk appetite: what
              counts as a wide enough gap, which asset it watches, and how long it is willing to
              hold through the open. The record below is seeded config until the pools exist on
              chain.
            </p>
          </div>
          <Link href="/explore" className="nav-item">
            All eight →
          </Link>
        </div>

        <AgentCarousel agents={AGENTS} />

        <p className="mt-6 font-mono text-xs leading-relaxed text-ink-faint">
          ⚠ Agent records are seeded configuration. The registry PDA is{" "}
          <span className="text-ink-dim">[b&quot;agent&quot;, agentTokenMint]</span> and this rail
          reads real accounts the moment a DBC pool exists.
        </p>
      </Section>

      {/* ── A warp breath, mid-page ──────────────────────────────────── */}
      {/* The page opens and closes on the warp; this is the same image in the
          middle, used as a change of pace rather than a second hero. */}
      <section className="relative isolate flex min-h-[62svh] items-center overflow-hidden border-t border-edge">
        <WarpField variant="band" lazy className="absolute inset-0 -z-10" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(to bottom, var(--color-void) 0%, color-mix(in srgb, var(--color-void) 55%, transparent) 34%, color-mix(in srgb, var(--color-void) 55%, transparent) 66%, var(--color-void) 100%)",
          }}
        />

        <div className="relative mx-auto max-w-app px-5 py-24 text-center sm:px-8">
          <span className="label">After the bell</span>
          <p className="font-display text-headline mx-auto mt-6 max-w-3xl text-balance text-ink">
            The reference market closes.
            <br />
            <span className="text-signal">The basis doesn&apos;t.</span>
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/explore" className="btn btn-primary btn-lg">
              Explore markets
              <Icon icon={ArrowRight} size={16} />
            </Link>
            <Link href="/launch" className="btn btn-ghost btn-lg">
              Launch an agent
            </Link>
          </div>
        </div>
      </section>

      {/* ── Where the value goes ─────────────────────────────────────── */}
      <Section id="vault" label="Where the value goes">
        <Glyph
          char="%"
          rotate={12}
          opacity={0.04}
          className="-top-20 right-0 text-[20rem] lg:text-[26rem]"
        />

        <div className="relative grid items-center gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
          <div>
            <h2 className="font-display text-statement text-balance text-ink">
              Fees and arbitrage, streamed to stakers.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-ink-dim">
              Every curve trade pays a fee, and every closing trade books a spread. Both land in the
              vault, and the vault pays them out over time — in the wrapped share itself, not in a
              token that tracks it.
            </p>

            <div className="mt-10 space-y-px border border-edge bg-edge">
              {[
                { k: "Income", v: "DBC curve fees + basis capture", icon: Coins },
                { k: "Payout", v: "Streamed pro-rata over time held", icon: Hourglass },
                { k: "Denomination", v: "wPreStock, redeemable 1:1", icon: LockKey },
                { k: "Rule", v: "Snapshot-free. No staking deadline.", icon: ArrowsClockwise },
              ].map((f) => (
                <div
                  key={f.k}
                  className="flex items-center gap-4 bg-void px-5 py-5 sm:justify-between"
                >
                  <span className="flex items-center gap-3">
                    <Icon icon={f.icon} size={16} className="text-signal" />
                    <span className="label">{f.k}</span>
                  </span>
                  <span className="text-sm text-ink-dim sm:text-right">{f.v}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex items-center gap-3">
              <Icon icon={Lightning} size={16} className="text-signal" />
              <p className="font-mono text-xs leading-relaxed text-ink-faint">
                Rewards accrue per slot staked, not per epoch snapshot.
              </p>
            </div>
          </div>

          <div className="panel relative aspect-[5/4] min-h-72 overflow-hidden">
            <DitherChart
              className="absolute inset-0 h-full w-full"
              lines={[
                { data: CURVE_FEES, mode: "area", opacity: 0.95 },
                { data: ARBITRAGE, mode: "area", opacity: 0.45 },
                { data: PAYOUT, mode: "line", tone: "dim", opacity: 0.9 },
              ]}
            />
            <div className="pointer-events-none absolute top-4 left-4">
              <span className="label">Income by source · payout</span>
            </div>
            <div className="pointer-events-none absolute bottom-3 left-4 flex flex-wrap items-center gap-4 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
              <span className="flex items-center gap-1.5 text-signal">
                <span aria-hidden className="size-2 bg-signal" /> Curve fees
              </span>
              <span className="flex items-center gap-1.5 text-signal/60">
                <span aria-hidden className="size-2 bg-signal/60" /> Arbitrage
              </span>
              <span className="flex items-center gap-1.5 text-ink-faint">
                <span aria-hidden className="h-px w-4 bg-ink-faint" /> Payout
              </span>
            </div>
          </div>
        </div>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <Section id="faq" label="Questions">
        <Glyph
          char="?"
          rotate={11}
          opacity={0.04}
          className="-top-14 -right-8 text-[20rem] lg:text-[26rem]"
        />

        <div className="relative grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
          <div>
            <h2 className="font-display text-statement text-balance text-ink">
              The short answers.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-ink-dim">
              Including the two questions most projects leave out: is it deployed, and what can go
              wrong.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <Icon icon={Target} size={16} className="text-signal" />
              <span className="font-mono text-xs text-ink-faint">
                Everything here is checkable on chain.
              </span>
            </div>
          </div>

          <FaqList items={FAQ} />
        </div>
      </Section>
    </>
  );
}
