/**
 * Verify the swap-signing path without a browser.
 *
 * Fetches a real Jupiter swap transaction and decodes it exactly the way the
 * wallet session will, then parses the message header by hand to prove it is a
 * genuine v0 versioned transaction addressed to our signer. Everything from here
 * to a broadcast order is the wallet's own signature.
 *
 * Run from the repo root:  pnpm exec tsx web/scripts/swap-check.ts
 */
import { getBase64Encoder, getTransactionDecoder, address, getBase58Decoder } from "@solana/kit";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SPACEX = "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh";
const USER = address("9BmQr4kLhVn2XcWpY7TfAd3sGzE6uJqRoP8vNbC1dHfM");

/** Read a Solana shortvec length. Takes ArrayLike so it accepts kit's branded
 *  ReadonlyUint8Array as well as a plain Uint8Array. */
function shortvec(buf: ArrayLike<number>, at: number): [number, number] {
  let value = 0;
  let shift = 0;
  let i = at;
  for (;;) {
    const byte = buf[i++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return [value, i];
}

async function main() {
  const q = await fetch(
    `https://lite-api.jup.ag/swap/v1/quote?inputMint=${USDC}&outputMint=${SPACEX}&amount=1000000&slippageBps=100`,
  );
  if (!q.ok) throw new Error(`quote ${q.status}`);
  const quote = await q.json();
  console.log(`quote   1.00 USDC -> ${quote.outAmount} raw SPACEX`);
  console.log(`route   ${(quote.routePlan ?? []).map((s: any) => s.swapInfo?.label).join(" -> ")}`);

  const s = await fetch("https://lite-api.jup.ag/swap/v1/swap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: USER,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    }),
  });
  if (!s.ok) throw new Error(`swap ${s.status}: ${await s.text()}`);
  const { swapTransaction } = await s.json();

  // Exactly what the wallet session is handed: base64 -> kit Transaction.
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(swapTransaction));
  const signers = Object.keys(tx.signatures ?? {});
  console.log(`\ntx      ${swapTransaction.length} base64 chars`);
  console.log(`sigslot ${signers.length} (${signers[0] === USER ? "our signer" : signers[0]})`);

  const m = tx.messageBytes;
  const version = m[0] & 0x80 ? (m[0] & 0x7f) : -1;
  const required = m[1];
  const [accountCount, after] = shortvec(m, 4);

  // First static account is always the fee payer.
  const feePayer = getBase58Decoder().decode(m.slice(after, after + 32));

  console.log(`message version=${version === -1 ? "legacy" : `v${version}`} requiredSignatures=${required} accounts=${accountCount}`);
  console.log(`feepayer ${feePayer}`);

  if (version !== 0) throw new Error(`expected a v0 versioned transaction, got ${version}`);
  if (feePayer !== USER) throw new Error(`fee payer ${feePayer} does not match the signer`);
  if (signers[0] !== USER) throw new Error("signature slot is not ours");

  console.log(`\nPASS — kit decodes it, it is a v0 tx, and it is payable by the connected wallet.`);
  console.log(`       The only remaining step is the wallet's own signature.`);
}

main().catch((e) => {
  console.error(`\nFAIL: ${e.message}`);
  process.exit(1);
});
