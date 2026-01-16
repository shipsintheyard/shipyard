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
// 4. Executes buyback via Jupiter and burns tokens
//
// Call this via Vercel Cron or external scheduler
// ============================================================

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const LAUNCHES_FILE = path.join(process.cwd(), 'data', 'launches.json');

// Cron secret for security (set in Vercel env)
const CRON_SECRET = process.env.CRON_SECRET;

// Shipyard wallet
const SHIPYARD_PRIVATE_KEY = process.env.SHIPYARD_PRIVATE_KEY;
const SHIPYARD_KEYPAIR = SHIPYARD_PRIVATE_KEY
  ? Keypair.fromSecretKey(bs58.decode(SHIPYARD_PRIVATE_KEY))
  : null;

// Jupiter API
const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

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
  tokensBurned: number;
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
  poolAddress: PublicKey
): Promise<{ success: boolean; signature?: string; feesReceived: number; error?: string }> {
  try {
    const poolState = await client.state.getPool(poolAddress);
    const configState = await client.state.getPoolConfig(poolState.config);

    if (!configState.feeClaimer || !SHIPYARD_KEYPAIR) {
      return { success: false, feesReceived: 0, error: 'No fee claimer or keypair' };
    }

    // Check balance before
    const balanceBefore = await connection.getBalance(SHIPYARD_KEYPAIR.publicKey);

    // Claim max fees
    const maxAmount = new BN('18446744073709551615');

    const transaction = await client.partner.claimPartnerTradingFee({
      feeClaimer: configState.feeClaimer,
      payer: SHIPYARD_KEYPAIR.publicKey,
      pool: poolAddress,
      maxBaseAmount: maxAmount,
      maxQuoteAmount: maxAmount,
      receiver: SHIPYARD_KEYPAIR.publicKey,
    });

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = SHIPYARD_KEYPAIR.publicKey;

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [SHIPYARD_KEYPAIR],
      { commitment: 'confirmed' }
    );

    // Check balance after
    const balanceAfter = await connection.getBalance(SHIPYARD_KEYPAIR.publicKey);
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
 * Execute buyback via Jupiter
 */
async function executeBuyback(
  connection: Connection,
  tokenMint: string,
  amountLamports: number
): Promise<{ success: boolean; signature?: string; tokensReceived: number; error?: string }> {
  try {
    if (!SHIPYARD_KEYPAIR || amountLamports < 1000000) { // Min 0.001 SOL
      return { success: false, tokensReceived: 0, error: 'Amount too small or no keypair' };
    }

    // Get Jupiter quote
    const quoteParams = new URLSearchParams({
      inputMint: WSOL_MINT.toBase58(),
      outputMint: tokenMint,
      amount: amountLamports.toString(),
      slippageBps: '100',
    });

    const quoteRes = await fetch(`${JUPITER_QUOTE_API}?${quoteParams}`);
    if (!quoteRes.ok) {
      return { success: false, tokensReceived: 0, error: 'Jupiter quote failed' };
    }
    const quote = await quoteRes.json();

    // Get swap transaction
    const swapRes = await fetch(JUPITER_SWAP_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: SHIPYARD_KEYPAIR.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });

    if (!swapRes.ok) {
      return { success: false, tokensReceived: 0, error: 'Jupiter swap failed' };
    }

    const swapData = await swapRes.json();
    const transaction = Transaction.from(Buffer.from(swapData.swapTransaction, 'base64'));

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;

    transaction.sign(SHIPYARD_KEYPAIR);

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    await connection.confirmTransaction(signature, 'confirmed');

    return {
      success: true,
      signature,
      tokensReceived: parseInt(quote.outAmount),
    };
  } catch (error) {
    return {
      success: false,
      tokensReceived: 0,
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
  amount: number
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    if (!SHIPYARD_KEYPAIR || amount <= 0) {
      return { success: false, error: 'No amount or keypair' };
    }

    const tokenAccount = await getAssociatedTokenAddress(tokenMint, SHIPYARD_KEYPAIR.publicKey);

    const burnIx = createBurnInstruction(
      tokenAccount,
      tokenMint,
      SHIPYARD_KEYPAIR.publicKey,
      amount,
      [],
      TOKEN_PROGRAM_ID
    );

    const transaction = new Transaction().add(burnIx);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = SHIPYARD_KEYPAIR.publicKey;

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [SHIPYARD_KEYPAIR],
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
  launch: Launch
): Promise<FlywheelResult> {
  const result: FlywheelResult = {
    pool: launch.poolAddress,
    symbol: launch.symbol,
    engine: launch.engineName,
    feesClaimed: 0,
    feesClaimedSol: 0,
    burnAmount: 0,
    tokensBurned: 0,
  };

  try {
    console.log(`\n=== Processing ${launch.symbol} (${launch.engineName}) ===`);
    console.log(`Pool: ${launch.poolAddress}`);

    // Step 1: Claim fees
    const claimResult = await claimFees(
      client,
      connection,
      new PublicKey(launch.poolAddress)
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

    // Step 3: Execute buyback
    const buybackResult = await executeBuyback(
      connection,
      launch.tokenMint,
      result.burnAmount
    );

    if (!buybackResult.success) {
      result.error = `Buyback failed: ${buybackResult.error}`;
      console.log(result.error);
      return result;
    }

    result.buybackSignature = buybackResult.signature;
    result.tokensBurned = buybackResult.tokensReceived;

    console.log(`Bought ${result.tokensBurned} tokens`);

    // Step 4: Burn tokens
    // Wait for token account to update
    await new Promise(resolve => setTimeout(resolve, 2000));

    const burnResult = await burnTokens(
      connection,
      new PublicKey(launch.tokenMint),
      result.tokensBurned
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

    if (!SHIPYARD_KEYPAIR) {
      return NextResponse.json(
        { success: false, error: 'SHIPYARD_PRIVATE_KEY not configured' },
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
      const result = await processPool(client, connection, launch);
      results.push(result);

      // Small delay between pools
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Summary
    const totalFeesClaimed = results.reduce((sum, r) => sum + r.feesClaimed, 0);
    const totalBurned = results.reduce((sum, r) => sum + r.tokensBurned, 0);
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
        totalTokensBurned: totalBurned,
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

    if (!SHIPYARD_KEYPAIR) {
      return NextResponse.json(
        { success: false, error: 'SHIPYARD_PRIVATE_KEY not configured' },
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

    const result = await processPool(client, connection, launch);

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
