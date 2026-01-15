import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { promises as fs } from 'fs';
import path from 'path';

// ============================================================
// SHIPYARD MIGRATION MONITOR
// ============================================================
// GET /api/migration-monitor - Check all pools for migrations, trigger buyback-burns
//
// This should be called periodically via:
// - Vercel cron (vercel.json)
// - External cron service
// - Manual trigger
//
// Flow:
// 1. Load all launches from DB
// 2. For each non-migrated pool, check on-chain state
// 3. If migrated, update launch record
// 4. If Supernova engine, trigger buyback-burn
// ============================================================

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const LAUNCHES_FILE = path.join(process.cwd(), 'data', 'launches.json');

// Meteora DBC Program
const DBC_PROGRAM_ID = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN');

interface Launch {
  id: string;
  tokenMint: string;
  poolAddress: string;
  name: string;
  symbol: string;
  engine: 1 | 2 | 3;
  engineName: 'navigator' | 'lighthouse' | 'supernova';
  solRaised: number;
  migrated: boolean;
  migratedAt?: number;
  buybackBurnEnabled: boolean;
  buybackBurnPercent: number;
  buybackBurnExecuted: boolean;
  buybackBurnTxSignature?: string;
  [key: string]: unknown;
}

async function getLaunches(): Promise<Launch[]> {
  try {
    const data = await fs.readFile(LAUNCHES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveLaunches(launches: Launch[]) {
  await fs.writeFile(LAUNCHES_FILE, JSON.stringify(launches, null, 2));
}

/**
 * Check if a Meteora DBC pool has migrated by checking pool state
 * Pool is migrated when it transitions to a Raydium LP
 */
async function checkPoolMigrated(
  connection: Connection,
  poolAddress: string
): Promise<{ migrated: boolean; solRaised: number }> {
  try {
    const poolPubkey = new PublicKey(poolAddress);
    const accountInfo = await connection.getAccountInfo(poolPubkey);

    if (!accountInfo) {
      console.log(`Pool ${poolAddress} not found`);
      return { migrated: false, solRaised: 0 };
    }

    // Parse pool data to check migration status
    // Meteora DBC pool layout - migration happens when pool reaches threshold
    // The pool account data contains the current SOL in the bonding curve
    // and a flag indicating if migration has occurred

    const data = accountInfo.data;

    // Pool state offset for migration flag (this varies by SDK version)
    // Based on Meteora DBC SDK, check if pool is still active
    // A migrated pool will have different characteristics

    // Simple check: if pool has significant SOL raised and quote reserve is depleted
    // the pool has likely migrated

    // For now, we'll check the pool's SOL balance as a proxy
    // Migrated pools will have transferred SOL to Raydium
    const poolBalance = await connection.getBalance(poolPubkey);

    // Get quote vault balance to check actual SOL raised
    // This requires parsing the pool data structure
    // For simplicity, we'll estimate from pool balance

    // If pool balance is very low but was previously active, it migrated
    // This is a heuristic - proper implementation would parse pool state

    // Check if pool data indicates migration (offset 200+ in most layouts)
    // Migration flag is typically a u8 at a specific offset
    if (data.length > 200) {
      // Heuristic: Check known migration indicator positions
      // This may need adjustment based on actual Meteora DBC layout
      const possibleMigrationFlag = data[200];
      if (possibleMigrationFlag === 1) {
        // Estimate SOL raised from historical data or pool state
        // For now return a placeholder - real implementation would track this
        return { migrated: true, solRaised: 0 };
      }
    }

    return { migrated: false, solRaised: poolBalance / 1e9 };
  } catch (error) {
    console.error(`Error checking pool ${poolAddress}:`, error);
    return { migrated: false, solRaised: 0 };
  }
}

/**
 * Trigger buyback-burn for a migrated Supernova pool
 */
async function triggerBuybackBurn(tokenMint: string): Promise<{
  success: boolean;
  signature?: string;
  error?: string;
}> {
  try {
    // Call our buyback-burn API internally
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/buyback-burn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenMint }),
    });

    const data = await response.json();

    if (data.success) {
      return { success: true, signature: data.burnSignature };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// GET - Check all pools for migrations
export async function GET(request: NextRequest) {
  try {
    // Optional: Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Allow without auth for manual testing, but log warning
      console.warn('Migration monitor called without valid CRON_SECRET');
    }

    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const launches = await getLaunches();

    // Find pools that haven't migrated yet
    const pendingPools = launches.filter(l => !l.migrated);

    if (pendingPools.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending pools to check',
        checked: 0,
        migrated: 0,
        buybacksTriggered: 0,
      });
    }

    console.log(`Checking ${pendingPools.length} pools for migration...`);

    const results = {
      checked: 0,
      migrated: 0,
      buybacksTriggered: 0,
      errors: [] as string[],
      details: [] as { symbol: string; migrated: boolean; buybackTriggered?: boolean }[],
    };

    for (const launch of pendingPools) {
      results.checked++;

      const { migrated, solRaised } = await checkPoolMigrated(
        connection,
        launch.poolAddress
      );

      if (migrated) {
        console.log(`Pool ${launch.symbol} has migrated!`);
        results.migrated++;

        // Update launch record
        const launchIndex = launches.findIndex(l => l.id === launch.id);
        if (launchIndex !== -1) {
          launches[launchIndex].migrated = true;
          launches[launchIndex].migratedAt = Date.now();
          if (solRaised > 0) {
            launches[launchIndex].solRaised = solRaised;
          }
        }

        const detail: { symbol: string; migrated: boolean; buybackTriggered?: boolean } = {
          symbol: launch.symbol,
          migrated: true,
        };

        // Trigger buyback-burn for Supernova pools
        if (launch.buybackBurnEnabled && !launch.buybackBurnExecuted) {
          console.log(`Triggering buyback-burn for ${launch.symbol}...`);

          const bbResult = await triggerBuybackBurn(launch.tokenMint);

          if (bbResult.success) {
            results.buybacksTriggered++;
            detail.buybackTriggered = true;
            console.log(`Buyback-burn complete for ${launch.symbol}: ${bbResult.signature}`);
          } else {
            results.errors.push(`Buyback-burn failed for ${launch.symbol}: ${bbResult.error}`);
            detail.buybackTriggered = false;
          }
        }

        results.details.push(detail);
      }

      // Small delay between checks to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Save updated launches
    await saveLaunches(launches);

    return NextResponse.json({
      success: true,
      message: `Checked ${results.checked} pools`,
      ...results,
    });
  } catch (error) {
    console.error('Migration monitor error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST - Manually mark a pool as migrated (for testing or manual override)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.tokenMint && !body.poolAddress) {
      return NextResponse.json(
        { success: false, error: 'tokenMint or poolAddress required' },
        { status: 400 }
      );
    }

    const launches = await getLaunches();
    const launchIndex = launches.findIndex(
      l => l.tokenMint === body.tokenMint || l.poolAddress === body.poolAddress
    );

    if (launchIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Launch not found' },
        { status: 404 }
      );
    }

    const launch = launches[launchIndex];

    // Mark as migrated
    launches[launchIndex].migrated = true;
    launches[launchIndex].migratedAt = Date.now();

    if (body.solRaised) {
      launches[launchIndex].solRaised = body.solRaised;
    }

    await saveLaunches(launches);

    // Optionally trigger buyback-burn
    let buybackResult = null;
    if (body.triggerBuyback && launch.buybackBurnEnabled && !launch.buybackBurnExecuted) {
      buybackResult = await triggerBuybackBurn(launch.tokenMint);
    }

    return NextResponse.json({
      success: true,
      message: `Marked ${launch.symbol} as migrated`,
      launch: launches[launchIndex],
      buybackResult,
    });
  } catch (error) {
    console.error('Manual migration error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
