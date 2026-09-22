/**
 * One real browser signature — the wallet sign → relay half, end to end.
 *
 *   # 1. point the app at a live program (devnet) and start it
 *   #    (from web/)
 *   NEXT_PUBLIC_BETA=false \
 *   PROGRAM_RPC_URL=https://api.devnet.solana.com \
 *   NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com \
 *   node_modules/.bin/next dev -p 3939
 *
 *   # 2. drive it with a Wallet Standard wallet backed by a local keypair
 *   pnpm exec tsx scripts/browser-sign-check.ts
 *
 * Every instruction is already proven with a local keypair on devnet
 * (`web/scripts/write-check.ts`), but that bypasses the browser: it signs with
 * `@solana/web3.js` and sends directly. This closes the one gap those checks
 * cannot reach — the app's own `build unsigned → wallet signs → server relays`
 * path, exercised through the real UI.
 *
 * The browser gets no private key on disk and no extension. A synthetic
 * **Wallet Standard** wallet is registered before the page boots (the same
 * registry Phantom registers into) and signs with WebCrypto Ed25519, which
 * Chrome exposes only in a secure context — localhost qualifies. So the app takes
 * the exact code path a real wallet takes: `getBase64Encoder` → kit decoder →
 * `session.signTransaction` → signed wire bytes → `submitTx` server action. What
 * remains outside this check is a human clicking Approve in the extension; the
 * cryptography and the protocol are real.
 *
 * The default write is a 1 `$AGENT` stake, because it has no side effects beyond
 * the one balance it moves and is trivially reversible. Success is asserted
 * against the chain: the `UserStake` account's `staked_amount` must grow by
 * exactly the amount, and the relayed signature must be confirmed.
 *
 * Note: the injected wallet is a **string**, not a serialised function.
 * `tsx`/esbuild compiles functions with `__name(...)` helpers that do not exist
 * in the page, so a function passed straight to Playwright throws the moment it
 * touches a named helper. A string crosses the boundary untouched.
 */
import fs from "node:fs";
import { chromium, type Page } from "playwright-core";
import { Connection, Keypair, Transaction } from "@solana/web3.js";

import {
  PROGRAM_RPC_URL,
  fetchAgentByPda,
  fetchAgents,
  fetchUserStake,
} from "../web/lib/chain.js";
import { buildCreateAgentCurve } from "../web/lib/launch.js";
import { testWalletScript } from "./lib/test-wallet.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3939";
const WALLET_NAME = process.env.WALLET_NAME ?? "Offhrs Test Wallet";
const CHAIN = process.env.WALLET_CHAIN ?? "solana:devnet";
/** Whole `$AGENT`, human units. */
const STAKE_AMOUNT = process.env.STAKE_AMOUNT ?? "1";
const AGENT_DECIMALS = 6;
const STAKE_RAW = BigInt(Math.round(Number(STAKE_AMOUNT) * 10 ** AGENT_DECIMALS));

const walletPath =
  process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))),
);
const address = payer.publicKey.toBase58();

const conn = new Connection(PROGRAM_RPC_URL, "confirmed");

/** The public devnet RPC drops a request now and then; the reads are idempotent. */
async function retry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts) await new Promise((r) => setTimeout(r, 750 * i));
    }
  }
  throw new Error(`${label}: ${last instanceof Error ? last.message : String(last)}`);
}

/**
 * The agent to stake into. `.devnet-demo.json` is what `devnet-pool.ts` writes,
 * so the check targets the same agent the demo does without an argument; fall
 * back to the first registered agent for a fresh cluster.
 */
async function resolveAgentId(): Promise<string> {
  if (process.env.AGENT_ID) return process.env.AGENT_ID;
  try {
    const demo = JSON.parse(
      fs.readFileSync(new URL("../.devnet-demo.json", import.meta.url), "utf8"),
    ) as { agent?: string };
    if (demo.agent) return demo.agent;
  } catch {
    // no demo file — pick from the registry below
  }
  const agents = await retry("fetchAgents", () => fetchAgents());
  if (agents.length === 0) throw new Error(`No agents registered on ${PROGRAM_RPC_URL}.`);
  return agents[0].pda;
}

