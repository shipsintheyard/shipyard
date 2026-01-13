import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { Launch } from '../route';

// ============================================================
// SHIPYARD SINGLE LAUNCH API
// ============================================================
// GET /api/launches/[address] - Get a single launch by token mint
// ============================================================

const LAUNCHES_FILE = path.join(process.cwd(), 'data', 'launches.json');

async function getLaunches(): Promise<Launch[]> {
  try {
    const data = await fs.readFile(LAUNCHES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// GET - Return a single launch by token mint address
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Address is required' },
        { status: 400 }
      );
    }

    const launches = await getLaunches();
    const launch = launches.find(l => l.tokenMint === address);

    if (!launch) {
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
