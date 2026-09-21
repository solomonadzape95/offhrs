use anchor_lang::prelude::*;

use crate::error::AngelError;
use crate::state::{Agent, ArbExecution, ArbVenue, Signal};

/// Log one arbitrage execution.
///
/// The instruction deliberately requires a `Signal` account. The Pyth fields on
/// the execution record are **copied from that signal**, never taken from the
/// caller, so an execution cannot be fabricated without a genuine, current,
/// correctly-identified oracle read behind it. That is what turns the execution
/// log into evidence rather than a claim — and it is what the §8 UI terminal and
/// the Pyth bounty both need.
#[derive(Accounts)]
#[instruction(index: u64)]
pub struct LogArb<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = agent.creator == authority.key() || agent.agent_signer == authority.key()
            @ AngelError::Unauthorized
    )]
    pub agent: Account<'info, Agent>,

    /// The agent's own Pyth signal. Must already have been recorded.
    #[account(constraint = signal.agent == agent.key() @ AngelError::SignalAgentMismatch)]
    pub signal: Account<'info, Signal>,

    #[account(
        init,
        seeds = [ArbExecution::SEED, agent.key().as_ref(), &index.to_le_bytes()],
        bump,
        payer = authority,
        space = 8 + ArbExecution::INIT_SPACE,
    )]
    pub execution: Account<'info, ArbExecution>,

    pub system_program: Program<'info, System>,
}

pub fn log_arb(
    ctx: Context<LogArb>,
    index: u64,
    amount_in: u64,
    amount_out: u64,
    venue: ArbVenue,
) -> Result<()> {
    // The PDA index must match the counter, so executions are strictly ordered
    // and cannot be quietly overwritten.
    require_eq!(
        index,
        ctx.accounts.agent.execution_count,
        AngelError::ExecutionIndexMismatch
    );

    let clock = Clock::get()?;
    let signal = &ctx.accounts.signal;

    // Profit is derived, not asserted by the caller. A leg with no edge logs 0
    // rather than being hidden.
    let profit = amount_out.saturating_sub(amount_in);

    let execution = &mut ctx.accounts.execution;
    execution.agent = ctx.accounts.agent.key();
    execution.index = index;
    execution.venue = venue;
    execution.amount_in = amount_in;
    execution.amount_out = amount_out;
    execution.profit = profit;

    execution.oracle = signal.oracle;
    execution.feed_id = signal.feed_id;
    execution.pyth_price = signal.price;
    execution.pyth_exponent = signal.exponent;
    execution.pyth_publish_time = signal.publish_time;
    execution.pyth_staleness_secs = signal.staleness_secs;
    execution.regime = signal.regime;

    execution.executed_at = clock.unix_timestamp;
    execution.bump = ctx.bumps.execution;

    let agent = &mut ctx.accounts.agent;
    agent.execution_count = agent
        .execution_count
        .checked_add(1)
        .ok_or(AngelError::MathOverflow)?;
    agent.total_profit_logged = agent
        .total_profit_logged
        .checked_add(profit)
        .ok_or(AngelError::MathOverflow)?;

    emit!(ArbLogged {
        agent: execution.agent,
        index,
        venue,
        amount_in,
        amount_out,
        profit,
        pyth_price: execution.pyth_price,
        pyth_publish_time: execution.pyth_publish_time,
        regime: execution.regime,
    });

    Ok(())
}

#[event]
pub struct ArbLogged {
    pub agent: Pubkey,
    pub index: u64,
    pub venue: ArbVenue,
    pub amount_in: u64,
    pub amount_out: u64,
    pub profit: u64,
    pub pyth_price: i64,
    pub pyth_publish_time: i64,
    pub regime: crate::state::MarketRegime,
}
