import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// SCAN FOR POOLS WITH NO CLAIM ACTIVITY (TRULY UNCLAIMED FEES)
// ============================================================
// GET /api/scan-unclaimed-fees - Find pools where nobody has claimed
//
// Strategy: Check transaction history for claim activity
// No claims = fees are still sitting there unclaimed
// ============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Fee Share program - transactions to this program are claims
const FEE_SHARE_PROGRAM = 'FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK';

interface PoolWithFees {
  poolAddress: string;
  tokenMint?: string;
  symbol?: string;
  name?: string;
  estimatedTotalFees: number; // Total estimated fees from volume
  claimedFeesSol: number; // Amount already claimed
  unclaimedFeesSol: number; // Remaining (estimated - claimed)
  quoteFees: number;
  marketCap?: number;
  fdv?: number;
  volume24h?: number;
  liquidity?: number;
  priceUsd?: string;
  opportunityScore: number;
  ageHours: number;
  claimCount: number; // Number of claim transactions
  hasClaims: boolean;
  url?: string;
}

// Meteora DAMM v2 program ID - used for fee claims
const METEORA_DAMM_V2 = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG';

// Check if a pool has had any claim transactions using Helius
// Strategy: Look for transactions that specifically involve fee claiming
// Returns: claimCount, hasClaims, and totalClaimedSol (estimated)
async function checkClaimActivity(poolAddress: string, rpcUrl: string): Promise<{
  claimCount: number;
  hasClaims: boolean;
  totalClaimedSol: number;
}> {
  try {
    // Extract API key from RPC URL
    const apiKeyMatch = rpcUrl.match(/api-key=([^&]+)/);
    const apiKey = apiKeyMatch ? apiKeyMatch[1] : '';

    if (!apiKey) {
      return { claimCount: -1, hasClaims: false, totalClaimedSol: 0 }; // Can't check without API key
    }

    // Use Helius enhanced transactions API - check pool's transaction history
    const response = await fetch(
      `https://api.helius.xyz/v0/addresses/${poolAddress}/transactions?api-key=${apiKey}&limit=100`,
      {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      console.log(`Helius API error for ${poolAddress}: ${response.status}`);
      return { claimCount: -1, hasClaims: false, totalClaimedSol: 0 };
    }

    const transactions = await response.json();

    // Count claim transactions and track total claimed SOL
    let claimCount = 0;
    let swapCount = 0;
    let totalClaimedLamports = 0;

    for (const tx of transactions || []) {
      const txType = tx.type?.toUpperCase() || '';
      const description = (tx.description || '').toLowerCase();

      // Identify swaps (to exclude them from claim detection)
      if (txType === 'SWAP' || description.includes('swap')) {
        swapCount++;
        continue; // Skip swaps, they're not claims
      }

      let isClaim = false;
      let claimAmountLamports = 0;

      // Method 1: Explicit claim type from Helius parsing
      if (txType.includes('CLAIM') || txType.includes('WITHDRAW_FEE')) {
        isClaim = true;
      }

      // Method 2: Description-based detection (Helius enriches descriptions)
      if (!isClaim && description.includes('claim') && description.includes('fee')) {
        isClaim = true;
      }

      // Method 3: Check for Fee Share program involvement
      const accountKeys = tx.accountData?.map((a: any) => a.account) || [];
      if (!isClaim && accountKeys.includes(FEE_SHARE_PROGRAM)) {
        isClaim = true;
      }

      // Method 4: Check instructions for claim-like behavior
      if (!isClaim) {
        const instructions = tx.instructions || [];
        for (const ix of instructions) {
          const programId = ix.programId || '';
          if (programId === FEE_SHARE_PROGRAM || programId === METEORA_DAMM_V2) {
            const nativeTransfers = tx.nativeTransfers || [];
            const userReceives = nativeTransfers.filter((t: any) =>
              t.toUserAccount &&
              !t.toUserAccount.endsWith('1111') &&
              t.amount > 1000000 &&
              t.amount < 100_000_000_000
            );
            if (userReceives.length > 0) {
              isClaim = true;
              break;
            }
          }
        }
      }

      // If this is a claim, count it and sum up SOL transfers
      if (isClaim) {
        claimCount++;

        // Sum up SOL going to user wallets as claimed amount
        const nativeTransfers = tx.nativeTransfers || [];
        for (const t of nativeTransfers) {
          // SOL going to a user wallet (not a program/system account)
          if (t.toUserAccount &&
              !t.toUserAccount.endsWith('1111') &&
              t.amount > 1000000 &&
              t.amount < 100_000_000_000) {
            claimAmountLamports += t.amount;
          }
        }
        totalClaimedLamports += claimAmountLamports;
      }
    }

    const totalClaimedSol = totalClaimedLamports / 1_000_000_000;
    console.log(`Pool ${poolAddress.slice(0,8)}...: ${claimCount} claims (${totalClaimedSol.toFixed(2)} SOL), ${swapCount} swaps out of ${transactions?.length || 0} txs`);

    return { claimCount, hasClaims: claimCount > 0, totalClaimedSol };
  } catch (e) {
    console.error(`Error checking claims for ${poolAddress}:`, e);
    return { claimCount: -1, hasClaims: false, totalClaimedSol: 0 };
  }
}

export async function GET(request: NextRequest) {
  try {
    const minFeesParam = request.nextUrl.searchParams.get('minFees');
    const minFees = minFeesParam ? parseFloat(minFeesParam) : 0.1;
    const sortBy = request.nextUrl.searchParams.get('sortBy') || 'opportunity';
    const onlyUnclaimed = request.nextUrl.searchParams.get('unclaimed') !== 'false';

    console.log(`Scanning for pools with >= ${minFees} SOL fees, unclaimed only: ${onlyUnclaimed}...`);

    const rpcUrl = process.env.SOLANA_RPC_URL || '';
    const pools: PoolWithFees[] = [];
    const solPrice = 150;
    const now = Date.now();

    // Get Meteora pools from DexScreener
    const candidatePools: any[] = [];

    try {
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
            if (pair.chainId !== 'solana') continue;
            if (!pair.dexId?.toLowerCase().includes('meteora')) continue;

            const volume24h = pair.volume?.h24 || 0;
            const estimatedFees = (volume24h * 0.01) / solPrice;

            if (estimatedFees >= minFees) {
              candidatePools.push(pair);
            }
          }
        }
      }
    } catch (e) {
      console.error('DexScreener error:', e);
    }

    console.log(`Found ${candidatePools.length} candidate pools to check for claim activity`);

    // Check each pool for claim activity (limit to top 15 to avoid rate limits)
    const poolsToCheck = candidatePools
      .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
      .slice(0, 15);

    for (const pair of poolsToCheck) {
      const volume24h = pair.volume?.h24 || 0;
      const estimatedFees = (volume24h * 0.01) / solPrice;
      const marketCap = pair.marketCap || pair.fdv || 0;
      const feesUsd = estimatedFees * solPrice;

      // Check for claim activity and total claimed
      const { claimCount, hasClaims, totalClaimedSol } = await checkClaimActivity(pair.pairAddress, rpcUrl);

      // If only showing unclaimed and this has claims, skip
      if (onlyUnclaimed && hasClaims) {
        console.log(`Skipping ${pair.baseToken?.symbol} - has ${claimCount} claims (${totalClaimedSol.toFixed(2)} SOL claimed)`);
        continue;
      }

      // Calculate age
      const createdAt = pair.pairCreatedAt;
      const ageHours = createdAt ? Math.round((now - createdAt) / (1000 * 60 * 60)) : 0;

      // Calculate unclaimed = estimated - claimed (minimum 0)
      const unclaimedFeesSol = Math.max(0, estimatedFees - totalClaimedSol);

      // Opportunity score - based on UNCLAIMED fees relative to mcap
      // More unclaimed = better opportunity
      const unclaimedUsd = unclaimedFeesSol * solPrice;
      const basScore = marketCap > 0 ? (unclaimedUsd / marketCap) * 10000 : 0;
      const noClaimBoost = !hasClaims ? 1.5 : 1.0; // 1.5x boost if no one has claimed yet
      const opportunityScore = basScore * noClaimBoost;

      pools.push({
        poolAddress: pair.pairAddress,
        tokenMint: pair.baseToken?.address,
        symbol: pair.baseToken?.symbol,
        name: pair.baseToken?.name,
        estimatedTotalFees: estimatedFees,
        claimedFeesSol: totalClaimedSol,
        unclaimedFeesSol,
        quoteFees: estimatedFees,
        marketCap: pair.marketCap,
        fdv: pair.fdv,
        volume24h,
        liquidity: pair.liquidity?.usd,
        priceUsd: pair.priceUsd,
        opportunityScore,
        ageHours,
        claimCount,
        hasClaims,
        url: pair.url,
      });

      // Small delay between checks
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Sort results
    if (sortBy === 'opportunity') {
      pools.sort((a, b) => b.opportunityScore - a.opportunityScore);
    } else if (sortBy === 'fees') {
      pools.sort((a, b) => b.unclaimedFeesSol - a.unclaimedFeesSol);
    } else if (sortBy === 'mcap') {
      pools.sort((a, b) => (a.marketCap || Infinity) - (b.marketCap || Infinity));
    }

    return NextResponse.json({
      success: true,
      minFeesFilter: minFees,
      totalFound: pools.length,
      poolsChecked: poolsToCheck.length,
      pools,
      note: onlyUnclaimed
        ? 'Showing pools with NO claim activity - fees likely still unclaimed!'
        : 'All high-volume pools with claim status',
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Scan unclaimed fees error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
