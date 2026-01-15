// Vanity Address Grinding Web Worker
// Grinds keypairs in the browser until finding one ending in target suffix

// We need to import the Solana web3.js library
// Using a CDN version that works in web workers
importScripts('https://unpkg.com/@solana/web3.js@1.87.6/lib/index.iife.min.js');

const { Keypair } = solanaWeb3;

// Base58 alphabet for validation
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function isValidBase58Suffix(suffix) {
  return [...suffix].every(char => BASE58_ALPHABET.includes(char));
}

self.onmessage = function(e) {
  const { suffix, maxAttempts = 100_000_000, reportInterval = 10_000 } = e.data;

  if (!suffix || !isValidBase58Suffix(suffix)) {
    self.postMessage({
      type: 'error',
      error: 'Invalid suffix - must be valid base58 characters'
    });
    return;
  }

  const targetSuffix = suffix.toUpperCase();
  let attempts = 0;
  const startTime = Date.now();

  while (attempts < maxAttempts) {
    attempts++;

    const keypair = Keypair.generate();
    const address = keypair.publicKey.toBase58();

    // Check if address ends with target suffix (case insensitive)
    if (address.toUpperCase().endsWith(targetSuffix)) {
      const elapsed = (Date.now() - startTime) / 1000;

      // Convert secret key to array for transfer
      self.postMessage({
        type: 'found',
        publicKey: address,
        secretKey: Array.from(keypair.secretKey),
        attempts,
        elapsed,
        rate: Math.round(attempts / elapsed)
      });
      return;
    }

    // Report progress periodically
    if (attempts % reportInterval === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      self.postMessage({
        type: 'progress',
        attempts,
        elapsed,
        rate: Math.round(attempts / elapsed)
      });
    }
  }

  // Hit max attempts without finding
  self.postMessage({
    type: 'maxed',
    attempts,
    elapsed: (Date.now() - startTime) / 1000
  });
};
