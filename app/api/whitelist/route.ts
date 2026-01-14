import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const WHITELIST_KEY = 'bottles:whitelist';
const BOTTLES_KEY = 'bottles:all';

interface Bottle {
  id: string;
  sender: string;
  recipient?: string;
  timestamp: number;
}

interface WhitelistEntry {
  wallet: string;
  bottlesSent: number;
  firstBottle: number;
  lastBottle: number;
}

// GET - Fetch whitelist (with optional minimum bottles filter)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const minBottles = parseInt(searchParams.get('min') || '1');
    const format = searchParams.get('format'); // 'csv' for export

    const whitelist = await redis.get<WhitelistEntry[]>(WHITELIST_KEY) || [];

    // Filter by minimum bottles sent
    const filtered = whitelist.filter(w => w.bottlesSent >= minBottles);

    // Sort by bottles sent (descending)
    filtered.sort((a, b) => b.bottlesSent - a.bottlesSent);

    // CSV export format
    if (format === 'csv') {
      const csv = ['wallet,bottlesSent,firstBottle,lastBottle']
        .concat(filtered.map(w => `${w.wallet},${w.bottlesSent},${w.firstBottle},${w.lastBottle}`))
        .join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="bottles-whitelist.csv"',
        },
      });
    }

    // Plain wallet list format (for easy copying)
    if (format === 'list') {
      const list = filtered.map(w => w.wallet).join('\n');
      return new NextResponse(list, {
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    return NextResponse.json({
      total: filtered.length,
      minBottles,
      whitelist: filtered,
    });
  } catch (error) {
    console.error('Failed to fetch whitelist:', error);
    return NextResponse.json({ whitelist: [], total: 0 });
  }
}

// POST - Backfill whitelist from existing bottles
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action !== 'backfill') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Get all existing bottles
    const bottles = await redis.get<Bottle[]>(BOTTLES_KEY) || [];

    // Build whitelist from bottles
    const whitelistMap = new Map<string, WhitelistEntry>();

    for (const bottle of bottles) {
      // Skip DMs - only count public bottles
      if (bottle.recipient) continue;

      const existing = whitelistMap.get(bottle.sender);
      if (existing) {
        existing.bottlesSent++;
        if (bottle.timestamp < existing.firstBottle) {
          existing.firstBottle = bottle.timestamp;
        }
        if (bottle.timestamp > existing.lastBottle) {
          existing.lastBottle = bottle.timestamp;
        }
      } else {
        whitelistMap.set(bottle.sender, {
          wallet: bottle.sender,
          bottlesSent: 1,
          firstBottle: bottle.timestamp,
          lastBottle: bottle.timestamp,
        });
      }
    }

    const whitelist = Array.from(whitelistMap.values());
    await redis.set(WHITELIST_KEY, whitelist);

    return NextResponse.json({
      success: true,
      message: `Backfilled ${whitelist.length} wallets from ${bottles.length} bottles`,
      total: whitelist.length,
    });
  } catch (error) {
    console.error('Failed to backfill whitelist:', error);
    return NextResponse.json({ error: 'Failed to backfill' }, { status: 500 });
  }
}
