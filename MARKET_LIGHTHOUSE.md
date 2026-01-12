# Market Lighthouse Widget

Real-time Solana market analytics widget inspired by Axiom's Market Lighthouse.

## Features

- **Real-time data** from DexScreener API (no authentication required)
- **24h statistics**: Total trades, traders, volume with buy/sell breakdown
- **Top platforms**: BONK, Pump.fun, Meteora, Bags.fm with live volumes
- **Dismissible**: Click the × button to close the widget
- **Auto-refresh**: Updates every 60 seconds

## Data Sources

### Default (No Configuration Required)

The widget uses **DexScreener API** by default, which provides:
- BONK token real-time volume and price changes
- Free access, no API key needed
- Updates every 60 seconds

### Optional: Birdeye API (For Enhanced Data)

For more comprehensive market data, you can add a Birdeye API key:

1. Sign up at [birdeye.so](https://birdeye.so)
2. Get your free API key (100 requests/day)
3. Add to `.env.local`:
   ```
   NEXT_PUBLIC_BIRDEYE_API_KEY=your_api_key_here
   ```

## What's Real vs Simulated?

### Real Data (from DexScreener):
- ✅ **BONK volume** - Live 24h trading volume
- ✅ **BONK price change** - Real 24h percentage change

### Simulated Data (Pattern-based):
- ⚠️ **Pump.fun volume** - Based on typical $18-30M daily patterns
- ⚠️ **Meteora volume** - Based on typical $8-15M daily patterns
- ⚠️ **Bags.fm volume** - Based on typical $1-2M daily patterns
- ⚠️ **Total trades/traders** - Estimated from volume ($100k ≈ 500 trades, 200 traders)
- ⚠️ **Buy/Sell split** - Realistic 52-60% buy ratio

## Why Some Data is Simulated?

1. **Pump.fun** - No public aggregated API for all tokens
2. **Meteora** - Would need to aggregate multiple pools
3. **Bags.fm** - Smaller platform without public API
4. **Trades/Traders** - Requires indexed blockchain data (Helius/QuickNode)

## Future Enhancements

To get 100% real data, you could:

1. **Use Helius/QuickNode** - Solana RPC with transaction indexing
   - Track all swaps/transfers in real-time
   - Count unique signers for trader counts

2. **Aggregate platform APIs**:
   - Pump.fun: Track their program ID transactions
   - Meteora: Sum all pool volumes via their API
   - Bags.fm: Track program transactions

3. **Use Birdeye Premium** - More comprehensive market data
   - Platform-specific volume breakdowns
   - Real trader counts
   - Historical data

## Implementation

The Market Lighthouse consists of:

- **[MarketLighthouse.tsx](app/components/MarketLighthouse.tsx)** - UI component
- **[marketData.ts](app/utils/marketData.ts)** - Data fetching utilities
- **[Sonar.tsx](app/components/Sonar.tsx)** - Integration into main app

### Code Flow:

```typescript
// Sonar.tsx
useEffect(() => {
  const data = await fetchMarketData(); // Fetches real + simulated data
  setPlatformVolumes(data.platformVolumes);
  setMarketStats(data.marketStats);
}, []);

// marketData.ts
export async function fetchMarketData() {
  const bonk = await fetchBONKVolume(); // Real data from DexScreener
  const pumpfun = await fetchPumpFunVolume(); // Simulated
  // ... returns combined data
}
```

## Customization

You can easily swap the data sources in [marketData.ts](app/utils/marketData.ts:1):

```typescript
// Example: Add your own data source
async function fetchPumpFunVolume(): Promise<PlatformVolume> {
  const response = await fetch('YOUR_API_ENDPOINT');
  const data = await response.json();
  return {
    volume: data.volume,
    change: data.change24h
  };
}
```

## FAQ

**Q: Is the BONK volume accurate?**
A: Yes! It's fetched from DexScreener which aggregates all DEX trading pairs.

**Q: How often does it update?**
A: Every 60 seconds automatically.

**Q: Can I close the widget?**
A: Yes, click the × button in the top-right corner.

**Q: Will it come back after closing?**
A: Currently, it stays closed for the session. To make it persistent, we'd need to store the preference in localStorage.

**Q: Can I use this for mainnet?**
A: Yes! DexScreener provides mainnet data by default.

## Resources

- [DexScreener API Docs](https://docs.dexscreener.com)
- [Birdeye API Docs](https://docs.birdeye.so)
- [Helius Webhooks](https://docs.helius.dev/webhooks-and-websockets/what-are-webhooks) - For real transaction tracking
- [Solana FM](https://solana.fm) - For exploring program transactions
