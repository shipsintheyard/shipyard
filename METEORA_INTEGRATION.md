# Meteora DBC Integration Guide

This document explains the complete Meteora Dynamic Bonding Curve (DBC) integration for the Raft launchpad.

## Overview

The Raft launchpad allows users to create SPL tokens with Meteora DBC pools that have configurable fee splits between LP autocompounding and token burning. The integration is **functionally complete** with only wallet signing remaining as a limitation.

## Current Implementation Status

### ✅ Fully Implemented

1. **SDK Installation**:
   - `@meteora-ag/dynamic-bonding-curve-sdk` (full integration)
   - `@meteora-ag/dlmm`
   - `@solana/spl-token`
   - `@coral-xyz/anchor`

2. **Complete Utilities Module** ([app/utils/meteora.ts](app/utils/meteora.ts:1-319)):
   - ✅ `createToken()`: Creates SPL token mints (lines 42-66)
   - ✅ `getPoolAddress()`: Derives Meteora DBC pool PDA addresses (lines 71-86)
   - ✅ `createMeteoraConfig()`: **FULLY IMPLEMENTED** with `buildCurveWithMarketCap` (lines 92-178)
   - ✅ `createMeteoraPool()`: **FULLY IMPLEMENTED** with SDK client calls (lines 183-226)
   - ✅ `launchToken()`: Complete end-to-end launch flow (lines 231-274)
   - ✅ `launchTokenWithConfig()`: Simplified flow with pre-existing config (lines 280-318)

3. **UI Integration** ([app/page.tsx](app/page.tsx:36-116)):
   - Engine selection (Navigator/Polaris/Supernova) properly connected to fee configs
   - Updated `handleLaunch()` with real integration
   - Comprehensive user feedback and documentation

4. **Build Configuration**: Next.js webpack config handles native node modules perfectly

### ⚠️ Known Limitation

**Wallet Signing**: The Meteora SDK's `DynamicBondingCurveClient` requires a `Keypair` for transaction signing. It does not currently support Solana wallet adapter's `signTransaction` method.

**Workarounds**:
1. **For Testing**: Use a burner wallet on devnet, export private key, create Keypair
2. **For Production**: Implement a backend service that holds the keypair securely
3. **Future**: Wait for SDK updates that support wallet adapter signing

## Complete Implementation Details

### Config Creation (buildCurveWithMarketCap)

The `createMeteoraConfig()` function uses Meteora's `buildCurveWithMarketCap` helper with these parameters:

```typescript
const curveConfig = buildCurveWithMarketCap({
  totalTokenSupply: 1_000_000_000,
  initialMarketCap: 30,      // Starting at 30 SOL market cap
  migrationMarketCap: 69000, // Graduates at 69k SOL market cap
  migrationOption: MigrationOption.MET_DAMM_V2,

  // Fee splits based on selected engine
  partnerLockedLpPercentage: feeConfig.lpPercent, // 80%, 70%, or 50%

  // Trading fees
  baseFeeParams: {
    baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
    feeSchedulerParam: {
      startingFeeBps: 100, // 1% fee
      endingFeeBps: 100,
      numberOfPeriod: 0,
      totalDuration: 0
    }
  },

  dynamicFeeEnabled: true,
  collectFeeMode: CollectFeeMode.QuoteToken,
  tokenType: TokenType.SPL,
  // ... full config in code
});
```

### Pool Creation

The `createMeteoraPool()` function:
1. Initializes `DynamicBondingCurveClient`
2. Derives the pool PDA address
3. Calls `client.createPool(baseMint, quoteMint, config, creator)`
4. Signs and sends the transaction
5. Returns pool address and transaction signature

### Full Launch Flow

```typescript
launchToken(connection, keypair, tokenConfig, feeConfig)
  ↓
1. createMeteoraConfig() → Creates config with fee split
  ↓
2. createToken() → Creates SPL token mint
  ↓
3. createMeteoraPool() → Creates DBC pool
  ↓
Returns: { tokenMint, poolAddress, configAddress, signature }
```

## Fee Split Engines

