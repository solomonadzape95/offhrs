"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Call a server action from a client component, cached.
 *
 * The `/app` tabs are separate routes because they read the wallet, but the chain
 * reads themselves happen in server actions (`app/actions.ts`). This is the glue:
 * run the action for a key and keep the three states a page actually renders.
 *
 * It is backed by React Query so the reads survive a route change. Switching from
 * Position to Vault and back reuses the last `getUserPosition` result instead of
 * re-running the `getProgramAccounts` scans, and two components asking for the
 * same key share one in-flight request. A write invalidates the cache, so the
 * figure you just changed is the one you see.
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
  const query = useQuery({
    queryKey: ["server", key],
    queryFn: run,
    enabled: Boolean(key),
  });

  if (!key) return { status: "idle" };
  if (query.isPending) return { status: "loading" };
  if (query.isError) {
    return {
      status: "error",
      error: query.error instanceof Error ? query.error.message : String(query.error),
    };
  }
  return { status: "ready", data: query.data as T };
}
