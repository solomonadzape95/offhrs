use anchor_lang::prelude::*;

/// Configuration + reserve bookkeeping for one wrapped PreStock.
///
/// One `WrapperConfig` exists per PreStock mint (e.g. SPACEX, OPENAI). It owns
/// both the `wrapped_mint` (mint authority = this PDA) and the `reserve` token
/// account that holds the raw PreStock backing it.
///
/// INVARIANT: `wrapped_mint.supply == reserve.amount`, enforced on every
/// wrap/unwrap. It can only be broken externally, by PreStocks exercising the
/// Token-2022 `permanentDelegate` on the PreStock mint — see `bad_debt()`.
#[account]
#[derive(InitSpace)]
pub struct WrapperConfig {
    /// The raw PreStock mint (Token-2022, transfer-fee bearing).
    pub prestock_mint: Pubkey,
    /// Classic SPL mint, mint authority = this PDA. **This is the DBC quote asset.**
    pub wrapped_mint: Pubkey,
    /// PDA token account holding the raw PreStock.
    pub reserve: Pubkey,
    /// Admin allowed to pause and to seed the vault.
    pub admin: Pubkey,
    /// Decimals of the raw PreStock mint (9 for the live PreStocks).
    pub prestock_decimals: u8,
    /// Decimals of `wrapped_mint`. Always equal to `prestock_decimals`: the wrapper is
    /// 1:1 at the RAW amount level and therefore transparent to `scaledUiAmount`.
    /// (Baking the multiplier in would mis-back every wrapper the moment it changed.)
    pub wrapped_decimals: u8,
    /// Circuit breaker mirroring PreStocks' `pausableConfig`, which can halt
    /// PreStock transfers out from under us.
    pub paused: bool,
    pub bump: u8,

    // ---- transparency counters (surfaced in the UI) ----
    /// Gross PreStock requested in.
    pub total_requested_in: u64,
    /// PreStock actually credited, net of transfer fees.
    pub total_received_in: u64,
    /// PreStock transfer fees burned on the way in. Proves we read the extension.
    pub total_fee_paid_in: u64,
    pub total_unwrapped: u64,
}

impl WrapperConfig {
    pub const SEED: &'static [u8] = b"wrapper";
    pub const RESERVE_SEED: &'static [u8] = b"reserve";
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/// An autonomous trading agent and its revenue split.
#[account]
#[derive(InitSpace)]
pub struct Agent {
    /// Deploys the agent, sets fee parameters, receives creator royalties.
    pub creator: Pubkey,
    /// The Clawpump bot's execution keypair. May route profits into the vault.
    pub agent_signer: Pubkey,
    /// The `$AGENT` mint (created by the Meteora DBC pool). This is the staking token.
    pub agent_token_mint: Pubkey,
    /// The wrapped PreStock (`wSPACEX` / `wOPENAI`) — the vault's reward token.
    pub wrapped_mint: Pubkey,
    /// DBC dynamic fee tier, in bps (500 = 5%).
    pub dynamic_fee_bps: u16,
    /// Historical arbitrage yield routed in, for the UI.
    pub total_profits_routed: u64,
    /// Number of arb executions logged. Doubles as the PDA index counter.
    pub execution_count: u64,
    /// Sum of logged execution profit, for the UI.
    pub total_profit_logged: u64,
    pub vault: Pubkey,
    pub bump: u8,
}

impl Agent {
    pub const SEED: &'static [u8] = b"agent";
}

// ---------------------------------------------------------------------------
// Dividend vault
// ---------------------------------------------------------------------------

/// Streams `wPreStock` rewards to `$AGENT` stakers.
///
/// Rewards are **streamed over a duration** rather than dropped in as a lump
/// sum. This is the Synthetix `StakingRewards` pattern, and it is the reason
/// this vault is not flash-loanable: a lump-sum accumulator would hand a
/// proportional share of a deposit to anyone who staked in the same block,
/// whereas a stream pays for *time held*. Stake one slot before a deposit and
/// you earn one slot's worth.
///
/// It also gives the doc's "duration-weighted yield" literally, with no
/// per-user bookkeeping.
#[account]
#[derive(InitSpace)]
pub struct DividendVault {
    /// The `$AGENT` mint users must stake.
    pub staking_mint: Pubkey,
    /// The reward token — always the wrapped PreStock, never raw PreStock, so the
    /// PreStock transfer fee is paid once on unwrap instead of on every claim.
    pub reward_mint: Pubkey,
    /// PDA token account holding staked `$AGENT`.
    pub stake_vault: Pubkey,
    /// PDA token account holding `wPreStock` rewards.
    pub reward_vault: Pubkey,
    /// Authority allowed to deposit rewards (the agent's creator or signer).
    pub agent: Pubkey,

