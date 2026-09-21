import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { StockVault } from "../target/types/stock_vault";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createInitializeTransferFeeConfigInstruction,
  createInitializeMintInstruction,
  getMintLen,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  createMintToInstruction,
} from "@solana/spl-token";
import { assert } from "chai";

const U64_MAX = 18446744073709551615n; // PreStocks use maximumFee = u64::MAX (uncapped)
const D9 = 10n ** 9n;
const ONE_HUNDRED = 100n * D9;

/** Token-2022 floors the fee as amount * bps / 10_000, capped at maximumFee. */
const expectedFee = (amount: bigint, bps: number) => (amount * BigInt(bps)) / 10_000n;

describe("stock_vault — wrapped PreStock", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.StockVault as Program<StockVault>;
  const connection = provider.connection;
  const admin = provider.wallet as anchor.Wallet;

  const wrapperPda = (prestock: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("wrapper"), prestock.toBuffer()],
      program.programId,
    )[0];

  const reservePda = (wrapper: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("reserve"), wrapper.toBuffer()],
      program.programId,
    )[0];

  /** Create a Token-2022 mint that mimics a real PreStock. */
  async function makePrestock(feeBps: number, decimals = 9): Promise<PublicKey> {
    const mint = Keypair.generate();
    const len = getMintLen([ExtensionType.TransferFeeConfig]);
    const rent = await connection.getMinimumBalanceForRentExemption(len);
    const tx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: admin.publicKey,
        newAccountPubkey: mint.publicKey,
        lamports: rent,
        space: len,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeTransferFeeConfigInstruction(
        mint.publicKey,
        admin.publicKey,
        admin.publicKey,
        feeBps,
        U64_MAX,
        TOKEN_2022_PROGRAM_ID,
      ),
      createInitializeMintInstruction(
        mint.publicKey,
        decimals,
        admin.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
    await provider.sendAndConfirm(tx, [mint]);
    return mint.publicKey;
  }

  async function initWrapper(prestock: PublicKey) {
    const wrapperConfig = wrapperPda(prestock);
    const wrappedMint = Keypair.generate();
    const reserve = reservePda(wrapperConfig);
    await program.methods
      .initializeWrapper()
      .accountsStrict({
        admin: admin.publicKey,
        prestockMint: prestock,
        wrapperConfig,
        wrappedMint: wrappedMint.publicKey,
        reserve,
        prestockTokenProgram: TOKEN_2022_PROGRAM_ID,
        wrappedTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([wrappedMint])
      .rpc();
    return { wrapperConfig, wrappedMint: wrappedMint.publicKey, reserve };
  }

  const ata = (mint: PublicKey, owner: PublicKey, tokenProgram: PublicKey) =>
    getAssociatedTokenAddress(mint, owner, false, tokenProgram);

  /** Create ATAs for both mints, and optionally fund the PreStock ATA. */
  async function setupUser(
    prestock: PublicKey,
    wrappedMint: PublicKey,
    fundAmount: bigint,
  ) {
    const userPrestock = await ata(prestock, admin.publicKey, TOKEN_2022_PROGRAM_ID);
    const userWrapped = await ata(wrappedMint, admin.publicKey, TOKEN_PROGRAM_ID);
    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        admin.publicKey, userPrestock, admin.publicKey, prestock, TOKEN_2022_PROGRAM_ID,
      ),
      createAssociatedTokenAccountInstruction(
        admin.publicKey, userWrapped, admin.publicKey, wrappedMint, TOKEN_PROGRAM_ID,
      ),
      createMintToInstruction(
        prestock, userPrestock, admin.publicKey, fundAmount, [], TOKEN_2022_PROGRAM_ID,
      ),
    );
    await provider.sendAndConfirm(tx);
    return { userPrestock, userWrapped };
  }

  const wrap = (prestock: PublicKey, wrappedMint: PublicKey, wrapperConfig: PublicKey, reserve: PublicKey, userPrestock: PublicKey, userWrapped: PublicKey, amount: bigint) =>
    program.methods
      .wrap(new BN(amount.toString()))
      .accountsStrict({
        user: admin.publicKey,
        prestockMint: prestock,
        wrapperConfig,
        wrappedMint,
        reserve,
        userPrestock,
        userWrapped,
        prestockTokenProgram: TOKEN_2022_PROGRAM_ID,
        wrappedTokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

  // -------------------------------------------------------------------------

  it("mints the RECEIVED delta, not the requested amount (PreStock 50bps)", async () => {
    const prestock = await makePrestock(50);
    const { wrapperConfig, wrappedMint, reserve } = await initWrapper(prestock);
    const { userPrestock, userWrapped } = await setupUser(prestock, wrappedMint, ONE_HUNDRED);

    const requested = ONE_HUNDRED;
    await wrap(prestock, wrappedMint, wrapperConfig, reserve, userPrestock, userWrapped, requested);

    const fee = expectedFee(requested, 50);
    const received = requested - fee;

    const wrappedBal = (await connection.getTokenAccountBalance(userWrapped)).value.amount;
    const reserveBal = (await connection.getTokenAccountBalance(reserve)).value.amount;
    const supply = (await connection.getTokenSupply(wrappedMint)).value.amount;

    assert.equal(wrappedBal, received.toString(), "user must receive net-of-fee");
    assert.equal(reserveBal, received.toString(), "reserve holds exactly what backed it");
    assert.equal(supply, received.toString(), "supply == reserve  (invariant)");

    // The whole point: crediting `requested` would have created unbacked supply.
    assert.notEqual(wrappedBal, requested.toString());

    const cfg = await program.account.wrapperConfig.fetch(wrapperConfig);
    assert.equal(cfg.totalRequestedIn.toString(), requested.toString());
    assert.equal(cfg.totalReceivedIn.toString(), received.toString());
    assert.equal(cfg.totalFeePaidIn.toString(), fee.toString());
    assert.equal(cfg.wrappedDecimals, 9);
  });

  it("is exactly 1:1 when the PreStock charges no fee", async () => {
    const prestock = await makePrestock(0);
    const { wrapperConfig, wrappedMint, reserve } = await initWrapper(prestock);
    const { userPrestock, userWrapped } = await setupUser(prestock, wrappedMint, ONE_HUNDRED);

    await wrap(prestock, wrappedMint, wrapperConfig, reserve, userPrestock, userWrapped, ONE_HUNDRED);

    const wrappedBal = (await connection.getTokenAccountBalance(userWrapped)).value.amount;
    const supply = (await connection.getTokenSupply(wrappedMint)).value.amount;
    assert.equal(wrappedBal, ONE_HUNDRED.toString());
    assert.equal(supply, ONE_HUNDRED.toString());
  });

  it("handles a 100bps PreStock — the rate it will be from epoch 1039", async () => {
    const prestock = await makePrestock(100);
    const { wrapperConfig, wrappedMint, reserve } = await initWrapper(prestock);
    const { userPrestock, userWrapped } = await setupUser(prestock, wrappedMint, ONE_HUNDRED);

    await wrap(prestock, wrappedMint, wrapperConfig, reserve, userPrestock, userWrapped, ONE_HUNDRED);

    const received = ONE_HUNDRED - expectedFee(ONE_HUNDRED, 100);
    const wrappedBal = (await connection.getTokenAccountBalance(userWrapped)).value.amount;
    const supply = (await connection.getTokenSupply(wrappedMint)).value.amount;
    assert.equal(wrappedBal, received.toString());
    assert.equal(supply, received.toString());
  });

  it("unwrap burns and returns PreStock, preserving the invariant", async () => {
    const prestock = await makePrestock(50);
    const { wrapperConfig, wrappedMint, reserve } = await initWrapper(prestock);
    const { userPrestock, userWrapped } = await setupUser(prestock, wrappedMint, ONE_HUNDRED);

    await wrap(prestock, wrappedMint, wrapperConfig, reserve, userPrestock, userWrapped, ONE_HUNDRED);
    const wrappedBefore = BigInt(
      (await connection.getTokenAccountBalance(userWrapped)).value.amount,
    );
    const prestockBefore = BigInt(
      (await connection.getTokenAccountBalance(userPrestock)).value.amount,
    );

    await program.methods
      .unwrap(new BN(wrappedBefore.toString()))
      .accountsStrict({
        user: admin.publicKey,
        prestockMint: prestock,
        wrapperConfig,
        wrappedMint,
        reserve,
        userPrestock,
        userWrapped,
        prestockTokenProgram: TOKEN_2022_PROGRAM_ID,
        wrappedTokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const wrappedAfter = BigInt(
      (await connection.getTokenAccountBalance(userWrapped)).value.amount,
    );
    const prestockAfter = BigInt(
      (await connection.getTokenAccountBalance(userPrestock)).value.amount,
    );
    const supply = BigInt((await connection.getTokenSupply(wrappedMint)).value.amount);
    const reserveBal = BigInt((await connection.getTokenAccountBalance(reserve)).value.amount);

    assert.equal(wrappedAfter, 0n, "all wrapped tokens burned");
    assert.equal(supply, 0n);
    assert.equal(reserveBal, 0n, "reserve fully drained");
    // The user pays the PreStock fee a second time on the way out.
    assert.equal(prestockAfter - prestockBefore, wrappedBefore - expectedFee(wrappedBefore, 50));
  });

  it("refuses to mint against a reserve that did not move (zero amount)", async () => {
    const prestock = await makePrestock(50);
    const { wrapperConfig, wrappedMint, reserve } = await initWrapper(prestock);
    const { userPrestock, userWrapped } = await setupUser(prestock, wrappedMint, ONE_HUNDRED);

    try {
      await wrap(prestock, wrappedMint, wrapperConfig, reserve, userPrestock, userWrapped, 0n);
      assert.fail("should have rejected a zero wrap");
    } catch (e: any) {
      assert.include(e.toString(), "ZeroAmount");
    }
  });

  it("pause halts wrapping, and only the admin can pause", async () => {
    const prestock = await makePrestock(50);
    const { wrapperConfig, wrappedMint, reserve } = await initWrapper(prestock);
    const { userPrestock, userWrapped } = await setupUser(prestock, wrappedMint, ONE_HUNDRED);

    await program.methods
      .setPaused(true)
      .accountsStrict({ admin: admin.publicKey, wrapperConfig })
      .rpc();

    try {
      await wrap(prestock, wrappedMint, wrapperConfig, reserve, userPrestock, userWrapped, D9);
      assert.fail("wrap should have been blocked while paused");
    } catch (e: any) {
      assert.include(e.toString(), "Paused");
    }

    await program.methods
      .setPaused(false)
      .accountsStrict({ admin: admin.publicKey, wrapperConfig })
      .rpc();
    await wrap(prestock, wrappedMint, wrapperConfig, reserve, userPrestock, userWrapped, D9);

    // A non-admin cannot pause.
    const stranger = Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(stranger.publicKey, 1e9),
    );
    try {
      await program.methods
        .setPaused(true)
        .accountsStrict({ admin: stranger.publicKey, wrapperConfig })
        .signers([stranger])
        .rpc();
      assert.fail("stranger should not be able to pause");
    } catch (e: any) {
      assert.include(e.toString(), "Unauthorized");
    }
  });

  it("rejects a classic-SPL PreStock (must be Token-2022)", async () => {
    // A plain SPL mint passed as the PreStock must be refused: the whole design
    // depends on the wrapper sitting on top of a Token-2022 PreStock.
    const mint = Keypair.generate();
    const len = getMintLen([]);
    const rent = await connection.getMinimumBalanceForRentExemption(len);
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: admin.publicKey,
          newAccountPubkey: mint.publicKey,
          lamports: rent,
          space: len,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
          mint.publicKey, 9, admin.publicKey, null, TOKEN_PROGRAM_ID,
        ),
      ),
      [mint],
    );

    const wrapperConfig = wrapperPda(mint.publicKey);
    const wrappedMint = Keypair.generate();
    try {
      await program.methods
        .initializeWrapper()
        .accountsStrict({
          admin: admin.publicKey,
          prestockMint: mint.publicKey,
          wrapperConfig,
          wrappedMint: wrappedMint.publicKey,
          reserve: reservePda(wrapperConfig),
          prestockTokenProgram: TOKEN_PROGRAM_ID, // wrong on purpose
          wrappedTokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([wrappedMint])
        .rpc();
      assert.fail("should reject a non-Token-2022 PreStock");
    } catch (e: any) {
      assert.include(e.toString(), "InvalidPrestockMint");
    }
  });
});
