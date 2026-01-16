import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import {
  getAssociatedTokenAddress,
  createBurnInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAccount,
} from '@solana/spl-token';
import BN from 'bn.js';
import bs58 from 'bs58';
import { promises as fs } from 'fs';
import path from 'path';

// ============================================================
// SHIPYARD FEE FLYWHEEL CRON
// ============================================================
// GET /api/cron/fee-flywheel - Auto-claim fees and execute flywheel
//
// This cron job:
// 1. Finds all active pools with accumulated fees
// 2. Claims fees using Meteora DBC SDK
// 3. Routes fees based on engine config:
//    - Navigator (80% LP / 20% Burn)
//    - Lighthouse (50% LP / 50% Creator - no burn)
//    - Supernova (25% LP / 75% Burn)
// 4. Executes buyback via Meteora DBC pool and burns tokens
//
// Call this via Vercel Cron or external scheduler
// ============================================================

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const LAUNCHES_FILE = path.join(process.cwd(), 'data', 'launches.json');

// Cron secret for security (set in Vercel env)
const CRON_SECRET = process.env.CRON_SECRET;

function getShipyardKeypair(): Keypair | null {
  const key = process.env.SHIPYARD_PRIVATE_KEY;
  if (!key) return null;
  try {
    return Keypair.fromSecretKey(bs58.decode(key));
  } catch {
    return null;
  }
}

// Engine configurations - burn percentages
const ENGINE_BURN_PERCENT: Record<string, number> = {
  navigator: 20,   // 80% LP, 20% Burn
  lighthouse: 0,   // 50% LP, 50% Creator (no burn)
  supernova: 75,   // 25% LP, 75% Burn
};

// Minimum fees to trigger flywheel (0.01 SOL)
const MIN_FEE_THRESHOLD = 0.01 * LAMPORTS_PER_SOL;

interface Launch {
  id: string;
  tokenMint: string;
  poolAddress: string;
  name: string;
  symbol: string;
  engine: 1 | 2 | 3;
  engineName: 'navigator' | 'lighthouse' | 'supernova';
  migrated: boolean;
  [key: string]: unknown;
}

interface FlywheelResult {
  pool: string;
  symbol: string;
  engine: string;
  feesClaimed: number;
  feesClaimedSol: number;
  burnAmount: number;
  tokensBurned: string; // Changed to string for bigint serialization
  claimSignature?: string;
  buybackSignature?: string;
  burnSignature?: string;
  error?: string;
}

