use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::accum::{accrue, debt, pending};
use crate::error::AngelError;
use crate::state::{Agent, DividendVault, UserStake};

// ---------------------------------------------------------------------------
// internal accounting
// ---------------------------------------------------------------------------

/// Stream rewards up to `now` and fold them into the per-share accumulator.
///
/// Must be called before *any* change to `total_staked` or the reward schedule,
/// otherwise holders would be paid against a stale accumulator.
fn settle_vault(vault: &mut DividendVault, now: u64) {
    let elapsed = now.saturating_sub(vault.last_update_slot);
    let (acc, reserve) = accrue(
        vault.acc_reward_per_share,
        vault.reward_rate,
        vault.reward_reserve,
        vault.total_staked,
        elapsed,
    );
    let streamed = vault.reward_reserve.saturating_sub(reserve);
    vault.acc_reward_per_share = acc;
    vault.reward_reserve = reserve;
    vault.total_distributed = vault.total_distributed.saturating_add(streamed);
    vault.last_update_slot = now;
}

/// Move a holder's earned-but-unsettled rewards into `accrued`, and reset their
/// debt. Doing this on every stake/unstake is what stops rewards from being
/// silently forfeited or double-counted.
fn settle_user(user: &mut UserStake, acc_reward_per_share: u128) -> Result<()> {
    let owed = pending(user.staked_amount, acc_reward_per_share, user.reward_debt);
    let owed: u64 = u64::try_from(owed).map_err(|_| AngelError::MathOverflow)?;
    user.accrued = user.accrued.checked_add(owed).ok_or(AngelError::MathOverflow)?;
    user.reward_debt = debt(user.staked_amount, acc_reward_per_share);
    Ok(())
}

/// Lazily initialize a `UserStake` when the account was created in this tx.
fn ensure_user_stake(
    user_stake: &mut UserStake,
    owner: Pubkey,
    vault: Pubkey,
    bump: u8,
) {
    if user_stake.vault == Pubkey::default() {
        user_stake.owner = owner;
        user_stake.vault = vault;
        user_stake.bump = bump;
    }
}

// ---------------------------------------------------------------------------
// initialize_vault
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut, has_one = creator @ AngelError::Unauthorized)]
    pub agent: Account<'info, Agent>,

    #[account(address = agent.agent_token_mint @ AngelError::AgentMintMismatch)]
    pub staking_mint: InterfaceAccount<'info, Mint>,

    #[account(address = agent.wrapped_mint @ AngelError::AgentMintMismatch)]
    pub reward_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        seeds = [DividendVault::SEED, agent.agent_token_mint.as_ref()],
        bump,
        payer = creator,
        space = 8 + DividendVault::INIT_SPACE,
    )]
    pub vault: Account<'info, DividendVault>,

    #[account(
        init,
        seeds = [DividendVault::STAKE_VAULT_SEED, vault.key().as_ref()],
        bump,
        payer = creator,
        token::mint = staking_mint,
        token::authority = vault,
        token::token_program = staking_token_program,
    )]
    pub stake_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        seeds = [DividendVault::REWARD_VAULT_SEED, vault.key().as_ref()],
        bump,
        payer = creator,
        token::mint = reward_mint,
        token::authority = vault,
        token::token_program = reward_token_program,
    )]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,

    pub staking_token_program: Interface<'info, TokenInterface>,
    pub reward_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_vault(ctx: Context<InitializeVault>, min_hold_slots: u64) -> Result<()> {
    let clock = Clock::get()?;

    let vault = &mut ctx.accounts.vault;
    vault.staking_mint = ctx.accounts.staking_mint.key();
    vault.reward_mint = ctx.accounts.reward_mint.key();
    vault.stake_vault = ctx.accounts.stake_vault.key();
    vault.reward_vault = ctx.accounts.reward_vault.key();
    vault.agent = ctx.accounts.agent.key();

    vault.total_staked = 0;
    vault.acc_reward_per_share = 0;
    vault.reward_rate = 0;
    vault.reward_reserve = 0;
    vault.total_distributed = 0;
    vault.last_update_slot = clock.slot;
    vault.min_hold_slots = min_hold_slots;
    vault.bump = ctx.bumps.vault;

    ctx.accounts.agent.vault = vault.key();

    emit!(VaultInitialized {
        vault: vault.key(),
        agent: vault.agent,
        staking_mint: vault.staking_mint,
        reward_mint: vault.reward_mint,
        min_hold_slots,
    });

    Ok(())
}

#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub agent: Pubkey,
    pub staking_mint: Pubkey,
    pub reward_mint: Pubkey,
    pub min_hold_slots: u64,
}

