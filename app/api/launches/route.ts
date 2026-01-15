import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

// ============================================================
// SHIPYARD LAUNCH HISTORY API
// ============================================================
// GET /api/launches - Get all launches
// POST /api/launches - Record a new launch (called after pool creation)
//
// Uses Vercel KV for persistent storage across serverless invocations
// ============================================================

const LAUNCHES_KEY = 'shipyard:launches';

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
  engineName: 'navigator' | 'lighthouse' | 'supernova';
  devBuyAmount: number;
  devBuyPercent: number;
  createdAt: number;
  solRaised: number;
  migrated: boolean;
  migratedAt?: number;
  txSignature?: string;
  // Buyback-burn tracking (for supernova engine)
  buybackBurnEnabled: boolean;
  buybackBurnPercent: number;
  buybackBurnExecuted: boolean;
  buybackBurnTxSignature?: string;
  buybackBurnAmount?: number;
  tokensBurned?: number;
}

async function getLaunches(): Promise<Launch[]> {
  try {
    const launches = await kv.get<Launch[]>(LAUNCHES_KEY);
    return launches || [];
  } catch (error) {
    console.error('KV get error:', error);
    return [];
  }
}

async function saveLaunches(launches: Launch[]) {
  try {
    await kv.set(LAUNCHES_KEY, launches);
  } catch (error) {
    console.error('KV set error:', error);
    throw error;
  }
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

// DELETE - Clear all launches (admin only, requires ?confirm=yes)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const confirm = searchParams.get('confirm');

    if (confirm !== 'yes') {
      return NextResponse.json(
        { success: false, error: 'Add ?confirm=yes to confirm deletion' },
        { status: 400 }
      );
    }

    await kv.del(LAUNCHES_KEY);

    return NextResponse.json({
      success: true,
      message: 'All launches cleared',
    });
  } catch (error) {
    console.error('Delete launches error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PATCH - Update a launch (for fixing data)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.tokenMint) {
      return NextResponse.json(
        { success: false, error: 'tokenMint is required' },
        { status: 400 }
      );
    }

    const launches = await getLaunches();
    const index = launches.findIndex(l => l.tokenMint === body.tokenMint);

    if (index === -1) {
      return NextResponse.json(
        { success: false, error: 'Launch not found' },
        { status: 404 }
      );
    }

    // Update allowed fields
    if (body.poolAddress) launches[index].poolAddress = body.poolAddress;
    if (body.solRaised !== undefined) launches[index].solRaised = body.solRaised;
    if (body.migrated !== undefined) launches[index].migrated = body.migrated;

    await saveLaunches(launches);

    return NextResponse.json({
      success: true,
      launch: launches[index],
    });
  } catch (error) {
    console.error('Update launch error:', error);
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

    // Map engine number to name
    const engineNum = body.engine || 2;
    const engineNames: Record<number, 'navigator' | 'lighthouse' | 'supernova'> = {
      1: 'navigator',
      2: 'lighthouse',
      3: 'supernova',
    };
    const engineName = body.engineName || engineNames[engineNum] || 'lighthouse';

    // Supernova engine enables buyback-burn (20% of migration fees)
    const isBuybackBurn = engineName === 'supernova';

    const newLaunch: Launch = {
      id: `launch_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      tokenMint: body.tokenMint,
      poolAddress: body.poolAddress,
      name: body.name,
      symbol: body.symbol.toUpperCase(),
      description: body.description || '',
      imageUrl: body.imageUrl || '',
      creator: body.creator,
      engine: engineNum as 1 | 2 | 3,
      engineName: engineName,
      devBuyAmount: body.devBuyAmount || 0,
      devBuyPercent: body.devBuyPercent || 0,
      createdAt: Date.now(),
      solRaised: 0,
      migrated: false,
      txSignature: body.txSignature,
      // Buyback-burn fields
      buybackBurnEnabled: isBuybackBurn,
      buybackBurnPercent: isBuybackBurn ? 20 : 0,
      buybackBurnExecuted: false,
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
