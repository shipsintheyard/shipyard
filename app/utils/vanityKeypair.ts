import { Keypair } from '@solana/web3.js';

/**
 * Grinds for a vanity Solana keypair with the specified suffix.
 * Case-sensitive matching for exact suffix (e.g., "SHIP").
 *
 * For a 4-character suffix with base58 (58 chars), odds are ~1 in 11.3 million.
 * At ~50-100k keypairs/second, average time is 2-4 minutes.
 *
 * @param suffix - The suffix to match (case-sensitive)
 * @param maxAttempts - Maximum attempts before giving up (default: 50 million)
 * @param onProgress - Optional callback for progress updates
 * @returns The matching keypair or null if max attempts reached
 */
export function grindVanityKeypair(
  suffix: string,
  maxAttempts: number = 50_000_000,
  onProgress?: (attempts: number) => void
): Keypair | null {
  const suffixUpper = suffix.toUpperCase();

  for (let i = 0; i < maxAttempts; i++) {
    const keypair = Keypair.generate();
    const pubkey = keypair.publicKey.toBase58();

    // Check if pubkey ends with the suffix (case-sensitive)
    if (pubkey.endsWith(suffix)) {
      return keypair;
    }

    // Progress callback every 100k attempts
    if (onProgress && i % 100_000 === 0 && i > 0) {
      onProgress(i);
    }
  }

  return null;
}

/**
 * Async version that yields to event loop periodically.
 * Better for server environments to avoid blocking.
 *
 * @param suffix - The suffix to match (case-sensitive)
 * @param maxAttempts - Maximum attempts before giving up
 * @param batchSize - Number of attempts per batch before yielding
 * @returns The matching keypair or null if max attempts reached
 */
export async function grindVanityKeypairAsync(
  suffix: string,
  maxAttempts: number = 50_000_000,
  batchSize: number = 10_000
): Promise<{ keypair: Keypair | null; attempts: number }> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    // Process a batch synchronously
    for (let i = 0; i < batchSize && attempts < maxAttempts; i++, attempts++) {
      const keypair = Keypair.generate();
      const pubkey = keypair.publicKey.toBase58();

      if (pubkey.endsWith(suffix)) {
        console.log(`Found vanity address ending in "${suffix}" after ${attempts} attempts`);
        console.log(`Address: ${pubkey}`);
        return { keypair, attempts };
      }
    }

    // Yield to event loop
    await new Promise(resolve => setImmediate(resolve));
  }

  console.log(`Max attempts (${maxAttempts}) reached without finding suffix "${suffix}"`);
  return { keypair: null, attempts };
}

/**
 * Estimates the number of attempts needed to find a suffix with given probability.
 *
 * For base58 (58 characters):
 * - 1 char suffix: ~58 attempts average
 * - 2 char suffix: ~3,364 attempts average
 * - 3 char suffix: ~195,112 attempts average
 * - 4 char suffix: ~11,316,496 attempts average (SHIP)
 * - 5 char suffix: ~656,356,768 attempts average
 */
export function estimateAttempts(suffixLength: number): number {
  return Math.pow(58, suffixLength);
}
