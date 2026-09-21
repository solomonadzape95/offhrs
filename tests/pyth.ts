import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { StockVault } from "../target/types/stock_vault";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  getMintLen,
} from "@solana/spl-token";
import { assert } from "chai";

/**
 * On-chain Pyth reads, tested against REAL mainnet PriceUpdateV2 accounts
 * replayed into the local validator (see [[test.validator.account]] in
 * Anchor.toml and fixtures/).
 *
 * These are the same accounts Hermes gates behind `pyth-indices` — read
 * permissionlessly, with no API key and no entitlement.
 */
const PYTH_RECEIVER = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

const FIXTURES = {
  aapl: {
    account: new PublicKey("D9uk39pqZMcnmtPP9WeC8cREUpKZmyXLga9mSQ79SphW"),
    feedIdHex: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
    // captured constants from the fixture
    price: 33481590n,
    exponent: -5,
    publishTime: 1789775997, // Friday after-hours close
  },
  btc: {
    account: new PublicKey("4cSM2e6rvbGQUFiJbqytoVMi5GgghSMr8LwVrT9VPSPo"),
    feedIdHex: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    price: 8179151074707n,
    exponent: -8,
    publishTime: 1789834760,
  },
};

const asBytes = (hex: string) => Array.from(Buffer.from(hex, "hex"));

