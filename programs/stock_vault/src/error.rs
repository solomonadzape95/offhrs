use anchor_lang::prelude::*;

#[error_code]
pub enum AngelError {
    // ---- wrapper ----
    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Wrapper is paused")]
    Paused,

    #[msg("PreStock mint must be owned by the Token-2022 program")]
    InvalidPrestockMint,

    #[msg("Wrapped mint must be owned by the classic SPL Token program")]
    InvalidWrappedMint,

    #[msg("Reserve balance decreased during transfer")]
    ReserveWentBackwards,

    #[msg("Nothing received — the PreStock transfer fee consumed the whole amount")]
    NothingReceived,

    #[msg("Invariant violated: wrapped supply != reserve balance")]
    InvariantBroken,

    #[msg("Unauthorized")]
    Unauthorized,

    // ---- registry ----
    #[msg("Mint does not match the agent registration")]
    AgentMintMismatch,

    // ---- dividend vault ----
    #[msg("Vault is not linked to this agent")]
    VaultAgentMismatch,

    #[msg("Nothing to claim")]
    NothingToClaim,

    #[msg("Stake is still inside the anti-flash-loan hold window")]
    StakeLocked,

    #[msg("Insufficient staked balance")]
    InsufficientStake,

    #[msg("Duration must be greater than zero slots")]
    InvalidDuration,

    #[msg("Arithmetic overflow")]
    MathOverflow,

    #[msg("Reward vault holds less than the vault accounting claims")]
    RewardVaultUnderfunded,

    // ---- pyth ----
    #[msg("Pyth price account is not owned by the Pyth receiver program")]
    PythAccountOwnerMismatch,

    #[msg("Pyth account is too small to be a PriceUpdateV2")]
    PythAccountTooSmall,

    #[msg("Pyth account is not a PriceUpdateV2")]
    PythWrongAccountType,

    #[msg("Pyth account carries a different feed id than expected")]
    PythFeedIdMismatch,

    #[msg("Pyth price is older than the caller's staleness policy allows")]
    StalePrice,

    // ---- execution log ----
    #[msg("Signal belongs to a different agent")]
    SignalAgentMismatch,

    #[msg("Execution index does not match the agent's counter")]
    ExecutionIndexMismatch,
}