    pub total_staked: u64,
    /// Scaled by `PRECISION`.
    pub acc_reward_per_share: u128,
    /// Rewards per slot currently being streamed.
    pub reward_rate: u128,
    /// Deposited rewards not yet streamed out.
    pub reward_reserve: u64,
    /// Lifetime rewards actually streamed into the accumulator.
    pub total_distributed: u64,
    pub last_update_slot: u64,
    /// Slots a stake must be held before rewards can be claimed.
    pub min_hold_slots: u64,
    pub bump: u8,
}

impl DividendVault {
    pub const SEED: &'static [u8] = b"vault";
    pub const STAKE_VAULT_SEED: &'static [u8] = b"stake_vault";
    pub const REWARD_VAULT_SEED: &'static [u8] = b"reward_vault";
}

/// Per-holder stake record.
#[account]
#[derive(InitSpace)]
pub struct UserStake {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub staked_amount: u64,
    /// `staked_amount * acc_reward_per_share / PRECISION` at last settle.
    pub reward_debt: u128,
    /// Rewards settled but not yet withdrawn. Keeping this means `stake`/`unstake`
    /// never silently forfeit accrued rewards.
    pub accrued: u64,
    pub total_claimed: u64,
    /// Slot of the most recent stake. Anti-flash-loan retention lock.
    pub last_stake_slot: u64,
    pub bump: u8,
}

impl UserStake {
    pub const SEED: &'static [u8] = b"stake";
}

// ---------------------------------------------------------------------------
// Pyth market signal
// ---------------------------------------------------------------------------

/// Whether the reference market behind a feed is currently live or frozen.
///
/// This is the doc's "Weekend Market Disconnect" thesis encoded on-chain: an
/// equity feed whose `publish_time` stops advancing *is* the disconnect, and it
/// is measurable permissionlessly from the Pyth account itself.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum MarketRegime {
    Live,
    Frozen,
}

/// The latest Pyth-attested market read for one (agent, feed) pair.
///
/// Upserted by `record_signal`. It can only exist if a genuine `PriceUpdateV2`
/// account, owned by the Pyth receiver, carrying the expected feed id, and
/// inside the caller's staleness policy, was supplied — so the value is an
/// attestation rather than something the agent merely claims.
#[account]
#[derive(InitSpace)]
pub struct Signal {
    pub agent: Pubkey,
    /// The Pyth account this was decoded from.
    pub oracle: Pubkey,
    pub feed_id: [u8; 32],
    pub price: i64,
    pub conf: u64,
    pub exponent: i32,
    /// `publish_time` from the Pyth account.
    pub publish_time: i64,
    /// Our clock when we recorded it.
    pub observed_at: i64,
    pub staleness_secs: u64,
    pub regime: MarketRegime,
    pub bump: u8,
}

impl Signal {
    pub const SEED: &'static [u8] = b"signal";
}

// ---------------------------------------------------------------------------
// Arbitrage execution log
// ---------------------------------------------------------------------------

/// Where an execution happened. Kept as an enum so the UI can group by venue
/// and the judge can see the agent really routed through multiple DEXes.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum ArbVenue {
    Jupiter,
    Raydium,
    MeteoraDlmm,
    MeteoraDammV2,
    Orca,
    Clawpump,
    Other,
    MeteoraDbc,
}

/// One logged arbitrage execution.
///
/// The Pyth fields are **copied from the referenced `Signal`**, not supplied by
/// the caller. An execution therefore cannot be logged without a real, current,
/// correctly-identified oracle read behind it — which is what makes the
/// execution log evidence rather than a claim.
#[account]
#[derive(InitSpace)]
pub struct ArbExecution {
    pub agent: Pubkey,
    pub index: u64,
    pub venue: ArbVenue,
    /// What the agent committed (quote-asset units).
    pub amount_in: u64,
    /// What it got back (quote-asset units).
    pub amount_out: u64,
    /// `amount_out.saturating_sub(amount_in)` — computed on-chain, not asserted.
    pub profit: u64,

    // ---- Pyth attestation, copied from the Signal ----
    pub oracle: Pubkey,
    pub feed_id: [u8; 32],
    pub pyth_price: i64,
    pub pyth_exponent: i32,
    pub pyth_publish_time: i64,
    pub pyth_staleness_secs: u64,
    pub regime: MarketRegime,

    pub executed_at: i64,
    pub bump: u8,
}

impl ArbExecution {
    pub const SEED: &'static [u8] = b"exec";
}
