// Vanity Address Grinding Web Worker
// Grinds keypairs in the browser until finding one ending in target suffix

// Try to load Solana web3.js from CDN
try {
  importScripts('https://unpkg.com/@solana/web3.js@1.87.6/lib/index.iife.min.js');
} catch (e) {
  self.postMessage({
    type: 'error',
    error: 'Failed to load Solana library: ' + e.message
  });
}

// Check if library loaded
if (typeof solanaWeb3 === 'undefined') {
  self.postMessage({
    type: 'error',
    error: 'Solana library not available'
  });
} else {
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
}
