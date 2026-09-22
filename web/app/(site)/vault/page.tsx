import { RequireWallet } from "@/components/app/require-wallet";
import { VaultPanel } from "@/components/app/vault-panel";

export const metadata = {
  title: "Vault · Offhrs",
  description: "Stake an agent token and claim the fees and gains it earns.",
};

/**
 * The public address of the vault.
 *
 * `/app/vault` is the same surface inside the signed-in shell; this route exists
 * so a link from the marketing site lands somewhere real instead of bouncing
 * through the app. It renders the same panel, gated the same way.
 */
export default function PublicVaultPage() {
  return (
    <section className="mx-auto max-w-app px-5 py-14 sm:px-8 sm:py-20">
      <RequireWallet
        title="Connect your wallet"
        body="Your stake and what it has earned live in your wallet — connect to see them."
      >
        <VaultPanel />
      </RequireWallet>
    </section>
  );
}
