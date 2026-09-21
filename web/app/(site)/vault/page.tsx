import { RequireWallet } from "@/components/app/require-wallet";
import { VaultPanel } from "@/components/app/vault-panel";

export const metadata = {
  title: "Vault · Offhrs",
  description: "Stake an agent token and claim the fees and spread it earns.",
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
        title="Connect to stake"
        body="Your stake and its accrued equity live against your wallet, so there is nothing to show until one is connected."
      >
        <VaultPanel />
      </RequireWallet>
    </section>
  );
}
