import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// SCAN BAGS.FM FEES API
// ============================================================
// GET /api/scan-bags-fees - Find pools with high trading volume
//
// Uses DexScreener API to find high-volume Meteora pools
// ============================================================

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

interface PoolData {
  poolAddress: string;
  tokenMint?: string;
  symbol?: string;
  name?: string;
  estimatedFees: number;
  quoteFees: number; // Alias for frontend compatibility
  baseFees: number;
  volume24h: number;
  priceUsd?: string;
  liquidity?: number;
  marketCap?: number;
  fdv?: number;
  url?: string;
  isMigrated: boolean;
  programId: string;
  // Opportunity score: fees relative to market cap (higher = better r/r)
  opportunityScore?: number;
}

export async function GET(request: NextRequest) {
  try {
    const minFeesParam = request.nextUrl.searchParams.get('minFees');
    const minFees = minFeesParam ? parseFloat(minFeesParam) : 0.1;

    console.log(`Looking for pools with estimated fees >= ${minFees} SOL...`);

    const pools: PoolData[] = [];

    // Use DexScreener API to find high-volume Meteora pools
    // DexScreener is free and has good Solana DEX data
    try {
      // Search for recent Meteora pairs
      const response = await fetch(
        'https://api.dexscreener.com/latest/dex/search?q=meteora',
        {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log(`DexScreener returned ${data.pairs?.length || 0} pairs`);

        if (data.pairs) {
          for (const pair of data.pairs) {
            // Filter for Solana Meteora pools
            if (pair.chainId !== 'solana') continue;
            if (!pair.dexId?.toLowerCase().includes('meteora')) continue;

            const volume24h = pair.volume?.h24 || 0;
            // Estimate fees: ~1% of volume, converted to SOL
            // Assuming SOL price ~$150
            const solPrice = 150;
            const estimatedFees = (volume24h * 0.01) / solPrice;

            if (estimatedFees >= minFees) {
              const marketCap = pair.marketCap || pair.fdv || 0;
              // Opportunity score: (fees in USD) / (market cap) * 10000
              // Higher score = more fees relative to market cap = better opportunity
              const feesUsd = estimatedFees * solPrice;
              const opportunityScore = marketCap > 0 ? (feesUsd / marketCap) * 10000 : 0;

              pools.push({
                poolAddress: pair.pairAddress,
                tokenMint: pair.baseToken?.address,
                symbol: pair.baseToken?.symbol,
                name: pair.baseToken?.name,
                estimatedFees,
                quoteFees: estimatedFees, // For frontend compatibility
                baseFees: 0,
                volume24h,
                priceUsd: pair.priceUsd,
                liquidity: pair.liquidity?.usd,
                marketCap: pair.marketCap,
                fdv: pair.fdv,
                url: pair.url,
                isMigrated: pair.labels?.includes('DYN2') || false, // DYN2 = DAMM v2 migrated
                programId: 'meteora',
                opportunityScore,
              });
            }
          }
        }
      } else {
        console.log('DexScreener search failed:', response.status);
      }
    } catch (e) {
      console.error('DexScreener search error:', e instanceof Error ? e.message : 'unknown');
    }

    // Also try getting top Solana pairs
    if (pools.length < 10) {
      try {
        const response = await fetch(
          'https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112',
          {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000),
          }
        );

        if (response.ok) {
          const data = await response.json();

          if (data.pairs) {
            for (const pair of data.pairs) {
              // Filter for Meteora pools only
              if (!pair.dexId?.toLowerCase().includes('meteora')) continue;
              // Skip if we already have this pool
              if (pools.find(p => p.poolAddress === pair.pairAddress)) continue;

              const volume24h = pair.volume?.h24 || 0;
              const solPrice = 150;
              const estimatedFees = (volume24h * 0.01) / solPrice;

              if (estimatedFees >= minFees) {
                const solPrice = 150;
                const marketCap = pair.marketCap || pair.fdv || 0;
                const feesUsd = estimatedFees * solPrice;
                const opportunityScore = marketCap > 0 ? (feesUsd / marketCap) * 10000 : 0;

                pools.push({
                  poolAddress: pair.pairAddress,
                  tokenMint: pair.baseToken?.address,
                  symbol: pair.baseToken?.symbol,
                  name: pair.baseToken?.name,
                  estimatedFees,
                  quoteFees: estimatedFees,
                  baseFees: 0,
                  volume24h,
                  priceUsd: pair.priceUsd,
                  liquidity: pair.liquidity?.usd,
                  marketCap: pair.marketCap,
                  fdv: pair.fdv,
                  url: pair.url,
                  isMigrated: pair.labels?.includes('DYN2') || false,
                  programId: 'meteora',
                  opportunityScore,
                });
              }
            }
          }
        }
      } catch (e) {
        console.error('DexScreener SOL pairs error:', e instanceof Error ? e.message : 'unknown');
      }
    }

    // Check for sort parameter
    const sortBy = request.nextUrl.searchParams.get('sortBy') || 'opportunity';

    if (sortBy === 'opportunity') {
      // Sort by opportunity score (best r/r first - high fees relative to low mcap)
      pools.sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0));
    } else if (sortBy === 'fees') {
      // Sort by estimated fees descending
      pools.sort((a, b) => b.estimatedFees - a.estimatedFees);
    } else if (sortBy === 'mcap') {
      // Sort by market cap ascending (lowest first)
      pools.sort((a, b) => (a.marketCap || Infinity) - (b.marketCap || Infinity));
    }

    // Limit results
    const results = pools.slice(0, 50);

    if (results.length === 0) {
      return NextResponse.json({
        success: true,
        minFeesFilter: minFees,
        totalFound: 0,
        pools: [],
        note: 'No high-volume Meteora pools found. Fee estimates are based on 24h trading volume.',
        suggestions: [
          'Use /api/bags-fees?wallet=YOUR_WALLET to check your specific claimable fees',
          'Try lowering the minimum fee threshold',
          'Visit bags.fm to see trending tokens directly',
        ],
      }, { headers: corsHeaders });
    }

    return NextResponse.json({
      success: true,
      minFeesFilter: minFees,
      totalFound: results.length,
      pools: results,
      note: 'Fee estimates are based on 24h trading volume (~1% of volume). These are ALL Meteora pools, not just Bags.fm. Actual claimable fees depend on your fee share position.',
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Scan bags fees error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
