import { RequireWallet } from "@/components/app/require-wallet";
import { VaultPanel } from "@/components/app/vault-panel";

export const metadata = {
  title: "Vault · Offhrs",
  description: "Stake an agent token and claim the fees and spread it earns.",
};

export default function VaultPage() {
  return (
    <section className="mx-auto max-w-app px-5 py-10 sm:px-8 sm:py-14">
      <RequireWallet
        title="Connect to stake"
        body="Your stake and its accrued equity live against your wallet, so there is nothing to show until one is connected."
      >
        <VaultPanel />
      </RequireWallet>
    </section>
  );
}
