import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { StockVault } from "../target/types/stock_vault";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  getMintLen,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  createMintToInstruction,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

const D9 = 10n ** 9n;

describe("stock_vault — dividend vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.StockVault as Program<StockVault>;
  const connection = provider.connection;
  const admin = provider.wallet as anchor.Wallet;
  const adminKp = (admin as any).payer as Keypair;

  const agentPda = (mint: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("agent"), mint.toBuffer()], program.programId)[0];
  const vaultPda = (mint: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("vault"), mint.toBuffer()], program.programId)[0];
  const stakeVaultPda = (vault: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("stake_vault"), vault.toBuffer()], program.programId)[0];
  const rewardVaultPda = (vault: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("reward_vault"), vault.toBuffer()], program.programId)[0];
  const userStakePda = (vault: PublicKey, user: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), vault.toBuffer(), user.toBuffer()],
      program.programId,
    )[0];

  /** Local-validator slots advance in real time; wait until `n` have elapsed. */
  async function waitSlots(n: number) {
    const target = (await connection.getSlot()) + n;
    const deadline = Date.now() + 90_000;
    while ((await connection.getSlot()) < target) {
      if (Date.now() > deadline) throw new Error(`timed out waiting ${n} slots`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  async function classicMint(decimals: number) {
    const kp = Keypair.generate();
    const rent = await connection.getMinimumBalanceForRentExemption(getMintLen([]));
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: admin.publicKey,
          newAccountPubkey: kp.publicKey,
          lamports: rent,
          space: getMintLen([]),
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(kp.publicKey, decimals, admin.publicKey, null, TOKEN_PROGRAM_ID),
      ),
      [kp],
    );
    return kp.publicKey;
  }

  const ata = (mint: PublicKey, owner: PublicKey) =>
    getAssociatedTokenAddress(mint, owner, false, TOKEN_PROGRAM_ID);

  /** A funded holder with ATAs for both mints. */
  async function makeHolder(agentMint: PublicKey, rewardMint: PublicKey, agentTokens: bigint) {
    const kp = Keypair.generate();
    await connection.confirmTransaction(await connection.requestAirdrop(kp.publicKey, 3e9));
    const agentAta = await ata(agentMint, kp.publicKey);
    const rewardAta = await ata(rewardMint, kp.publicKey);
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        createAssociatedTokenAccountInstruction(admin.publicKey, agentAta, kp.publicKey, agentMint),
        createAssociatedTokenAccountInstruction(admin.publicKey, rewardAta, kp.publicKey, rewardMint),
        createMintToInstruction(agentMint, agentAta, admin.publicKey, agentTokens, []),
      ),
    );
    return { kp, agentAta, rewardAta };
  }

  /** Fresh agent + vault. Returns everything the tests need. */
  async function setupAgent(minHoldSlots: number) {
    const agentMint = await classicMint(9);
    const rewardMint = await classicMint(9); // stands in for wSPACEX / wOPENAI
    const agent = agentPda(agentMint);
    const vault = vaultPda(agentMint);

    await program.methods
      .registerAgent(admin.publicKey, 500)
      .accountsStrict({
        creator: admin.publicKey,
        agent,
        agentTokenMint: agentMint,
        wrappedMint: rewardMint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .initializeVault(new BN(minHoldSlots))
      .accountsStrict({
        creator: admin.publicKey,
        agent,
        stakingMint: agentMint,
        rewardMint,
        vault,
        stakeVault: stakeVaultPda(vault),
        rewardVault: rewardVaultPda(vault),
        stakingTokenProgram: TOKEN_PROGRAM_ID,
        rewardTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return {
      agentMint,
      rewardMint,
      agent,
      vault,
      stakeVault: stakeVaultPda(vault),
      rewardVault: rewardVaultPda(vault),
    };
  }

  const doStake = (
    s: Awaited<ReturnType<typeof setupAgent>>,
    holder: Awaited<ReturnType<typeof makeHolder>>,
    amount: bigint,
  ) =>
    program.methods
      .stake(new BN(amount.toString()))
      .accountsStrict({
        user: holder.kp.publicKey,
        vault: s.vault,
        stakingMint: s.agentMint,
        stakeVault: s.stakeVault,
        userStakeAccount: holder.agentAta,
        userStake: userStakePda(s.vault, holder.kp.publicKey),
        stakingTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([holder.kp])
      .rpc();

  const doClaim = (s: Awaited<ReturnType<typeof setupAgent>>, holder: Awaited<ReturnType<typeof makeHolder>>) =>
    program.methods
      .claim()
      .accountsStrict({
        user: holder.kp.publicKey,
        vault: s.vault,
        rewardMint: s.rewardMint,
        rewardVault: s.rewardVault,
        userRewardAccount: holder.rewardAta,
        userStake: userStakePda(s.vault, holder.kp.publicKey),
        rewardTokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([holder.kp])
      .rpc();

  const doDeposit = (
    s: Awaited<ReturnType<typeof setupAgent>>,
    amount: bigint,
    durationSlots: number,
    payer: { kp: Keypair; rewardAta: PublicKey } = { kp: adminKp, rewardAta: adminRewardAta! },
  ) =>
    program.methods
      .depositRewards(new BN(amount.toString()), new BN(durationSlots))
      .accountsStrict({
        depositor: payer.kp.publicKey,
        agent: s.agent,
        vault: s.vault,
        rewardMint: s.rewardMint,
        rewardVault: s.rewardVault,
        depositorRewardAccount: payer.rewardAta,
        rewardTokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers(payer.kp === adminKp ? [] : [payer.kp])
      .rpc();

  // The admin needs its own wPreStock ATA to seed rewards from.
  let adminRewardAta: PublicKey | undefined;
  let sharedRewardMint: PublicKey | undefined;

  async function ensureAdminRewardAta(rewardMint: PublicKey) {
    if (sharedRewardMint === rewardMint && adminRewardAta) return adminRewardAta;
    const a = await ata(rewardMint, admin.publicKey);
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        createAssociatedTokenAccountInstruction(admin.publicKey, a, admin.publicKey, rewardMint),
        createMintToInstruction(rewardMint, a, admin.publicKey, 100n * D9, []),
      ),
    );
    adminRewardAta = a;
    sharedRewardMint = rewardMint;
    return a;
  }

  // -------------------------------------------------------------------------

  it("streams rewards to a staker over the deposit duration", async () => {
    const s = await setupAgent(2);
    await ensureAdminRewardAta(s.rewardMint);
    const alice = await makeHolder(s.agentMint, s.rewardMint, 10n * D9);

    await doStake(s, alice, 1n * D9);
    await waitSlots(3); // clear the hold window

    const deposit = 1n * D9;
    await doDeposit(s, deposit, 8);

    await waitSlots(12); // let the whole stream run out

    await doClaim(s, alice);
    const claimed = BigInt((await getAccount(connection, alice.rewardAta)).amount);

    assert.isTrue(claimed > 0n, "should have earned something");
    assert.isTrue(
      claimed <= deposit,
      `must never pay more than was deposited: ${claimed} > ${deposit}`,
    );
    // Allow a couple of slots of slop for real-time slot drift.
    assert.isTrue(
      claimed >= (deposit * 80n) / 100n,
      `expected ~${deposit} after the full duration, got ${claimed}`,
    );

    const v = await program.account.dividendVault.fetch(s.vault);
    assert.equal(v.totalDistributed.toString(), claimed.toString());
    assert.equal(v.rewardReserve.toString(), "0", "stream fully consumed");
  });

  it("pays for TIME HELD — a late staker earns far less than an early one", async () => {
    const s = await setupAgent(2);
    await ensureAdminRewardAta(s.rewardMint);
    const early = await makeHolder(s.agentMint, s.rewardMint, 10n * D9);
    const late = await makeHolder(s.agentMint, s.rewardMint, 10n * D9);

    await doStake(s, early, 1n * D9);
    await waitSlots(3);
    await doDeposit(s, 1n * D9, 20);

    // Let 15 of the 20 slots stream with only `early` present.
    await waitSlots(15);
    await doStake(s, late, 1n * D9);
    await waitSlots(3); // clear `late`'s hold window

    await doClaim(s, early);
    await doClaim(s, late);

    const earlyGot = BigInt((await getAccount(connection, early.rewardAta)).amount);
    const lateGot = BigInt((await getAccount(connection, late.rewardAta)).amount);

    assert.isTrue(lateGot > 0n, "late staker should still earn a little");
    assert.isTrue(
      earlyGot > lateGot * 3n,
      `early holder must dominate: early=${earlyGot} late=${lateGot}`,
    );
    assert.isTrue(
      earlyGot + lateGot <= 1n * D9,
      "vault must stay solvent across both claims",
    );
  });

  it("blocks a stake-then-claim flash loan via the hold window", async () => {
    const s = await setupAgent(10); // 10-slot hold
    await ensureAdminRewardAta(s.rewardMint);
    const alice = await makeHolder(s.agentMint, s.rewardMint, 10n * D9);

    await doStake(s, alice, 1n * D9);
    await doDeposit(s, 1n * D9, 5);

    // Claim in the very next slot — must be refused.
    try {
      await doClaim(s, alice);
      assert.fail("claim should have been locked");
    } catch (e: any) {
      assert.include(e.toString(), "StakeLocked");
    }

    // After the window it succeeds.
    await waitSlots(12);
    await doClaim(s, alice);
    assert.isTrue(BigInt((await getAccount(connection, alice.rewardAta)).amount) > 0n);
  });

  it("keeps accrued rewards when a holder adds stake mid-stream", async () => {
    const s = await setupAgent(2);
    await ensureAdminRewardAta(s.rewardMint);
    const alice = await makeHolder(s.agentMint, s.rewardMint, 10n * D9);

    await doStake(s, alice, 1n * D9);
    await waitSlots(3);
    await doDeposit(s, 1n * D9, 12);
    await waitSlots(6);

    // Top up — this settles first, so nothing accrued is lost.
    await doStake(s, alice, 1n * D9);

    const us = await program.account.userStake.fetch(userStakePda(s.vault, alice.kp.publicKey));
    assert.isTrue(
      BigInt(us.accrued.toString()) > 0n,
      "topping up must not forfeit accrued rewards",
    );

    await waitSlots(12);
    await doClaim(s, alice);
    const claimed = BigInt((await getAccount(connection, alice.rewardAta)).amount);
    assert.isTrue(claimed > 0n && claimed <= 1n * D9);
  });

  it("lets a holder unstake and still claim what they already earned", async () => {
    const s = await setupAgent(2);
    await ensureAdminRewardAta(s.rewardMint);
    const alice = await makeHolder(s.agentMint, s.rewardMint, 10n * D9);

    await doStake(s, alice, 1n * D9);
    await waitSlots(3);
    await doDeposit(s, 1n * D9, 10);
    await waitSlots(6);

    const before = BigInt((await getAccount(connection, alice.agentAta)).amount);

    await program.methods
      .unstake(new BN((1n * D9).toString()))
      .accountsStrict({
        user: alice.kp.publicKey,
        vault: s.vault,
        stakingMint: s.agentMint,
        stakeVault: s.stakeVault,
        userStakeAccount: alice.agentAta,
        userStake: userStakePda(s.vault, alice.kp.publicKey),
        stakingTokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([alice.kp])
      .rpc();

    const after = BigInt((await getAccount(connection, alice.agentAta)).amount);
    assert.equal(after - before, 1n * D9, "principal returned");

    const v = await program.account.dividendVault.fetch(s.vault);
    assert.equal(v.totalStaked.toString(), "0");

    await doClaim(s, alice);
    assert.isTrue(
      BigInt((await getAccount(connection, alice.rewardAta)).amount) > 0n,
      "accrued rewards survive unstaking",
    );
  });

  it("rejects reward deposits from anyone but the creator or agent signer", async () => {
    const s = await setupAgent(2);
    const stranger = await makeHolder(s.agentMint, s.rewardMint, 1n * D9);

    try {
      await doDeposit(s, 1n * D9, 5, { kp: stranger.kp, rewardAta: stranger.rewardAta });
      assert.fail("stranger should not fund the vault");
    } catch (e: any) {
      assert.include(e.toString(), "Unauthorized");
    }
  });

  it("refuses a claim when nothing has accrued", async () => {
    const s = await setupAgent(2);
    const alice = await makeHolder(s.agentMint, s.rewardMint, 10n * D9);

    await doStake(s, alice, 1n * D9);
    await waitSlots(4); // hold window passes, but no rewards were ever deposited

    try {
      await doClaim(s, alice);
      assert.fail("nothing to claim");
    } catch (e: any) {
      assert.include(e.toString(), "NothingToClaim");
    }
  });
});
