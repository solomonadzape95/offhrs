# Offhrs — demo runbook

The submission needs **one link**, and the video is the strongest. This is a
four-minute script: what to show, in order, and what to say.

## Before you record

- **Record after the US close (after ~20:00 UTC).** The agent only trades when the
  reference feed is *frozen*; during market hours it correctly says "waiting for a
  frozen reference", which is honest but a weak demo. After the close the regime
  flips and the agent acts.
- Use a **fresh devnet wallet** so the faucet flow is clean (or the tester wallet if
  the faucet cooldown bites).
- Open the **admin console** in a second tab: `/asdfg/admin`.
- 1080p+, browser zoom reset, bookmarks hidden, notifications off.
- Have the repo URL and the live site ready to paste at the end.

## The script

**0:00 — Landing.** The claim: *"The market is closed. The gap isn't."* Scroll to
the board. One sentence: the token trades away from the official mark overnight, and
that gap is the product.

**0:30 — Docs (`/docs`).** The technicals, briefly. Point at two things: the wrapper
invariant (`supply == reserve`) and the streaming vault. *"The hard parts are
on-chain and tested."*

**1:00 — Connect + faucet (`/app`).** Connect a devnet wallet. Pull test SOL and
wPreStock. *"Everything here runs on devnet for free."*

**1:30 — Launch (`/launch`).** Choose **Create the curve**. Name, ticker, asset, fee.
Deploy. Let the progress rail run: *create config + pool → register → vault*. *"The
app creates the DBC config and pool itself; the mint is immutable, and the vault is
attached in the same flow."*

**2:15 — Buy.** Buy the agent token with auto-stake on. Show the balance land.

**2:30 — Position (`/app`).** Show **Equity accrued** and **Claimable**, and the
share inventory. *"Holders earn the wrapped share itself, streaming per slot — no
snapshots to game."*

**3:00 — Activity (`/app/activity`).** The execution log: venue, profit, the Pyth
price and staleness. *"Every logged trade is backed by a real oracle read — the
fields are copied from the attestation, not claimed."*

**3:20 — Admin (`/asdfg/admin`).** The charts: executions, profit, holders, stake.
Then the **Logged → Routed → Unrouted → Streamed** panel. *"This is the whole yield
engine in one row: the agent logs a trade, routes the profit into the vault, and the
vault streams it to holders."*

**3:45 — Claim.** Claim the accrued equity and show the balance change. Wrap:
the repo, the docs, the live devnet demo.

## The one-liner

> AI agents trade tokenized shares of private companies after the market closes, and
> pay the people who hold their token in the shares themselves.

## Fallbacks

- **Market still open?** Say it plainly: *"the agent is waiting — it only trades when
  the reference is frozen."* Then show the seeded executions and the admin console.
- **Faucet cooldown?** Use the tester wallet (`.devnet-tester.json`).
- **A route is slow?** Cut to the admin console; it always has data.
- **A transaction fails?** Don't re-record. Narrate the error honestly — the app now
  reports the real cause (token balance, network) instead of blaming SOL.

## The checklist

- [ ] Recorded after the US close
- [ ] Fresh wallet, faucet pulled
- [ ] Launch → buy → stake → position → activity → admin → claim, in that order
- [ ] The Logged/Routed/Streamed panel is on screen and explained
- [ ] Ends with the repo + live link
