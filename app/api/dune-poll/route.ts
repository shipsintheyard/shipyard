import { NextRequest, NextResponse } from 'next/server';

const DUNE_API_KEY = process.env.DUNE_API_KEY || '';

export async function GET(request: NextRequest) {
  const activityId = request.nextUrl.searchParams.get('activityId');
  const dexId = request.nextUrl.searchParams.get('dexId');

  if (!activityId || !dexId) {
    return NextResponse.json({ ready: false, error: 'Missing execution IDs' });
  }

  if (!DUNE_API_KEY) {
    return NextResponse.json({ ready: false, error: 'No API key' });
  }

  try {
    const [activityRes, dexRes] = await Promise.all([
      fetch(`https://api.dune.com/api/v1/execution/${activityId}/results`, {
        headers: { 'X-Dune-Api-Key': DUNE_API_KEY },
      }).then(r => r.json()),
      fetch(`https://api.dune.com/api/v1/execution/${dexId}/results`, {
        headers: { 'X-Dune-Api-Key': DUNE_API_KEY },
      }).then(r => r.json()),
    ]);

    // Both must be finished
    if (!activityRes.is_execution_finished || !dexRes.is_execution_finished) {
      return NextResponse.json({ ready: false });
    }

    // Parse activity data
    const activityRow = activityRes.result?.rows?.[0] as Record<string, unknown> | undefined;
    const txnCount = activityRow ? Number(activityRow.total_txns ?? 0) : 0;
    const firstSeen = activityRow?.first_seen;
    const firstSeenDate = firstSeen
      ? new Date(String(firstSeen)).toISOString()
      : null;

    const now = Date.now() / 1000;
    const walletAgeDays = firstSeenDate
      ? Math.floor((now - new Date(firstSeenDate).getTime() / 1000) / 86400)
      : 0;

    // Parse DEX data
    const dexRows = (dexRes.result?.rows ?? []) as Record<string, unknown>[];
    const dexProtocols = dexRows.map(r => ({
      project: String(r.project ?? ''),
      trades: Number(r.trades ?? 0),
    }));

    return NextResponse.json({
      ready: true,
      data: {
        txnCount,
        walletAgeDays,
        firstSeenDate,
        dexProtocols,
        dexCount: dexProtocols.length,
      },
    }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch {
    return NextResponse.json({ ready: false, error: 'Dune poll failed' });
  }
}
