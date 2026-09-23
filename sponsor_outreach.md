# Offhrs — mainnet funding outreach

**The ask, in one line:** ~2.9 SOL to deploy the `stock_vault` program to mainnet before the
Stocklana deadline — as a **grant / sponsorship, not a loan**.

> **No repayment. No equity. No obligation.** We are not offering interest, returns or a stake, and
> we are not promising the money back. If a program cannot give on those terms, we would rather they
> decline than stretch it into something else.

**Deadline:** Fri 25 Sep 2026, 16:00 ET. **One link** is all the submission needs, so devnet is a
valid fallback — but a mainnet deploy unlocks the real PreStocks wrappers and the live demo.

**Facts you can paste**

| | |
|---|---|
| Program | `stock_vault` — `FoVBZRFCamH1HNMiVpNZV2QJxk9bSxWtQvKgmqZ1rVLw` |
| Deploy wallet | `Duzj6WGukxjCesWCEM6uTxZEf6Dhc8LfRGzS6o8xR4HQ` |
| Cost | ~2.9 SOL of account rent (a grant — nothing owed back) |
| Live demo | https://www.offhrs.fun |
| Code | https://github.com/solomonadzape95/offhrs |
| X | https://x.com/Offhrsdotfun |
| Status | Program + wrapper + vault + Pyth log all live on **devnet**; 15 unit + 30 integration tests |

---

## 1. The email (short — grants, funds, ecosystem)

**Subject options**

- `A grant, not a loan: 2.9 SOL to ship tokenized pre-IPO equity on mainnet`
- `Offhrs (Stocklana): one deploy, ~2.9 SOL, nothing owed back`
- `Funding the last step of Offhrs — a ~2.9 SOL deploy grant`

**Body**

> Hi [name],
>
> I'm building **Offhrs**, an autonomous marketplace where AI trading agents arbitrage tokenized
> pre-IPO equity after the regular market closes, and stream the proceeds to the people holding each
> agent's token — paid in the wrapped share itself, not stablecoins.
>
> The whole loop works on devnet: an Anchor program (`stock_vault`) with a zero-fee PreStock wrapper,
> a dividend vault that streams wPreStock per slot, a Meteora DBC pool quoted in the wrapper, and a
> Pyth-attested execution log. It's my **Stocklana** submission.
>
> The only thing left is a single mainnet deploy, which needs about **2.9 SOL**. To be clear about
> what I'm asking for: this is a **grant, not a loan** — no repayment, no equity, no obligation, and
> nothing promised back. It covers account rent for the deploy.
>
> Could [org] cover it, or point me to the right program? Happy to send the deploy transaction, the
> devnet demo and the repo, and to sign a simple grant agreement if your program needs one. We're
> working on an independent audit and will publish the report when it lands.
>
> Live demo: https://www.offhrs.fun
> Code: https://github.com/solomonadzape95/offhrs
>
> Thank you,
> [name]

---

## 2. The email (long — foundations, protocol partners)

Use §1 and add these two paragraphs before the sign-off:

> **Why it needs a program.** Raw PreStocks are Token-2022 mints with a non-zero transfer fee, so
> Meteora's DBC program rejects them as a quote asset (`QuoteMintHasNonZeroTransferFee`, 6081). Offhrs
> wraps each share 1:1 in a zero-fee classic-SPL token and quotes the curve in that. The wrapper mints
> the *measured* reserve delta, so every wrapped share stays backed — an invariant checked on every
> wrap and unwrap.
>
> **What you get.** A mainnet deploy makes your infrastructure the substrate for a real product:
> a stock-paired DBC pool that graduates to DAMM v2, on-chain Pyth reads with no API entitlement, and
> a public repo and demo we're happy to attribute and write up. If a grant is hard to approve, infra
> credits help too.

---

## 3. Direct-message version (X / Discord, under 500 chars)

> Hey — building Offhrs (Stocklana): AI agents arbitrage tokenized pre-IPO equity after hours and pay
> holders in the wrapped shares. Everything's live on devnet; the last step is a mainnet deploy that
> needs ~2.9 SOL. It's a **grant, not a loan** — nothing owed back. Can you point me at the right
> person or program? Demo: offhrs.fun · Code: github.com/solomonadzape95/offhrs

---

