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
import { FaqList } from "@/components/site/faq";
import { Glyph } from "@/components/site/glyph";
import { MechanicsGrid } from "@/components/site/mechanics";
import { Section } from "@/components/site/section";
import { Stat } from "@/components/site/stat";
import { WarpField } from "@/components/site/warp-field";
import { Icon } from "@/components/ui/icon";
import { AGENTS } from "@/lib/agents";
import { FAQ } from "@/lib/faq";
import { usd } from "@/lib/format";
import { FROZEN_AFTER_SECS, fetchAllPreStocks, readPyth } from "@/lib/market";
import { DitherIcon } from "@/components/ui/dither-icon";

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
 * not become one repeated card. There are no invented figures anywhere: the
 * numbers are read live, and where a graphic would go it is a diagram or a mark,
 * not a fake series.
 */
export default async function Home() {
  const [stocks, regime] = await Promise.all([
    fetchAllPreStocks().catch(() => []),
    readPyth().catch(() => null),
  ]);

  const frozen = regime ? regime.stalenessSecs > FROZEN_AFTER_SECS : false;
  const dislocated = [...stocks].sort(
    (a, b) => Math.abs(b.premiumBps) - Math.abs(a.premiumBps),
  );
  const widest = dislocated[0];

  const tracked = usd(
    stocks.reduce((s, x) => s + x.markValuation, 0),
    { compact: true },
  );

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      {/* One viewport. The header is fixed over the top, so this is 100svh of
          composition rather than "100svh minus a bar". */}
      <div className="relative flex min-h-svh flex-col">
        {/* The claim. Pushed down from the top and given room below, so it and
            the field are two separate moments rather than one crowded screen. */}
        <section className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 pt-40 pb-20 text-center sm:pt-48 sm:pb-24">
          <h1 className="font-display text-display max-w-4xl text-balance text-ink">
            The market is closed.
            <br />
            <span className="text-signal">The gap doesn&apos;t.</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-dim text-pretty sm:text-lg">
            Tokenized shares of private companies trade around the clock. The
            regular stock market doesn&apos;t. Offhrs runs AI agents on the gap
            between the two — and pays the people who back them in the shares
            themselves.
          </p>

          <div className="mt-9 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/waitlist"
              className="btn btn-primary btn-lg w-full sm:w-auto"
            >
              Join the waitlist
            </Link>
            <Link
              href="/explore"
              className="btn btn-ghost btn-lg w-full sm:w-auto"
            >
              Explore markets
            </Link>
          </div>
        </section>

        {/* The field. Taller than the read-out band used to be, and now empty:
            the pattern is the subject, with nothing printed over it. */}
        <section className="relative h-[52svh] min-h-[340px] w-full shrink-0">
          <WarpField className="absolute inset-0" />
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
              Pyth puts each stock&apos;s price on chain with a{" "}
              <span className="font-mono text-ink">publish_time</span> anyone
              can read. When that timestamp stops moving, the real market has
              closed. The tokenized shares keep trading anyway — and that is
              when their prices drift.
            </p>

            <div className="mt-10 grid grid-cols-2 gap-8">
              <Stat
                label="Reference feed"
                value={regime ? (frozen ? "Frozen" : "Live") : "—"}
                tone={regime ? (frozen ? "ember" : "signal") : "default"}
                hint={
                  regime
                    ? `stale ${Math.floor(regime.stalenessSecs / 3600)}h`
                    : "unavailable"
                }
              />
              <Stat
                label="Last print"
                value={
                  regime
                    ? new Date(regime.publishTime * 1000)
                        .toISOString()
                        .slice(11, 16)
                    : "—"
                }
                unit="UTC"
                hint={
                  regime
                    ? new Date(regime.publishTime * 1000)
                        .toISOString()
                        .slice(0, 10)
                    : ""
                }
              />
            </div>
          </div>

          {/* The four headline readings, as a bordered 2×2 block in the space the
              chart used to occupy. */}
          <div className="grid grid-cols-2 gap-px border border-edge bg-edge">
            <div className="bg-void p-6 sm:p-8">
              <Stat
                label="Widest gap"
                value={`${widest?.premiumBps && widest.premiumBps >= 0 ? "+" : ""}${widest?.premiumBps ?? 0}`}
                unit="bps"
                tone="signal"
                hint={widest?.symbol ?? ""}
              />
            </div>
            <div className="bg-void p-6 sm:p-8">
              <Stat
                label="Pre-IPO tracked"
                value={tracked}
                hint={`${stocks.length} assets`}
              />
            </div>
            <div className="bg-void p-6 sm:p-8">
              <Stat
                label="Agents staged"
                value={String(AGENTS.length)}
                hint="registry seeded"
              />
            </div>
            <div className="bg-void p-6 sm:p-8">
              <Stat
                label="Assets with a feed"
                value={regime ? "1" : "—"}
                hint="Pyth equity feed"
              />
            </div>
          </div>
        </div>
      </Section>

      {/* ── The dislocation board ────────────────────────────────────── */}
      <Section id="board" label="The board">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-statement max-w-3xl text-balance text-ink">
            Tokenized shares, priced against their mark.
          </h2>
          <Link href="/explore" className="nav-item">
            All agents →
          </Link>
        </div>

        <div className="panel mt-10 overflow-x-auto rounded-none p-2 sm:p-3">
          <table className="w-full min-w-160 border-collapse">
            <thead>
              <tr className="border-b border-edge">
                {[
                  "Asset",
                  "Official mark",
                  "Token price",
                  "Gap",
                  "Mark value",
                ].map((h, i) => (
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
                <tr key={s.symbol} className="even:bg-signal/5">
                  <td className="py-4 pl-4">
                    <span className="font-mono text-sm text-ink">
                      {s.symbol}
                    </span>
                    <span className="ml-3 text-sm text-ink-faint">
                      {s.name}
                    </span>
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
          The gap is how far the token&apos;s price sits from its official mark.
          Positive means it trades below the mark.
        </p>
      </Section>

      {/* ── Mechanics, as a compact bento ────────────────────────────── */}
      <Section id="mechanics" label="Mechanics">
        <Glyph
          char="↗"
          rotate={9}
          opacity={0.04}
          className="-top-16 -left-12 text-[20rem] lg:text-[26rem]"
        />

        <div className="relative">
          <h2 className="font-display text-statement max-w-3xl text-balance text-ink">
            Three pieces. One of them is what we built.
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
              Four desks, one thesis each.
            </h2>
            <p className="mt-6 max-w-2xl leading-relaxed text-ink-dim">
              Every agent runs the same idea with different settings: how wide
              a gap counts as a trade, which company it watches, and how long
              it will hold through the open. These eight are a preview — they
              become real the moment their pools are on chain.
            </p>
          </div>
          <Link href="/explore" className="nav-item">
            All agents →
          </Link>
        </div>

        <AgentCarousel agents={AGENTS.slice(0, 4)} />

        <p className="mt-6 font-mono text-xs leading-relaxed text-ink-faint">
          ⚠ The eight agents are staged previews. This rail reads real accounts
          the moment each DBC pool exists on chain.
        </p>
      </Section>

      {/* ── A warp breath, mid-page ──────────────────────────────────── */}
      {/* The page opens and closes on the field; this is the same image in the
          middle, used as a change of pace rather than a second hero. */}
      <section className="relative isolate flex min-h-[62svh] items-center overflow-hidden border-t border-edge">
        <WarpField variant="band" lazy className="absolute inset-0 -z-10" />
        {/* One uniform wash, not a gradient. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-void/70"
        />

        <div className="relative mx-auto max-w-app px-5 py-24 text-center sm:px-8">
          <p className="font-display text-headline mx-auto max-w-3xl text-balance text-ink">
            The market is closed.
            <br />
            <span className="text-signal">The gap doesn&apos;t.</span>
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/explore" className="btn btn-primary btn-lg">
              Explore markets
              <Icon icon={ArrowRight} size={16} dither={false} />
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
              Hold the token, earn the shares.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-ink-dim">
              Every trade on an agent&apos;s curve pays a fee, and every trade
              that closes the gap books a gain. Both flow into a pool that pays
              you over time — in the tokenized shares themselves, not in a token
              that tracks them.
            </p>

            <div className="mt-8 flex items-center gap-3">
              <Icon
                icon={Lightning}
                size={16}
                className="text-signal"
                dither={false}
              />
              <p className="font-mono text-xs leading-relaxed text-ink-faint">
                Rewards build up for every moment you hold. No snapshots to game.
              </p>
            </div>
          </div>

          {/* The ledger, moved into the space the chart held and enlarged. */}
          <div className="panel overflow-hidden rounded-none">
            <div className="grid gap-px bg-edge">
              {[
                {
                  k: "Income",
                  v: "Curve fees + gap capture",
                  icon: Coins,
                },
                {
                  k: "Payout",
                  v: "Paid out for how long you hold",
                  icon: Hourglass,
                },
                {
                  k: "Denomination",
                  v: "The wrapped share, redeemable 1:1",
                  icon: LockKey,
                },
                {
                  k: "Rule",
                  v: "No snapshots. No deadline.",
                  icon: ArrowsClockwise,
                },
              ].map((f) => (
                <div
                  key={f.k}
                  className="flex items-center gap-5 bg-void px-6 py-6"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-signal/8 text-signal">
                    <Icon icon={f.icon} size={26} dither={true} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="label">{f.k}</span>
                    <p className="mt-1 text-base leading-snug text-ink-dim">
                      {f.v}
                    </p>
                  </div>
                </div>
              ))}
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
              Including the two questions most projects leave out: is it
              deployed, and what can go wrong.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <Icon
                icon={Target}
                size={16}
                className="text-signal"
                dither={false}
              />
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
