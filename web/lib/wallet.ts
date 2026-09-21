"use client";

import { useEffect, useState } from "react";
import { watchWalletStandardConnectors, type WalletConnector } from "@solana/client";

import { useWalletConnection, useWalletSession } from "@solana/react-hooks";

/**
 * Wallet UI state, shaped to match the pattern Nebula uses.
 *
 * Framework-kit already owns the connection state, so this is a thin adapter
 * rather than a second store: it normalises the status into the four states the
 * UI actually renders and turns library errors into sentences.
 */

export type WalletUiStatus = "idle" | "connecting" | "connected" | "error";

export type WalletUi = {
  address: string | null;
  connectorId: string | null;
  status: WalletUiStatus;
  /** Human-readable, already-mapped. Null when there is nothing to say. */
  error: string | null;
  connectors: readonly {
    id: string;
    name: string;
    icon?: string;
    ready?: boolean;
    isSupported(): boolean;
  }[];
  connect: (connectorId: string) => Promise<string | null>;
  disconnect: () => Promise<void>;
  /** False during SSR and until wallet discovery has run. Gate rendering on it. */
  isReady: boolean;
};

/**
 * Wallet errors arrive as wallet-standard objects whose `message` is written for
 * a developer reading a console. These are the four a person can actually act on.
 */
export function describeWalletError(cause: unknown, walletName = "That wallet"): string {
  const raw =
    typeof cause === "object" && cause !== null && "message" in cause
      ? String((cause as { message: unknown }).message)
      : String(cause ?? "");

  if (!raw) return `${walletName} could not be reached.`;

  if (/not installed|no provider|undefined is not an object|cannot read|not found/i.test(raw)) {
    return `${walletName} does not seem to be installed in this browser.`;
  }
  if (/reject|denied|declined|cancel/i.test(raw)) {
    return "You declined the request in your wallet.";
  }
  if (/locked/i.test(raw)) {
    return `${walletName} is locked. Unlock it and try again.`;
  }
  if (/insufficient|0x1$|not enough/i.test(raw)) {
    return "Not enough SOL to cover the network fee and rent.";
  }
  if (/blockhash|expired|dropped/i.test(raw)) {
    return "The transaction expired before it landed. Try again.";
  }
  return raw;
}

/**
 * Live Wallet Standard discovery.
 *
 * `autoDiscover()` is a one-shot snapshot taken when its module is evaluated. A
 * wallet that finishes injecting a beat later — Phantom, in practice, next to an
 * already-registered MetaMask — is never seen. The library exposes the watching
 * variant, so subscribe to register/unregister events instead. It emits the
 * current set immediately, so this is populated on the first client render.
 */
function useDiscoveredConnectors(): readonly WalletConnector[] {
  const [connectors, setConnectors] = useState<readonly WalletConnector[]>([]);

  useEffect(() => {
    const stop = watchWalletStandardConnectors((next) => {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[wallet] discovered:", next.map((c) => c.name));
      }
      setConnectors(next);
    });
    return stop;
  }, []);

  return connectors;
}

export function useWalletUi(): WalletUi {
  const discovered = useDiscoveredConnectors();

  // Prefer the live registry; fall back to the client's snapshot until the
  // subscription has emitted.
  const {
    connect: rawConnect,
    connected,
    connecting,
    connectors: snapshotConnectors,
    connectorId,
    disconnect,
    error,
    isReady,
  } = useWalletConnection(discovered.length > 0 ? { connectors: discovered } : undefined);

  const connectors = discovered.length > 0 ? discovered : snapshotConnectors;

  const session = useWalletSession();

  const connect = async (id: string): Promise<string | null> => {
    try {
      const next = await rawConnect(id);
      return next?.account?.address?.toString() ?? null;
    } catch {
      // The error is already in the client store and surfaces through `error`.
      return null;
    }
  };

  const status: WalletUiStatus = connecting
    ? "connecting"
    : connected
      ? "connected"
      : error
        ? "error"
        : "idle";

  const name = connectors.find((c) => c.id === connectorId)?.name;

  return {
    address: session?.account?.address?.toString() ?? null,
    connectorId: connectorId ?? null,
    status,
    error: error ? describeWalletError(error, name) : null,
    connectors,
    connect,
    disconnect,
    isReady: Boolean(isReady),
  };
}

/**
 * Copy for the wallets worth naming, keyed by connector id.
 *
 * Discovery decides what is *available*; this only decides what to *say* about
 * the ones people are most likely to have. Anything not listed still appears,
 * with the wallet's own name and icon and no blurb.
 */
export const WALLET_NOTES: Record<string, { blurb: string; url: string; recommended?: boolean }> = {
  "wallet-standard:phantom": {
    blurb: "The most widely used Solana wallet.",
    url: "https://phantom.app",
    recommended: true,
  },
  "wallet-standard:solflare": {
    blurb: "Extension and mobile, with hardware support.",
    url: "https://solflare.com",
  },
  "wallet-standard:backpack": {
    blurb: "Multi-chain wallet from the Backpack team.",
    url: "https://backpack.app",
  },
  "wallet-standard:glow": {
    blurb: "Lightweight Solana extension.",
    url: "https://glow.app",
  },
};

export const walletNote = (id: string) =>
  WALLET_NOTES[id] ?? { blurb: "", url: "", recommended: false };

export const shortAddress = (a: string, head = 4, tail = 4) =>
  `${a.slice(0, head)}…${a.slice(-tail)}`;
