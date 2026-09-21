/**
 * Verify the wallet-scoped position math against a real cluster.
 *
 *   pnpm exec tsx web/scripts/position-check.ts [OWNER]
 *
 * This mirrors `getUserPosition` in `app/actions.ts` (which cannot be imported
 * outside Next because of the `"use server"` boundary) and prints the same
 * numbers, so the server action's arithmetic is checkable against the accounts
 * created by `scripts/devnet-smoke.ts`.
 */
import { fetchAgents, fetchSlot, fetchVaultByPda, fetchUserStake, type OnChainVault } from "../lib/chain";

const PRECISION = 10n ** 12n;
const owner = process.argv[2] ?? "Duzj6WGukxjCesWCEM6uTxZEf6Dhc8LfRGzS6o8xR4HQ";

/** Same projection as `app/actions.ts` — see the comment there. */
function projectAcc(vault: OnChainVault, slot: number): bigint {
  if (vault.totalStaked === 0n) return vault.accRewardPerShare;
  const elapsed = BigInt(Math.max(0, slot - Number(vault.lastUpdateSlot)));
  const payout = vault.rewardRate * elapsed;
  const capped = payout > vault.rewardReserve ? vault.rewardReserve : payout;
  return vault.accRewardPerShare + (capped * PRECISION) / vault.totalStaked;
}

async function main() {
  console.log(`owner ${owner}`);
  const agents = await fetchAgents();
  console.log(`agents ${agents.length}`);

  let totalStaked = 0n;
  let totalAccrued = 0n;
  const slot = await fetchSlot();

  for (const a of agents) {
    const [stake, vault] = await Promise.all([
      fetchUserStake(a.vault, owner).catch(() => null),
      fetchVaultByPda(a.vault).catch(() => null),
    ]);
    const staked = stake?.stakedAmount ?? 0n;
    const acc = vault ? projectAcc(vault, slot) : 0n;
    const debt = stake?.rewardDebt ?? 0n;
    const earned = staked > 0n && acc > 0n ? (staked * acc) / PRECISION : 0n;
    const pending = earned > debt ? earned - debt : 0n;
    const accrued = (stake?.accrued ?? 0n) + pending;

    console.log(
      `  ${a.pda}\n` +
        `    staked=${staked} accrued=${accrued} claimed=${stake?.totalClaimed ?? 0n}` +
        `  (pending=${pending} debt=${debt} acc=${acc})`,
    );
    totalStaked += staked;
    totalAccrued += accrued;
  }

  console.log(`totals staked=${totalStaked} accrued=${totalAccrued}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
