#!/usr/bin/env bash
#
# Deploy stock_vault to a cluster and print status.
#
#   ./scripts/deploy.sh                 # devnet (default)
#   CLUSTER=mainnet-beta ./scripts/deploy.sh
#
# Mainnet needs ~2.9 SOL of rent parked in the program account (refundable on
# close). Devnet is the same but free via the faucet.
set -euo pipefail

export SDKROOT="${SDKROOT:-/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk}"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

CLUSTER="${CLUSTER:-devnet}"
cd "$(dirname "$0")/.."

case "$CLUSTER" in
  mainnet-beta|mainnet) RPC="https://api.mainnet-beta.solana.com" ;;
  devnet)                RPC="https://api.devnet.solana.com" ;;
  *)                     RPC="${RPC:?set RPC for cluster $CLUSTER}" ;;
esac

echo "→ build"
anchor build

echo "→ deploy to $CLUSTER"
anchor deploy --provider.cluster "$CLUSTER"

echo "→ status"
RPC_URL="$RPC" pnpm exec tsx scripts/status.ts
