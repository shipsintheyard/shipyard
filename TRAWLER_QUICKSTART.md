# Trawler - Quick Start Guide

Ship just the Trawler without touching the launchpad.

## Current Status ✅

**Already Done:**
- ✅ Standalone route exists at `/trawler`
- ✅ Sonar widget is fully functional
- ✅ Market Lighthouse integrated
- ✅ All features working (events, forecasts, analytics)

## How to Use Right Now

### Option 1: Test Locally
```bash
npm run dev
```
Visit: http://localhost:3000/trawler

### Option 2: Deploy to Production

**Vercel** (1-click):
```bash
vercel --prod
```
Your Trawler will be at: `https://your-domain.vercel.app/trawler`

**Netlify**:
```bash
netlify deploy --prod
```

## Routes Comparison

| Route | Shows | Use Case |
|-------|-------|----------|
| `/` | Full Shipyard (Launchpad + Trawler + Docs) | Complete platform |
| `/trawler` | **Just Trawler (Sonar widget)** | Event monitoring only |

## Deployment Scenarios

### Scenario 1: Separate Subdomain
Deploy full site, use subdomain routing:
- `shipyard.com` → Main launchpad
- `trawler.shipyard.com` → Just the `/trawler` route

**How**: DNS CNAME pointing to same deployment

### Scenario 2: Separate Domain
Deploy on different domain:
- `shipyard.com` → Launchpad
- `trawler.io` → New deployment, rewrite root to `/trawler`

**How**: See `TRAWLER_DEPLOYMENT.md` - Method A

### Scenario 3: Keep Everything Together
No changes needed! Users access:
- `yourdomain.com` → Landing/Launchpad
- `yourdomain.com/trawler` → Event monitor

## Quick Customization

### Remove Footer Link
**File**: `app/components/Sonar.tsx` (line 2021)
```tsx
// Comment out the footer or change the link
<span>Built by <span style={{ color: '#5EAED8' }}>YOUR NAME</span></span>
```

### Add Marketing Landing
**File**: `app/trawler/page.enhanced.tsx`

Rename to `page.tsx` to get a landing page before the widget:
```bash
cd app/trawler
mv page.tsx page.minimal.tsx
mv page.enhanced.tsx page.tsx
```

### Hide Market Lighthouse
**File**: `app/components/Sonar.tsx` (line 2057)
```tsx
{/* <MarketLighthouse ... /> */}
```

## Files You Need

**Core Trawler Files** (don't delete these):
```
app/
├── components/
│   ├── Sonar.tsx                ← Main widget
│   ├── MarketLighthouse.tsx     ← Market stats
│   └── Trawler.tsx              ← (Different tool - wallet cleanup)
├── utils/
│   ├── marketData.ts            ← Real-time data
│   └── imageUpload.ts           ← (Not used by Trawler)
└── trawler/
    ├── page.tsx                 ← Route config
    └── page.enhanced.tsx        ← Optional marketing page
```

**Files You Can Delete** (if shipping ONLY Trawler):
```
app/
├── utils/
│   ├── meteora.ts              ❌ Launchpad only
│   ├── meteoraWallet.ts        ❌ Launchpad only
│   └── imageUpload.ts          ❌ Launchpad only
└── METEORA_INTEGRATION.md      ❌ Launchpad docs
```

## Environment Setup

**Required**: NONE! Works out of the box.

**Optional** (for better data):
```bash
# .env.local
NEXT_PUBLIC_BIRDEYE_API_KEY=xxx  # Enhanced market data
```

## Testing Checklist

Before shipping to production:

- [ ] Test on `/trawler` route locally
- [ ] Verify Market Lighthouse shows data
- [ ] Check event feed is populating
- [ ] Test filter toggles (bags claims, graduations)
- [ ] Verify Twitter link works
- [ ] Mobile responsive check
- [ ] Test "past hour events" loading (toggle filters)
- [ ] Verify current time block is highlighted in heatmap

## Production Optimizations

### 1. Use Premium RPC
Free public RPCs can be slow. Upgrade to:
- **Helius**: 100k req/day free
- **QuickNode**: Reliable Solana RPC
- **Triton**: Solana-optimized

### 2. Enable Caching
Already built-in:
- Market data: 60s cache
- Historical events: 30 days stored

### 3. Add CDN
Vercel/Netlify include CDN automatically.

## Monitoring

### Check Health
1. Open browser console
2. Look for: `📜 Loaded X events from past hour`
3. Should see: `Fetching real market data...`

### Watch for Issues
- ❌ WebSocket connection errors → Check DexScreener status
- ❌ Market Lighthouse shows $0 → Check API endpoints
- ❌ No events appearing → Check browser console

## Support & Updates

- **Bugs**: Check browser console first
- **Questions**: [@ShipsInTheYard](https://x.com/ShipsInTheYard)
- **Updates**: Run `git pull` for latest features

## What's Next?

Ideas for enhancement:
1. Add user authentication (save filter preferences)
2. Webhook alerts (Discord/Telegram notifications)
3. Historical event search
4. Export to CSV/JSON
5. Custom dashboard layouts

---

**You're ready to ship! 🚀**

Access Trawler at: http://localhost:3000/trawler
