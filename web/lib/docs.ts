/**
 * The technical documentation, as data.
 *
 * A docs page has one job: to be skimmable in the sidebar and precise in the
 * body. Keeping the content as a typed tree — rather than a wall of JSX in the
 * route — is what lets the shell render a real table of contents, a scroll-spy
 * and anchored sections without every heading being hand-wired.
 *
 * The prose here is the source of truth for the *interface*: account seeds,
 * instruction names and the two invariants that hold the system together. When
 * `programs/stock_vault/src/` changes, this file is the second place to look
 * after the Rust.
 */

export type DocBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "steps"; items: { title: string; text: string }[] }
  | { kind: "code"; label?: string; code: string }
  | { kind: "callout"; tone?: "signal" | "ember"; title: string; text: string }
  | { kind: "table"; head: string[]; rows: string[][]; mono?: number[] };

export type DocSection = {
  id: string;
  title: string;
  /** One line under the heading — the section's claim, not a summary of itself. */
  summary: string;
  blocks: DocBlock[];
};

export type DocGroup = { title: string; sections: DocSection[] };

export const DOC_GROUPS: DocGroup[] = [
  {
    title: "Foundations",
    sections: [
      {
        id: "overview",
        title: "Overview",
        summary: "Two problems, one Anchor program, and the reason the wrapper exists.",
        blocks: [
          {
            kind: "p",
            text: "Offhrs is an autonomous marketplace where AI trading agents arbitrage tokenized pre-IPO equity after the regular market closes, and stream the proceeds to the people holding each agent's token — paid in the wrapped share itself, not in a stablecoin.",
          },
          {
            kind: "p",
            text: "The on-chain half is a single Anchor program, `stock_vault`. It solves two problems that have nothing to do with each other except that both stand between the thesis and a working product.",
          },
          {
            kind: "steps",
            items: [
              {
                title: "Raw PreStocks cannot be a bonding-curve quote asset",
                text: "They are Token-2022 mints carrying a non-zero transfer fee. Meteora's DBC program rejects them with QuoteMintHasNonZeroTransferFee (6081), and a token badge does not help — a badge cannot authorise a non-zero fee. The wrapper mints a zero-fee classic-SPL twin so a stock-paired pool can exist at all.",
              },
              {
                title: "Dividends cannot be farmed",
                text: "A lump-sum reward pool pays a pro-rata share to anyone who stakes in the same block as the deposit. The vault streams rewards per slot instead, so yield is paid for time held and the vault is solvent by construction.",
              },
            ],
          },
          {
            kind: "callout",
            tone: "signal",
            title: "The product in one line",
            text: "The reference market closes, the tokenized marks keep trading, and that gap is the product.",
          },
          {
            kind: "table",
            head: ["Surface", "Where"],
            rows: [
              ["Program", "programs/stock_vault — wrapper · registry · vault · Pyth · execution log"],
              ["Off-chain agent", "agent/src — config · market · signal · execution · chain"],
              ["Frontend", "web/ — Next.js App Router, server actions for every chain read and write"],
            ],
          },
        ],
      },
      {
        id: "gap",
        title: "The gap",
        summary: "Why a liquid token trades away from a frozen reference price.",
        blocks: [
          {
            kind: "p",
            text: "The official value of a tokenized share comes from Pyth. When the underlying exchange closes, the equity feed's publish time stops advancing — the price does not move because there is no new price. The tokenized share keeps trading on Solana all night, so its mark drifts from the stale reference.",
          },
          {
            kind: "p",
            text: "That drift is the tradable object. An agent buys the token when it trades below the last reference and sells when it trades above, and only when the gap clears its costs. The result is a measurable basis, not a narrative: the basis is the difference between the DEX price and the reference mark, in basis points.",
          },
          {
            kind: "callout",
            title: "The regime is computed on chain",
            text: "The program does not ask an API whether the market is open. record_signal reads a Pyth PriceUpdateV2 account and derives MarketRegime::{Live, Frozen} from whether publish_time advanced within the caller's policy. If Pyth were the only source, a Pyth outage would look like an open market — so the session clock is computed from the exchange calendar separately.",
          },
          {
            kind: "list",
            items: [
              "The mark is quoted unscaled; the DEX price is not. Apply the scaledUiAmount multiplier before comparing them.",
              "The tokenized share is illiquid. A large sell moves the price; the gap can close against the agent.",
              "When the real market reopens, the reference can gap to the tokenized price rather than the other way round.",
            ],
          },
        ],
      },
      {
        id: "prestocks",
        title: "Tokenized PreStocks",
        summary: "The Token-2022 extensions that make the raw mint unusable, and why.",
        blocks: [
          {
            kind: "p",
            text: "A PreStock is a Token-2022 mint with the extensions a compliant security token needs: a transfer-fee configuration (50bps at launch, stepping up later), a permanent delegate, a pausable configuration and a scaled-UI-amount multiplier. They are exactly what makes the token usable as a regulated share — and exactly what makes it unusable as a DBC quote mint.",
          },
          {
            kind: "table",
            head: ["Extension", "Consequence for the protocol"],
            rows: [
              ["TransferFeeConfig", "DBC rejects the mint as a quote asset (6081). The wrapper pays the fee once, on the way in."],
              ["PermanentDelegate", "The issuer can move a holder's tokens. The wrapper's backing can be seized; see the invariant caveat below."],
              ["PausableConfig", "PreStock transfers can halt from under us, which is why the wrapper has its own set_paused."],
              ["ScaledUiAmount", "A display multiplier that changes on corporate actions. The wrapper is 1:1 at the raw amount level, so it is transparent to it."],
            ],
          },
          {
            kind: "callout",
            tone: "ember",
            title: "The invariant can be broken externally",
            text: "wrapped supply == reserve balance holds against every instruction this program runs. It can still be broken by the issuer exercising the permanent delegate on the PreStock mint and moving the reserve out. That is bad debt by construction, and it is disclosed rather than hidden.",
          },
        ],
      },
      {
        id: "glossary",
        title: "Glossary",
        summary: "The words this codebase uses, defined once.",
        blocks: [
          {
            kind: "table",
            head: ["Term", "Meaning"],
            rows: [
              ["PreStock", "A Token-2022 tokenized stock. Transfer-fee bearing, with a permanent delegate and a pausable config."],
              ["wPreStock", "The zero-fee classic-SPL wrapper of a PreStock. 1:1 at the raw amount level; the DBC quote asset."],
              ["$AGENT", "An agent's own SPL token, created on its bonding curve. The token holders stake."],
              ["Wrapper", "The config + reserve pair behind one wPreStock. Holds the raw PreStock backing the wrapped supply."],
              ["Dividend vault", "The per-agent vault that stakes `$AGENT` and streams wPreStock to holders."],
              ["Accumulator", "acc_reward_per_share — the fixed-point figure that turns a stream into each holder's share."],
              ["Basis", "The gap between the DEX price and the Pyth reference mark, in basis points."],
              ["Regime", "Live or Frozen — whether the reference feed's publish time is still advancing."],
              ["DBC", "Meteora's Dynamic Bonding Curve — the curve `$AGENT` trades on before migration."],
              ["Migration", "The point the curve graduates to a DAMM v2 pool. Measured in quote-token units."],
              ["Execution", "One logged arbitrage, Pyth-attested. Its oracle fields are copied from a Signal on chain."],
            ],
          },
        ],
      },
    ],
  },
  {
    title: "Protocol",
    sections: [
      {
        id: "wrapper",
        title: "The wrapper",
        summary: "A zero-fee, 1:1-backed classic-SPL twin of each PreStock.",
        blocks: [
          {
            kind: "p",
            text: "initialize_wrapper creates two accounts per PreStock: a classic SPL mint whose mint authority is the WrapperConfig PDA, and a reserve token account that holds the raw PreStock backing it. The wrapped mint is the DBC quote asset — the only reason a stock-paired curve is possible.",
          },
          {
            kind: "p",
            text: "wrap measures the reserve delta rather than trusting the requested amount. A raw PreStock transfer arrives net of its fee, so the program reads the reserve balance before and after and mints exactly what arrived. Minting the request would create unbacked supply on every wrap.",
          },
          {
            kind: "code",
            label: "The invariant, checked on every wrap and unwrap",
            code: `wrapped_mint.supply == reserve.amount

// wrap:    delta = reserve.after - reserve.before   → mint delta
// unwrap:  burn amount                              → transfer amount, fee paid here`,
          },
          {
            kind: "table",
            head: ["Instruction", "Effect"],
            rows: [
              ["initialize_wrapper", "Create the wrapped mint + reserve for one PreStock mint."],
              ["wrap(amount)", "Deposit raw PreStock; receive wPreStock 1:1 on the received amount."],
              ["unwrap(amount)", "Burn wPreStock; receive raw PreStock less the PreStock transfer fee."],
              ["set_paused(paused)", "Admin circuit breaker, mirroring the PreStock pausable config."],
            ],
          },
          {
            kind: "p",
            text: "The config carries four transparency counters — total_requested_in, total_received_in, total_fee_paid_in and total_unwrapped — so the fee actually paid on the way in is visible on chain, not estimated in a UI.",
          },
        ],
      },
      {
        id: "vault",
        title: "The dividend vault",
        summary: "Rewards stream per slot, so time held is what pays.",
        blocks: [
          {
            kind: "p",
            text: "Every agent has one DividendVault. Holders stake the agent's `$AGENT` token into it and earn wrapped PreStock. The vault is the Synthetix staking-rewards pattern: deposits set a reward rate over a duration, and the per-share accumulator is advanced by however many slots have elapsed since it was last touched.",
          },
          {
            kind: "code",
            label: "accum.rs — the whole payout rule",
            code: `PRECISION = 1e12

payout  = min(reward_rate * elapsed, reward_reserve)   // capped at what it holds
increment = payout * PRECISION / total_staked
acc_reward_per_share += increment
reward_reserve       -= payout

// what a holder can claim:
pending = staked * acc_reward_per_share / PRECISION - reward_debt`,
          },
          {
            kind: "steps",
            items: [
              {
                title: "Solvent by construction",
                text: "Payout is capped at reward_reserve, so the accumulator can never credit more than the vault holds, whatever the rate or elapsed time.",
              },
              {
                title: "Not flash-loanable",
                text: "A stream pays for time held. Stake one slot before a deposit and you earn one slot's worth; a full-duration holder earns the whole stream. min_hold_slots adds a hard retention lock on top.",
              },
              {
                title: "No per-user bookkeeping",
                text: "reward_debt is the holder's settled share of the accumulator. stake and unstake settle into accrued first, so an action never silently forfeits rewards.",
              },
            ],
          },
          {
            kind: "table",
            head: ["Instruction", "Who", "Effect"],
            rows: [
              ["initialize_vault(min_hold_slots)", "creator", "Create the stake + reward PDAs for a registered agent."],
              ["stake(amount)", "holder", "Move `$AGENT` in; rewards start streaming from this slot."],
              ["unstake(amount)", "holder", "Withdraw `$AGENT`; accrued rewards stay claimable."],
              ["claim()", "holder", "Transfer accrued wPreStock out of the reward vault."],
              ["deposit_rewards(amount, duration_slots)", "creator or signer", "Fund a stream. Fees and arbitrage profit route in here."],
            ],
          },
        ],
      },
      {
        id: "registry",
        title: "The agent registry",
        summary: "One account per agent, joining a token, a share and a vault.",
        blocks: [
          {
            kind: "p",
            text: "An Agent account binds the creator, the execution signer (the Clawpump bot's keypair), the `$AGENT` mint, the wrapped PreStock it pays out in, and the vault address. register_agent is permissionless — anyone can launch an agent — and the account is addressed by the agent's own mint, so the mint is the identity.",
          },
          {
            kind: "table",
            head: ["Field", "Meaning"],
            rows: [
              ["creator", "Deploys the agent, sets the fee, receives creator royalties."],
              ["agent_signer", "Execution keypair; may route profits into the vault."],
              ["agent_token_mint", "The DBC-created `$AGENT` mint — the staking token."],
              ["wrapped_mint", "The reward token. Always the wrapper, never raw PreStock."],
              ["dynamic_fee_bps", "DBC dynamic fee tier, 500–1500 bps at launch."],
              ["execution_count", "Logged executions; also the PDA index counter."],
            ],
          },
          {
            kind: "callout",
            title: "Closing is creator-only and gated on the vault",
            text: "close_agent returns the registration's rent, but refuses while the vault still has stakers. Deregistering can never strand someone's rewards.",
          },
        ],
      },
      {
        id: "curve",
        title: "The curve",
        summary: "Meteora DBC, quoted in wPreStock, with the fee accruing in the share.",
        blocks: [
          {
            kind: "p",
            text: "The `$AGENT` token trades on a Meteora Dynamic Bonding Curve. The config is created by the app when Clawpump is unavailable, and the one setting that matters for the product is the quote asset: the pool is quoted in wPreStock, and fees are collected in the quote token. That is what makes “dividends paid in equity” literally true rather than a marketing line.",
          },
          {
            kind: "code",
            label: "The curve settings that define the product",
            code: `quoteMint:            wPreStock            // the zero-fee wrapper
collectFeeMode:       QuoteToken           // fees accrue in the share
creatorTradingFeePercentage: 0            // the creator does not skim the vault
migrationOption:      MET_DAMM_V2          // graduates to a DAMM v2 pool
migrationQuoteThreshold: 100 wPreStock`,
          },
          {
            kind: "list",
            items: [
              "The `$AGENT` mint is created in the same transaction as the pool, as an Immutable SPL mint. The ephemeral keypairs that sign it have no power once it lands.",
              "Buying at launch is a DBC first buy, sent straight to the creator's wallet — so launching leaves you holding your own token, not just a pool.",
              "The app's buy box quotes the curve server-side with Meteora's SDK; the browser only ever receives an unsigned transaction.",
            ],
          },
        ],
      },
      {
        id: "pyth",
        title: "Pyth attestation",
        summary: "A logged execution cannot exist without a real oracle read behind it.",
        blocks: [
          {
            kind: "p",
            text: "record_signal reads a Pyth PriceUpdateV2 account on chain — permissionless, no API key — checks that it is owned by the Pyth receiver, that it carries the expected feed id, and that it is inside the caller's staleness policy, then writes a Signal. The regime is derived from publish_time: a feed that has stopped advancing is Frozen, which is the thesis encoded as an enum.",
          },
          {
            kind: "p",
            text: "log_arb then copies the oracle fields from the referenced Signal rather than accepting them from the caller. The Pyth price, exponent, publish time and staleness on an ArbExecution are therefore attestation, not assertion — which is what makes the execution log evidence.",
          },
          {
            kind: "code",
            label: "An execution row, as the UI reads it",
            code: `ArbExecution {
  agent, index, venue,
  amount_in, amount_out,
  profit,                       // amount_out.saturating_sub(amount_in), on chain
  oracle, feed_id, pyth_price, pyth_exponent,
  pyth_publish_time, pyth_staleness_secs,
  regime, executed_at,
}`,
          },
        ],
      },
      {
        id: "accounts",
        title: "Accounts & PDAs",
        summary: "Every account the program owns, and the seeds that address it.",
        blocks: [
          {
            kind: "p",
            text: "The frontend does not carry an Anchor client. It decodes these accounts with small explicit Borsh readers that assert the 8-byte discriminator first, so a layout change fails loudly rather than decoding garbage.",
          },
          {
            kind: "table",
            head: ["Account", "Seeds", "Holds"],
            mono: [1],
            rows: [
              ["WrapperConfig", '["wrapper", prestock_mint]', "wrapped mint, reserve, admin, pause, fee counters"],
              ["Reserve", '["reserve", wrapper_config]', "the raw PreStock backing the wrapper"],
              ["Agent", '["agent", agent_token_mint]', "creator, signer, fee, counters, vault"],
              ["DividendVault", '["vault", agent_token_mint]', "stake + reward mints, accumulator, stream"],
              ["StakeVault", '["stake_vault", vault]', "staked `$AGENT`"],
              ["RewardVault", '["reward_vault", vault]', "wPreStock waiting to stream"],
              ["UserStake", '["stake", vault, owner]', "one holder's stake, debt and accrual"],
              ["Signal", '["signal", agent, feed_id]', "the latest Pyth-attested market read"],
              ["ArbExecution", '["exec", agent, index]', "one Pyth-attested execution"],
            ],
          },
        ],
      },
      {
        id: "economics",
        title: "Fees & economics",
        summary: "Where value accrues, and the constants that define it.",
        blocks: [
          {
            kind: "p",
            text: "An agent token trades on a bonding curve. The trading fee is charged in the quote asset — wPreStock — and that fee is the vault's income: it streams to stakers as the share itself. The creator's own trading-fee percentage is zero, so the vault is not competing with the creator for the same fees.",
          },
          {
            kind: "table",
            head: ["Constant", "Value", "Why"],
            mono: [1],
            rows: [
              ["`$AGENT` supply", "1,000,000,000 (6 decimals)", "Fixed at launch; the curve sells the supply and migrates the rest."],
              ["Quote decimals", "9", "wPreStock inherits the PreStock's 9."],
              ["Curve fee", "5–15% at launch", "A linear schedule decaying to 1% over 24 hours — the agent's main income."],
              ["Creator trading fee", "0%", "Fees accrue to the vault, not the creator."],
              ["Migration", "DAMM v2", "The curve graduates to a full DAMM v2 pool at the quote threshold."],
            ],
          },
          {
            kind: "callout",
            title: "Income is not price",
            text: "A holder earns from the stream regardless of the token's price. Betting on the agent's trading is separate from collecting the share it routes — the vault pays for time held, not for being right.",
          },
        ],
      },
    ],
  },
  {
    title: "Operations",
    sections: [
      {
        id: "networks",
        title: "Networks & addresses",
        summary: "What is live where, and the one spend still outstanding.",
        blocks: [
          {
            kind: "table",
            head: ["Thing", "Value"],
            mono: [1],
            rows: [
              ["stock_vault program", "FoVBZRFCamH1HNMiVpNZV2QJxk9bSxWtQvKgmqZ1rVLw"],
              ["Meteora DBC program", "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN"],
              ["Program cluster", "devnet"],
              ["Market data", "mainnet — PreStocks, Jupiter and Pyth equity feeds exist only there"],
            ],
          },
          {
            kind: "p",
            text: "The program runs on devnet, where the whole loop works. The market inputs are read from mainnet and the program writes land on devnet.",
          },
          {
            kind: "callout",
            title: "Devnet assets are mocks",
            text: "Real PreStocks only exist on mainnet, so on devnet the wrappers point at mock Token-2022 mints carrying the same extensions. They borrow the identity of the real shares they stand in for, so a card, a launch row and a terminal all read the same figures.",
          },
        ],
      },
      {
        id: "local",
        title: "Running it locally",
        summary: "Build, test, and drive the agent on macOS, Linux or Windows.",
        blocks: [
          {
            kind: "callout",
            title: "Windows uses WSL2",
            text: "Anchor, the Solana CLI and the Meteora SDK are Linux-first. On Windows, install WSL2 with an Ubuntu distro and run every command inside it rather than in PowerShell — the local validator and the toolchain assume a Unix filesystem.",
          },
          {
            kind: "code",
            label: "Toolchain — macOS, Linux and WSL2",
            code: `# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Solana CLI (Agave)
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Anchor, through avm
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest && avm use latest

# Node 20+ and pnpm
corepack enable && corepack prepare pnpm@latest --activate`,
          },
          {
            kind: "list",
            items: [
              "macOS — install the Xcode Command Line Tools (xcode-select --install). If the linker rejects the SDK with a malformed-file or unknown-architecture error, pin SDKROOT to the SDK inside the CommandLineTools directory before building.",
              "Linux (Debian/Ubuntu) — apt-get install -y build-essential pkg-config libssl-dev libudev-dev libclang-dev. Fedora and Arch need the equivalents.",
              "Windows — WSL2 + Ubuntu, then the Linux line above. Keep the repo inside the WSL filesystem, not under /mnt/c, or file watching and the validator get slow.",
            ],
          },
          {
            kind: "code",
            label: "Program — same commands on every platform",
            code: `anchor build
anchor test                                   # 30 integration tests
cargo test --manifest-path programs/stock_vault/Cargo.toml   # 15 unit tests`,
          },
          {
            kind: "code",
            label: "Frontend",
            code: `cd web
pnpm exec next dev -p 3939                     # dev server
pnpm exec next build && pnpm exec next start -p 3939`,
          },
          {
            kind: "code",
            label: "Agent",
            code: `ANGEL_ONCE=1 pnpm exec tsx agent/src/index.ts          # one read-only pass
ANGEL_SYMBOL=OPENAI pnpm exec tsx agent/src/index.ts   # a different asset
pnpm exec tsx agent/src/index.ts --feeds               # known on-chain feeds`,
          },
          {
            kind: "p",
            text: "The check scripts are the fastest way to verify a subsystem end to end: position-check for the vault maths, trade-check for buy/auto-stake/sell/wrap/unwrap on devnet, and browser-sign-check for a real Wallet Standard signature through the UI.",
          },
        ],
      },
      {
        id: "security",
        title: "Security & custody",
        summary: "The server never holds a key that can move your funds.",
        blocks: [
          {
            kind: "list",
            items: [
              "Non-custodial by construction: there are no accounts and no passwords, and the only identity is a wallet address.",
              "Writes are built unsigned on the server, signed in the browser by the wallet, and relayed back. The server never sees a private key.",
              "The devnet faucet is the one server-held key. It is devnet-gated and refuses before touching a key on a mainnet RPC; it only sends test tokens.",
              "Every write path is bounded — a wallet that never resolves its approval cannot leave a control spinning forever.",
            ],
          },
          {
            kind: "callout",
            title: "Audit in progress",
            text: "The program is covered by a test suite today — 15 unit and 30 integration tests, including an independent model of the reward accumulator — and an independent audit is being arranged before the product opens to real value. Until that lands, treat this deployment as what it is: a devnet beta.",
          },
        ],
      },
      {
        id: "limits",
        title: "Limits & caveats",
        summary: "The honest list, kept where the technicals live.",
        blocks: [
          {
            kind: "list",
            items: [
              "The reference mark can gap when the real market reopens — the position can lose money.",
              "The wrapped share is only as good as the issuer's permanent delegate allows; the backing can be moved out from under the wrapper.",
              "Pyth equity feeds are gated on Hermes and absent on chain; the program's own reads cover the crypto/FX scope that is available permissionlessly.",
              "Real PreStocks wrappers only exist on mainnet, so this build uses devnet mocks.",
              "Trading is devnet-only today; the Jupiter USDC route is mainnet-only and is mocked on devnet.",
            ],
          },
        ],
      },
      {
        id: "testing",
        title: "Testing & verification",
        summary: "What the suite actually covers, and how to reproduce a result.",
        blocks: [
          {
            kind: "list",
            items: [
              "15 unit tests cover the accumulator in isolation: solvency (payout capped at the reserve), duration weighting, pro-rata correctness, and an independent reference model that distributes each slot's payout exactly.",
              "30 integration tests run the program against a local validator: wrapper invariants, vault streaming, Pyth attestation and the execution log.",
              "The accumulator is checked against a naive model that is deliberately not a reimplementation, so the test measures agreement rather than the same bug twice.",
            ],
          },
          {
            kind: "code",
            label: "Reproduce the two suites",
            code: `anchor test                                   # 30 integration tests
cargo test --manifest-path programs/stock_vault/Cargo.toml   # 15 unit tests`,
          },
          {
            kind: "p",
            text: "The app ships its own checks, which are the honest way to verify a subsystem against a live cluster rather than a mock: position-check (the vault maths), trade-check (buy/auto-stake/sell/wrap/unwrap), launch-curve-check (a real DBC config and pool), and browser-sign-check (a real Wallet Standard signature through the UI).",
          },
        ],
      },
      {
        id: "troubleshooting",
        title: "Troubleshooting",
        summary: "The failures that look like something else.",
        blocks: [
          {
            kind: "callout",
            tone: "ember",
            title: "“Not enough SOL” when you have SOL",
            text: "The buy path spends the quote token — wPreStock — not SOL. If the wallet holds none for the asset you picked, the SPL token program returns InsufficientFunds, and an older build reported that as a SOL problem. Check the wPreStock balance first, and make sure the wallet is on the same cluster as the program.",
          },
          {
            kind: "list",
            items: [
              "Wallet on the wrong network — the faucet and the program run on devnet. Switch the wallet itself to Devnet, not just the app.",
              "Faucet cooldown — one drop per wallet every ten minutes; the drop funds test SOL and wPreStock for every mock asset.",
              "Empty dashboard or 429s — the public devnet RPC rate-limits the program scans. Point PROGRAM_RPC_URL and NEXT_PUBLIC_SOLANA_RPC_URL at a dedicated endpoint.",
              "A stale mark — the site says when the issuer API was unreachable and shows the snapshot; it never presents a snapshot as live.",
            ],
          },
        ],
      },
    ],
  },
];

/** Flat section list, for the mobile table of contents and the scroll-spy. */
export const DOC_SECTIONS: DocSection[] = DOC_GROUPS.flatMap((g) => g.sections);
