import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // Fetch real trending Solana pools from GeckoTerminal
    const trendingRes = await fetch(
      'https://api.geckoterminal.com/api/v2/networks/solana/trending_pools',
      { next: { revalidate: 180 } } // Cache for 3 minutes
    );
    const trendingData = await trendingRes.json();

    const tokenDetails = [];
    let totalVolume = 0;

    if (trendingData.data) {
      // Get top 5 trending pools
      const topPools = trendingData.data.slice(0, 5);

      for (const pool of topPools) {
        const attrs = pool.attributes;
        const vol24h = parseFloat(attrs.volume_usd?.h24 || 0);
        totalVolume += vol24h;

        // Extract token name from pool name (e.g., "WhaleGuru / SOL" -> "WhaleGuru")
        const poolName = attrs.name || '';
        const tokenName = poolName.split(' / ')[0] || 'Unknown';

        tokenDetails.push({
          symbol: tokenName,
          name: tokenName,
          address: pool.relationships?.base_token?.data?.id?.replace('solana_', '') || '',
          price: parseFloat(attrs.base_token_price_usd || 0),
          priceChange24h: parseFloat(attrs.price_change_percentage?.h24 || 0),
          volume24h: vol24h,
          txns24h: (attrs.transactions?.h24?.buys || 0) + (attrs.transactions?.h24?.sells || 0),
          chainId: 'solana',
        });
      }
    }

    return NextResponse.json({
      tokens: tokenDetails,
      totalVolume
    });
  } catch (error) {
    console.error('Failed to fetch volume radar data:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
