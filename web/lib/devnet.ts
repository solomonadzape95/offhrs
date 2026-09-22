/**
 * Devnet-only affordances.
 *
 * `NEXT_PUBLIC_*` is inlined at build time. The faucet is on by default when the
 * browser client talks to devnet; `NEXT_PUBLIC_DEVNET_FAUCET=false` hides it even
 * there, and `=true` forces it on. The server action still refuses on mainnet, so
 * this flag only decides whether the button renders.
 */
export const DEVNET_FAUCET =
  process.env.NEXT_PUBLIC_DEVNET_FAUCET === "true" ||
  (process.env.NEXT_PUBLIC_DEVNET_FAUCET !== "false" &&
    (process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "").includes("devnet"));
