"use client";

import { useEffect, useMemo, useState } from "react";
import { useSolanaClient } from "@solana/react-hooks";

import { buildInitializeVaultTx, buildRegisterAgentTx } from "@/app/actions";
import { Curve } from "@/components/app/curve";
import { CurvePreview } from "@/components/app/curve-preview";
import { preflight, type Check } from "@/lib/deploy";
import { LEAD_ASSETS, orderByLead } from "@/lib/agents";
import { usd } from "@/lib/format";
import type { PreStock } from "@/lib/market";
import { useWriteTx } from "@/lib/use-write-tx";
import { useWalletUi } from "@/lib/wallet";

/**
 * §4 Creator Studio.
 *
 * Five steps, and the fee slider is bounded to the 5–15% the doc specifies
 * because that is the range the DBC config is validated against. The deploy
 * button is inert and says so — the program-side instructions exist
 * (`initialize_wrapper`, `register_agent`, `initialize_vault`) but the DBC pool
 * creation and the wallet signature are not wired yet.
 */
const STEPS = ["Agent", "Token", "Dividend asset", "Curve fee", "Deploy"] as const;

export function LaunchStudio({ assets }: { assets: PreStock[] }) {
  const [step, setStep] = useState(0);

  const [agentSigner, setAgentSigner] = useState("");
  const [agentTokenMint, setAgentTokenMint] = useState("");
  const [minEdge, setMinEdge] = useState("150");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [asset, setAsset] = useState(
    assets.find((a) => a.symbol === LEAD_ASSETS[0])?.symbol ?? assets[0]?.symbol ?? "SPACEX",
  );
  const [feeBps, setFeeBps] = useState(500);

  const orderedAssets = useMemo(() => orderByLead(assets), [assets]);

  const chosen = useMemo(() => assets.find((a) => a.symbol === asset), [assets, asset]);
  const client = useSolanaClient();
  const { address } = useWalletUi();
  const { state: write, run } = useWriteTx();

  // Preflight only runs when it can matter — an RPC round trip per check is not
  // worth spending on step 1 of a form.
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (step !== 4 || !chosen) return;
    let cancelled = false;
    setChecking(true);
    void preflight?.(client, { assetMint: chosen.mint, assetSymbol: chosen.symbol })
      .then((next) => {
        if (!cancelled) setChecks(next);
      })
      .catch(() => {
        if (!cancelled) setChecks(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, chosen, client]);

  const ready = Boolean(checks && checks.every((c) => c.ok === true));
  const canDeploy = Boolean(address && chosen && agentTokenMint.length >= 32 && agentSigner.length >= 32);

  /**
   * Two program-side transactions. The DBC pool that mints the token is
   * Clawpump's, so the mint is an input; we register it and stand up its vault.
   */
  const onDeploy = async () => {
    if (!address || !chosen) return;
    const registered = await run(() =>
      buildRegisterAgentTx(address, agentTokenMint, chosen.mint, agentSigner, feeBps),
    );
    if (registered) {
      await run(() => buildInitializeVaultTx(address, agentTokenMint, chosen.mint, 0));
    }
  };

  const canAdvance =
    (step === 0 && agentSigner.length >= 32 && Number(minEdge) > 0) ||
    (step === 1 && name.length > 1 && symbol.length >= 2) ||
    step === 2 ||
    step === 3 ||
    step === 4;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-8">
        {/* Step rail */}
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                onClick={() => setStep(i)}
                className={`pill ${i === step ? "pill-active" : ""}`}
                aria-current={i === step}
              >
                <span className="mr-2 text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
                {s}
              </button>
            </li>
          ))}
        </ol>

        <div className="panel flex flex-col gap-6 p-6 sm:p-8">
          {step === 0 && (
            <>
              <Head
                t="Agent"
                d="The Clawpump execution keypair and the basis threshold it will trade on."
              />
              <Field label="Agent signer (Clawpump keypair)" hint="base58 public key">
                <input
                  value={agentSigner}
                  onChange={(e) => setAgentSigner(e.target.value.trim())}
                  placeholder="9BmQr4kLhVn2XcWpY7TfAd3sGzE6uJqRoP8vNbC1dHfM"
                  className="w-full border-b border-edge bg-transparent pb-2 font-mono text-sm text-ink outline-none focus:border-signal"
                />
              </Field>
              <Field label="Agent token mint" hint="returned by your Clawpump DBC launch">
                <input
                  value={agentTokenMint}
                  onChange={(e) => setAgentTokenMint(e.target.value.trim())}
                  placeholder="DVdtWw6y8Aet4oLP741ZpYoS5VoGa6Dr11qFWEsfQfwM"
                  className="w-full border-b border-edge bg-transparent pb-2 font-mono text-sm text-ink outline-none focus:border-signal"
                />
              </Field>
              <Field label="Minimum basis to act" hint="bps · net of ~600bps round-trip cost">
                <input
                  value={minEdge}
                  onChange={(e) => setMinEdge(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                  className="tabular w-full border-b border-edge bg-transparent pb-2 font-mono text-sm text-ink outline-none focus:border-signal"
                />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Head t="Token" d="Name, ticker and icon for the agent token." />
              <div className="grid gap-6 sm:grid-cols-2">
                <Field label="Name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Orbital"
                    className="w-full border-b border-edge bg-transparent pb-2 font-mono text-sm text-ink outline-none focus:border-signal"
                  />
                </Field>
                <Field label="Ticker" hint="uppercase, 2-8">
                  <input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase().slice(0, 8))}
                    placeholder="ORB"
                    className="w-full border-b border-edge bg-transparent pb-2 font-mono text-sm text-ink outline-none focus:border-signal"
                  />
                </Field>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Head
                t="Dividend asset"
                d="The PreStock the vault streams. Only the eight PreStocks tokens are eligible."
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {orderedAssets.map((a) => (
                  <button
                    key={a.symbol}
                    onClick={() => setAsset(a.symbol)}
                    className={`flex items-baseline justify-between border px-4 py-3 text-left transition-colors ${
                      asset === a.symbol
                        ? "border-signal-dim bg-signal/8"
                        : "border-edge hover:border-ink-faint"
                    }`}
                  >
                    <span className="font-mono text-sm text-ink">{a.symbol}</span>
                    <span
                      className={`tabular font-mono text-xs ${
                        a.premiumBps > 0 ? "basis-up" : "basis-down"
                      }`}
                    >
                      {a.premiumBps >= 0 ? "+" : ""}
                      {a.premiumBps}bps
                    </span>
                  </button>
                ))}
              </div>
              <p className="font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
                Note: raw PreStocks cannot be a DBC quote mint — they carry a non-zero Token-2022
                transfer fee, which Meteora rejects outright. The pool is quoted in the zero-fee
                wrapper instead.
              </p>
            </>
          )}

          {step === 3 && (
            <>
              <Head t="Curve fee" d="The DBC dynamic fee tier. The vault receives it in wPreStock." />
              <div className="flex items-baseline justify-between">
                <span className="label">Fee tier</span>
                <span className="figure text-2xl text-signal">{(feeBps / 100).toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min={500}
                max={1500}
                step={50}
                value={feeBps}
                onChange={(e) => setFeeBps(Number(e.target.value))}
                className="w-full accent-signal"
              />
              <div className="flex justify-between font-mono text-[0.625rem] text-ink-faint">
                <span>5.0%</span>
                <span>15.0%</span>
              </div>
              <p className="font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
                Set high, this is the agent&apos;s main income. Set low, the token is more tradeable
                but dividends accrue slowly.
              </p>
            </>
          )}

          {step === 4 && (
            <>
              <Head
                t="Deploy"
                d="Three transactions against the vault program, then one against Meteora's DBC."
              />

              {/* Preflight. The useful thing this page can do before a wallet is
                  involved is say precisely what is missing. */}
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <span className="label">Preflight</span>
                  {checking && (
                    <span className="font-mono text-[0.625rem] text-ink-faint">checking chain…</span>
                  )}
                </div>
                <ul className="flex flex-col divide-y divide-edge/60 border-y border-edge/60">
                  {(checks ?? []).map((c) => (
                    <li key={c.id} className="flex items-start gap-3 py-3">
                      <span
                        aria-hidden
                        className={`mt-1.5 block size-1.5 shrink-0 ${
                          c.ok === null ? "bg-ink-faint" : c.ok ? "bg-signal" : "bg-ember"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-ink">{c.label}</span>
                        <span className="mt-0.5 block font-mono text-[0.6875rem] break-words text-ink-faint">
                          {c.detail}
                        </span>
                      </span>
                    </li>
                  ))}
                  {!checks && !checking && (
                    <li className="py-3 font-mono text-xs text-ink-faint">
                      Preflight could not reach the chain.
                    </li>
                  )}
                </ul>
              </div>

              <CurvePreview feeBps={feeBps} symbol={asset} />

              <dl className="flex flex-col gap-3">
                <Row k="Agent signer" v={agentSigner || "—"} />
                <Row k="Token" v={name && symbol ? `${name} ($${symbol})` : "—"} />
                <Row k="Dividend asset" v={asset} />
                <Row k="Curve fee" v={`${(feeBps / 100).toFixed(1)}%`} />
                <Row k="Min basis" v={`${minEdge || "0"}bps`} />
                <Row
                  k="Pool quote mint"
                  v={`w${asset} (zero-fee wrapper)`}
                  hint="raw PreStock is rejected by DBC"
                />
              </dl>

              <button
                disabled={!canDeploy || write.status === "signing" || write.status === "sending"}
                onClick={() => void onDeploy()}
                className="btn btn-primary mt-2 w-full disabled:opacity-50"
              >
                {write.status === "signing"
                  ? "Sign…"
                  : write.status === "sending"
                    ? "Sending…"
                    : "Register agent + create vault"}
              </button>

              {write.status === "done" && (
                <p className="font-mono text-[0.6875rem] break-all text-signal">
                  Confirmed: {write.signature}
                </p>
              )}
              {write.status === "error" && (
                <p className="text-xs leading-relaxed text-ember">{write.error}</p>
              )}

              <p className="font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
                Two transactions: register the agent, then create its dividend vault. The DBC pool
                that mints the token is Clawpump&apos;s — paste the mint it returns above. The
                preflight reports mainnet readiness; the program is live on devnet.
              </p>
            </>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-edge pt-6">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="btn btn-ghost px-4 py-2.5 text-xs disabled:opacity-40"
            >
              Back
            </button>
            <button
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={step === STEPS.length - 1 || !canAdvance}
              className="btn btn-primary px-4 py-2.5 text-xs disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="flex flex-col gap-6">
        <div className="panel flex flex-col gap-5 p-6">
          <span className="label">Preview</span>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="dither grid size-11 place-items-center border border-edge bg-raised font-mono text-[0.6875rem] text-ink-dim"
            >
              {(symbol || "AG").slice(0, 2)}
            </span>
            <div className="flex flex-col">
              <span className="text-base leading-tight text-ink">{name || "Unnamed agent"}</span>
              <span className="font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
                ${symbol || "TOKEN"}
              </span>
            </div>
          </div>

          <span className="border border-signal-dim/60 px-2 py-1 text-center font-mono text-[0.625rem] tracking-[0.14em] text-signal uppercase">
            yields {asset}
          </span>

          <div className="flex items-baseline justify-between border-t border-edge pt-4">
            <span className="label">Mark value</span>
            <span className="tabular font-mono text-sm text-ink-dim">
              {chosen ? usd(chosen.markValuation, { compact: true }) : "—"}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="label">Basis today</span>
            <span
              className={`tabular font-mono text-sm ${
                (chosen?.premiumBps ?? 0) > 0 ? "basis-up" : "basis-down"
              }`}
            >
              {chosen ? `${chosen.premiumBps >= 0 ? "+" : ""}${chosen.premiumBps}bps` : "—"}
            </span>
          </div>

          <Curve progress={0} />
        </div>
      </div>
    </div>
  );
}

function Head({ t, d }: { t: string; d: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl leading-snug font-medium text-ink">{t}</h2>
      <p className="max-w-lg text-sm leading-relaxed text-ink-dim">{d}</p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="label">
        {label}
        {hint && <span className="ml-2 normal-case tracking-normal text-ink-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Row({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-edge/60 pb-2">
      <dt className="label shrink-0">{k}</dt>
      <dd className="truncate font-mono text-xs text-ink-dim">
        {v}
        {hint && <span className="ml-2 text-ink-faint">{hint}</span>}
      </dd>
    </div>
  );
}
