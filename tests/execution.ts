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
 * The arbitrage execution log. Every record is Pyth-attested: the oracle fields
 * are copied from the agent's `Signal` by the program, never supplied by the
 * caller. These tests prove an execution cannot be fabricated.
 */
const AAPL = {
  account: new PublicKey("D9uk39pqZMcnmtPP9WeC8cREUpKZmyXLga9mSQ79SphW"),
  feedIdHex: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
  price: 33481590n,
  exponent: -5,
};

const asBytes = (hex: string) => Array.from(Buffer.from(hex, "hex"));

describe("stock_vault — arbitrage execution log", () => {
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
  const execPda = (agent: PublicKey, index: number) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(BigInt(index));
    return PublicKey.findProgramAddressSync(
      [Buffer.from("exec"), agent.toBuffer(), b],
      program.programId,
    )[0];
  };

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

  async function newAgent() {
    const agentMint = await classicMint();
    const wrappedMint = await classicMint();
    const agent = agentPda(agentMint);
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
    return agent;
  }

  const recordSignal = (agent: PublicKey) =>
    program.methods
      .recordSignal(asBytes(AAPL.feedIdHex), new BN(2_000_000), new BN(3_600))
      .accountsStrict({
        authority: admin.publicKey,
        agent,
        priceUpdate: AAPL.account,
        signal: signalPda(agent, asBytes(AAPL.feedIdHex)),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

  const logArb = (
    agent: PublicKey,
    index: number,
    amountIn: bigint,
    amountOut: bigint,
    venue: any = { meteoraDlmm: {} },
  ) =>
    program.methods
      .logArb(new BN(index), new BN(amountIn.toString()), new BN(amountOut.toString()), venue)
      .accountsStrict({
        authority: admin.publicKey,
        agent,
        signal: signalPda(agent, asBytes(AAPL.feedIdHex)),
        execution: execPda(agent, index),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

  let agent: PublicKey;

  before(async () => {
    agent = await newAgent();
    await recordSignal(agent);
  });

  it("logs an execution and copies the Pyth attestation from the Signal", async () => {
    const inAmt = 1_000_000_000n;
    const outAmt = 1_012_500_000n;
    await logArb(agent, 0, inAmt, outAmt, { meteoraDlmm: {} });

    const e = await program.account.arbExecution.fetch(execPda(agent, 0));
    const s = await program.account.signal.fetch(signalPda(agent, asBytes(AAPL.feedIdHex)));

    assert.equal(e.amountIn.toString(), inAmt.toString());
    assert.equal(e.amountOut.toString(), outAmt.toString());
    assert.equal(e.profit.toString(), "12500000", "profit is derived on-chain");
    assert.deepEqual(Object.keys(e.venue), ["meteoraDlmm"]);

    // The attestation must be identical to the signal's, not caller-supplied.
    assert.equal(e.oracle.toBase58(), s.oracle.toBase58());
    assert.equal(e.pythPrice.toString(), s.price.toString());
    assert.equal(e.pythExponent, s.exponent);
    assert.equal(Number(e.pythPublishTime), Number(s.publishTime));
    assert.equal(Number(e.pythStalenessSecs), Number(s.stalenessSecs));
    assert.deepEqual(Object.keys(e.regime), Object.keys(s.regime));
    assert.equal(e.pythPrice.toString(), AAPL.price.toString());
    assert.equal(e.pythExponent, AAPL.exponent);
    assert.equal(e.feedId.length, 32);
  });

  it("advances the agent's counters", async () => {
    const before = await program.account.agent.fetch(agent);
    await logArb(agent, 1, 5n, 7n, { jupiter: {} });
    const after = await program.account.agent.fetch(agent);

    assert.equal(Number(after.executionCount), Number(before.executionCount) + 1);
    assert.equal(
      after.totalProfitLogged.toString(),
      (BigInt(before.totalProfitLogged.toString()) + 2n).toString(),
    );
  });

  it("logs a zero-profit leg rather than hiding it", async () => {
    const idx = Number((await program.account.agent.fetch(agent)).executionCount);
    await logArb(agent, idx, 1_000n, 900n, { orca: {} });
    const e = await program.account.arbExecution.fetch(execPda(agent, idx));
    assert.equal(e.profit.toString(), "0", "a losing leg is recorded, not suppressed");
    assert.equal(e.amountIn.toString(), "1000");
    assert.equal(e.amountOut.toString(), "900");
  });

  it("rejects an out-of-order index", async () => {
    try {
      await logArb(agent, 999, 1n, 2n);
      assert.fail("should reject a wrong index");
    } catch (e: any) {
      assert.include(e.toString(), "ExecutionIndexMismatch");
    }
  });

  it("rejects a signal belonging to a different agent", async () => {
    const other = await newAgent();
    await recordSignal(other); // it must genuinely exist, or we'd be testing 'not found'
    const idx = Number((await program.account.agent.fetch(agent)).executionCount);

    try {
      await program.methods
        .logArb(new BN(idx), new BN(1), new BN(2), { other: {} })
        .accountsStrict({
          authority: admin.publicKey,
          agent,
          signal: signalPda(other, asBytes(AAPL.feedIdHex)), // wrong agent's signal
          execution: execPda(agent, idx),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("should reject a foreign signal");
    } catch (e: any) {
      assert.include(e.toString(), "SignalAgentMismatch");
    }
  });

  it("rejects an execution with no Signal account at all", async () => {
    const idx = Number((await program.account.agent.fetch(agent)).executionCount);
    try {
      // Point at an account that is not a Signal (the agent itself).
      await program.methods
        .logArb(new BN(idx), new BN(1), new BN(2), { other: {} })
        .accountsStrict({
          authority: admin.publicKey,
          agent,
          signal: agent as any,
          execution: execPda(agent, idx),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("should reject a non-Signal account");
    } catch (e: any) {
      assert.match(e.toString(), /AccountDiscriminatorMismatch|ConstraintSeeds|AnchorError/);
    }
  });

  it("rejects a log from someone who is neither creator nor agent signer", async () => {
    const stranger = Keypair.generate();
    await connection.confirmTransaction(await connection.requestAirdrop(stranger.publicKey, 2e9));
    const idx = Number((await program.account.agent.fetch(agent)).executionCount);

    try {
      await program.methods
        .logArb(new BN(idx), new BN(1), new BN(2), { other: {} })
        .accountsStrict({
          authority: stranger.publicKey,
          agent,
          signal: signalPda(agent, asBytes(AAPL.feedIdHex)),
          execution: execPda(agent, idx),
          systemProgram: SystemProgram.programId,
        })
        .signers([stranger])
        .rpc();
      assert.fail("stranger should not be able to log executions");
    } catch (e: any) {
      assert.include(e.toString(), "Unauthorized");
    }
  });
});