## 4. Who to send it to

Ordered by how likely they are to say yes *this morning*.

| # | Target | Why them | How to reach | Ask for |
|---|---|---|---|---|
| 1 | **Stocklana hackathon organisers / Colosseum** | They run the event and usually have a support + hacker-help channel; a deploy grant is a normal request | Hackathon Discord / support channel via `hackathons.solana.com`; Colosseum Discord | A deploy grant, or an intro to a sponsor |
| 2 | **Superteam** (global + regional, e.g. Superteam Nigeria) | Fast, small, builder-first grants; the dev is Nigeria-based, so the regional chapter is a warm door | `superteam.fun`, Superteam Earn (`earn.superteam.fun`), the regional chapter's X/Discord | A small build grant |
| 3 | **Solana Foundation Grants** | The canonical ecosystem grant; tokenized-equity infrastructure is a public good | `solana.org/grants` form | A microgrant covering the deploy |
| 4 | **Meteora** (`@MeteoraAG`) | Offhrs is a DBC + DAMM v2 showcase — a stock-paired curve is a novel use of their product | Meteora Discord, X DM | A deploy grant or DBC launch support |
| 5 | **Pyth Network** (`@PythNetwork`) | Offhrs reads Pyth on chain permissionlessly and turns `publish_time` into a market regime | Pyth Discord, X DM, `pyth.network` | A small grant, or feature us as an integration |
| 6 | **Helius** (`@heliuslabs`) / **QuickNode** | Not the deploy, but free dedicated RPC removes the 429 problem the public cluster causes | Their Discord dev channels / dashboards | RPC credits |
| 7 | **Phantom** (`@phantom`) | The app is Wallet-Standard-first; a mainnet launch is a clean integration story | Phantom developer Discord | Ecosystem support / signal boost |
| 8 | **Jupiter** (`@JupiterExchange`) | The USDC route runs through Jupiter (mainnet-only today) | Jupiter Discord | Credits / an integration mention |
| 9 | **The PreStocks issuer** | Offhrs wraps their token 1:1; a mainnet deploy makes it tradeable on a stock-paired curve, which is upside for them | Their issuer API docs / team | A grant to cover the deploy |
| 10 | **Clawpump** | The launch path qualifies for both Clawpump and Meteora tracks; they confirmed the custom-pair flow | Clawpump's Discord/X | Launch support or a grant |
| 11 | **Solana Nigeria / regional communities** | Warm, active, and used to funding small builders quickly | X / Telegram / Discord | A small grant |
| 12 | **Friends, teammates, other hackers** | A gift toward the project — asked for as a gift, not a loan | Direct | Any amount, nothing owed back |

**Rules of thumb**

- Ask for a **sponsorship, not investment**. No repayment, no equity, no obligation — that is the
  reason it is an easy yes, and the reason to say it out loud.
- Ask for **credits** before asking for a transfer. "Can your RPC cover us" is easier to approve than
  money.
- Never use the words *loan*, *lend*, *float* or *repay*. Say **grant** and **nothing owed back**.
- Attach the **deploy transaction** only after someone bites — 2.9 SOL is abstract, a real tx is not.
- If someone can't help, ask for **one intro**. Most of these are one message away from each other.

---

## 5. Follow-up (send ~24h later, or the same day if the deadline is close)

> Quick nudge on this — we're aiming to land the deploy before the Stocklana deadline on Friday. The
> ask is unchanged: ~2.9 SOL as a grant, with nothing owed back. If it's not a fit, an intro to
> whoever handles ecosystem grants would be just as useful. Thanks either way.

---

## 6. Send checklist for this morning

1. Open the live demo and the repo in two tabs, so a reply-to can be answered instantly.
2. Paste the §1 email, swap `[name]` / `[org]`, and send to targets **1–4** first.
3. Send the §3 DM to **Meteora, Pyth, Helius, QuickNode, Phantom, Jupiter**.
4. Post the §3 DM in the **Stocklana / Colosseum** and **Superteam** Discords.
5. Message **two friends** and ask for a gift toward the deploy — not a loan.
6. Log who you sent to and when, so the follow-up in §5 goes out on time.

> **The one sentence to lead with:** this is a grant, not a loan — no repayment, no equity, nothing
> owed back. Everything else in the email is easier once that is said.
