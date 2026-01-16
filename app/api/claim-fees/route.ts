import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  Keypair,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import BN from 'bn.js';
import bs58 from 'bs58';
import { promises as fs } from 'fs';
import path from 'path';

// ============================================================
// SHIPYARD FEE CLAIMING API
// ============================================================
// POST /api/claim-fees - Claim trading fees from a DBC pool
// GET /api/claim-fees - Get fee info for pools
//
// This handles automated fee claiming for Shipyard pools using
// the Meteora Dynamic Bonding Curve SDK.
//
// The feeClaimer (partner) can claim accumulated trading fees
// which can then be used for buyback-burn or LP compounding.
// ============================================================

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const LAUNCHES_FILE = path.join(process.cwd(), 'data', 'launches.json');

// Shipyard wallet for executing fee claims
const SHIPYARD_PRIVATE_KEY = process.env.SHIPYARD_PRIVATE_KEY;
const SHIPYARD_KEYPAIR = SHIPYARD_PRIVATE_KEY
  ? Keypair.fromSecretKey(bs58.decode(SHIPYARD_PRIVATE_KEY))
  : Keypair.generate();
const SHIPYARD_WALLET = SHIPYARD_KEYPAIR.publicKey;

interface Launch {
  id: string;
  tokenMint: string;
  poolAddress: string;
  name: string;
  symbol: string;
  engine: 1 | 2 | 3;
  engineName: 'navigator' | 'lighthouse' | 'supernova';
  configAddress?: string;
  creator?: string;
  migrated: boolean;
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

/**
 * Get pool state and fee information
 */
async function getPoolFeeInfo(
  client: DynamicBondingCurveClient,
  poolAddress: string
): Promise<{
  poolState: any;
  configState: any;
  partnerFees: { base: BN; quote: BN } | null;
  creatorFees: { base: BN; quote: BN } | null;
}> {
  const pool = new PublicKey(poolAddress);

  // Get pool state
  const poolState = await client.state.getPool(pool);

  // Get config state for fee info
  const configState = await client.state.getPoolConfig(poolState.config);

  // The pool state contains fee information
  // partnerUnclaimedFee and creatorUnclaimedFee are tracked in the pool
  // We need to check the actual pool data structure

  return {
    poolState,
    configState,
    partnerFees: null, // Will be populated from pool state
    creatorFees: null,
  };
}

// GET - Get fee info for all pools or a specific pool
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const poolAddress = searchParams.get('pool');

    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const client = DynamicBondingCurveClient.create(connection, 'confirmed');

    if (poolAddress) {
      // Get fee info for specific pool
      try {
        const poolInfo = await getPoolFeeInfo(client, poolAddress);

        return NextResponse.json({
          success: true,
          pool: poolAddress,
          poolState: {
            config: poolInfo.poolState.config.toBase58(),
            creator: poolInfo.poolState.creator?.toBase58(),
            baseMint: poolInfo.poolState.baseMint.toBase58(),
            quoteMint: poolInfo.configState.quoteMint?.toBase58(),
            migrated: poolInfo.poolState.migrated,
          },
          configState: {
            feeClaimer: poolInfo.configState.feeClaimer?.toBase58(),
            creatorTradingFeePercentage: poolInfo.configState.creatorTradingFeePercentage,
            collectFeeMode: poolInfo.configState.collectFeeMode,
          },
        });
      } catch (error) {
        return NextResponse.json(
          { success: false, error: `Failed to get pool info: ${error instanceof Error ? error.message : 'Unknown error'}` },
          { status: 400 }
        );
      }
    }

    // Get fee info for all launches
    const launches = await getLaunches();
    const poolInfos = [];

    for (const launch of launches) {
      if (!launch.poolAddress) continue;

      try {
        const poolInfo = await getPoolFeeInfo(client, launch.poolAddress);
        poolInfos.push({
          id: launch.id,
          symbol: launch.symbol,
          poolAddress: launch.poolAddress,
          migrated: poolInfo.poolState.migrated,
          engine: launch.engineName,
        });
      } catch (error) {
        poolInfos.push({
          id: launch.id,
          symbol: launch.symbol,
          poolAddress: launch.poolAddress,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      shipyardWallet: SHIPYARD_WALLET.toBase58(),
      pools: poolInfos,
    });
  } catch (error) {
    console.error('Get fee info error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST - Claim fees from a pool
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.poolAddress) {
      return NextResponse.json(
        { success: false, error: 'poolAddress is required' },
        { status: 400 }
      );
    }

    if (!SHIPYARD_PRIVATE_KEY) {
      return NextResponse.json(
        { success: false, error: 'SHIPYARD_PRIVATE_KEY not configured' },
        { status: 500 }
      );
    }

    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const client = DynamicBondingCurveClient.create(connection, 'confirmed');

    const poolAddress = new PublicKey(body.poolAddress);

    // Get pool state to determine fees
    const poolState = await client.state.getPool(poolAddress);
    const configState = await client.state.getPoolConfig(poolState.config);

    console.log('=== CLAIMING FEES ===');
    console.log('Pool:', body.poolAddress);
    console.log('Config:', poolState.config.toBase58());
    console.log('Fee Claimer:', configState.feeClaimer?.toBase58());
    console.log('Creator:', poolState.creator?.toBase58());

    // Determine claim type based on who we are
    const claimType = body.claimType || 'partner'; // 'partner' or 'creator'

    // Use max values to claim all available fees
    const maxBaseAmount = new BN('18446744073709551615'); // u64 max
    const maxQuoteAmount = new BN('18446744073709551615'); // u64 max

    let transaction;
    let claimDescription;

    if (claimType === 'creator' && poolState.creator) {
      // Claim as creator
      console.log('Claiming as creator...');

      transaction = await client.creator.claimCreatorTradingFee({
        creator: poolState.creator,
        payer: SHIPYARD_WALLET,
        pool: poolAddress,
        maxBaseAmount,
        maxQuoteAmount,
        receiver: SHIPYARD_WALLET, // Receive fees to Shipyard wallet
      });
      claimDescription = 'Creator trading fee claim';
    } else {
      // Claim as partner (fee claimer)
      console.log('Claiming as partner/feeClaimer...');

      if (!configState.feeClaimer) {
        return NextResponse.json(
          { success: false, error: 'Pool config has no feeClaimer set' },
          { status: 400 }
        );
      }

      transaction = await client.partner.claimPartnerTradingFee({
        feeClaimer: configState.feeClaimer,
        payer: SHIPYARD_WALLET,
        pool: poolAddress,
        maxBaseAmount,
        maxQuoteAmount,
        receiver: SHIPYARD_WALLET,
      });
      claimDescription = 'Partner trading fee claim';
    }

    // Sign and send transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = SHIPYARD_WALLET;

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [SHIPYARD_KEYPAIR],
      { commitment: 'confirmed' }
    );

    console.log(`${claimDescription} successful!`);
    console.log('Signature:', signature);

    return NextResponse.json({
      success: true,
      message: `${claimDescription} successful`,
      signature,
      pool: body.poolAddress,
      claimType,
      explorer: `https://solscan.io/tx/${signature}`,
    });
  } catch (error) {
    console.error('Claim fees error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
