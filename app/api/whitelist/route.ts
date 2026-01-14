import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const WHITELIST_KEY = 'bottles:whitelist';

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
