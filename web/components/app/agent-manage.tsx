"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useWalletSession } from "@solana/react-hooks";
import { ArrowUpRight, Check, Coins, Copy, Download, Pause, Play } from "@phosphor-icons/react";

import {
  buildCloseAgentTx,
  buildSetPausedTx,
  getAgentSignerPublic,
  revealAgentSigner,
} from "@/app/actions";
import { Curve } from "@/components/app/curve";
import { DitherAvatar } from "@/components/site/dither-avatar";
import { Stat } from "@/components/site/stat";
import { useTheme } from "@/components/site/theme-provider";
import { Icon } from "@/components/ui/icon";
import { AGENT_AVATAR_COLOR } from "@/lib/avatar";
import type { AgentSeed } from "@/lib/agents";
import { compactNumber } from "@/lib/format";
import { useWriteTx } from "@/lib/use-write-tx";
import { useWalletUi } from "@/lib/wallet";

/**
 * Creator view of a single agent.
 *
 * The only "manage" instruction the program actually has is `set_paused` on the
 * **wrapper** — a circuit breaker mirroring PreStocks' `pausableConfig` that
 * halts wrapping/unwrapping, not the agent's trading or the vault. So that is
 * what the control does, and it is labelled as such. Creator fees have no
 * on-chain instruction: Clawpump collects and distributes them, so the button
 * links there rather than pretending to withdraw.
 */
export type ManageData = {
  pda: string;
  agentTokenMint: string;
  totalProfitRouted: string;
  executionCount: number;
  paused: boolean;
};

const fmtWPreStock = (raw: string) => {
  const n = Number(raw) / 1e9;
  if (!Number.isFinite(n) || n === 0) return "0";
  return compactNumber(n);
};

