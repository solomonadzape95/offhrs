use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::error::AngelError;
use crate::state::{Agent, DividendVault};

/// Register an autonomous trading agent.
///
/// `agent_token_mint` is the `$AGENT` mint produced by the Meteora DBC pool, and
/// `wrapped_mint` is the wrapped PreStock whose dividends the agent's stakers
/// will earn. The vault is attached separately by `initialize_vault` so that a
/// registration exists even before the DBC pool graduates.
#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        seeds = [Agent::SEED, agent_token_mint.key().as_ref()],
        bump,
        payer = creator,
        space = 8 + Agent::INIT_SPACE,
    )]
    pub agent: Account<'info, Agent>,

    /// The `$AGENT` mint. DBC creates this, so it must already exist.
    pub agent_token_mint: InterfaceAccount<'info, Mint>,

    /// The wrapped PreStock the vault pays out (e.g. `wSPACEX`).
    pub wrapped_mint: InterfaceAccount<'info, Mint>,

    pub system_program: Program<'info, System>,
}

pub fn register_agent(
    ctx: Context<RegisterAgent>,
    agent_signer: Pubkey,
    dynamic_fee_bps: u16,
) -> Result<()> {
    let agent = &mut ctx.accounts.agent;
    agent.creator = ctx.accounts.creator.key();
    agent.agent_signer = agent_signer;
    agent.agent_token_mint = ctx.accounts.agent_token_mint.key();
    agent.wrapped_mint = ctx.accounts.wrapped_mint.key();
    agent.dynamic_fee_bps = dynamic_fee_bps;
    agent.total_profits_routed = 0;
    agent.execution_count = 0;
    agent.total_profit_logged = 0;
    agent.vault = Pubkey::default();
    agent.bump = ctx.bumps.agent;

    emit!(AgentRegistered {
        agent: agent.key(),
        creator: agent.creator,
        agent_signer,
        agent_token_mint: agent.agent_token_mint,
        wrapped_mint: agent.wrapped_mint,
        dynamic_fee_bps,
    });

    Ok(())
}

#[event]
pub struct AgentRegistered {
    pub agent: Pubkey,
    pub creator: Pubkey,
    pub agent_signer: Pubkey,
    pub agent_token_mint: Pubkey,
    pub wrapped_mint: Pubkey,
    pub dynamic_fee_bps: u16,
}

/// Close an agent registration.
///
/// Only the creator may call it, and only once the vault has no stakers —
/// deregistering must never strand someone's tokens. The vault and its token
/// accounts are left in place; this removes the agent from the registry (and
/// returns the agent account's rent to the creator).
#[derive(Accounts)]
pub struct CloseAgent<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut, close = creator, has_one = creator)]
    pub agent: Account<'info, Agent>,

    #[account(
        seeds = [DividendVault::SEED, agent.agent_token_mint.as_ref()],
        bump = vault.bump,
        has_one = agent,
    )]
    pub vault: Account<'info, DividendVault>,
}

pub fn close_agent(ctx: Context<CloseAgent>) -> Result<()> {
    require!(
        ctx.accounts.vault.total_staked == 0,
        AngelError::VaultNotDrained
    );
    emit!(AgentClosed {
        agent: ctx.accounts.agent.key(),
        creator: ctx.accounts.creator.key(),
    });
    Ok(())
}

#[event]
pub struct AgentClosed {
    pub agent: Pubkey,
    pub creator: Pubkey,
}
