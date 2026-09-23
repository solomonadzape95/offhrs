/**
 * A beta tester's launch, end to end, in a real browser.
 *
 *   # app running on devnet (see scripts/browser-sign-check.ts for the env)
 *   pnpm exec tsx scripts/browser-launch-check.ts
 *
 * `browser-sign-check.ts` proves the sign → relay path with a stake. This proves
 * the other end of the product: a **fresh wallet** with no special access —
 * funded by the devnet faucet, not by us — can create a Meteora DBC curve, register
 * an agent, and create its dividend vault, signing all three transactions itself.
 *
 * It is deliberately not the provider wallet. That wallet is the program's upgrade
 * authority and the mock mints' authority; a tester must not need either. The
 * faucet hands out test tokens and the tester's own key does the rest.
 *
 * The asset source is the devnet mock list (`fetchDevnetAssets`), because the real
 * PreStocks mints only exist on mainnet and have no devnet wrapper — which is the
 * gap this check was written to close.
 */
import fs from "node:fs";
import { chromium } from "playwright-core";
import { Keypair } from "@solana/web3.js";

import { PROGRAM_RPC_URL, fetchAgentByMint, fetchVaultByMint } from "../web/lib/chain.js";
import { faucet } from "../web/lib/faucet.js";
import { testWalletScript } from "./lib/test-wallet.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3939";
const WALLET_NAME = "Offhrs Launch Tester";
const CHAIN = "solana:devnet";

async function main() {
  const tester =
    (() => {
      const path = process.env.TESTER_KEYPAIR ?? new URL("../.devnet-tester.json", import.meta.url).pathname;
      try {
        return Keypair.fromSecretKey(
          Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8"))),
        );
      } catch {
        const kp = Keypair.generate();
        fs.writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
        return kp;
      }
    })();
  const address = tester.publicKey.toBase58();

  console.log(`rpc     ${PROGRAM_RPC_URL}`);
  console.log(`app     ${APP_URL}`);
  console.log(`tester  ${address}`);

  const drop = await faucet(address);
  if ("error" in drop) throw new Error(`faucet: ${drop.error}`);
  console.log(`faucet  ${drop.signature}`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    throw new Error(
      `Could not launch Chromium. Install one with:\n` +
        `  pnpm dlx playwright@1.63.0 install chromium\n` +
        `(${e instanceof Error ? e.message.split("\n")[0] : String(e)})`,
    );
  }
  const context = await browser.newContext();
  await context.addInitScript({
    content: testWalletScript({
      seedHex: Buffer.from(tester.secretKey.slice(0, 32)).toString("hex"),
      pubHex: tester.publicKey.toBuffer().toString("hex"),
      address,
      walletName: WALLET_NAME,
      chain: CHAIN,
    }),
  });
  const page = await context.newPage();

  try {
    // ── connect ──────────────────────────────────────────────────────────
    await page.goto(`${APP_URL}/connect`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const walletButton = page.getByRole("button", { name: new RegExp(WALLET_NAME) });
    await walletButton.waitFor({ state: "visible", timeout: 30_000 });
    await walletButton.click();
    await page.waitForURL("**/app", { timeout: 30_000 }).catch(() => {});

    // ── the launch form ──────────────────────────────────────────────────
    await page.goto(`${APP_URL}/launch`, { waitUntil: "domcontentloaded" });

    const self = page.getByRole("button", { name: "Create the curve" });
    await self.waitFor({ state: "visible", timeout: 60_000 });
    await self.click();
    await page
      .locator('input[placeholder="9BmQr4kLhVn2XcWpY7TfAd3sGzE6uJqRoP8vNbC1dHfM"]')
      .fill(address);
    await page.getByRole("button", { name: "Continue" }).click();

    await page.locator('input[placeholder="Orbital"]').fill("Beta Runner");
    await page.locator('input[placeholder="ORB"]').fill("BETA");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click(); // dividend asset: first mock
    await page.getByRole("button", { name: "Continue" }).click(); // curve fee: default

    // ── deploy: create curve → register → vault ──────────────────────────
    const deploy = page.getByRole("button", { name: "Create curve + register + vault" });
    await deploy.click({ timeout: 90_000 }); // waits for preflight to enable it

    const done = page.locator("text=/Deployed. \\$AGENT mint: /");
    try {
      await done.waitFor({ timeout: 240_000 });
    } catch (e) {
      const panel = await page.locator("main").innerText().catch(() => "");
      throw new Error(
        `Launch did not complete. Panel:\n${panel.slice(0, 1200)}\n` +
          `(${e instanceof Error ? e.message : String(e)})`,
      );
    }

    const mint = (await done.innerText()).replace(/.*\$AGENT mint:\s*/, "").trim();
    console.log(`mint    ${mint}`);

    // ── assert against the chain ─────────────────────────────────────────
    const agent = await fetchAgentByMint(mint);
    const vault = await fetchVaultByMint(mint);
    if (!agent) throw new Error("No Agent account for the launched mint.");
    if (!vault) throw new Error("No DividendVault for the launched agent.");
    if (agent.creator !== address) {
      throw new Error(`Agent creator is ${agent.creator}, expected ${address}.`);
    }

    console.log(`agent   ${agent.pda}`);
    console.log(`vault   ${vault.pda}`);
    console.log("");
    console.log(
      `\x1b[32mPASS\x1b[0m — a fresh faucet-funded wallet launched an agent on devnet: ` +
        `curve + register + vault, signed in the browser.`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(`\n\x1b[31mFAIL\x1b[0m — ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
