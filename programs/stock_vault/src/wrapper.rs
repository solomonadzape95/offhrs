use anchor_lang::prelude::*;
use anchor_spl::token::ID as TOKEN_ID;
use anchor_spl::token_2022::ID as TOKEN_2022_ID;
use anchor_spl::token_interface::{
    burn, mint_to, transfer_checked, Burn, Mint, MintTo, TokenAccount, TokenInterface,
    TransferChecked,
};

use crate::error::AngelError;
use crate::state::WrapperConfig;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct WrapperInitialized {
    pub prestock_mint: Pubkey,
    pub wrapped_mint: Pubkey,
    pub reserve: Pubkey,
    pub decimals: u8,
}

#[event]
pub struct Wrapped {
    pub user: Pubkey,
    /// What the user asked to wrap.
    pub requested: u64,
    /// What was actually credited to them (net of the PreStock transfer fee).
    pub received: u64,
    /// PreStock transfer fee burned by the mint's Token-2022 `transferFeeConfig`.
    pub fee: u64,
}

#[event]
pub struct Unwrapped {
    pub user: Pubkey,
    /// Wrapped tokens burned. The user receives less than this — the PreStock
    /// transfer fee applies again on the way out.
    pub amount: u64,
}

#[event]
pub struct PauseChanged {
    pub paused: bool,
}

// ---------------------------------------------------------------------------
// initialize_wrapper
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitializeWrapper<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// The raw PreStock mint (Token-2022, transfer-fee bearing).
    pub prestock_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        seeds = [WrapperConfig::SEED, prestock_mint.key().as_ref()],
        bump,
        payer = admin,
        space = 8 + WrapperConfig::INIT_SPACE,
    )]
    pub wrapper_config: Account<'info, WrapperConfig>,

    /// The wrapper mint. Deliberately a **classic SPL Token** mint so that it is
    /// permissionless-supported as a Meteora DBC quote mint — this is the whole
    /// reason the wrapper exists. Its mint authority is the `wrapper_config` PDA,
    /// so only this program can ever create supply.
    #[account(
        init,
        payer = admin,
        mint::decimals = prestock_mint.decimals,
        mint::authority = wrapper_config,
        mint::token_program = wrapped_token_program,
    )]
    pub wrapped_mint: InterfaceAccount<'info, Mint>,

    /// PDA token account holding the raw PreStock backing every wrapped token.
    #[account(
        init,
        seeds = [WrapperConfig::RESERVE_SEED, wrapper_config.key().as_ref()],
        bump,
        payer = admin,
        token::mint = prestock_mint,
        token::authority = wrapper_config,
        token::token_program = prestock_token_program,
    )]
    pub reserve: InterfaceAccount<'info, TokenAccount>,

    pub prestock_token_program: Interface<'info, TokenInterface>,
    pub wrapped_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_wrapper(ctx: Context<InitializeWrapper>) -> Result<()> {
    // Pin the programs. A PreStock is Token-2022 by construction, and the wrapper
    // MUST be classic SPL — those are the two halves of the design.
    require_keys_eq!(
        ctx.accounts.prestock_token_program.key(),
        TOKEN_2022_ID,
        AngelError::InvalidPrestockMint
    );
    require_keys_eq!(
        ctx.accounts.wrapped_token_program.key(),
        TOKEN_ID,
        AngelError::InvalidWrappedMint
    );

    let cfg = &mut ctx.accounts.wrapper_config;
    cfg.prestock_mint = ctx.accounts.prestock_mint.key();
    cfg.wrapped_mint = ctx.accounts.wrapped_mint.key();
    cfg.reserve = ctx.accounts.reserve.key();
    cfg.admin = ctx.accounts.admin.key();
    cfg.prestock_decimals = ctx.accounts.prestock_mint.decimals;
    cfg.wrapped_decimals = ctx.accounts.prestock_mint.decimals;
    cfg.paused = false;
    cfg.bump = ctx.bumps.wrapper_config;
    cfg.total_requested_in = 0;
    cfg.total_received_in = 0;
    cfg.total_fee_paid_in = 0;
    cfg.total_unwrapped = 0;

    emit!(WrapperInitialized {
        prestock_mint: cfg.prestock_mint,
        wrapped_mint: cfg.wrapped_mint,
        reserve: cfg.reserve,
        decimals: cfg.wrapped_decimals,
    });

    Ok(())
}

