/**
 * A synthetic Wallet Standard wallet, as page source.
 *
 * Shared by the browser checks. It registers the same two ways a real extension
 * does — catch the app-ready handshake if the app boots second, and announce the
 * wallet if it booted first — then signs legacy transactions with WebCrypto
 * Ed25519, replacing only the fee payer's slot so partial signatures survive.
 *
 * It returns a **string**, not a function: `tsx`/esbuild compiles functions with
 * `__name(...)` helpers that do not exist in the page, so a function passed
 * straight to Playwright throws the moment it touches a named helper. A string
 * crosses the boundary untouched.
 *
 * WebCrypto only exposes Ed25519 in a secure context, which `http://localhost`
 * is. The private key is a 32-byte seed wrapped in the minimal PKCS#8 envelope.
 */
export function testWalletScript(arg: {
  seedHex: string;
  pubHex: string;
  address: string;
  walletName: string;
  chain: string;
}): string {
  const j = (v: string) => JSON.stringify(v);
  return `
(function () {
  var seedHex = ${j(arg.seedHex)};
  var pubHex = ${j(arg.pubHex)};
  var address = ${j(arg.address)};
  var walletName = ${j(arg.walletName)};
  var chain = ${j(arg.chain)};

  function hexToBytes(h) {
    var out = new Uint8Array(h.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  function concat(parts) {
    var n = 0, i;
    for (i = 0; i < parts.length; i++) n += parts[i].length;
    var out = new Uint8Array(n), at = 0;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], at); at += parts[i].length; }
    return out;
  }
  function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function readShortvec(buf, offset) {
    var value = 0, shift = 0, i = offset, b;
    for (;;) {
      b = buf[i++];
      value |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return [value >>> 0, i];
  }
  function encodeShortvec(n) {
    var out = [], b;
    for (;;) {
      b = n & 0x7f;
      n >>>= 7;
      if (n > 0) b |= 0x80;
      out.push(b);
      if (n === 0) break;
    }
    return Uint8Array.from(out);
  }

  var seed = hexToBytes(seedHex);
  var pub = hexToBytes(pubHex);

  // The 32-byte Ed25519 seed wrapped in the minimal PKCS#8 DER envelope — the
  // only private-key form WebCrypto's importKey accepts for Ed25519.
  function ed25519Key() {
    var pkcs8 = new Uint8Array([
      0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04,
      0x22, 0x04, 0x20
    ].concat(Array.prototype.slice.call(seed)));
    return crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
  }

  function signWire(wire) {
    var header = readShortvec(wire, 0);
    var numSignatures = header[0];
    var signatureStart = header[1];
    var message = wire.slice(signatureStart + numSignatures * 64);
    var requiredSignatures = message[0];
    var accounts = readShortvec(message, 3);
    var numAccounts = accounts[0];
    var accountsStart = accounts[1];

    var signerIndex = -1;
    for (var i = 0; i < numAccounts; i++) {
      var key = message.slice(accountsStart + i * 32, accountsStart + i * 32 + 32);
      if (bytesEqual(key, pub)) signerIndex = i;
    }
    if (signerIndex < 0 || signerIndex >= requiredSignatures) {
      return Promise.reject(new Error("The test wallet is not a required signer."));
    }

    return ed25519Key().then(function (key) {
      return crypto.subtle.sign("Ed25519", key, message).then(function (raw) {
        var signatures = [];
        for (var i = 0; i < numSignatures; i++) {
          signatures.push(wire.slice(signatureStart + i * 64, signatureStart + (i + 1) * 64));
        }
        signatures[signerIndex] = new Uint8Array(raw);
        return concat([encodeShortvec(numSignatures)].concat(signatures, [message]));
      });
    });
  }

  var account = { address: address, publicKey: pub, chains: [chain], features: ["solana:signTransaction", "solana:signMessage"] };
  var icon = "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#7c5cff"/></svg>');

  var wallet = {
    version: "1.0.0",
    name: walletName,
    icon: icon,
    chains: [chain],
    features: {
      "standard:connect": { version: "1.0.0", connect: function () { return Promise.resolve({ accounts: [account] }); } },
      "standard:disconnect": { version: "1.0.0", disconnect: function () { return Promise.resolve(); } },
      "standard:events": { version: "1.0.0", on: function () { return function () {}; } },
      "solana:signMessage": {
        version: "1.0.0",
        signMessage: function () {
          var inputs = Array.prototype.slice.call(arguments);
          return ed25519Key().then(function (key) {
            return Promise.all(inputs.map(function (input) {
              return crypto.subtle.sign("Ed25519", key, input.message).then(function (raw) {
                var signed = new Uint8Array(raw);
                return { signedMessage: signed, signature: signed };
              });
            }));
          });
        }
      },
      "solana:signTransaction": {
        version: "1.0.0",
        signTransaction: function () {
          var inputs = Array.prototype.slice.call(arguments);
          return Promise.all(inputs.map(function (input) {
            return signWire(input.transaction).then(function (signedTransaction) {
              return { signedTransaction: signedTransaction };
            });
          }));
        }
      }
    },
    accounts: [account]
  };

  window.__offhrsTestWallet = wallet;
  function register(api) { try { api.register(wallet); } catch (e) {} }
  window.addEventListener("wallet-standard:app-ready", function (event) { register(event.detail); });
  try {
    window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register }));
  } catch (e) {}
})();
`;
}