// ---------------------------------------------------------------------------
// stake
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub vault: Account<'info, DividendVault>,

    #[account(address = vault.staking_mint)]
    pub staking_mint: InterfaceAccount<'info, Mint>,

    #[account(mut, address = vault.stake_vault)]
    pub stake_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, token::mint = staking_mint, token::authority = user)]
    pub user_stake_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        seeds = [UserStake::SEED, vault.key().as_ref(), user.key().as_ref()],
        bump,
        payer = user,
        space = 8 + UserStake::INIT_SPACE,
    )]
    pub user_stake: Account<'info, UserStake>,

    pub staking_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
    require!(amount > 0, AngelError::ZeroAmount);
    let clock = Clock::get()?;

    let vault = &mut ctx.accounts.vault;
    settle_vault(vault, clock.slot);

    let user_stake = &mut ctx.accounts.user_stake;
    ensure_user_stake(
        user_stake,
        ctx.accounts.user.key(),
        vault.key(),
        ctx.bumps.user_stake,
    );
    settle_user(user_stake, vault.acc_reward_per_share)?;

    transfer_checked(
        CpiContext::new(
            ctx.accounts.staking_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.user_stake_account.to_account_info(),
                mint: ctx.accounts.staking_mint.to_account_info(),
                to: ctx.accounts.stake_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.staking_mint.decimals,
    )?;

    user_stake.staked_amount = user_stake
        .staked_amount
        .checked_add(amount)
        .ok_or(AngelError::MathOverflow)?;
    user_stake.reward_debt = debt(user_stake.staked_amount, vault.acc_reward_per_share);
    // Restart the hold window: you cannot claim rewards for a position you just
    // enlarged, which closes the stake-then-claim-in-one-tx loop.
    user_stake.last_stake_slot = clock.slot;

    vault.total_staked = vault
        .total_staked
        .checked_add(amount)
        .ok_or(AngelError::MathOverflow)?;

    emit!(Staked {
        vault: vault.key(),
        user: ctx.accounts.user.key(),
        amount,
        total_staked: vault.total_staked,
    });

    Ok(())
}

#[event]
pub struct Staked {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub total_staked: u64,
}

// ---------------------------------------------------------------------------
// unstake
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub vault: Account<'info, DividendVault>,

    #[account(address = vault.staking_mint)]
    pub staking_mint: InterfaceAccount<'info, Mint>,

    #[account(mut, address = vault.stake_vault)]
    pub stake_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, token::mint = staking_mint, token::authority = user)]
    pub user_stake_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [UserStake::SEED, vault.key().as_ref(), user.key().as_ref()],
        bump = user_stake.bump,
    )]
    pub user_stake: Account<'info, UserStake>,

    pub staking_token_program: Interface<'info, TokenInterface>,
}

pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
    require!(amount > 0, AngelError::ZeroAmount);
    let clock = Clock::get()?;

    let vault = &mut ctx.accounts.vault;
    settle_vault(vault, clock.slot);

    let user_stake = &mut ctx.accounts.user_stake;
    settle_user(user_stake, vault.acc_reward_per_share)?;
    require!(
        user_stake.staked_amount >= amount,
        AngelError::InsufficientStake
    );

    user_stake.staked_amount -= amount;
    user_stake.reward_debt = debt(user_stake.staked_amount, vault.acc_reward_per_share);
    vault.total_staked = vault.total_staked.saturating_sub(amount);

    let staking_mint_key = vault.staking_mint;
    let bump = vault.bump;
    let seeds: &[&[u8]] = &[DividendVault::SEED, staking_mint_key.as_ref(), &[bump]];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.staking_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.stake_vault.to_account_info(),
                mint: ctx.accounts.staking_mint.to_account_info(),
                to: ctx.accounts.user_stake_account.to_account_info(),
                authority: vault.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.staking_mint.decimals,
    )?;

    emit!(Unstaked {
        vault: vault.key(),
        user: ctx.accounts.user.key(),
        amount,
        total_staked: vault.total_staked,
    });

    Ok(())
}

#[event]
pub struct Unstaked {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub total_staked: u64,
}

// ---------------------------------------------------------------------------
// claim
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub vault: Account<'info, DividendVault>,

    #[account(address = vault.reward_mint)]
    pub reward_mint: InterfaceAccount<'info, Mint>,

    #[account(mut, address = vault.reward_vault)]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, token::mint = reward_mint, token::authority = user)]
    pub user_reward_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [UserStake::SEED, vault.key().as_ref(), user.key().as_ref()],
        bump = user_stake.bump,
    )]
    pub user_stake: Account<'info, UserStake>,

    pub reward_token_program: Interface<'info, TokenInterface>,
}

