"use client";

import { useEffect, useMemo, useState } from "react";
import { useSolanaClient, useWalletSession } from "@solana/react-hooks";
import {
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
} from "@solana/kit";

import {
  buildCreateAgentCurveTx,
  buildInitializeVaultTx,
  buildRegisterAgentTx,
  submitTx,
} from "@/app/actions";
import { Curve } from "@/components/app/curve";
import { CurvePreview } from "@/components/app/curve-preview";
import { preflight, type Check } from "@/lib/deploy";
import { LEAD_ASSETS, orderByLead } from "@/lib/agents";
import { usd } from "@/lib/format";
import type { PreStock } from "@/lib/market";
import { describeWalletError, useWalletUi } from "@/lib/wallet";

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
  const session = useWalletSession();

  // Where the `$AGENT` mint comes from. Clawpump is the normal path; the
  // self-owned DBC launch is the fallback if it falls through.
  const [source, setSource] = useState<"clawpump" | "self">("clawpump");
  const [deploy, setDeploy] = useState<
    | { k: "idle" }
    | { k: "busy"; label: string }
    | { k: "done"; mint: string }
    | { k: "error"; error: string }
  >({ k: "idle" });

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
  const canDeploy = Boolean(
    address &&
      chosen &&
      agentSigner.length >= 32 &&
      (source === "self" || agentTokenMint.length >= 32),
  );

  /** Decode a server-built tx, sign it with the wallet, relay it. */
  const signAndSend = async (tx: string): Promise<string> => {
    if (!session?.signTransaction) throw new Error("This wallet cannot sign in the browser.");
    const decoded = getTransactionDecoder().decode(getBase64Encoder().encode(tx));
    const signed = await session.signTransaction(decoded as never);
    const wire = getBase64EncodedWireTransaction(signed as never);
    const res = await submitTx(wire);
    if ("error" in res) throw new Error(res.error);
    return res.signature;
  };

  /**
   * Deploy. Two sources, one outcome: a registered agent with a dividend vault.
   *
   * - **Clawpump:** the mint already exists, so it is register + vault.
   * - **Self-owned:** the app creates the DBC config and pool first (one
   *   transaction), reads the mint DBC created, then registers and vaults it.
   */
  const onDeploy = async () => {
    if (!address || !chosen) return;
    try {
      let mint = agentTokenMint;

      if (source === "self") {
        setDeploy({ k: "busy", label: "Create config + pool…" });
        const curve = await buildCreateAgentCurveTx(address, chosen.mint, name, symbol, feeBps);
        if ("error" in curve) throw new Error(curve.error);
        await signAndSend(curve.tx);
        mint = curve.baseMint;
      }

      setDeploy({ k: "busy", label: "Register agent…" });
      const register = await buildRegisterAgentTx(address, mint, chosen.mint, agentSigner, feeBps);
      if ("error" in register) throw new Error(register.error);
      await signAndSend(register.tx);

      setDeploy({ k: "busy", label: "Create vault…" });
      const vault = await buildInitializeVaultTx(address, mint, chosen.mint, 0);
      if ("error" in vault) throw new Error(vault.error);
      await signAndSend(vault.tx);

      setDeploy({ k: "done", mint });
    } catch (e) {
      setDeploy({ k: "error", error: describeWalletError(e) });
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
                d="Where the token comes from, who signs its trades, and the gap size it acts on."
              />
              <div className="grid grid-cols-2 border border-edge">
                {(
                  [
                    { v: "clawpump", label: "Clawpump token" },
                    { v: "self", label: "Create the curve" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setSource(o.v)}
                    className={`px-3 py-2.5 font-mono text-[0.6875rem] tracking-[0.08em] uppercase transition-colors ${
                      source === o.v ? "bg-raised text-signal" : "text-ink-faint hover:text-ink"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <Field
                label="Agent signer"
                hint={source === "clawpump" ? "Clawpump keypair · base58" : "the keypair the agent trades with · base58"}
              >
                <input
                  value={agentSigner}
                  onChange={(e) => setAgentSigner(e.target.value.trim())}
                  placeholder="9BmQr4kLhVn2XcWpY7TfAd3sGzE6uJqRoP8vNbC1dHfM"
                  className="w-full border-b border-edge bg-transparent pb-2 font-mono text-sm text-ink outline-none focus:border-signal"
                />
              </Field>
              {source === "clawpump" ? (
                <Field label="Agent token mint" hint="returned by your Clawpump DBC launch">
                  <input
                    value={agentTokenMint}
                    onChange={(e) => setAgentTokenMint(e.target.value.trim())}
                    placeholder="DVdtWw6y8Aet4oLP741ZpYoS5VoGa6Dr11qFWEsfQfwM"
                    className="w-full border-b border-edge bg-transparent pb-2 font-mono text-sm text-ink outline-none focus:border-signal"
                  />
                </Field>
              ) : (
                <p className="font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
                  The app will create the Meteora DBC config and pool itself, quoted in w{asset},
                  and the `$AGENT` mint is created in that transaction. Use this only if Clawpump is
                  unavailable.
                </p>
              )}
              <Field label="Minimum gap to act" hint="bps · after ~600bps of round-trip costs">
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
                d="The tokenized share the agent pays out. Only the eight PreStocks tokens are eligible."
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
                Note: the raw shares cannot be used as the pool&apos;s currency — they carry a
                transfer fee, which Meteora rejects. The pool is quoted in the zero-fee wrapper
                instead.
              </p>
            </>
          )}

          {step === 3 && (
            <>
              <Head t="Curve fee" d="What your token charges on each trade. The vault collects it in wPreStock." />
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
                d="Create the pool curve if needed, then register the agent and create its vault."
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
                <Row k="Min gap" v={`${minEdge || "0"}bps`} />
                <Row
                  k="Pool currency"
                  v={`w${asset} (zero-fee wrapper)`}
                  hint="the raw share is rejected by the curve"
                />
              </dl>

              <button
                disabled={!canDeploy || deploy.k === "busy"}
                onClick={() => void onDeploy()}
                className="btn btn-primary mt-2 w-full disabled:opacity-50"
              >
                {deploy.k === "busy"
                  ? deploy.label
                  : source === "self"
                    ? "Create curve + register + vault"
                    : "Register agent + create vault"}
              </button>

              {deploy.k === "done" && (
                <p className="font-mono text-[0.6875rem] leading-relaxed break-all text-signal">
                  Deployed. $AGENT mint: {deploy.mint}
                </p>
              )}
              {deploy.k === "error" && (
                <p className="text-xs leading-relaxed text-ember">{deploy.error}</p>
              )}

              <p className="font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
                {source === "self"
                  ? "Three transactions: create the DBC config and pool, register the agent, then create its dividend vault. The config and mint keypairs are generated and discarded — they have no power after the transaction lands."
                  : "Two transactions: register the agent, then create its dividend vault. The DBC pool that mints the token is Clawpump's — paste the mint it returns above."}{" "}
                The preflight reports mainnet readiness; the program is live on devnet.
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
            <span className="label">Gap today</span>
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