async function getLaunches(): Promise<Launch[]> {
  try {
    const data = await fs.readFile(LAUNCHES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Claim trading fees from a pool
 */
async function claimFees(
  client: DynamicBondingCurveClient,
  connection: Connection,
  poolAddress: PublicKey,
  keypair: Keypair
): Promise<{ success: boolean; signature?: string; feesReceived: number; error?: string }> {
  try {
    const poolState = await client.state.getPool(poolAddress);
    const configState = await client.state.getPoolConfig(poolState.config);

    if (!configState.feeClaimer) {
      return { success: false, feesReceived: 0, error: 'No fee claimer' };
    }

    // Check balance before
    const balanceBefore = await connection.getBalance(keypair.publicKey);

    // Claim max fees
    const maxAmount = new BN('18446744073709551615');

    const transaction = await client.partner.claimPartnerTradingFee({
      feeClaimer: configState.feeClaimer,
      payer: keypair.publicKey,
      pool: poolAddress,
      maxBaseAmount: maxAmount,
      maxQuoteAmount: maxAmount,
      receiver: keypair.publicKey,
    });

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = keypair.publicKey;

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      { commitment: 'confirmed' }
    );

    // Check balance after
    const balanceAfter = await connection.getBalance(keypair.publicKey);
    const feesReceived = Math.max(0, balanceAfter - balanceBefore);

    return { success: true, signature, feesReceived };
  } catch (error) {
    return {
      success: false,
      feesReceived: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Execute buyback via Meteora DBC pool (swap SOL for tokens)
 */
async function executeBuyback(
  client: DynamicBondingCurveClient,
  connection: Connection,
  poolAddress: PublicKey,
  tokenMint: PublicKey,
  amountLamports: number,
  keypair: Keypair
): Promise<{ success: boolean; signature?: string; tokensReceived: bigint; tokenProgramId: PublicKey; error?: string }> {
  try {
    if (amountLamports < 1000000) { // Min 0.001 SOL
      return { success: false, tokensReceived: BigInt(0), tokenProgramId: TOKEN_PROGRAM_ID, error: 'Amount too small' };
    }

    // Detect token program (Token vs Token-2022)
    const mintAccountInfo = await connection.getAccountInfo(tokenMint);
    const tokenProgramId = mintAccountInfo?.owner.equals(TOKEN_2022_PROGRAM_ID)
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;

    // Get token account
    const tokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      keypair.publicKey,
      false,
      tokenProgramId
    );

    // Get balance before swap
    let tokenBalanceBefore = BigInt(0);
    try {
      const accountInfo = await getAccount(connection, tokenAccount, 'confirmed', tokenProgramId);
      tokenBalanceBefore = accountInfo.amount;
    } catch {
      // Account doesn't exist yet, will be created by swap
    }

    // Execute swap on Meteora DBC (buy tokens with SOL)
    const swapTx = await client.pool.swap({
      owner: keypair.publicKey,
      pool: poolAddress,
      amountIn: new BN(amountLamports),
      minimumAmountOut: new BN(0),
      swapBaseForQuote: false, // false = buy base token with quote (SOL)
      referralTokenAccount: null,
    });

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    swapTx.recentBlockhash = blockhash;
    swapTx.lastValidBlockHeight = lastValidBlockHeight;
    swapTx.feePayer = keypair.publicKey;

    const signature = await sendAndConfirmTransaction(
      connection,
      swapTx,
      [keypair],
      { commitment: 'confirmed' }
    );

    // Wait and get tokens received
    await new Promise(resolve => setTimeout(resolve, 2000));

    let tokensReceived = BigInt(0);
    try {
      const accountInfoAfter = await getAccount(connection, tokenAccount, 'confirmed', tokenProgramId);
      tokensReceived = accountInfoAfter.amount - tokenBalanceBefore;
    } catch (e) {
      return { success: false, tokensReceived: BigInt(0), tokenProgramId, error: 'Swap succeeded but failed to get token balance' };
    }

    return {
      success: true,
      signature,
      tokensReceived,
      tokenProgramId,
    };
  } catch (error) {
    return {
      success: false,
      tokensReceived: BigInt(0),
      tokenProgramId: TOKEN_PROGRAM_ID,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Burn tokens
 */
async function burnTokens(
  connection: Connection,
  tokenMint: PublicKey,
  amount: bigint,
  keypair: Keypair,
  tokenProgramId: PublicKey
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    if (amount <= BigInt(0)) {
      return { success: false, error: 'No amount' };
    }

    const tokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      keypair.publicKey,
      false,
      tokenProgramId
    );

    const burnIx = createBurnInstruction(
      tokenAccount,
      tokenMint,
      keypair.publicKey,
      amount,
      [],
      tokenProgramId
    );

    const transaction = new Transaction().add(burnIx);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = keypair.publicKey;

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      { commitment: 'confirmed' }
    );

    return { success: true, signature };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Process a single pool through the flywheel
 */
async function processPool(
  client: DynamicBondingCurveClient,
  connection: Connection,
  launch: Launch,
  keypair: Keypair
): Promise<FlywheelResult> {
  const result: FlywheelResult = {
    pool: launch.poolAddress,
    symbol: launch.symbol,
    engine: launch.engineName,
    feesClaimed: 0,
    feesClaimedSol: 0,
    burnAmount: 0,
    tokensBurned: '0',
  };

  try {
    console.log(`\n=== Processing ${launch.symbol} (${launch.engineName}) ===`);
    console.log(`Pool: ${launch.poolAddress}`);

    // Step 1: Claim fees
    const claimResult = await claimFees(
      client,
      connection,
      new PublicKey(launch.poolAddress),
      keypair
    );

    if (!claimResult.success) {
      result.error = `Claim failed: ${claimResult.error}`;
      console.log(result.error);
      return result;
    }

    result.feesClaimed = claimResult.feesReceived;
    result.feesClaimedSol = claimResult.feesReceived / LAMPORTS_PER_SOL;
    result.claimSignature = claimResult.signature;

    console.log(`Fees claimed: ${result.feesClaimedSol} SOL`);

    // Check if fees meet threshold
    if (result.feesClaimed < MIN_FEE_THRESHOLD) {
      console.log(`Fees below threshold (${MIN_FEE_THRESHOLD / LAMPORTS_PER_SOL} SOL), skipping buyback`);
      return result;
    }

    // Step 2: Calculate burn amount based on engine
    const burnPercent = ENGINE_BURN_PERCENT[launch.engineName] || 0;

    if (burnPercent === 0) {
      console.log(`${launch.engineName} engine has no burn, skipping buyback`);
      return result;
    }

    result.burnAmount = Math.floor(result.feesClaimed * (burnPercent / 100));
    console.log(`Burn amount: ${result.burnAmount / LAMPORTS_PER_SOL} SOL (${burnPercent}%)`);

    // Step 3: Execute buyback via Meteora DBC
    const poolAddress = new PublicKey(launch.poolAddress);
    const tokenMint = new PublicKey(launch.tokenMint);

    const buybackResult = await executeBuyback(
      client,
      connection,
      poolAddress,
      tokenMint,
      result.burnAmount,
      keypair
    );

    if (!buybackResult.success) {
      result.error = `Buyback failed: ${buybackResult.error}`;
      console.log(result.error);
      return result;
    }

    result.buybackSignature = buybackResult.signature;
    result.tokensBurned = buybackResult.tokensReceived.toString();

    console.log(`Bought ${result.tokensBurned} tokens`);

    // Step 4: Burn tokens
    const burnResult = await burnTokens(
      connection,
      tokenMint,
      buybackResult.tokensReceived,
      keypair,
      buybackResult.tokenProgramId
    );

    if (!burnResult.success) {
      result.error = `Burn failed: ${burnResult.error}`;
      console.log(result.error);
      return result;
    }

    result.burnSignature = burnResult.signature;
    console.log(`Burned ${result.tokensBurned} tokens!`);

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
}

// GET - Run the flywheel cron job
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret if configured
    const authHeader = request.headers.get('authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const SHIPYARD_KEYPAIR = getShipyardKeypair();
    if (!SHIPYARD_KEYPAIR) {
      return NextResponse.json(
        { success: false, error: 'SHIPYARD_PRIVATE_KEY not configured or invalid' },
        { status: 500 }
      );
    }

    // Optional: filter by pool or engine
    const searchParams = request.nextUrl.searchParams;
    const filterPool = searchParams.get('pool');
    const filterEngine = searchParams.get('engine');

    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const client = DynamicBondingCurveClient.create(connection, 'confirmed');

    // Get all launches
    let launches = await getLaunches();

    // Filter to only active (non-migrated) pools with burn engines
    launches = launches.filter(l => {
      if (!l.poolAddress) return false;
      if (filterPool && l.poolAddress !== filterPool) return false;
      if (filterEngine && l.engineName !== filterEngine) return false;
      // Only process pools that have burn (navigator, supernova)
      // Lighthouse has no burn so skip unless specifically requested
      if (!filterEngine && l.engineName === 'lighthouse') return false;
      return true;
    });

    console.log(`\n========================================`);
    console.log(`SHIPYARD FEE FLYWHEEL CRON`);
    console.log(`Processing ${launches.length} pools`);
    console.log(`Wallet: ${SHIPYARD_KEYPAIR.publicKey.toBase58()}`);
    console.log(`========================================\n`);

    const results: FlywheelResult[] = [];

    for (const launch of launches) {
      const result = await processPool(client, connection, launch, SHIPYARD_KEYPAIR);
      results.push(result);

      // Small delay between pools
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Summary
    const totalFeesClaimed = results.reduce((sum, r) => sum + r.feesClaimed, 0);
    const totalBurned = results.reduce((sum, r) => sum + BigInt(r.tokensBurned), BigInt(0));
    const successCount = results.filter(r => !r.error).length;

    console.log(`\n========================================`);
    console.log(`FLYWHEEL COMPLETE`);
    console.log(`Pools processed: ${results.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Total fees claimed: ${totalFeesClaimed / LAMPORTS_PER_SOL} SOL`);
    console.log(`========================================\n`);

    return NextResponse.json({
      success: true,
      summary: {
        poolsProcessed: results.length,
        successCount,
        totalFeesClaimedSol: totalFeesClaimed / LAMPORTS_PER_SOL,
        totalTokensBurned: totalBurned.toString(),
      },
      results,
    });
  } catch (error) {
    console.error('Flywheel cron error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST - Run flywheel for a specific pool
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.poolAddress) {
      return NextResponse.json(
        { success: false, error: 'poolAddress is required' },
        { status: 400 }
      );
    }

    const SHIPYARD_KEYPAIR = getShipyardKeypair();
    if (!SHIPYARD_KEYPAIR) {
      return NextResponse.json(
        { success: false, error: 'SHIPYARD_PRIVATE_KEY not configured or invalid' },
        { status: 500 }
      );
    }

    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const client = DynamicBondingCurveClient.create(connection, 'confirmed');

    // Find the launch
    const launches = await getLaunches();
    const launch = launches.find(l => l.poolAddress === body.poolAddress);

    if (!launch) {
      return NextResponse.json(
        { success: false, error: 'Pool not found in launches' },
        { status: 404 }
      );
    }

    const result = await processPool(client, connection, launch, SHIPYARD_KEYPAIR);

    return NextResponse.json({
      success: !result.error,
      result,
    });
  } catch (error) {
    console.error('Flywheel error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
