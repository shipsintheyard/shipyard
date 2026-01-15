import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { Launch } from '../route';

// ============================================================
// SHIPYARD SINGLE LAUNCH API
// ============================================================
// GET /api/launches/[address] - Get a single launch by token mint
// Uses Vercel KV for persistent storage
// ============================================================

const LAUNCHES_KEY = 'shipyard:launches';

async function getLaunches(): Promise<Launch[]> {
  try {
    const launches = await kv.get<Launch[]>(LAUNCHES_KEY);
    return launches || [];
  } catch (error) {
    console.error('KV get error:', error);
    return [];
  }
}

// GET - Return a single launch by token mint address
export async function GET(
  request: NextRequest,
  context: { params: { address: string } }
) {
  try {
    const address = context.params.address;

    console.log('Looking up launch for address:', address);

    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Address is required' },
        { status: 400 }
      );
    }

    const launches = await getLaunches();
    console.log('Found', launches.length, 'launches in KV');

    const launch = launches.find(l => l.tokenMint === address);

    if (!launch) {
      console.log('No launch found for:', address);
      console.log('Available mints:', launches.map(l => l.tokenMint));
      return NextResponse.json(
        { success: false, error: 'Launch not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      launch,
    });
  } catch (error) {
    console.error('Get launch error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
