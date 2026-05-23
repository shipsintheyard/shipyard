import { NextRequest, NextResponse } from 'next/server';

const DUNE_API_KEY = process.env.DUNE_API_KEY || '';

export async function GET(request: NextRequest) {
  const execId = request.nextUrl.searchParams.get('id');

  if (!execId) {
    return NextResponse.json({ ready: false, error: 'Missing execution ID' });
  }
  if (!DUNE_API_KEY) {
    return NextResponse.json({ ready: false, error: 'No API key' });
  }

  try {
    const res = await fetch(`https://api.dune.com/api/v1/execution/${execId}/results`, {
      headers: { 'X-Dune-Api-Key': DUNE_API_KEY },
    });
    const json = await res.json();

    if (!json.is_execution_finished) {
      return NextResponse.json({ ready: false });
    }

    const rows = (json.result?.rows ?? []) as Record<string, string | null>[];

    // Parse the unified CTE result
    let txnCount = 0;
    let firstSeenDate: string | null = null;
    let walletAgeDays = 0;
    let activeMonths = 0;
    let totalTrades = 0;
    let totalVolumeUsd = 0;
    let biggestTradeUsd = 0;
    let favToken: string | null = null;
    let favTokenBuys = 0;
    const dexProtocols: { project: string; trades: number }[] = [];

    for (const row of rows) {
      switch (row.row_type) {
        case 'stats': {
          txnCount = Number(row.col1 ?? 0);
          if (row.col2) {
            firstSeenDate = new Date(row.col2).toISOString();
            walletAgeDays = Math.floor(
              (Date.now() / 1000 - new Date(row.col2).getTime() / 1000) / 86400
            );
          }
          activeMonths = Number(row.col3 ?? 0);
          totalTrades = Number(row.col4 ?? 0);
          totalVolumeUsd = Number(row.col5 ?? 0);
          biggestTradeUsd = Number(row.col6 ?? 0);
          break;
        }
        case 'project': {
          if (row.col1) {
            dexProtocols.push({
              project: row.col1,
              trades: Number(row.col2 ?? 0),
            });
          }
          break;
        }
        case 'fav_token': {
          favToken = row.col1 ?? null;
          favTokenBuys = Number(row.col2 ?? 0);
          break;
        }
      }
    }

    return NextResponse.json({
      ready: true,
      data: {
        txnCount,
        walletAgeDays,
        firstSeenDate,
        activeMonths,
        totalTrades,
        totalVolumeUsd: Math.round(totalVolumeUsd * 100) / 100,
        biggestTradeUsd: Math.round(biggestTradeUsd * 100) / 100,
        favToken,
        favTokenBuys,
        dexProtocols,
        dexCount: dexProtocols.length,
      },
    }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch {
    return NextResponse.json({ ready: false, error: 'Poll failed' });
  }
}
