import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// ============================================================
// SHIPYARD LAUNCH HISTORY API
// ============================================================
// GET /api/launches - Get all launches
// POST /api/launches - Record a new launch (called after pool creation)
// ============================================================

const LAUNCHES_FILE = path.join(process.cwd(), 'data', 'launches.json');

export interface Launch {
  id: string;
  tokenMint: string;
  poolAddress: string;
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
  creator: string;
  engine: 1 | 2 | 3;
  devBuyAmount: number;
  devBuyPercent: number;
  createdAt: number;
  solRaised: number;
  migrated: boolean;
  txSignature?: string;
}

async function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

async function getLaunches(): Promise<Launch[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(LAUNCHES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveLaunches(launches: Launch[]) {
  await ensureDataDir();
  await fs.writeFile(LAUNCHES_FILE, JSON.stringify(launches, null, 2));
}

// GET - Return all launches
export async function GET() {
  try {
    const launches = await getLaunches();

    // Sort by most recent first
    launches.sort((a, b) => b.createdAt - a.createdAt);

    // Calculate stats
    const totalSolRaised = launches.reduce((sum, l) => sum + l.solRaised, 0);
    const migratedCount = launches.filter(l => l.migrated).length;

    return NextResponse.json({
      success: true,
      totalLaunches: launches.length,
      totalSolRaised,
      migratedCount,
      launches,
    });
  } catch (error) {
    console.error('Get launches error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST - Record a new launch
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.tokenMint || !body.poolAddress || !body.name || !body.symbol || !body.creator) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const launches = await getLaunches();

    // Check for duplicate
    if (launches.some(l => l.tokenMint === body.tokenMint)) {
      return NextResponse.json(
        { success: false, error: 'Token already registered' },
        { status: 400 }
      );
    }

    const newLaunch: Launch = {
      id: `launch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tokenMint: body.tokenMint,
      poolAddress: body.poolAddress,
      name: body.name,
      symbol: body.symbol.toUpperCase(),
      description: body.description || '',
      imageUrl: body.imageUrl || '',
      creator: body.creator,
      engine: body.engine || 2,
      devBuyAmount: body.devBuyAmount || 0,
      devBuyPercent: body.devBuyPercent || 0,
      createdAt: Date.now(),
      solRaised: 0,
      migrated: false,
      txSignature: body.txSignature,
    };

    launches.push(newLaunch);
    await saveLaunches(launches);

    return NextResponse.json({
      success: true,
      launch: newLaunch,
    });
  } catch (error) {
    console.error('Record launch error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
