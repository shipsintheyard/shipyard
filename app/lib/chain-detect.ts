// ============================================================================
// Chain detection — determine wallet type from address format
// ============================================================================

export type Chain = 'solana' | 'evm';

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/; // base58, no 0/O/I/l

export function detectChain(address: string): Chain | null {
  if (EVM_RE.test(address)) return 'evm';
  if (SOL_RE.test(address)) return 'solana';
  return null;
}
