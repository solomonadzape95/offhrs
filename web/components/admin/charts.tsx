"use client";

/**
 * Small, dependency-free charts for the operator console.
 *
 * Everything here is a handful of divs or one SVG path. The design system has no
 * chart library and does not need one: the console plots four honest series, and
 * a library's tooltips and axes would be more chrome than data. Bars are signal;
 * the area is a hairline with a soft fill.
 */

export type Point = { label: string; value: number };

/** A row of bars, anchored to the baseline. */
export function Bars({
  data,
  format = (n) => String(n),
  height = 128,
}: {
  data: Point[];
  format?: (n: number) => string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const empty = data.every((d) => d.value === 0);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative flex items-end gap-[3px]" style={{ height }}>
        {data.map((d, i) => (
          <div
            key={`${d.label}-${i}`}
            className="group relative flex h-full flex-1 items-end"
            title={`${d.label} · ${format(d.value)}`}
          >
            <div
              className={`w-full transition-colors ${
                d.value > 0 ? "bg-signal/55 group-hover:bg-signal" : "bg-edge"
              }`}
              style={{ height: d.value > 0 ? `${Math.max(3, (d.value / max) * 100)}%` : "2px" }}
            />
          </div>
        ))}
        {empty && (
          <span className="absolute inset-0 grid place-items-center font-mono text-[0.625rem] text-ink-faint">
            no data yet
          </span>
        )}
      </div>
      {data.length > 1 && (
        <div className="flex items-center justify-between font-mono text-[0.625rem] text-ink-faint">
          <span>{data[0].label}</span>
          <span>{data[data.length - 1].label}</span>
        </div>
      )}
    </div>
  );
}

/** A cumulative line with a soft fill. */
export function Area({
  data,
  height = 128,
}: {
  data: Point[];
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / max) * 92 - 4;
  const line = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const fill = `0,100 ${line} 100,100`;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative border-b border-l border-edge" style={{ height }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full text-signal"
          aria-hidden
        >
          {data.length > 0 && (
            <>
              <polygon points={fill} fill="currentColor" opacity="0.12" />
              <polyline
                points={line}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>
        {data.length === 0 && (
          <span className="absolute inset-0 grid place-items-center font-mono text-[0.625rem] text-ink-faint">
            no data yet
          </span>
        )}
      </div>
      {data.length > 1 && (
        <div className="flex items-center justify-between font-mono text-[0.625rem] text-ink-faint">
          <span>{data[0].label}</span>
          <span>{data[data.length - 1].label}</span>
        </div>
      )}
    </div>
  );
}

/** A labelled chart panel. */
export function ChartCard({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel flex flex-col gap-5 p-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="label">{label}</span>
          {hint && <span className="font-mono text-[0.625rem] text-ink-faint">{hint}</span>}
        </div>
        {value && <span className="figure text-2xl text-ink">{value}</span>}
      </div>
      {children}
    </div>
  );
}
