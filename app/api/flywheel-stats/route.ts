import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

// ============================================================
// FLYWHEEL STATS API
// ============================================================
// GET /api/flywheel-stats - Get flywheel execution history and totals
//
// Returns aggregated stats about buyback + burn executions
// ============================================================

const FLYWHEEL_STATS_FILE = path.join(process.cwd(), 'data', 'flywheel-stats.json');

interface FlywheelHistoryEntry {
  timestamp: string;
  pool: string;
  symbol: string;
  engine: string;
  feesClaimedLamports: number;
  feesClaimedSol: number;
  lpCompoundedLamports: number;
  burnAmountLamports: number;
  tokensBurned: string;
  claimSignature?: string;
  buybackSignature?: string;
  burnSignature?: string;
}

interface FlywheelStats {
  totalFeesCollectedLamports: number;
  totalTokensBurned: string;
  totalLpCompoundedLamports: number;
  executionCount: number;
  lastExecution: string | null;
  history: FlywheelHistoryEntry[];
}

async function getFlywheelStats(): Promise<FlywheelStats> {
  try {
    const data = await fs.readFile(FLYWHEEL_STATS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      totalFeesCollectedLamports: 0,
      totalTokensBurned: '0',
      totalLpCompoundedLamports: 0,
      executionCount: 0,
      lastExecution: null,
      history: [],
    };
  }
}

function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export async function GET() {
  try {
    const stats = await getFlywheelStats();

    // Format history for frontend display
    const recentActivity = stats.history.slice(0, 10).map(entry => ({
      time: formatTimeAgo(entry.timestamp),
      timestamp: entry.timestamp,
      symbol: entry.symbol,
      engine: entry.engine,
      amount: `${entry.feesClaimedSol.toFixed(2)} SOL`,
      lp: (entry.lpCompoundedLamports / LAMPORTS_PER_SOL).toFixed(2),
      burn: (entry.burnAmountLamports / LAMPORTS_PER_SOL).toFixed(2),
      tokensBurned: entry.tokensBurned,
      tx: entry.burnSignature ? entry.burnSignature.slice(0, 4) + '...' + entry.burnSignature.slice(-3) : '',
      burnSignature: entry.burnSignature,
      buybackSignature: entry.buybackSignature,
      claimSignature: entry.claimSignature,
    }));

    return NextResponse.json({
      success: true,
      totals: {
        feesCollectedSol: stats.totalFeesCollectedLamports / LAMPORTS_PER_SOL,
        feesCollectedLamports: stats.totalFeesCollectedLamports,
        tokensBurned: stats.totalTokensBurned,
        lpCompoundedSol: stats.totalLpCompoundedLamports / LAMPORTS_PER_SOL,
        lpCompoundedLamports: stats.totalLpCompoundedLamports,
        executionCount: stats.executionCount,
        lastExecution: stats.lastExecution,
      },
      recentActivity,
    });
  } catch (error) {
    console.error('Failed to get flywheel stats:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