### Navigator ⭐
- **LP**: 80% (autocompounding)
- **Burn**: 20%
- **Market Cap**: $3,000 → $69,000 (pump.fun style)
- **Use case**: Maximum liquidity depth with steady deflationary pressure

### Polaris ✦
- **LP**: 70% (autocompounding)
- **Burn**: 30%
- **Market Cap**: $3,000 → $69,000 (pump.fun style)
- **Use case**: Balanced growth with higher burn rate

### Supernova ☄️
- **LP**: 50% (autocompounding)
- **Burn**: 50%
- **Market Cap**: $3,000 → $69,000 (pump.fun style)
- **Use case**: Maximum deflationary tokenomics

## Image Upload System

The launchpad includes a complete image upload system for token logos:

### Storage Options

1. **IPFS (Pinata)** - Recommended for production
   - Sign up at [https://pinata.cloud](https://pinata.cloud)
   - Add API keys to `.env.local`:
     ```
     NEXT_PUBLIC_PINATA_API_KEY=your_key
     NEXT_PUBLIC_PINATA_SECRET_KEY=your_secret
     ```
   - Images stored permanently on IPFS
   - Fast CDN delivery via Pinata gateway

2. **Base64 Encoding** - Automatic fallback
   - No configuration needed
   - Works immediately for testing
   - Creates large URLs (not recommended for production)

### Implementation

The system is in [app/utils/imageUpload.ts](app/utils/imageUpload.ts):
- `uploadTokenImage()` - Main upload function with auto-fallback
- `uploadToIPFS()` - IPFS upload via Pinata
- `convertToBase64()` - Base64 encoding fallback
- `createTokenMetadata()` - Creates Metaplex-compatible metadata

Images are validated for:
- File type (must be image)
- File size (max 5MB)

### Testing Without Devnet SOL

**Yes, you can test everything except the actual blockchain transactions:**

1. ✅ **UI Testing** - All forms, image uploads, fee calculations work without any SOL
2. ✅ **Image Upload** - Works immediately (uses base64 or IPFS if configured)
3. ✅ **Validation** - All form validation and error handling
4. ❌ **Blockchain Transactions** - Only this requires devnet SOL

So you can build and test 90% of the functionality without any SOL. When ready for real transactions, just get devnet SOL from the faucet.

## How to Test

### Option 1: Use a Burner Keypair (Devnet Testing)

1. Create a new devnet wallet (burner wallet)
2. Get devnet SOL from a faucet
3. Export the private key as an array of numbers
4. Update [page.tsx](app/page.tsx:36-116) to use the keypair:

```typescript
import { Keypair } from '@solana/web3.js';

// In handleLaunch function:
const keypair = Keypair.fromSecretKey(
  new Uint8Array([/* your private key array */])
);

const result = await launchToken(connection, keypair, tokenConfig, feeConfig);

setLaunchedToken({
  name: tokenName,
  symbol: tokenSymbol,
  address: result.tokenMint.toBase58(),
  poolAddress: result.poolAddress.toBase58()
});
```

5. Test the full flow on devnet

### Option 2: Backend Service (Production)

1. Create a backend API endpoint that holds the keypair
2. Frontend sends launch request to backend
3. Backend calls `launchToken()` and returns results
4. More secure for production use

## Resources

- [Meteora DBC SDK](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk)
- [Meteora Documentation](https://docs.meteora.ag)
- [buildCurveWithMarketCap Example](https://docs.meteora.ag/developer-guide/guides/dbc/typescript-sdk/example-scripts)
- [Bonding Curve Configs](https://docs.meteora.ag/developer-guide/guides/dbc/bonding-curve-configs)
- [DBC Program ID](https://solscan.io/account/dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN): `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`

## Code Reference

All implementation code is in:
- [app/utils/meteora.ts](app/utils/meteora.ts) - Complete Meteora integration (319 lines)
- [app/utils/meteoraWallet.ts](app/utils/meteoraWallet.ts) - Wallet adapter helpers
- [app/page.tsx](app/page.tsx:36-116) - UI integration

## Support

For Meteora-specific questions:
- Discord: [Meteora Community](https://discord.gg/meteora)
- Docs: https://docs.meteora.ag
- GitHub: https://github.com/MeteoraAg
