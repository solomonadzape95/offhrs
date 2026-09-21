import { utc } from "@/lib/format";

/**
 * The execution / signal terminal.
 *
 * §8 asks for "an interactive terminal window showing the bot's live on-chain
 * arbitrage executions in real time".
 *
 * Rows come in as props. Right now they are built from the agent's **live
 * reasoning** — reading the real Pyth account, the real SPV mark and a real
 * Jupiter quote — because no `$AGENT` pool exists yet, so there are no on-chain
 * executions to show. The `kind` on each row keeps that distinction visible
 * rather than dressing reasoning up as fills, and the same component renders
 * real `ArbExecution` rows unchanged once pools exist.
 */
export type TerminalRow = {
  t: number;
  kind: "info" | "signal" | "attest" | "hold" | "fill";
  text: string;
};

const TONE: Record<TerminalRow["kind"], string> = {
  info: "text-ink-faint",
  signal: "text-ink-dim",
  attest: "text-ink-dim",
  hold: "text-ember",
  fill: "text-signal",
};

const TAG: Record<TerminalRow["kind"], string> = {
  info: "INFO",
  signal: "SIG ",
  attest: "ATT ",
  hold: "HOLD",
  fill: "FILL",
};

export function Terminal({ rows, title = "agent.log" }: { rows: TerminalRow[]; title?: string }) {
  return (
    <div className="terminal scanlines relative flex flex-col">
      {/* Title bar, so it reads as a window rather than a paragraph in a box. */}
      <div className="flex items-center gap-3 border-b border-edge px-4 py-2.5">
        <span aria-hidden className="flex gap-1.5">
          <span className="block size-1.5 bg-edge" />
          <span className="block size-1.5 bg-edge" />
          <span className="block size-1.5 bg-signal" />
        </span>
        <span className="font-mono text-[0.6875rem] tracking-[0.18em] text-ink-faint uppercase">
          {title}
        </span>
        <span className="ml-auto font-mono text-[0.6875rem] text-ink-faint">
          {rows.length} lines
        </span>
      </div>

      <div className="relative max-h-105 overflow-y-auto px-4 py-3">
        {rows.length === 0 ? (
          <p className="text-ink-faint">waiting for the first signal…</p>
        ) : (
          rows.map((r, i) => (
            <div key={i} className="flex gap-3">
              <span className="shrink-0 text-ink-faint">{utc(r.t).slice(11)}</span>
              <span className={`shrink-0 ${TONE[r.kind]}`}>{TAG[r.kind]}</span>
              <span className={`${TONE[r.kind]} break-all whitespace-pre-wrap`}>{r.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
