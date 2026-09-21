/**
 * A basis reading: the PreStocks SPV mark against the executable market price.
 *
 * Sign carries the colour and the direction word; the number itself stays ink,
 * because a coloured figure plus a coloured arrow plus a coloured badge is three
 * signals for one fact.
 *
 * Positive basis means the token trades *below* its mark — buy and wait for
 * convergence. Negative means it trades above, so there is nothing to capture
 * from the long side.
 */
export function Basis({
  premiumBps,
  size = "md",
}: {
  premiumBps: number;
  size?: "sm" | "md" | "lg";
}) {
  const up = premiumBps > 0;
  const cls = up ? "basis-up" : "basis-down";
  const dir = up ? "below mark" : "above mark";

  const value =
    size === "lg"
      ? "figure text-3xl sm:text-4xl"
      : size === "md"
        ? "tabular font-mono text-sm"
        : "tabular font-mono text-xs";

  return (
    <span className="flex items-baseline gap-2">
      <span className={`${value} ${cls}`}>
        {premiumBps >= 0 ? "+" : ""}
        {premiumBps}bps
      </span>
      {size !== "sm" && (
        <span className="font-mono text-xs text-ink-faint uppercase">{dir}</span>
      )}
    </span>
  );
}