pub fn claim(ctx: Context<Claim>) -> Result<()> {
    let clock = Clock::get()?;

    let vault = &mut ctx.accounts.vault;
    let user_stake = &mut ctx.accounts.user_stake;

    // Anti-flash-loan retention lock: a position must be held for
    // `min_hold_slots` before its rewards can be withdrawn.
    require!(
        clock.slot >= user_stake.last_stake_slot.saturating_add(vault.min_hold_slots),
        AngelError::StakeLocked
    );

    settle_vault(vault, clock.slot);
    settle_user(user_stake, vault.acc_reward_per_share)?;

    let amount = user_stake.accrued;
    require!(amount > 0, AngelError::NothingToClaim);

    // Belt and braces: the accumulator caps its own payout at the reserve, so
    // this should be unreachable. Assert it rather than trusting the invariant
    // to hold across future edits.
    require!(
        ctx.accounts.reward_vault.amount >= amount,
        AngelError::RewardVaultUnderfunded
    );

    user_stake.accrued = 0;
    user_stake.total_claimed = user_stake
        .total_claimed
        .checked_add(amount)
        .ok_or(AngelError::MathOverflow)?;

    // The vault PDA is seeded by the STAKING mint (see `initialize_vault`), not
    // by the reward mint. Signing with the wrong mint yields
    // "seeds do not result in a valid address".
    let staking_mint_key = vault.staking_mint;
    let bump = vault.bump;
    let seeds: &[&[u8]] = &[DividendVault::SEED, staking_mint_key.as_ref(), &[bump]];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.reward_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.reward_vault.to_account_info(),
                mint: ctx.accounts.reward_mint.to_account_info(),
                to: ctx.accounts.user_reward_account.to_account_info(),
                authority: vault.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.reward_mint.decimals,
    )?;

    emit!(Claimed {
        vault: vault.key(),
        user: ctx.accounts.user.key(),
        amount,
    });

    Ok(())
}

#[event]
pub struct Claimed {
    pub vault: Pubkey,
    pub user: Pubkey,
    /// Paid in wrapped PreStock — redeemable 1:1 for the raw PreStock.
    pub amount: u64,
}

// ---------------------------------------------------------------------------
// deposit_rewards
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct DepositRewards<'info> {
    /// The agent's creator or its Clawpump execution signer — the only parties
    /// allowed to fund the dividend stream.
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(mut)]
    pub agent: Account<'info, Agent>,

    #[account(
        mut,
        constraint = vault.agent == agent.key() @ AngelError::VaultAgentMismatch
    )]
    pub vault: Account<'info, DividendVault>,

    #[account(address = vault.reward_mint)]
    pub reward_mint: InterfaceAccount<'info, Mint>,

    #[account(mut, address = vault.reward_vault)]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, token::mint = reward_mint, token::authority = depositor)]
    pub depositor_reward_account: InterfaceAccount<'info, TokenAccount>,

    pub reward_token_program: Interface<'info, TokenInterface>,
}

pub fn deposit_rewards(
    ctx: Context<DepositRewards>,
    amount: u64,
    duration_slots: u64,
) -> Result<()> {
    require!(amount > 0, AngelError::ZeroAmount);
    require!(duration_slots > 0, AngelError::InvalidDuration);

    // Either the creator or the agent's own signer may route profits in.
    let depositor = ctx.accounts.depositor.key();
    require!(
        depositor == ctx.accounts.agent.creator || depositor == ctx.accounts.agent.agent_signer,
        AngelError::Unauthorized
    );

    let clock = Clock::get()?;
    let vault = &mut ctx.accounts.vault;

    // Settle at the OLD rate before changing it.
    settle_vault(vault, clock.slot);

    transfer_checked(
        CpiContext::new(
            ctx.accounts.reward_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.depositor_reward_account.to_account_info(),
                mint: ctx.accounts.reward_mint.to_account_info(),
                to: ctx.accounts.reward_vault.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.reward_mint.decimals,
    )?;

    // Any remainder from a previous schedule is rolled into the new one, so the
    // stream is re-based over `duration_slots` against the total outstanding.
    vault.reward_reserve = vault
        .reward_reserve
        .checked_add(amount)
        .ok_or(AngelError::MathOverflow)?;
    vault.reward_rate = (vault.reward_reserve as u128) / (duration_slots as u128);

    ctx.accounts.agent.total_profits_routed = ctx
        .accounts
        .agent
        .total_profits_routed
        .checked_add(amount)
        .ok_or(AngelError::MathOverflow)?;

    emit!(RewardsDeposited {
        vault: vault.key(),
        depositor,
        amount,
        duration_slots,
        reward_rate: vault.reward_rate,
        reward_reserve: vault.reward_reserve,
    });

    Ok(())
}

#[event]
pub struct RewardsDeposited {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub amount: u64,
    pub duration_slots: u64,
    pub reward_rate: u128,
    pub reward_reserve: u64,
}
