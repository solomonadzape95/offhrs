use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::state::Agent;

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
