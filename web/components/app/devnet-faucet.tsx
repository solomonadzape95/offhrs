"use client";

import { useState } from "react";
import { ArrowUpRight, Drop } from "@phosphor-icons/react";

import { faucetDevnet } from "@/app/actions";
import { Icon } from "@/components/ui/icon";
import { DEVNET_FAUCET } from "@/lib/devnet";
import { useWalletUi } from "@/lib/wallet";

type State =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; signature: string }
  | { kind: "error"; message: string };

/**
 * Beta-tester on-ramp. Devnet-only, and only rendered to a connected wallet.
 *
 * The server action is the faucet; this only asks for it. The tester keeps using
 * their own wallet — the faucet just sends the tokens a mock devnet has no other
 * way to obtain.
 */
export function DevnetFaucet() {
  const { address } = useWalletUi();
  const [state, setState] = useState<State>({ kind: "idle" });

  if (!DEVNET_FAUCET || !address) return null;

  const onDrop = async () => {
    setState({ kind: "busy" });
    const res = await faucetDevnet(address);
    if ("error" in res) setState({ kind: "error", message: res.error });
    else setState({ kind: "done", signature: res.signature });
  };

  return (
    <div className="panel flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <span className="dither grid size-10 shrink-0 place-items-center border border-edge bg-raised">
          <Icon icon={Drop} size={16} className="text-signal" />
        </span>
        <div>
          <span className="label">Devnet beta</span>
          <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-dim">
            Get test SOL plus mock PreStock and wPreStock for{" "}
            <span className="text-ink">every</span> devnet asset, so you can trade or stake whichever
            one you pick. Switch your wallet to <span className="text-ink">Devnet</span> to see them;
            some wallets need the token mint added by hand.
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
        <button
          type="button"
          onClick={() => void onDrop()}
          disabled={state.kind === "busy"}
          className="btn btn-primary disabled:opacity-50"
        >
          {state.kind === "busy"
            ? "Sending…"
            : state.kind === "done"
              ? "Get more"
              : "Get devnet tokens"}
        </button>
        {state.kind === "done" && (
          <a
            href={`https://solscan.io/tx/${state.signature}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[0.625rem] text-signal"
          >
            {state.signature.slice(0, 16)}… <ArrowUpRight size={11} />
          </a>
        )}
        {state.kind === "error" && (
          <span className="max-w-xs text-right text-xs leading-relaxed text-ember">
            {state.message}
          </span>
        )}
      </div>
    </div>
  );
}
