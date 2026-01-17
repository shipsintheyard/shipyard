import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// BAGS.FM UNCLAIMED FEES API
// ============================================================
// GET /api/bags-fees?wallet=<address> - Get unclaimed fees from Bags.fm
//
// Proxies to Bags.fm public API to check claimable positions
// ============================================================

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';
const BAGS_API_KEY = process.env.BAGS_API_KEY || '';

interface ClaimablePosition {
  mint: string;
  symbol: string;
  name: string;
  imageUri?: string;
  poolAddress: string;
  poolType: 'virtual' | 'damm_v2';
  unclaimedFeesLamports: number;
  unclaimedFeesSol: number;
  feeSharePercent?: number;
}

interface BagsApiResponse {
  success: boolean;
  positions?: ClaimablePosition[];
  error?: string;
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    const wallet = request.nextUrl.searchParams.get('wallet');

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'wallet parameter is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate wallet address format (basic check)
    if (wallet.length < 32 || wallet.length > 44) {
      return NextResponse.json(
        { success: false, error: 'Invalid wallet address format' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Check if API key is configured
    if (!BAGS_API_KEY) {
      // Try without API key (may work for public data)
      console.log('No BAGS_API_KEY configured, trying without auth...');
    }

    // Fetch from Bags.fm API
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (BAGS_API_KEY) {
      headers['x-api-key'] = BAGS_API_KEY;
    }

    const apiUrl = `${BAGS_API_BASE}/token-launch/claimable-positions?wallet=${wallet}`;
    console.log('Fetching from Bags API:', apiUrl);
    console.log('Using API key:', BAGS_API_KEY ? 'yes (set)' : 'no (not set)');

    const response = await fetch(apiUrl, {
      headers,
      // Add timeout
      signal: AbortSignal.timeout(10000),
    });

    console.log('Bags API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Bags API error:', response.status, errorText);

      // If unauthorized, provide helpful message
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          {
            success: false,
            error: 'Bags.fm API key required or invalid.',
            hint: 'Get an API key from https://docs.bags.fm',
            details: errorText
          },
          { status: 401, headers: corsHeaders }
        );
      }

      return NextResponse.json(
        { success: false, error: `Bags API error: ${response.status}`, details: errorText },
        { status: response.status, headers: corsHeaders }
      );
    }

    const data = await response.json();
    console.log('Bags API response:', JSON.stringify(data).slice(0, 500));

    // Bags API uses "response" field for the array
    const rawPositions = data.response || data.positions || data.data || [];

    // Transform and return the data
    const positions: ClaimablePosition[] = rawPositions.map((pos: any) => ({
      mint: pos.mint || pos.tokenMint,
      symbol: pos.symbol || pos.tokenSymbol || 'Unknown',
      name: pos.name || pos.tokenName || 'Unknown Token',
      imageUri: pos.imageUri || pos.image || pos.logoUri,
      poolAddress: pos.poolAddress || pos.pool,
      poolType: pos.poolType || (pos.isDamm ? 'damm_v2' : 'virtual'),
      unclaimedFeesLamports: pos.unclaimedFeesLamports || pos.claimableAmount || 0,
      unclaimedFeesSol: (pos.unclaimedFeesLamports || pos.claimableAmount || 0) / 1e9,
      feeSharePercent: pos.feeSharePercent || pos.feeShare,
    }));

    // Calculate totals
    const totalUnclaimedLamports = positions.reduce((sum, p) => sum + p.unclaimedFeesLamports, 0);
    const totalUnclaimedSol = totalUnclaimedLamports / 1e9;

    return NextResponse.json({
      success: true,
      wallet,
      totals: {
        unclaimedFeesLamports: totalUnclaimedLamports,
        unclaimedFeesSol: totalUnclaimedSol,
        positionCount: positions.length,
      },
      positions,
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Bags fees error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
