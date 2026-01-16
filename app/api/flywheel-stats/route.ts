import { NextResponse } from 'next/server';
import { Connection, PublicKey, LAMPORTS_PER_SOL, ParsedTransactionWithMeta } from '@solana/web3.js';

// ============================================================
// FLYWHEEL STATS API
// ============================================================
// GET /api/flywheel-stats - Get flywheel stats from blockchain
//
// Queries the Shipyard wallet's transaction history to find
// burn transactions and calculate totals
// ============================================================

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const SHIPYARD_WALLET = '96u4qqbZc7MHmw8aujr4vSCaxSWyZ1EpenQ7detv5S6J';

// Token program IDs
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

interface BurnEntry {
  signature: string;
  tokensBurned: string;
  mint: string;
  timestamp: string;
  blockTime: number;
}

// Cache for stats (refreshes every minute)
let cachedStats: {
  feesCollectedLamports: number;
  tokensBurned: string;
  executionCount: number;
  lastUpdated: number;
  burns: BurnEntry[];
} | null = null;

const CACHE_TTL = 60 * 1000; // 1 minute

function formatTimeAgo(blockTime: number): string {
  const now = Date.now();
  const then = blockTime * 1000;
  const diffMs = now - then;

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

async function fetchBurnsFromBlockchain(): Promise<BurnEntry[]> {
  const connection = new Connection(SOLANA_RPC, 'confirmed');
  const walletPubkey = new PublicKey(SHIPYARD_WALLET);

  // Get recent signatures for the wallet
  const signatures = await connection.getSignaturesForAddress(walletPubkey, { limit: 100 });

  const burns: BurnEntry[] = [];

  // Fetch transactions in batches
  const batchSize = 10;
  for (let i = 0; i < signatures.length; i += batchSize) {
    const batch = signatures.slice(i, i + batchSize);
    const txs = await connection.getParsedTransactions(
      batch.map(s => s.signature),
      { maxSupportedTransactionVersion: 0 }
    );

    for (let j = 0; j < txs.length; j++) {
      const tx = txs[j];
      const sig = batch[j];

      if (!tx || tx.meta?.err) continue;

      // Look for burn instructions in the transaction
      for (const ix of tx.transaction.message.instructions) {
        if ('parsed' in ix && ix.program === 'spl-token' && ix.parsed?.type === 'burn') {
          const info = ix.parsed.info;
          burns.push({
            signature: sig.signature,
            tokensBurned: info.amount,
            mint: info.mint,
            timestamp: new Date((sig.blockTime || 0) * 1000).toISOString(),
            blockTime: sig.blockTime || 0,
          });
        }
      }

      // Also check inner instructions
      if (tx.meta?.innerInstructions) {
        for (const inner of tx.meta.innerInstructions) {
          for (const ix of inner.instructions) {
            if ('parsed' in ix && ix.program === 'spl-token' && ix.parsed?.type === 'burn') {
              const info = ix.parsed.info;
              // Avoid duplicates
              if (!burns.find(b => b.signature === sig.signature && b.tokensBurned === info.amount)) {
                burns.push({
                  signature: sig.signature,
                  tokensBurned: info.amount,
                  mint: info.mint,
                  timestamp: new Date((sig.blockTime || 0) * 1000).toISOString(),
                  blockTime: sig.blockTime || 0,
                });
              }
            }
          }
        }
      }
    }
  }

  // Sort by blockTime descending (most recent first)
  burns.sort((a, b) => b.blockTime - a.blockTime);

  return burns;
}

export async function GET() {
  try {
    // Check cache
    if (cachedStats && Date.now() - cachedStats.lastUpdated < CACHE_TTL) {
      const recentActivity = cachedStats.burns.slice(0, 10).map(burn => ({
        time: formatTimeAgo(burn.blockTime),
        timestamp: burn.timestamp,
        tokensBurned: burn.tokensBurned,
        mint: burn.mint,
        signature: burn.signature,
      }));

      return NextResponse.json({
        success: true,
        totals: {
          feesCollectedSol: cachedStats.feesCollectedLamports / LAMPORTS_PER_SOL,
          feesCollectedLamports: cachedStats.feesCollectedLamports,
          tokensBurned: cachedStats.tokensBurned,
          lpCompoundedSol: 0,
          lpCompoundedLamports: 0,
          executionCount: cachedStats.executionCount,
          lastExecution: cachedStats.burns[0]?.timestamp || null,
        },
        recentActivity,
        cached: true,
      });
    }

    // Fetch fresh stats from blockchain
    const burns = await fetchBurnsFromBlockchain();

    // Calculate totals
    let totalTokensBurned = BigInt(0);
    for (const burn of burns) {
      totalTokensBurned += BigInt(burn.tokensBurned);
    }

    // For now, estimate fees as 0 since we can't easily track fee claims
    // In the future, could scan for claimPartnerTradingFee transactions
    const feesCollectedLamports = 0;

    cachedStats = {
      feesCollectedLamports,
      tokensBurned: totalTokensBurned.toString(),
      executionCount: burns.length,
      lastUpdated: Date.now(),
      burns,
    };

    const recentActivity = burns.slice(0, 10).map(burn => ({
      time: formatTimeAgo(burn.blockTime),
      timestamp: burn.timestamp,
      tokensBurned: burn.tokensBurned,
      mint: burn.mint,
      signature: burn.signature,
    }));

    return NextResponse.json({
      success: true,
      totals: {
        feesCollectedSol: feesCollectedLamports / LAMPORTS_PER_SOL,
        feesCollectedLamports,
        tokensBurned: totalTokensBurned.toString(),
        lpCompoundedSol: 0,
        lpCompoundedLamports: 0,
        executionCount: burns.length,
        lastExecution: burns[0]?.timestamp || null,
      },
      recentActivity,
      cached: false,
    });
  } catch (error) {
    console.error('Failed to get flywheel stats:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
