import { NextResponse } from 'next/server';

const DUNE_API_KEY = process.env.DUNE_API_KEY || '';
const DUNE_PF_QUERY_ID = process.env.DUNE_PF_QUERY_ID || '';

// Cache for 6 hours — results only change once per day via cron
export const revalidate = 21600;

export async function GET() {
  if (!DUNE_API_KEY || !DUNE_PF_QUERY_ID) {
    return NextResponse.json({ success: false, error: 'Not configured' });
  }

  try {
    // Fetch latest cached results (no execution, just reads last run)
    const res = await fetch(
      `https://api.dune.com/api/v1/query/${DUNE_PF_QUERY_ID}/results?limit=30`,
      { headers: { 'X-Dune-Api-Key': DUNE_API_KEY } }
    );
    const json = await res.json();

    if (!json.result?.rows) {
      return NextResponse.json({ success: false, error: 'No results yet — cron may not have run' });
    }

    return NextResponse.json({
      success: true,
      data: json.result.rows,
      lastExecuted: json.execution_started_at,
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Fetch failed' });
  }
}
