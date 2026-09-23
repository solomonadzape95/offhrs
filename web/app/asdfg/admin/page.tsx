"use client";

import Link from "next/link";
import { ArrowUpRight, WarningCircle } from "@phosphor-icons/react";

import { getAdminAgents, getAdminOverview, getAdminStats } from "@/app/asdfg/admin/actions";
import { Area, Bars, ChartCard } from "@/components/admin/charts";
import { Icon } from "@/components/ui/icon";
import { compactAmount, compactNumber, shortAddr } from "@/lib/format";
import { useServerData } from "@/lib/use-server-data";

/**
 * Overview.
 *
 * A bordered bento rather than a row of loose figures: the stake is the largest
 * number on the page and gets a cell three rows tall, while the counters fill the
 * cells around it. Under it, the four series the program can actually support,
 * then the logged/routed/streamed split that explains why a busy agent can still
 * have an empty vault.
 */
export default function AdminOverviewPage() {
  const overview = useServerData("admin:overview", getAdminOverview);
  const stats = useServerData("admin:stats", getAdminStats);
  const agents = useServerData("admin:agents", getAdminAgents);

  const o = overview.status === "ready" ? overview.data : null;
  const s = stats.status === "ready" ? stats.data : null;
  const loading = overview.status === "loading" || stats.status === "loading";

  const nameOf = (id: string) =>
    agents.status === "ready"
      ? (agents.data.find((a) => a.pda === id)?.name ?? shortAddr(id))
      : shortAddr(id);

  const execDays = (s?.days ?? []).map((d) => ({ label: d.day.slice(5), value: d.count }));
  const cumulative = (s?.cumulative ?? []).map((d) => ({
    label: d.day.slice(5),
    value: Number(d.value) / 1e9,
  }));
  const holders = (s?.holdersByAgent ?? []).map((h) => ({
    label: nameOf(h.agentId),
    value: h.holders,
  }));
  const staked = (s?.holdersByAgent ?? []).map((h) => ({
    label: nameOf(h.agentId),
    value: Number(h.staked) / 1e6,
  }));

  const unrouted = s ? Number(s.totals.unrouted) / 1e9 : 0;

  return (
    <div className="flex flex-col gap-12">
      {/* Bordered bento. The stake spans three rows; the rest fill around it. */}
      <div className="grid grid-cols-2 gap-px border border-edge bg-edge lg:grid-cols-4">
        <Cell
          className="lg:row-span-3"
          label="Staked"
          value={s ? compactAmount(s.totals.staked, 6) : "—"}
          unit="$AGENT"
          hint="across every vault"
          big
          loading={loading}
        />
        <Cell
          label="Program"
          value={o ? (o.deployed ? "Live" : "Missing") : "—"}
          hint={o?.cluster}
          tone={o ? (o.deployed ? "signal" : "ember") : "default"}
          loading={loading}
        />
        <Cell
          label="Wrappers"
          value={o ? String(o.counts.wrappers) : "—"}
          hint={o ? `${o.counts.paused} paused` : undefined}
          loading={loading}
        />
        <Cell
          label="Agents"
          value={o ? String(o.counts.agents) : "—"}
          hint={o ? `${o.counts.hidden} hidden` : undefined}
          loading={loading}
        />
        <Cell
          label="Holders"
          value={s ? String(s.totals.holders) : "—"}
          hint="unique wallets"
          loading={loading}
        />
        <Cell
          label="Vaults"
          value={o ? String(o.counts.vaults) : "—"}
          hint="dividend vaults"
          loading={loading}
        />
        <Cell
          label="Waitlist"
          value={o?.waitlist != null ? String(o.waitlist) : "—"}
          hint={o ? `cap ${o.waitlistCap}` : undefined}
          loading={loading}
        />
        <Cell
          label="Executions"
          value={s ? String(s.days.reduce((n, d) => n + d.count, 0)) : "—"}
          hint="logged, all time"
          loading={loading}
        />
        <Cell
          label="Profit logged"
          value={s ? compactAmount(s.totals.logged, 9) : "—"}
          unit="wPreStock"
          hint="sum of execution profit"
          loading={loading}
        />
        <Cell
          label="Streamed"
          value={s ? compactAmount(s.totals.distributed, 9) : "—"}
          unit="wPreStock"
          hint="paid out to stakers"
          loading={loading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          label="Executions logged"
          hint="per day, UTC"
          value={s ? String(s.days.reduce((n, d) => n + d.count, 0)) : undefined}
        >
          {loading ? <ChartSkeleton /> : <Bars data={execDays} />}
        </ChartCard>

        <ChartCard
          label="Profit logged"
          hint="cumulative, in wPreStock"
          value={s ? compactAmount(s.totals.logged, 9) : undefined}
        >
          {loading ? <ChartSkeleton /> : <Area data={cumulative} />}
        </ChartCard>

        <ChartCard
          label="Holders per agent"
          hint="unique staker wallets"
          value={s ? String(s.totals.holders) : undefined}
        >
          {loading ? (
            <ChartSkeleton />
          ) : (
            <Bars data={holders} format={(n) => `${n} holders`} />
          )}
        </ChartCard>

        <ChartCard
          label="Stake per agent"
          hint="raw $AGENT"
          value={s ? compactAmount(s.totals.staked, 6) : undefined}
        >
          {loading ? (
            <ChartSkeleton />
          ) : (
            <Bars data={staked} format={(n) => `${compactNumber(n)} $AGENT`} />
          )}
        </ChartCard>
      </div>

      {/* Logged vs routed: the honest explanation of an empty-looking vault. */}
      <div className="panel flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="dither grid size-10 shrink-0 place-items-center border border-edge bg-raised">
            <Icon icon={WarningCircle} size={16} className="text-signal" />
          </span>
          <div>
            <span className="label">Profit, step by step</span>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-dim">
              Logging a trade and paying it out are two separate on-chain steps.
              <span className="font-mono text-ink"> log_arb</span> writes the record and adds to the
              agent&apos;s total. It moves no money. <span className="font-mono text-ink">deposit_rewards</span>{" "}
              moves the profit into the vault, and only then does it stream to holders. An agent with
              executions and no routed profit has paid nobody yet.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px border border-edge bg-edge lg:grid-cols-4">
          <FlowCell
            label="Logged"
            value={loading ? "—" : compactAmount(s?.totals.logged ?? "0", 9)}
            hint="arb profit on the record"
          />
          <FlowCell
            label="Routed"
            value={loading ? "—" : compactAmount(s?.totals.routed ?? "0", 9)}
            hint="deposited into vaults"
          />
          <FlowCell
            label="Unrouted"
            value={loading ? "—" : compactAmount(s?.totals.unrouted ?? "0", 9)}
            hint="logged, not paid"
            tone={unrouted > 0 ? "ember" : "default"}
          />
          <FlowCell
            label="Streamed"
            value={loading ? "—" : compactAmount(s?.totals.distributed ?? "0", 9)}
            hint="reached holders"
          />
        </div>
        {!loading && unrouted > 0 && (
          <p className="font-mono text-[0.6875rem] leading-relaxed text-ember">
            {compactAmount(s?.totals.unrouted ?? "0", 9)} wPreStock of arb profit is logged but not
            routed, so holders cannot claim it yet.
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Health o={o} loading={overview.status === "loading"} />
        <Funding o={o} loading={overview.status === "loading"} />
      </div>

      <Link
        href="/docs"
        className="inline-flex items-center gap-1.5 self-start font-mono text-xs tracking-wider text-signal uppercase"
      >
        Read the docs <Icon icon={ArrowUpRight} size={12} dither={false} />
      </Link>
    </div>
  );
}

function Cell({
  label,
  value,
  unit,
  hint,
  tone = "default",
  big = false,
  loading,
  className = "",
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: "default" | "signal" | "ember";
  big?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const color = tone === "ember" ? "text-ember" : tone === "signal" ? "text-signal" : "text-ink";
  return (
    <div className={`flex flex-col justify-between gap-8 bg-void p-5 sm:p-6 ${className}`}>
      <span className="label">{label}</span>
      {loading ? (
        <span className="block h-8 w-24 animate-pulse bg-raised" />
      ) : (
        <div className="flex flex-col gap-1.5">
          <span
            className={`figure ${big ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl"} leading-none ${color}`}
          >
            {value}
            {unit && <span className="ml-1.5 text-sm text-ink-faint">{unit}</span>}
          </span>
          {hint && <span className="font-mono text-[0.625rem] text-ink-faint">{hint}</span>}
        </div>
      )}
    </div>
  );
}

function FlowCell({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "ember";
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-void px-5 py-5">
      <span className="label">{label}</span>
      <span
        className={`tabular font-mono text-lg ${tone === "ember" ? "text-ember" : "text-ink"}`}
      >
        {value}
      </span>
      <span className="font-mono text-[0.625rem] text-ink-faint">{hint}</span>
    </div>
  );
}

function Health({
  o,
  loading,
}: {
  o: {
    counts: { invariantBreaks: number; underfundedVaults: number; vaults: number; wrappers: number };
    universeStale: boolean;
    universeCapturedAt: string;
    faucetEnabled: boolean;
    programId: string;
  } | null;
  loading: boolean;
}) {
  return (
    <div className="panel flex flex-col gap-4 p-6">
      <span className="label">Health</span>
      <dl className="flex flex-col divide-y divide-edge/60 border-y border-edge/60">
        <Row
          k="Wrapper backing"
          v={loading || !o ? "—" : o.counts.invariantBreaks === 0 ? "1:1" : `${o.counts.invariantBreaks} broken`}
          tone={o && o.counts.invariantBreaks > 0 ? "ember" : "signal"}
        />
        <Row
          k="Vault solvency"
          v={loading || !o ? "—" : o.counts.underfundedVaults === 0 ? "backed" : `${o.counts.underfundedVaults} short`}
          tone={o && o.counts.underfundedVaults > 0 ? "ember" : "signal"}
        />
        <Row
          k="Issuer API"
          v={o ? (o.universeStale ? `snapshot ${o.universeCapturedAt.slice(0, 10)}` : "live") : "—"}
          tone={o?.universeStale ? "ember" : "default"}
        />
        <Row
          k="Devnet faucet"
          v={o ? (o.faucetEnabled ? "enabled" : "off") : "—"}
          tone={o?.faucetEnabled ? "signal" : "default"}
        />
        <Row k="Program id" v={o ? shortAddr(o.programId, 6) : "—"} mono />
      </dl>
    </div>
  );
}

function Funding({
  o,
  loading,
}: {
  o: { adminBalances: { address: string; sol: number }[] } | null;
  loading: boolean;
}) {
  const best = o ? Math.max(...o.adminBalances.map((b) => b.sol), 0) : 0;
  const funded = best >= 2.9;
  return (
    <div className="panel flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <span className="label">Deploy funding</span>
        <span
          className={`border px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.14em] uppercase ${
            funded ? "border-signal-dim/60 text-signal" : "border-ember/40 text-ember"
          }`}
        >
          {funded ? "ready" : "not funded"}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-ink-dim">
        Operator-only. The deploy needs about 2.9 SOL of account rent.
      </p>
      <div className="flex flex-col divide-y divide-edge/60 border-y border-edge/60">
        {o?.adminBalances.map((b, i) => (
          <div key={b.address} className="flex items-center justify-between gap-4 py-3">
            <span className="font-mono text-xs break-all text-ink-dim">
              {i === 0 ? "deploy wallet" : "operator key"}
            </span>
            <span className="tabular shrink-0 font-mono text-sm text-ink">{b.sol.toFixed(4)} SOL</span>
          </div>
        ))}
        {loading && (
          <div className="py-3">
            <span className="block h-3 w-40 animate-pulse bg-raised" />
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  k,
  v,
  mono,
  tone = "default",
}: {
  k: string;
  v: string;
  mono?: boolean;
  tone?: "default" | "signal" | "ember";
}) {
  const color = tone === "signal" ? "text-signal" : tone === "ember" ? "text-ember" : "text-ink";
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-sm text-ink-dim">{k}</dt>
      <dd className={`text-sm ${color} ${mono ? "font-mono text-xs" : ""}`}>{v}</dd>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex h-32 items-end gap-[3px]">
      {Array.from({ length: 24 }).map((_, i) => (
        <span key={i} className="flex-1 animate-pulse bg-raised" style={{ height: `${20 + (i % 5) * 10}%` }} />
      ))}
    </div>
  );
}
