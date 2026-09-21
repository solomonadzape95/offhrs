"use client";

import { useCallback, useState } from "react";
import {
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
} from "@solana/kit";
import { useWalletSession } from "@solana/react-hooks";

import { submitTx } from "@/app/actions";
import type { BuildTxResult } from "@/lib/portfolio";
import { describeWalletError } from "@/lib/wallet";

/**
 * Sign-and-send a server-built transaction.
 *
 * The server builds an unsigned wire transaction (`buildStakeTx` /
 * `buildClaimTx`); this decodes it with kit, hands it to the wallet session to
 * sign, and posts the signed bytes back for the server to relay. The wallet
 * message stays opaque in between — it signs exactly what was built, and no key
 * ever reaches our code.
 */
export type WriteState =
  | { status: "idle" }
  | { status: "signing" }
  | { status: "sending" }
  | { status: "done"; signature: string }
  | { status: "error"; error: string };

export function useWriteTx(onDone?: () => void) {
  const session = useWalletSession();
  const [state, setState] = useState<WriteState>({ status: "idle" });

  const reset = useCallback(() => setState({ status: "idle" }), []);

  const run = useCallback(
    async (build: () => Promise<BuildTxResult>) => {
      if (!session?.signTransaction) {
        setState({
          status: "error",
          error: "This wallet does not support signing transactions in the browser.",
        });
        return;
      }

      setState({ status: "signing" });
      try {
        const built = await build();
        if ("error" in built) throw new Error(built.error);

        const decoded = getTransactionDecoder().decode(getBase64Encoder().encode(built.tx));
        const signed = await session.signTransaction(decoded as never);

        setState({ status: "sending" });
        const wire = getBase64EncodedWireTransaction(signed as never);
        const res = await submitTx(wire);
        if ("error" in res) throw new Error(res.error);

        setState({ status: "done", signature: res.signature });
        onDone?.();
      } catch (e) {
        setState({ status: "error", error: describeWalletError(e) });
      }
    },
    [session, onDone],
  );

  return { state, run, reset };
}
