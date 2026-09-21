"use client";

import { SolanaProvider } from "@solana/react-hooks";
import { createClient, defaultWalletConnectors } from "@solana/client";

import { ThemeProvider } from "@/components/site/theme-provider";
import { ShaderProvider } from "@/components/site/shader-provider";

/**
 * The single Solana client for the app.
 *
 * Module scope, matching framework-kit's documented bootstrap: one client owns
 * the RPC connection, the websocket and the wallet registry, and `autoDiscover`
 * finds whatever Wallet Standard wallets the browser actually has rather than us
 * shipping a list of adapters and hoping. Anything not installed simply does not
 * appear.
 *
 * Defaults to **mainnet**, which is deliberate and slightly unusual. The market
 * data this product is built on only exists there — PreStocks tokens, the Jupiter
 * routes and the Pyth accounts are all mainnet-only — so pointing the client at
 * devnet would give a wallet that cannot see or trade anything the site is about.
 * The `stock_vault` program is the one thing that is not mainnet, and the writes
 * that need it say so instead of failing obscurely.
 */
const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

const websocketEndpoint =
  process.env.NEXT_PUBLIC_SOLANA_WS_URL ??
  endpoint.replace(/^https:/, "wss:").replace(/^http:/, "ws:");

export const solanaClient = createClient({
  endpoint,
  websocketEndpoint,
  // `defaultWalletConnectors()` names Phantom/Solflare/Backpack and adds whatever
  // else registered by this point. It is still a snapshot, though, so it is only
  // the fallback for auto-connect — `useWalletUi` subscribes to the live Wallet
  // Standard registry and feeds that list into `useWalletConnection`.
  walletConnectors: defaultWalletConnectors(),
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ShaderProvider>
        <SolanaProvider
          client={solanaClient}
          /* Remember the last wallet and try it silently on load. Wallets that still
             hold the permission return without a prompt; the ones that do not are
             forgotten rather than re-prompting on every visit. */
          walletPersistence={{ autoConnect: true }}
        >
          {children}
        </SolanaProvider>
      </ShaderProvider>
    </ThemeProvider>
  );
}