// ---------------------------------------------------------------------------
// wrap
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Wrap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// Raw PreStock mint. Pinned by the `wrapper_config` seeds below.
    #[account(mut)]
    pub prestock_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [WrapperConfig::SEED, prestock_mint.key().as_ref()],
        bump = wrapper_config.bump,
    )]
    pub wrapper_config: Account<'info, WrapperConfig>,

    #[account(
        mut,
        address = wrapper_config.wrapped_mint,
        mint::authority = wrapper_config,
    )]
    pub wrapped_mint: InterfaceAccount<'info, Mint>,

    #[account(mut, address = wrapper_config.reserve)]
    pub reserve: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, token::mint = prestock_mint, token::authority = user)]
    pub user_prestock: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, token::mint = wrapped_mint, token::authority = user)]
    pub user_wrapped: InterfaceAccount<'info, TokenAccount>,

    pub prestock_token_program: Interface<'info, TokenInterface>,
    pub wrapped_token_program: Interface<'info, TokenInterface>,
}

pub fn wrap(ctx: Context<Wrap>, amount: u64) -> Result<()> {
    require!(amount > 0, AngelError::ZeroAmount);
    require!(!ctx.accounts.wrapper_config.paused, AngelError::Paused);
    require_keys_eq!(
        ctx.accounts.prestock_token_program.key(),
        TOKEN_2022_ID,
        AngelError::InvalidPrestockMint
    );
    require_keys_eq!(
        ctx.accounts.wrapped_token_program.key(),
        TOKEN_ID,
        AngelError::InvalidWrappedMint
    );

    let before = ctx.accounts.reserve.amount;

    transfer_checked(
        CpiContext::new(
            ctx.accounts.prestock_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.user_prestock.to_account_info(),
                mint: ctx.accounts.prestock_mint.to_account_info(),
                to: ctx.accounts.reserve.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.prestock_mint.decimals,
    )?;

    // ---------------------------------------------------------------------
    // THE CRITICAL STEP. The PreStock mint charges a transfer fee (50bps today,
    // rising to 100bps at epoch 1039), so LESS than `amount` actually arrives.
    // Credit the measured delta. Minting `amount` here would create unbacked
    // supply on every single wrap and silently break the peg.
    // ---------------------------------------------------------------------
    ctx.accounts.reserve.reload()?;
    let received = ctx
        .accounts
        .reserve
        .amount
        .checked_sub(before)
        .ok_or(AngelError::ReserveWentBackwards)?;
    require!(received > 0, AngelError::NothingReceived);

    let prestock_key = ctx.accounts.wrapper_config.prestock_mint;
    let bump = ctx.accounts.wrapper_config.bump;
    let seeds: &[&[u8]] = &[WrapperConfig::SEED, prestock_key.as_ref(), &[bump]];

    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.wrapped_token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.wrapped_mint.to_account_info(),
                to: ctx.accounts.user_wrapped.to_account_info(),
                authority: ctx.accounts.wrapper_config.to_account_info(),
            },
            &[seeds],
        ),
        received,
    )?;

    require_invariant(
        &mut ctx.accounts.wrapped_mint,
        &mut ctx.accounts.reserve,
    )?;

    let fee = amount.saturating_sub(received);
    let cfg = &mut ctx.accounts.wrapper_config;
    cfg.total_requested_in = cfg.total_requested_in.checked_add(amount).unwrap();
    cfg.total_received_in = cfg.total_received_in.checked_add(received).unwrap();
    cfg.total_fee_paid_in = cfg.total_fee_paid_in.checked_add(fee).unwrap();

    emit!(Wrapped {
        user: ctx.accounts.user.key(),
        requested: amount,
        received,
        fee,
    });

    Ok(())
}

