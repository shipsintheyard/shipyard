// ============================================================================
// Chain detection — determine wallet type from address format
// ============================================================================

export type Chain = 'solana' | 'evm';

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/; // base58, no 0/O/I/l
const ENS_RE = /^[a-zA-Z0-9-]+\.eth$/;

export function detectChain(address: string): Chain | null {
  if (EVM_RE.test(address)) return 'evm';
  if (ENS_RE.test(address)) return 'evm';
  if (SOL_RE.test(address)) return 'solana';
  return null;
}

export function isENS(address: string): boolean {
  return ENS_RE.test(address);
}

export async function resolveENS(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://ensdata.net/${name}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.address || null;
  } catch { return null; }
}
