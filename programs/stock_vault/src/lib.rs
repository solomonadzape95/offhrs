use anchor_lang::prelude::*;

pub mod accum;
pub mod error;
pub mod execution;
pub mod pricing;
pub mod registry;
pub mod signal;
pub mod state;
pub mod vault;
pub mod wrapper;

use execution::*;
use registry::*;
use state::ArbVenue;
use signal::*;
use vault::*;
use wrapper::*;

declare_id!("FoVBZRFCamH1HNMiVpNZV2QJxk9bSxWtQvKgmqZ1rVLw");

/// Angel — `stock_vault`
///
/// Two problems, one program.
///
/// **1. Raw PreStocks are unusable as a DBC quote asset.** They are Token-2022
/// mints carrying a non-zero `transferFeeConfig` (50bps today, 100bps from epoch
/// 1039) plus `permanentDelegate`, `pausableConfig`, `scaledUiAmountConfig` and
/// friends. Meteora's DBC rejects them with `QuoteMintHasNonZeroTransferFee`
/// (6081), and a token badge does not help — a badge cannot authorise a non-zero
/// transfer fee. So we mint a 1:1-backed, zero-fee **classic SPL** wrapper, which
/// is permissionless-supported by DBC. That is what makes a stock-paired bonding
/// curve possible at all.
///
/// **2. Dividends need a vault that cannot be farmed.** `DividendVault` streams
/// wrapped PreStock to `$AGENT` stakers over a duration rather than dropping
/// rewards in as a lump sum, so yield is paid for *time held* and a
/// stake-just-before-the-deposit gets ~nothing.
#[program]
pub mod stock_vault {
    use super::*;

    // ---- PreStock wrapper -------------------------------------------------

    /// Create the wrapper mint + reserve for one PreStock mint.
    pub fn initialize_wrapper(ctx: Context<InitializeWrapper>) -> Result<()> {
        wrapper::initialize_wrapper(ctx)
    }

    /// Deposit raw PreStock, receive `wPreStock` 1:1 on the *received* amount.
    pub fn wrap(ctx: Context<Wrap>, amount: u64) -> Result<()> {
        wrapper::wrap(ctx, amount)
    }

    /// Burn `wPreStock`, receive raw PreStock (less the PreStock transfer fee).
    pub fn unwrap(ctx: Context<Unwrap>, amount: u64) -> Result<()> {
        wrapper::unwrap(ctx, amount)
    }

    /// Circuit breaker. PreStocks can pause PreStock transfers via their
    /// Token-2022 `pausableConfig`; this lets us halt cleanly from our side too.
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        wrapper::set_paused(ctx, paused)
    }

    // ---- registry ---------------------------------------------------------

    /// Register an agent and its revenue split.
    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        agent_signer: Pubkey,
        dynamic_fee_bps: u16,
    ) -> Result<()> {
        registry::register_agent(ctx, agent_signer, dynamic_fee_bps)
    }

    // ---- dividend vault ---------------------------------------------------

    /// Create the staking + reward vault for a registered agent.
    pub fn initialize_vault(ctx: Context<InitializeVault>, min_hold_slots: u64) -> Result<()> {
        vault::initialize_vault(ctx, min_hold_slots)
    }

    /// Stake `$AGENT` to start earning wrapped PreStock.
    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        vault::stake(ctx, amount)
    }

    /// Withdraw `$AGENT`. Accrued rewards stay claimable.
    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        vault::unstake(ctx, amount)
    }

    /// Claim accrued wrapped PreStock (redeemable 1:1 for raw PreStock).
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        vault::claim(ctx)
    }

    /// Route trading fees / arbitrage profits in. Only the agent's creator or
    /// its execution signer may call this. Rewards stream over `duration_slots`.
    pub fn deposit_rewards(
        ctx: Context<DepositRewards>,
        amount: u64,
        duration_slots: u64,
    ) -> Result<()> {
        vault::deposit_rewards(ctx, amount, duration_slots)
    }

    // ---- pyth market signal -----------------------------------------------

    /// Record a Pyth-attested market read (permissionless on-chain read; no API
    /// key or entitlement needed, unlike the gated Hermes equity feeds).
    pub fn record_signal(
        ctx: Context<RecordSignal>,
        expected_feed_id: [u8; 32],
        max_staleness_secs: u64,
        frozen_after_secs: u64,
    ) -> Result<()> {
        signal::record_signal(ctx, expected_feed_id, max_staleness_secs, frozen_after_secs)
    }

    // ---- execution log ----------------------------------------------------

    /// Log an arbitrage execution. Requires the agent's Pyth `Signal`, whose
    /// oracle fields are copied onto the record — so every logged trade is
    /// Pyth-attested and cannot be fabricated.
    pub fn log_arb(
        ctx: Context<LogArb>,
        index: u64,
        amount_in: u64,
        amount_out: u64,
        venue: ArbVenue,
    ) -> Result<()> {
        execution::log_arb(ctx, index, amount_in, amount_out, venue)
    }
}
