import { NextResponse } from 'next/server';

const DUNE_API_KEY = process.env.DUNE_API_KEY || '';
const DUNE_PF_QUERY_ID = process.env.DUNE_PF_QUERY_ID || '';

// ============================================================================
// Dune Daily Cron — triggers execution of PF global stats query
//
// Setup:
// 1. Create this query on dune.com and save it:
//
//    SELECT
//      date_trunc('day', block_time) AS day,
//      COUNT(*) AS num_trades,
//      COALESCE(SUM(amount_usd), 0) AS volume_usd,
//      COUNT(DISTINCT tx_from) AS unique_wallets
//    FROM dex_solana.trades
//    WHERE project = 'pumpfun'
//      AND block_time >= CURRENT_DATE - INTERVAL '30' day
//    GROUP BY 1
//    ORDER BY 1
//
// 2. Copy the query ID from the Dune URL (e.g. dune.com/queries/12345)
// 3. Set DUNE_PF_QUERY_ID=12345 in Vercel env vars
// 4. This cron runs daily at 1 AM UTC (see vercel.json)
// 5. Results are fetched by /api/pf-global
// ============================================================================

export async function GET() {
  if (!DUNE_API_KEY || !DUNE_PF_QUERY_ID) {
    return NextResponse.json({
      success: false,
      error: 'Set DUNE_PF_QUERY_ID env var — see route comments for setup instructions',
    });
  }

  try {
    const res = await fetch(
      `https://api.dune.com/api/v1/query/${DUNE_PF_QUERY_ID}/execute`,
      {
        method: 'POST',
        headers: {
          'X-Dune-Api-Key': DUNE_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ performance: 'medium' }),
      }
    );
    const data = await res.json();

    if (!data.execution_id) {
      return NextResponse.json({ success: false, error: 'Execution failed', detail: data });
    }

    return NextResponse.json({
      success: true,
      executionId: data.execution_id,
      state: data.state,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Cron error';
    return NextResponse.json({ success: false, error: message });
  }
}