/**
 * The other browser gap: a self-owned DBC launch carries two partial signatures
 * — the config and base-mint keypairs — that the server adds before serialising.
 * The wallet must add its own without wiping theirs. Build that wire, sign it
 * through the same in-page wallet feature the UI uses, and check every signer.
 * Nothing is sent: this is the co-sign itself.
 */
async function assertMultiSignerCoSign(page: Page) {
  const demo = JSON.parse(
    fs.readFileSync(new URL("../.devnet-demo.json", import.meta.url), "utf8"),
  ) as { prestockMint?: string };
  if (!demo.prestockMint) throw new Error("No prestockMint in .devnet-demo.json.");

  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const built = await buildCreateAgentCurve({
    owner: address,
    prestockMint: demo.prestockMint,
    name: "Browser co-sign",
    symbol: "BCS",
    feeBps: 500,
    blockhash,
  });
  const partials = built.tx.signatures.filter((s) => s.signature).length;
  if (partials !== 2) {
    throw new Error(`Expected config + base mint partials, found ${partials}.`);
  }

  const wireHex = built.tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("hex");
  await page.evaluate(`window.__offhrsWireHex = ${JSON.stringify(wireHex)}`);

  const signedHex = (await page.evaluate(`(function () {
    var bytes = new Uint8Array(window.__offhrsWireHex.match(/../g).map(function (h) { return parseInt(h, 16); }));
    var account = window.__offhrsTestWallet.accounts[0];
    return window.__offhrsTestWallet.features["solana:signTransaction"]
      .signTransaction({ account: account, chain: ${JSON.stringify(CHAIN)}, transaction: bytes })
      .then(function (out) {
        return Array.prototype.map.call(out[0].signedTransaction, function (b) {
          return (b & 0xff).toString(16).padStart(2, "0");
        }).join("");
      });
  })()`)) as string;

  const tx = Transaction.from(Buffer.from(signedHex, "hex"));
  const filled = tx.signatures.filter((s) => s.signature).length;
  const valid = tx.verifySignatures(false);
  if (tx.signatures.length !== 3 || filled !== 3 || !valid) {
    throw new Error(
      `co-sign incomplete: ${filled}/${tx.signatures.length} signatures, verify=${valid}`,
    );
  }
  console.log(
    `→ multi-signer co-sign: ${filled}/3 signatures (config + base mint partials preserved)`,
  );
}