describe("stock_vault — Pyth market signals", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.StockVault as Program<StockVault>;
  const connection = provider.connection;
  const admin = provider.wallet as anchor.Wallet;

  const agentPda = (mint: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("agent"), mint.toBuffer()], program.programId)[0];
  const signalPda = (agent: PublicKey, feedId: number[]) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("signal"), agent.toBuffer(), Buffer.from(feedId)],
      program.programId,
    )[0];

  async function classicMint() {
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
        createInitializeMintInstruction(kp.publicKey, 9, admin.publicKey, null, TOKEN_PROGRAM_ID),
      ),
      [kp],
    );
    return kp.publicKey;
  }

  let agent: PublicKey;

  before(async () => {
    const agentMint = await classicMint();
    const wrappedMint = await classicMint();
    agent = agentPda(agentMint);
    await program.methods
      .registerAgent(admin.publicKey, 500)
      .accountsStrict({
        creator: admin.publicKey,
        agent,
        agentTokenMint: agentMint,
        wrappedMint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  const record = (
    fx: { account: PublicKey; feedIdHex: string },
    maxStaleness: number,
    frozenAfter: number,
  ) =>
    program.methods
      .recordSignal(asBytes(fx.feedIdHex), new BN(maxStaleness), new BN(frozenAfter))
      .accountsStrict({
        authority: admin.publicKey,
        agent,
        priceUpdate: fx.account,
        signal: signalPda(agent, asBytes(fx.feedIdHex)),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

  it("the replayed fixtures are genuine Pyth accounts", async () => {
    for (const fx of Object.values(FIXTURES)) {
      const info = await connection.getAccountInfo(fx.account);
      assert.isNotNull(info, "fixture not loaded into the validator");
      assert.equal(info!.owner.toBase58(), PYTH_RECEIVER.toBase58());
      assert.equal(info!.data.length, 134, "should be a PriceUpdateV2");
    }
  });

  it("decodes a real equity feed on-chain and classifies it as FROZEN", async () => {
    const fx = FIXTURES.aapl;
    // The fixture is a snapshot, so it is legitimately hours old by test time.
    await record(fx, 2_000_000, 3_600);

    const s = await program.account.signal.fetch(signalPda(agent, asBytes(fx.feedIdHex)));
    assert.equal(s.price.toString(), fx.price.toString(), "price decoded from the real account");
    assert.equal(s.exponent, fx.exponent);
    assert.equal(Number(s.publishTime), fx.publishTime, "the Friday after-hours print");
    assert.deepEqual(Object.keys(s.regime), ["frozen"]);
    assert.isAbove(Number(s.stalenessSecs), 3_600);
    assert.equal(
      Number(s.observedAt) - Number(s.publishTime),
      Number(s.stalenessSecs),
      "staleness must be derived from publish_time, not asserted by the caller",
    );
    assert.equal(s.oracle.toBase58(), fx.account.toBase58());
  });

  it("decodes a real crypto feed on-chain", async () => {
    const fx = FIXTURES.btc;
    await record(fx, 2_000_000, 3_600);
    const s = await program.account.signal.fetch(signalPda(agent, asBytes(fx.feedIdHex)));
    assert.equal(s.price.toString(), fx.price.toString());
    assert.equal(s.exponent, -8);
    // $81,791.51
    assert.equal(s.price.toString(), "8179151074707");
  });

  it("classifies as LIVE under a loose frozen threshold", async () => {
    const fx = FIXTURES.aapl;
    await record(fx, 2_000_000, 1_000_000_000); // nothing is ever that stale
    const s = await program.account.signal.fetch(signalPda(agent, asBytes(fx.feedIdHex)));
    assert.deepEqual(Object.keys(s.regime), ["live"]);
  });

  it("refuses a price outside the caller's staleness policy", async () => {
    try {
      await record(FIXTURES.aapl, 10, 3_600); // 10s policy vs an hours-old fixture
      assert.fail("should reject a stale price");
    } catch (e: any) {
      assert.include(e.toString(), "StalePrice");
    }
  });

  it("refuses a Pyth account carrying a different feed id", async () => {
    // Ask for AAPL but hand it the BTC account.
    try {
      await program.methods
        .recordSignal(asBytes(FIXTURES.aapl.feedIdHex), new BN(2_000_000), new BN(3_600))
        .accountsStrict({
          authority: admin.publicKey,
          agent,
          priceUpdate: FIXTURES.btc.account,
          signal: signalPda(agent, asBytes(FIXTURES.aapl.feedIdHex)),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("should reject a mismatched feed id");
    } catch (e: any) {
      assert.include(e.toString(), "PythFeedIdMismatch");
    }
  });

  it("refuses an account not owned by the Pyth receiver", async () => {
    try {
      await program.methods
        .recordSignal(asBytes(FIXTURES.aapl.feedIdHex), new BN(2_000_000), new BN(3_600))
        .accountsStrict({
          authority: admin.publicKey,
          agent,
          priceUpdate: agent, // owned by our program, not Pyth
          signal: signalPda(agent, asBytes(FIXTURES.aapl.feedIdHex)),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("should reject a non-Pyth account");
    } catch (e: any) {
      assert.include(e.toString(), "PythAccountOwnerMismatch");
    }
  });

  it("upserts: a second read overwrites the stored signal", async () => {
    const fx = FIXTURES.aapl;
    const pda = signalPda(agent, asBytes(fx.feedIdHex));

    await record(fx, 2_000_000, 3_600);
    const first = await program.account.signal.fetch(pda);

    await new Promise((r) => setTimeout(r, 1200)); // let observedAt advance
    await record(fx, 2_000_000, 3_600);
    const second = await program.account.signal.fetch(pda);

    assert.isTrue(
      Number(second.observedAt) > Number(first.observedAt),
      "observedAt should advance on re-record",
    );
    assert.equal(second.price.toString(), first.price.toString(), "same fixture, same price");
  });

  it("rejects a signal from someone who is neither creator nor agent signer", async () => {
    const stranger = Keypair.generate();
    await connection.confirmTransaction(await connection.requestAirdrop(stranger.publicKey, 2e9));

    try {
      await program.methods
        .recordSignal(asBytes(FIXTURES.aapl.feedIdHex), new BN(2_000_000), new BN(3_600))
        .accountsStrict({
          authority: stranger.publicKey,
          agent,
          priceUpdate: FIXTURES.aapl.account,
          signal: signalPda(agent, asBytes(FIXTURES.aapl.feedIdHex)),
          systemProgram: SystemProgram.programId,
        })
        .signers([stranger])
        .rpc();
      assert.fail("stranger should not be able to write signals");
    } catch (e: any) {
      assert.include(e.toString(), "Unauthorized");
    }
  });
});