// ---------------------------------------------------------------------------
// unwrap
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Unwrap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub prestock_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [WrapperConfig::SEED, prestock_mint.key().as_ref()],
        bump = wrapper_config.bump,
    )]
    pub wrapper_config: Account<'info, WrapperConfig>,

    #[account(
        mut,
        address = wrapper_config.wrapped_mint,
        mint::authority = wrapper_config,
    )]
    pub wrapped_mint: InterfaceAccount<'info, Mint>,

    #[account(mut, address = wrapper_config.reserve)]
    pub reserve: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, token::mint = prestock_mint, token::authority = user)]
    pub user_prestock: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, token::mint = wrapped_mint, token::authority = user)]
    pub user_wrapped: InterfaceAccount<'info, TokenAccount>,

    pub prestock_token_program: Interface<'info, TokenInterface>,
    pub wrapped_token_program: Interface<'info, TokenInterface>,
}

pub fn unwrap(ctx: Context<Unwrap>, amount: u64) -> Result<()> {
    require!(amount > 0, AngelError::ZeroAmount);
    require!(!ctx.accounts.wrapper_config.paused, AngelError::Paused);
    require_keys_eq!(
        ctx.accounts.prestock_token_program.key(),
        TOKEN_2022_ID,
        AngelError::InvalidPrestockMint
    );
    require_keys_eq!(
        ctx.accounts.wrapped_token_program.key(),
        TOKEN_ID,
        AngelError::InvalidWrappedMint
    );

    burn(
        CpiContext::new(
            ctx.accounts.wrapped_token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.wrapped_mint.to_account_info(),
                from: ctx.accounts.user_wrapped.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    // The reserve and the supply both drop by exactly `amount`; the PreStock
    // transfer fee is taken out of what the *user* receives, not out of the
    // reserve, so the backing invariant is preserved.
    let prestock_key = ctx.accounts.wrapper_config.prestock_mint;
    let bump = ctx.accounts.wrapper_config.bump;
    let seeds: &[&[u8]] = &[WrapperConfig::SEED, prestock_key.as_ref(), &[bump]];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.prestock_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.reserve.to_account_info(),
                mint: ctx.accounts.prestock_mint.to_account_info(),
                to: ctx.accounts.user_prestock.to_account_info(),
                authority: ctx.accounts.wrapper_config.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.prestock_mint.decimals,
    )?;

    require_invariant(
        &mut ctx.accounts.wrapped_mint,
        &mut ctx.accounts.reserve,
    )?;

    let cfg = &mut ctx.accounts.wrapper_config;
    cfg.total_unwrapped = cfg.total_unwrapped.checked_add(amount).unwrap();

    emit!(Unwrapped {
        user: ctx.accounts.user.key(),
        amount,
    });

    Ok(())
}

// ---------------------------------------------------------------------------
// set_paused
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct SetPaused<'info> {
    pub admin: Signer<'info>,

    #[account(mut, has_one = admin @ AngelError::Unauthorized)]
    pub wrapper_config: Account<'info, WrapperConfig>,
}

pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
    ctx.accounts.wrapper_config.paused = paused;
    emit!(PauseChanged { paused });
    Ok(())
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/// Assert `wrapped_mint.supply == reserve.amount`.
///
/// Both accounts must be `reload()`ed first: Anchor's deserialized copies are
/// stale after a CPI, and the whole point of this check is to observe the
/// post-transfer chain state.
fn require_invariant(
    wrapped_mint: &mut InterfaceAccount<Mint>,
    reserve: &mut InterfaceAccount<TokenAccount>,
) -> Result<()> {
    wrapped_mint.reload()?;
    reserve.reload()?;
    require_eq!(
        wrapped_mint.supply,
        reserve.amount,
        AngelError::InvariantBroken
    );
    Ok(())
}
