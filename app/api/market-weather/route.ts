import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // Fetch Fear & Greed Index (7 days)
    const fgResponse = await fetch('https://api.alternative.me/fng/?limit=7', {
      next: { revalidate: 300 } // Cache for 5 minutes
    });
    const fgData = await fgResponse.json();

    // Fetch BTC/ETH prices from CoinGecko
    let priceData = { bitcoin: { usd: 0, usd_24h_change: 0 }, ethereum: { usd_24h_change: 0 } };
    try {
      const priceRes = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true',
        { next: { revalidate: 60 } }
      );
      priceData = await priceRes.json();
    } catch (e) {
      console.warn('Could not fetch price data:', e);
    }

    // Fetch funding rates from OKX
    let btcFundingRate = 0;
    let ethFundingRate = 0;
    try {
      const [btcFundingRes, ethFundingRes] = await Promise.all([
        fetch('https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP'),
        fetch('https://www.okx.com/api/v5/public/funding-rate?instId=ETH-USDT-SWAP')
      ]);

      const btcFundingData = await btcFundingRes.json();
      const ethFundingData = await ethFundingRes.json();

      btcFundingRate = parseFloat(btcFundingData.data?.[0]?.fundingRate || 0) * 100;
      ethFundingRate = parseFloat(ethFundingData.data?.[0]?.fundingRate || 0) * 100;
    } catch (e) {
      console.warn('Could not fetch funding rates:', e);
    }

    return NextResponse.json({
      fearGreed: fgData,
      prices: {
        btcPrice: priceData.bitcoin?.usd || 0,
        btcChange24h: priceData.bitcoin?.usd_24h_change || 0,
        ethChange24h: priceData.ethereum?.usd_24h_change || 0
      },
      funding: {
        btcFundingRate,
        ethFundingRate
      }
    });
  } catch (error) {
    console.error('Failed to fetch market weather data:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
