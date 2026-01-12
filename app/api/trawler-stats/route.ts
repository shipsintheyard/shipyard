import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const redis = Redis.fromEnv();

const STATS_KEY = 'trawler:stats';

interface TrawlerStats {
  totalSol: number;
  totalClaims: number;
  totalAccounts: number;
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
    const { solAmount, accountsClosed } = body;

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

    return NextResponse.json(newStats);
  } catch (error) {
    console.error('Failed to update stats:', error);
    return NextResponse.json({ error: 'Failed to update stats' }, { status: 500 });
  }
}
