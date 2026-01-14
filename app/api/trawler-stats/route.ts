import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

// Vercel KV uses different env var names than Upstash default
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const STATS_KEY = 'trawler:stats';
const WHITELIST_KEY = 'trawler:whitelist';

interface TrawlerStats {
  totalSol: number;
  totalClaims: number;
  totalAccounts: number;
}

interface TrawlerWhitelistEntry {
  wallet: string;
  totalSolRecovered: number;
  totalAccountsClosed: number;
  claimCount: number;
  firstClaim: number;
  lastClaim: number;
}

// GET - Fetch current stats
export async function GET() {
  try {
    const stats = await redis.get<TrawlerStats>(STATS_KEY);

    return NextResponse.json({
      totalSol: stats?.totalSol || 0,
      totalClaims: stats?.totalClaims || 0,
      totalAccounts: stats?.totalAccounts || 0,
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    return NextResponse.json({
      totalSol: 0,
      totalClaims: 0,
      totalAccounts: 0,
    });
  }
}

// POST - Record a new claim
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { solAmount, accountsClosed, wallet } = body;

    if (typeof solAmount !== 'number' || solAmount < 0) {
      return NextResponse.json({ error: 'Invalid solAmount' }, { status: 400 });
    }

    // Get current stats
    const currentStats = await redis.get<TrawlerStats>(STATS_KEY) || {
      totalSol: 0,
      totalClaims: 0,
      totalAccounts: 0,
    };

    // Update stats
    const newStats: TrawlerStats = {
      totalSol: currentStats.totalSol + solAmount,
      totalClaims: currentStats.totalClaims + 1,
      totalAccounts: currentStats.totalAccounts + (accountsClosed || 0),
    };

    await redis.set(STATS_KEY, newStats);

    // Add user to Trawler whitelist if wallet provided
    if (wallet && typeof wallet === 'string') {
      const whitelist = await redis.get<TrawlerWhitelistEntry[]>(WHITELIST_KEY) || [];
      const existingEntry = whitelist.find(w => w.wallet === wallet);

      if (existingEntry) {
        existingEntry.totalSolRecovered += solAmount;
        existingEntry.totalAccountsClosed += (accountsClosed || 0);
        existingEntry.claimCount++;
        existingEntry.lastClaim = Date.now();
      } else {
        whitelist.push({
          wallet,
          totalSolRecovered: solAmount,
          totalAccountsClosed: accountsClosed || 0,
          claimCount: 1,
          firstClaim: Date.now(),
          lastClaim: Date.now(),
        });
      }

      await redis.set(WHITELIST_KEY, whitelist);
    }

    return NextResponse.json(newStats);
  } catch (error) {
    console.error('Failed to update stats:', error);
    return NextResponse.json({ error: 'Failed to update stats' }, { status: 500 });
  }
}
