"use client";

import { useEffect, useState } from "react";

/**
 * Call a server action from a client component, keyed.
 *
 * The `/app` tabs are client components because they read the wallet, but the
 * chain reads themselves happen in a server action (`app/actions.ts`). This is
 * the glue: run the action when the key changes (the wallet address), and keep
 * the three states a page actually renders.
 *
 * `key === null` is the "no wallet yet" case and resolves to `idle` rather than
 * firing a request against a missing address.
 */
export type ServerData<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: string };

export function useServerData<T>(key: string | null, run: () => Promise<T>): ServerData<T> {
  const [state, setState] = useState<ServerData<T>>({ status: "idle" });

  useEffect(() => {
    if (!key) {
      setState({ status: "idle" });
      return;
    }
    let alive = true;
    setState({ status: "loading" });
    run().then(
      (data) => {
        if (alive) setState({ status: "ready", data });
      },
      (e) => {
        if (alive) setState({ status: "error", error: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      alive = false;
    };
    // Keyed on `key` only: `run` is a fresh closure each render and re-running on
    // its identity would loop. The key is the wallet address, which is what
    // actually changes the answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
