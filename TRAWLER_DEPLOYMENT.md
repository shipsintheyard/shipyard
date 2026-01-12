# Trawler - Standalone Deployment Guide

Deploy just the Trawler (Sonar) event monitoring widget without the launchpad.

## What is Trawler?

**Trawler** is a real-time Solana event monitoring dashboard that tracks:
- 🚀 Pump.fun launches, migrations, and graduations
- 🎒 Bags.fm reward claims
- 💰 DEX paid promotions
- 🎨 4meme migrations
- 📊 Market analytics (Market Lighthouse)
- 📈 Activity forecasts and heatmaps

## Quick Start

### Option 1: Use Existing Route (Recommended)

The simplest way - just navigate to:
```
http://localhost:3000/trawler
```

This route is already configured and ready to use!

### Option 2: Deploy as Standalone Site

If you want to deploy Trawler on its own domain (e.g., `trawler.shipyard.com`):

#### Method A: Rewrite Root Route

1. **Backup your main page**:
   ```bash
   cp app/page.tsx app/page.launchpad.tsx.backup
   ```

2. **Copy Trawler to root**:
   ```bash
   cp app/trawler/page.tsx app/page.tsx
   ```

3. **Deploy**:
   ```bash
   npm run build
   npm start
   ```

Now your root URL shows only Trawler!

#### Method B: Vercel/Netlify Rewrite Rules

Deploy the full app but use rewrite rules to show only Trawler:

**Vercel** (`vercel.json`):
```json
{
  "rewrites": [
    { "source": "/", "destination": "/trawler" }
  ]
}
```

**Netlify** (`netlify.toml`):
```toml
[[redirects]]
  from = "/"
  to = "/trawler"
  status = 200
```

#### Method C: Subdomain Deployment

Deploy the full app, then:
- Main domain: `shipyard.com` (shows launchpad)
- Subdomain: `trawler.shipyard.com` → points to `/trawler` route

**Vercel**: Use environment variables in `next.config.js`
**Netlify**: Use branch deploys

## What Gets Included

When deploying just Trawler, these components are included:

### Core Components
- ✅ **Sonar.tsx** - Main event monitoring widget
- ✅ **MarketLighthouse.tsx** - 24h market stats (BONK, Pump.fun, Meteora, Bags.fm)
- ✅ **marketData.ts** - Real-time data fetching (DexScreener + optional Birdeye)

### Features
- ✅ Real-time WebSocket connections
- ✅ Historical event tracking (30 days)
- ✅ Activity forecasting
- ✅ Market signal detection (cold/warming/hot/cooling)
- ✅ Event filtering by type
- ✅ Toast notifications
- ✅ Responsive design

### External Dependencies
- `@solana/web3.js` - Solana connections
- DexScreener API (free, no auth)
- Bags.fm API (free, no auth)
- Optional: Birdeye API (100 req/day free)

## What's NOT Included

When deploying standalone Trawler, these are excluded:
- ❌ Token launchpad UI
- ❌ Wallet adapter UI (Sonar doesn't need wallet connection)
- ❌ Meteora integration
- ❌ Token creation forms

## Environment Variables

### Required: None!
Trawler works out of the box with no configuration.

### Optional (for enhanced data):

```bash
# .env.local

# Birdeye API - Enhanced market data (optional)
NEXT_PUBLIC_BIRDEYE_API_KEY=your_birdeye_api_key

# Custom RPC endpoint (optional, defaults to public endpoints)
NEXT_PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com
```

## Customization

### Branding

**Remove "Built by THE SHIPYARD" footer**:

Edit `app/components/Sonar.tsx` (line ~2021):
```tsx
// Comment out or modify the footer
<footer style={{ ... }}>
  Built by <span style={{ color: '#5EAED8' }}>YOUR NAME</span> · Your tagline
</footer>
```

**Change Twitter link**:

Edit `app/components/Sonar.tsx` (line ~2034):
```tsx
<a href="https://x.com/YourHandle" ...>
  @YourHandle
</a>
```

### Filters

**Default enabled filters** (app/components/Sonar.tsx, line ~62):
```tsx
const [filters, setFilters] = useState({
  'pump-launch': false,        // Launches (can be noisy)
  'pump-graduation-ready': true, // Graduation signals
  'dex-paid': false,           // DEX ads
  'cto': false,                // CTO claims
  'pump-claim': false,         // Pump claims
  'bags-claim': false,         // Bags claims
  'pump-migration': true,      // Migrations
  '4meme-migration': false     // 4meme
});
```

Change `true`/`false` to customize default view.

### Market Lighthouse

**Hide Market Lighthouse** (bottom-right widget):

Edit `app/components/Sonar.tsx` (line ~2057):
```tsx
{/* Comment out to hide Market Lighthouse */}
{/* <MarketLighthouse platformVolumes={platformVolumes} marketStats={marketStats} /> */}
```

**Customize platforms** shown in Market Lighthouse:

Edit `app/utils/marketData.ts` to change BONK/Pump.fun/Meteora/Bags.fm to other platforms.

## Performance Optimization

### For Production Builds:

**1. Enable compression** (`next.config.js`):
```js
module.exports = {
  compress: true,
  // ... existing config
}
```

**2. Use production RPC**:
Instead of public endpoints, use:
- [Helius](https://helius.dev) - Free tier: 100k requests/day
- [QuickNode](https://quicknode.com) - Free tier available
- [Triton](https://triton.one) - Solana-specific

**3. Cache API responses**:
The Market Lighthouse already caches for 60 seconds. For longer caching, edit the `fetchMarketData` interval in Sonar.tsx.

## Deployment Platforms

### Vercel (Recommended)
```bash
npm install -g vercel
vercel --prod
```

### Netlify
```bash
npm install -g netlify-cli
netlify deploy --prod
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Static Export (Limited)
**Note**: Trawler uses real-time WebSockets, so SSG won't work. Use SSR deployment (Vercel/Netlify/VPS).

## Monitoring & Analytics

### Add Analytics

**Google Analytics** (`app/trawler/page.tsx`):
```tsx
import Script from 'next/script';

export default function TrawlerPage() {
  return (
    <>
      <Script src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX" />
      <Script id="google-analytics">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-XXXXXXXXXX');
        `}
      </Script>
      <Sonar />
    </>
  );
}
```

### Monitor API Usage

Check DexScreener and Birdeye API usage:
- DexScreener: No rate limits (be respectful)
- Birdeye: 100 requests/day free tier

## Troubleshooting

### WebSocket Connection Fails
- **Issue**: DexScreener WebSocket blocked by firewall
- **Fix**: Use polling fallback (edit Sonar.tsx line ~632)

### High Memory Usage
- **Issue**: Too many historical events stored
- **Fix**: Reduce retention from 30 days (line ~189)

### Market Lighthouse Shows $0
- **Issue**: API fetch failing or CORS blocked
- **Fix**: Check browser console, verify RPC endpoints

## Roadmap

Future enhancements for standalone Trawler:

- [ ] User accounts with saved filter preferences
- [ ] Webhook notifications (Discord/Telegram)
- [ ] Export event data (CSV/JSON)
- [ ] Historical event replay
- [ ] Custom event triggers/alerts
- [ ] Multi-chain support (Base, Arbitrum, etc.)

## Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Twitter**: [@ShipsInTheYard](https://x.com/ShipsInTheYard)
- **Discord**: [Join our community](#)

## License

Same as main Shipyard project.