async function main() {
  const agentId = await resolveAgentId();
  const agent = await retry("fetchAgentByPda", () => fetchAgentByPda(agentId));
  if (!agent) throw new Error(`No agent at ${agentId} on ${PROGRAM_RPC_URL}.`);

  const before = await retry("fetchUserStake", () => fetchUserStake(agent.vault, address));
  const stakedBefore = before?.stakedAmount ?? 0n;

  console.log(`rpc      ${PROGRAM_RPC_URL}`);
  console.log(`app      ${APP_URL}`);
  console.log(`wallet   ${address}  (${WALLET_NAME})`);
  console.log(`agent    ${agentId}`);
  console.log(`stake    ${STAKE_AMOUNT} $AGENT (${STAKE_RAW} raw) — before ${stakedBefore}`);
  console.log("");

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    throw new Error(
      `Could not launch Chromium. playwright-core does not download browsers; install one with:\n` +
        `  pnpm dlx playwright@1.63.0 install chromium\n` +
        `Original error: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`,
    );
  }
  const context = await browser.newContext();
  await context.addInitScript({
    content: testWalletScript({
      seedHex: Buffer.from(payer.secretKey.slice(0, 32)).toString("hex"),
      pubHex: payer.publicKey.toBuffer().toString("hex"),
      address,
      walletName: WALLET_NAME,
      chain: CHAIN,
    }),
  });

  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("hydrated")) {
      console.error(`  [browser] ${m.text().split("\n")[0]}`);
    }
  });

  try {
    await page
      .goto(`${APP_URL}/connect`, { waitUntil: "domcontentloaded", timeout: 30_000 })
      .catch((e) => {
        throw new Error(
          `Could not reach ${APP_URL}. Start it first:\n` +
            `  (cd web && NEXT_PUBLIC_BETA=false PROGRAM_RPC_URL=${PROGRAM_RPC_URL} ` +
            `NEXT_PUBLIC_SOLANA_RPC_URL=${PROGRAM_RPC_URL} node_modules/.bin/next dev -p 3939)\n` +
            `Original error: ${e instanceof Error ? e.message : String(e)}`,
        );
      });

    // ── connect, through the real panel ───────────────────────────────────
    const walletButton = page.getByRole("button", { name: new RegExp(WALLET_NAME) });
    await walletButton.waitFor({ state: "visible", timeout: 30_000 });
    console.log("→ wallet discovered, connecting");
    await walletButton.click();
    await page.waitForURL("**/app", { timeout: 30_000 }).catch(() => {});
    await page.goto(`${APP_URL}/app/vault`, { waitUntil: "domcontentloaded" });

    // ── stake, through the real panel ─────────────────────────────────────
    const select = page.locator('select[aria-label="Agent to stake"]');
    try {
      await select.waitFor({ state: "attached", timeout: 60_000 });
    } catch (e) {
      const panel = await page.locator("main").innerText().catch(() => "");
      throw new Error(
        `The vault never offered an agent to stake. The panel read:\n${panel.slice(0, 800)}\n` +
          `(${e instanceof Error ? e.message : String(e)})`,
      );
    }
    await select.selectOption(agentId).catch(() => select.selectOption({ index: 0 }));
    await page.locator('input[aria-label="Amount to stake"]').fill(STAKE_AMOUNT);
    console.log("→ clicking Stake (wallet signs, server relays)");

    const confirmed = page.locator("text=/Confirmed: /").first();
    try {
      await page.getByRole("button", { name: "Stake", exact: true }).click();
      await confirmed.waitFor({ timeout: 120_000 });
    } catch (e) {
      const panel = await page.locator("main").innerText().catch(() => "");
      throw new Error(
        `No confirmation. The panel read:\n${panel.slice(0, 800)}\n` +
          `(${e instanceof Error ? e.message : String(e)})`,
      );
    }

    const signature = (await confirmed.innerText()).replace(/.*Confirmed:\s*/, "").trim();
    console.log(`→ signature ${signature}`);

    // ── assert against the chain, not the UI ──────────────────────────────
    const status = (await conn.getSignatureStatuses([signature])).value[0];
    if (!status) throw new Error("The relayed signature is not on chain.");
    if (status.err) throw new Error(`The transaction failed: ${JSON.stringify(status.err)}`);

    const after = await retry("fetchUserStake(after)", () =>
      fetchUserStake(agent.vault, address),
    );
    const stakedAfter = after?.stakedAmount ?? 0n;
    const delta = stakedAfter - stakedBefore;
    if (delta !== STAKE_RAW) {
      throw new Error(`Staked delta is ${delta}, expected ${STAKE_RAW}.`);
    }

    console.log("");
    console.log(
      `\x1b[32mPASS\x1b[0m — stake browser-signed, server-relayed, confirmed on chain: ` +
        `${stakedBefore} → ${stakedAfter} staked.`,
    );

    // ── the multi-signer co-sign, in the same browser ─────────────────────
    await assertMultiSignerCoSign(page);
    console.log(
      `\x1b[32mPASS\x1b[0m — self-owned DBC co-sign: all three signatures valid.`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(`\n\x1b[31mFAIL\x1b[0m — ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
