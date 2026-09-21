# ANGEL — Day 0 De-risk Results (VERIFIED, devnet)

Run: **Sat 19 Sep 2026**. Network: **devnet**. DBC program: `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`
Payer: `E5e932aqdyevqTtywyX6FmFm6CBJkjuzd5Z1hcUpMkSS`

Reproduce with:
```bash
pnpm install
pnpm exec tsx experiments/day0-quote-mint.ts   # the constraint matrix
pnpm exec tsx experiments/day0-pool.ts         # the full working path
```

## Experiment 1 — Can a PreStock-shaped mint be a DBC quote mint?

Source of the constraint (`docs.meteora.ag/core-products/dbc/token-2022-support.md`):
*"A badge does not allow a non-zero transfer fee. Current and any scheduled
`transfer_fee_basis_points` must be `0`."*

| # | Quote mint | Result | Evidence |
|---|---|---|---|
| **A** | Token-2022, transferFee **50bps**, + permanentDelegate + defaultAccountState **← raw PreStock shape** | ❌ **FAIL** | `InstructionError[0, {"Custom":6081}]`<br>`AnchorError thrown in programs/dynamic-bonding-curve/src/utils/token.rs:232`<br>`Error Code: QuoteMintHasNonZeroTransferFee` |
| **B** | Token-2022, transferFee **0bps**, + permanentDelegate (no token badge) | ❌ **FAIL** | `InstructionError[0, {"Custom":6080}]`<br>`Error Code: InvalidTokenBadge` |
| **C** | **classic SPL Token, 0 fee ← wPreStock shape** | ✅ **PASS** | config `2HLNhVyLf4WQXFWFG2yNNKYHY7PgQRsGr1fqzuXAmNEw` |

**Case B is a new finding beyond the docs.** Zeroing the transfer fee is *not sufficient* for
PreStocks — because they also carry `permanentDelegate`, `pausableConfig`, `scaledUiAmountConfig`,
`confidentialTransfer*` and `defaultAccountState`, a Meteora **operator-created token badge** is
*also* required. So "ask PreStocks to drop the fee" would still leave us dependent on Meteora
issuing a badge. The wrapper needs neither, and is fully permissionless.

The error is real program state, not documentation — the enum ships in the SDK IDL:

```js
{ code: 6081, name: "QuoteMintHasNonZeroTransferFee", msg: "Quote mint has a non zero transfer fee" }
{ code: 6080, name: "InvalidTokenBadge",             msg: "Invalid token badge" }
{ code: 6079, name: "CannotCreateTokenBadgeOnSupportedMint", msg: "Cannot create token badge on supported mint" }
```

## Experiment 2 — Does the full stock-paired DBC path work? **YES**

```
wPreStock quote mint : DTVSwoi8PuEdKW34LG4HA6j3zxkh8S8Rjy6UqwPXXRyF   (classic SPL, 0 fee)
config               : GX8DZk7HhSSznq4umucWpBxqcZAxfBEKwV9KPRJzt8mQ
$AGENT base mint     : C3drqranHd9qwhs4PubmGWXYgy72chD7R1WmDZWdcdGh   (created by DBC)
createPool OK        : 2kAewhvWqp5tNdu5Cfw1kdr7vnRvrMQfXnW4WpFiZ6ZE
config.quoteMint     : DTVSwoi8PuEdKW34LG4HA6j3zxkh8S8Rjy6UqwPXXRyF  (== wPreStock ✓)
funded 1 wMOCK       : NJ8NtwEfxoVj5YzsvbiGQxLPRVqZpBGnmx4Ggr7jruF
quote: 0.1 wMOCK -> 6,879,100,349,263 $AGENT (raw)
BUY SWAP OK          : 5CToeygeuafJw5bmQSWvZZT6h2ii1AXUgfT1GSwS3d5Wws5SMVp1VNB9EbPNHHgDq58bKm8XSo1T1orMyUtTUxHr

quote reserve after buy: 95,000,000
```

### The important number: `95,000,000`

0.1 wMOCK went in (`100_000_000` raw, 9 decimals). The quote reserve ended at **95,000,000**.
**5% accrued as trading fees denominated in the stock quote asset.**

That is §6 "Yield Stream A" of the source-of-truth doc — *"every swap pays a cut in tokenized
equity shares"* — **verified working on-chain**, via `CollectFeeMode.QuoteToken`. The doc's
headline mechanic is real; only the *raw PreStock* had to be swapped for a wrapper.

## Integration gotchas discovered (worth encoding so we don't re-hit them)

1. **`base_mint` is `SIGNER, WRITABLE` in `initialize_virtual_pool_with_spl_token`. DBC creates the
   base mint itself.** Pre-creating the `$AGENT` mint causes `SystemError 0x0`
   (`AccountAlreadyInUse`). Just `Keypair.generate()` and pass the pubkey; decimals come from the
   config's `tokenBaseDecimal`.
2. **The base mint keypair must co-sign `createPool`** alongside the payer, or simulation returns
   `SignatureFailure`.
3. **`curve()` must include `migrationFee: { feePercentage, creatorFeePercentage }` when
   `migrationFeeOption: Customizable`**, or the SDK throws
   `Cannot read properties of undefined (reading 'feePercentage')` before it ever reaches the chain.
4. **`buildCurve` takes `percentageSupplyOnMigration` + `migrationQuoteThreshold`** (not a dollar
   threshold). This is the real parameter behind the doc's unsourced "$750" claim, and it is
   denominated in **quote-token units** — i.e. wPreStock, which must be sized against real
   wPreStock liquidity.
5. **web3.js 1.x `simulateTransaction` takes signers, not a config object.** Passing
   `{ sigVerify: false }` throws `Invalid arguments`, and `replaceRecentBlockhash: true` requires
   `accounts`. Also: simulating then sending races devnet blockhash expiry — fetch a fresh
   blockhash immediately before `sendRawTransaction`.
6. Devnet SOL: ~0.07 SOL consumed for the whole experiment. Mainnet wallet is **empty (0 SOL)** —
   needs funding before day 5.

## What this means for the architecture

**Decision: build the wrapper. It is required, not optional, and it is fully permissionless.**

```
real PreStock (Token-2022, 0.5%→1% fee, permanentDelegate, pausable)
        │  wrap()   ← 0.5% fee paid here, once
        ▼
   wPreStock (classic SPL, 0 fee, 1:1 raw-backed)  ──►  DBC quote mint   ✅ proven
        │  unwrap() ← fee paid here, once
        ▼
real PreStock
```

The raw PreStock is **only** ever moved inside the wrapper program. Everything downstream — the
DBC pool, the dividend vault, holder claims — operates on `wPreStock`, which is fee-free and is why
the whole design is permissionless.

**Bonus: this is the PreStocks bounty pitch.** PreStocks are currently unusable as a DBC quote
asset on any launchpad. The wrapper is the missing piece that makes "stock-paired bonding curves"
possible at all. That is a real infrastructure contribution, not a workaround, and it maps directly
onto the bounty's *"new ways to trade or use them through derivatives or DeFi integrations"*.
