import { RequireWallet } from "@/components/app/require-wallet";
import { VaultPanel } from "@/components/app/vault-panel";

export const metadata = {
  title: "Vault · Offhrs",
  description: "Stake an agent token and claim the fees and gains it earns.",
};

export default function VaultPage() {
  return (
    <section className="mx-auto max-w-app px-5 py-10 sm:px-8 sm:py-14">
      <RequireWallet
        title="Connect your wallet"
        body="Your stake and what it has earned live in your wallet — connect to see them."
      >
        <VaultPanel />
      </RequireWallet>
    </section>
  );
}