export function AgentManage({ agent, onchain }: { agent: AgentSeed; onchain?: ManageData | null }) {
  const { theme } = useTheme();
  const { address } = useWalletUi();
  const router = useRouter();
  const [hover, setHover] = useState(false);
  const [paused, setPaused] = useState(onchain?.paused ?? false);
  const { state: write, run } = useWriteTx(() => setPaused((p) => !p));
  const closing = useWriteTx(() => router.push("/app/agents"));

  const session = useWalletSession();
  const [signerPublic, setSignerPublic] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ base58: string; json: string } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"public" | "secret" | null>(null);

  useEffect(() => {
    if (!onchain) return;
    let cancelled = false;
    void getAgentSignerPublic(onchain.pda).then((res) => {
      if (!cancelled && "publicKey" in res) setSignerPublic(res.publicKey);
    });
    return () => {
      cancelled = true;
    };
  }, [onchain]);

  const copy = async (text: string, which: "public" | "secret") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      // Clipboard denied — the value is selectable anyway.
    }
  };

  const onReveal = async () => {
    if (!address || !onchain) return;
    setKeyError(null);
    if (!session?.signMessage) {
      setKeyError("This wallet can't sign a message to prove ownership.");
      return;
    }
    setRevealing(true);
    try {
      // A short, agent-specific, recent challenge. The server verifies the
      // signature against the creator, so a spoofed address cannot get the key.
      const issuedAt = Math.floor(Date.now() / 1000);
      const message = `offhrs-reveal-signer:${onchain.agentTokenMint}:${issuedAt}`;
      const signature = await session.signMessage(new TextEncoder().encode(message));
      const signatureBase64 = btoa(String.fromCharCode(...signature));
      const res = await revealAgentSigner(address, onchain.pda, message, signatureBase64);
      if ("error" in res) {
        setKeyError(res.error);
      } else {
        setSecret({ base58: res.secretKey, json: res.secretKeyJson });
        setSignerPublic(res.publicKey);
      }
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevealing(false);
    }
  };

  const downloadKeypair = () => {
    if (!secret) return;
    const blob = new Blob([secret.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(agent.ticker || "agent").toLowerCase()}-signer.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const busy = write.status === "signing" || write.status === "sending";

  const onTogglePause = () => {
    if (!address || !onchain) return;
    void run(() => buildSetPausedTx(address, onchain.pda, !paused));
  };

  const onClose = () => {
    if (!address || !onchain) return;
    if (!window.confirm("Close this agent registration? This cannot be undone.")) return;
    void closing.run(() => buildCloseAgentTx(address, onchain.pda));
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <span
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            className="shrink-0"
          >
            <DitherAvatar
              name={agent.id}
              color={hover ? theme.signal : AGENT_AVATAR_COLOR}
              className="size-16"
            />
          </span>
          <div>
            <span className="label">Manage desk</span>
            <h1 className="font-display mt-2 text-3xl leading-none text-ink sm:text-4xl">
              {agent.name}
            </h1>
            <p className="mt-2 font-mono text-[0.6875rem] tracking-[0.16em] text-ink-faint uppercase">
              {agent.ticker} · {agent.asset}
            </p>
          </div>
        </div>
        <Link href={`/agent/${agent.id}`} className="btn btn-ghost">
          Public terminal
          <Icon icon={ArrowUpRight} size={14} dither={false} />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-10 border-t border-edge pt-10 lg:grid-cols-4">
        <Stat
          label="Curve filled"
          value={`${Math.round(agent.curveProgress * 100)}%`}
          hint="of the bonding curve"
        />
        <Stat
          label="Fee tier"
          value={`${(agent.feeBps / 100).toFixed(1)}%`}
          tone="signal"
          hint="your creator fee"
        />
        <Stat
          label="Fees routed"
          value={onchain ? fmtWPreStock(onchain.totalProfitRouted) : "—"}
          unit={onchain ? "wPreStock" : undefined}
          hint={onchain ? "lifetime, into the vault" : "not on chain"}
        />
        <Stat
          label="Executions"
          value={onchain ? String(onchain.executionCount) : "—"}
          hint={onchain ? "each backed by a price read" : "no agent"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="panel flex flex-col p-6 lg:p-7">
          <span className="label">Curve</span>
          <div className="mt-6">
            <Curve progress={agent.curveProgress} />
          </div>
          <p className="mt-6 text-sm leading-relaxed text-ink-dim">{agent.thesis}</p>
        </div>

        <div className="panel overflow-hidden">
          <div className="grid gap-px bg-edge">
            <div className="flex items-center justify-between gap-4 bg-void px-6 py-5">
              <div>
                <span className="label">Wrapper transfers</span>
                <p className="mt-1 text-sm text-ink-dim">{paused ? "Paused" : "Open"}</p>
              </div>
              <button
                type="button"
                disabled={!onchain || busy}
                onClick={onTogglePause}
                className="btn btn-ghost !px-4 !py-2.5 !text-xs disabled:opacity-50"
              >
                <Icon icon={paused ? Play : Pause} size={14} dither={false} />
                {busy ? "…" : paused ? "Resume" : "Pause"}
              </button>
            </div>
            <div className="flex items-center justify-between gap-4 bg-void px-6 py-5">
              <div>
                <span className="label">Creator fees</span>
                <p className="mt-1 text-sm text-ink-dim">Curve fee on secondary trades</p>
              </div>
              {onchain ? (
                <a
                  href={`https://clawpump.tech/tokens/${onchain.agentTokenMint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary !px-4 !py-2.5 !text-xs"
                >
                  <Icon icon={Coins} size={14} dither={false} />
                  Clawpump
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="btn btn-primary !px-4 !py-2.5 !text-xs disabled:opacity-50"
                >
                  <Icon icon={Coins} size={14} dither={false} />
                  Withdraw
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {onchain && (
        <div className="panel flex flex-col gap-5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="label">Trading key</span>
              <p className="mt-1 max-w-lg text-sm leading-relaxed text-ink-dim">
                Offhrs holds the key that signs this agent&apos;s trades. Copy it if you want to run
                your own bot, or keep it somewhere safe.
              </p>
            </div>
            <span className="border border-signal-dim/60 px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.14em] text-signal uppercase">
              app-owned
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <span className="label">Public key</span>
            <div className="flex items-center gap-3 border border-edge bg-void px-4 py-3">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-dim">
                {signerPublic ?? "—"}
              </span>
              <button
                type="button"
                disabled={!signerPublic}
                onClick={() => signerPublic && void copy(signerPublic, "public")}
                className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[0.625rem] tracking-wider text-ink-faint uppercase transition-colors hover:text-signal disabled:opacity-40"
              >
                <Icon icon={copied === "public" ? Check : Copy} size={11} dither={false} />
                {copied === "public" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {secret ? (
            <div className="flex flex-col gap-2">
              <span className="label">Secret key</span>
              <div className="flex items-center gap-3 border border-ember/40 bg-void px-4 py-3">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">
                  {secret.base58}
                </span>
                <button
                  type="button"
                  onClick={() => void copy(secret.base58, "secret")}
                  className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[0.625rem] tracking-wider text-ink-faint uppercase transition-colors hover:text-signal"
                >
                  <Icon icon={copied === "secret" ? Check : Copy} size={11} dither={false} />
                  {copied === "secret" ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={downloadKeypair}
                  className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[0.625rem] tracking-wider text-ink-faint uppercase transition-colors hover:text-signal"
                >
                  <Icon icon={Download} size={11} dither={false} />
                  File
                </button>
              </div>
              <p className="font-mono text-[0.6875rem] leading-relaxed text-ember">
                Anyone with this key can trade this agent, and it stays valid if you disconnect.
                Don&apos;t paste it anywhere you wouldn&apos;t paste a wallet key.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void onReveal()}
              disabled={revealing}
              className="btn btn-ghost self-start !px-4 !py-2.5 !text-xs disabled:opacity-50"
            >
              {revealing ? "Waiting for signature…" : "Reveal secret key"}
            </button>
          )}

          {keyError && <p className="text-xs leading-relaxed text-ember">{keyError}</p>}
        </div>
      )}

      {onchain && (
        <div className="panel flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="label">Deregister</span>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-dim">
              Close this agent&apos;s registration and return its rent. Only possible while no one
              is staked; the token and its pool are left in place.
            </p>
          </div>
          <button
            type="button"
            disabled={
              !address ||
              closing.state.status === "signing" ||
              closing.state.status === "sending"
            }
            onClick={onClose}
            className="btn btn-ghost shrink-0 !px-4 !py-2.5 !text-xs text-ember disabled:opacity-50"
          >
            {closing.state.status === "signing" || closing.state.status === "sending"
              ? "Closing…"
              : "Close agent"}
          </button>
          {closing.state.status === "error" && (
            <p className="text-xs leading-relaxed text-ember">{closing.state.error}</p>
          )}
        </div>
      )}

      {write.status === "done" && (
        <p className="font-mono text-[0.6875rem] break-all text-signal">
          Confirmed: {write.signature}
        </p>
      )}
      {write.status === "error" && (
        <p className="text-xs leading-relaxed text-ember">{write.error}</p>
      )}

      <p className="font-mono text-xs leading-relaxed text-ink-faint">
        {onchain
          ? "Pause stops wrapping and unwrapping of this asset (admin only) — it does not stop the agent or the vault. Creator fees are handled by Clawpump."
          : "This is a staged preview record — there is no on-chain agent to manage yet."}
      </p>
    </div>
  );
}
