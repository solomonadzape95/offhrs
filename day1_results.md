# ANGEL — Day 1 Results (VERIFIED)

`programs/stock_vault` — the wrapped-PreStock program. **7/7 tests green** on a local validator
against Token-2022 mock PreStocks that carry a real transfer fee.

```bash
anchor test        # 7 passing (~14s)
```

## What was built

```
programs/stock_vault/src/
  lib.rs       # #[program] entrypoints + the design rationale
  state.rs     # WrapperConfig
  error.rs     # WrapperError
  wrapper.rs   # initialize_wrapper, wrap, unwrap, set_paused, require_invariant
```

Program id (localnet/devnet): `FoVBZRFCamH1HNMiVpNZV2QJxk9bSxWtQvKgmqZ1rVLw`
Artifacts: `target/deploy/stock_vault.so` (316 KB), `target/idl/stock_vault.json`

**`WrapperConfig`** pairs one PreStock mint with one 0-fee classic SPL wrapper mint and the PDA
reserve that backs it. It also carries transparency counters (`total_requested_in`,
`total_received_in`, `total_fee_paid_in`, `total_unwrapped`) so the UI can show users the real cost
of the PreStock transfer fee instead of hiding it.

## The critical logic, verified

`wrap` credits the **measured reserve delta**, never the requested amount:

```rust
let before = reserve.amount;
transfer_checked(prestock, user -> reserve, amount)?;   // PreStock takes its fee here
reserve.reload()?;
let received = reserve.amount.checked_sub(before)?;     // ◄── what actually arrived
mint_to(wrapped_mint, user_wrapped, received)?;
require_eq!(wrapped_mint.supply, reserve.amount);        // invariant
```

## Test results

| Test | Proves |
|---|---|
| `mints the RECEIVED delta, not the requested amount (50bps)` | 100 in → **99.5** credited; reserve and supply both 99.5; counters record the 0.5 fee. Asserts `wrappedBal != requested` — crediting the request would have created unbacked supply |
| `is exactly 1:1 when the PreStock charges no fee` | the delta path is correct, not accidentally passing |
| `handles a 100bps PreStock` | the rate it becomes at epoch 1039 → 100 in → 99 out |
| `unwrap burns and returns PreStock, preserving the invariant` | supply and reserve both drain to 0; the user pays the fee a second time on the way out |
| `refuses to mint against a reserve that did not move` | zero-amount guard |
| `pause halts wrapping, and only the admin can pause` | `Paused` + `Unauthorized` enforced |
| `rejects a classic-SPL PreStock` | `InvalidPrestockMint` — the wrapper requires a genuine Token-2022 PreStock |

The first and second tests together are what make the delta path *verifiable*: an implementation that
used `amount` instead of `received` would still pass the 0-fee test, so only testing the fee case
would be a false sense of security. Both are required.

## Design decisions encoded

| Decision | Where | Why |
|---|---|---|
| 1:1 at the **raw** amount level | `wrapped_decimals = prestock_decimals` | Transparent to `scaledUiAmount`. Baking SPACEX's multiplier of 5 in would mis-back every wrapper the moment it changed |
| Classic **SPL** wrapper mint | `initialize_wrapper` pins `TOKEN_ID` | This is the entire reason the wrapper exists — Token-2022 is what DBC rejects |
| Mint authority = `wrapper_config` PDA | `mint::authority = wrapper_config` | Supply can never drift from the reserve |
| No freeze authority | `createInitializeMintInstruction(..., null, ...)` in tests | Smaller trust surface |
| Reserve owned by the config PDA | `token::authority = wrapper_config` | Only this program can move the backing |
| `reload()` before reading | `require_invariant` | Anchor's deserialized copies are stale after a CPI |

## Blocker: devnet deploy needs ~0.9 more SOL

Deploying a 316 KB program needs **~2.20 SOL**. Airdrop is rate-limited and the wallet holds
**1.302 SOL**.

Faucet at <https://faucet.solana.com> with:

```
Duzj6WGukxjCesWCEM6uTxZEf6Dhc8LfRGzS6o8xR4HQ
```

Not a blocker for Day 2 (the local validator is sufficient), but it will be needed before the
devnet DBC end-to-end.

## Environment gotcha (cost me a while — recording it)

**`anchor build` fails on this machine with `tapi error: malformed file ... unknown architecture
arm64e.x1-macos`.** This is *not* our code: the CommandLineTools install is self-inconsistent —

```
/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk -> MacOSX27.0.sdk
```

and the installed linker (ld-1267) cannot parse that SDK's `.tbd` files. Even `cc` fails to link
`int main(){return 0;}`. `MacOSX26.5.sdk` and Xcode's SDK both link fine.

Fixed locally in `.cargo/config.toml`:

```toml
[env]
SDKROOT = { value = "/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk", force = false }
```

Remove that if the CLT install is repaired (`xcode-select -s` a full Xcode, or reinstall CLT).

Two smaller ones:

- `anchor init` shells out to `yarn`, which isn't installed — scaffolding still succeeds, only the
  install step fails. We use pnpm.
- The root `package.json` needs `"type": "module"` for the tsx experiments, which breaks ts-mocha's
  CommonJS loader (`ERR_REQUIRE_ESM`). Fixed with a scoped `tests/package.json` containing
  `{"type": "commonjs"}` — Node resolves module type from the nearest `package.json`.
