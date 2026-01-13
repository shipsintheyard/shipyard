import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

// ============================================================
// SHIPYARD TOKEN LAUNCH API
// ============================================================
// POST /api/launch-token
//
// Launches a new token with pump.fun-style bonding curve
// - 85 SOL to fill curve
// - 1% trading fee during bonding → 100% to flywheel
// - 0.5% trading fee post-migration → 100% to flywheel
// - 100% LP locked forever
// - Auto-migration to Meteora DAMM v2
//
// LAUNCH FEE: 2 SOL (paid to Shipyard)
// ============================================================

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// Shipyard Production Config (devnet)
const SHIPYARD_CONFIG = 'FWV59wJ2wHHVjzTS2Er33KwJ2i7LXc1fAMoRbvVSjHJB';

// Launch fee wallet - receives 2 SOL per launch (Shipyard operations)
const LAUNCH_FEE_WALLET = '8G46itYevnA4gFUBFNSUZF1fZEgRWfa4xYsJbuhY6BFj';

// Fee claimer wallet - receives trading fees (for flywheel distribution)
const FEE_CLAIMER_WALLET = 'BCPC2W5DzAeRQRZL3U1sZWTtPUq8xwvmGxAg7h6BvfJx';

// Launch fee in SOL (reduced to 0.1 for devnet testing)
const LAUNCH_FEE_SOL = 0.1;

// Dev buy limits
// At initial MC of 27.48 SOL, 5% of 1B supply costs ~1.37 SOL
// Using 1.5 SOL as max to account for slippage on early curve
const MAX_DEV_BUY_PERCENT = 5; // Max 5% of supply
const MAX_DEV_BUY_SOL = 1.5; // ~5% of supply at launch price

// Engine tiers for flywheel
const ENGINE_TIERS = {
  1: { name: 'Engine 1', lpPercent: 80, burnPercent: 20 },
  2: { name: 'Engine 2', lpPercent: 50, burnPercent: 50 },
  3: { name: 'Engine 3', lpPercent: 25, burnPercent: 75 },
} as const;

interface LaunchRequest {
  // Token metadata
  name: string;
  symbol: string;
  description?: string;
  uri?: string; // Metadata URI (arweave/ipfs)

  // Engine selection (1, 2, or 3)
  engine?: 1 | 2 | 3;

  // Creator wallet (pays launch fee, receives any creator benefits)
  creatorWallet: string;

  // Optional dev buy - SOL amount to buy at launch (max ~5% of supply)
  devBuyAmount?: number;
}

interface LaunchResponse {
  success: boolean;
  error?: string;

  // Transaction to sign (if success)
  transaction?: string; // Base64 encoded transaction

  // Launch details
  launchFee?: number;
  tokenMint?: string;
  poolAddress?: string;
  configAddress?: string;

  // Curve info
  curveInfo?: {
    migrationThreshold: string;
    bondingFee: string;
    postMigrationFee: string;
  };

  // Engine info
  engineInfo?: {
    tier: number;
    name: string;
    lpPercent: number;
    burnPercent: number;
  };

  // Dev buy info
  devBuyInfo?: {
    enabled: boolean;
    solAmount: number;
    estimatedPercent: number;
  };
}

// GET - Return launch configuration info
export async function GET() {
  return NextResponse.json({
    name: 'Shipyard Token Launch',
    version: '2.0.0',
    network: 'devnet', // Change to mainnet for production

    launchFee: {
      amount: LAUNCH_FEE_SOL,
      currency: 'SOL',
      recipient: LAUNCH_FEE_WALLET,
      purpose: 'Platform fee - covers operations, infrastructure, keeper bots',
    },

    curve: {
      style: 'pump.fun',
      migrationThreshold: '85 SOL',
      priceMultiplier: '~15x',
    },

    fees: {
      bonding: '1% (100% to flywheel)',
      postMigration: '0.5% (100% to flywheel)',
      platformCut: '0% of trading fees',
    },

    lp: {
      locked: '100%',
      lockedTo: 'Shipyard',
      unlockable: false,
    },

    engines: ENGINE_TIERS,

    devBuy: {
      enabled: true,
      maxPercent: MAX_DEV_BUY_PERCENT,
      maxSol: MAX_DEV_BUY_SOL,
      description: 'Optional: Creator can buy up to 5% of supply at launch',
    },

    config: {
      address: SHIPYARD_CONFIG,
      feeClaimer: FEE_CLAIMER_WALLET,
    },

    status: 'ready',
  });
}

// POST - Create launch transaction
export async function POST(request: NextRequest) {
  try {
    const body: LaunchRequest = await request.json();

    // Validate required fields
    if (!body.name || !body.symbol || !body.creatorWallet) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: name, symbol, creatorWallet',
        },
        { status: 400 }
      );
    }

    // Validate wallet address
    let creatorPubkey: PublicKey;
    try {
      creatorPubkey = new PublicKey(body.creatorWallet);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid creator wallet address' },
        { status: 400 }
      );
    }

    // Validate symbol length
    if (body.symbol.length < 2 || body.symbol.length > 10) {
      return NextResponse.json(
        { success: false, error: 'Symbol must be 2-10 characters' },
        { status: 400 }
      );
    }

    // Validate name length
    if (body.name.length < 1 || body.name.length > 32) {
      return NextResponse.json(
        { success: false, error: 'Name must be 1-32 characters' },
        { status: 400 }
      );
    }

    // Get engine tier (default to Engine 2: 50/50 split)
    const engineTier = body.engine || 2;
    if (![1, 2, 3].includes(engineTier)) {
      return NextResponse.json(
        { success: false, error: 'Engine must be 1, 2, or 3' },
        { status: 400 }
      );
    }
    const engine = ENGINE_TIERS[engineTier as 1 | 2 | 3];

    // Validate dev buy amount if provided
    let devBuyAmount = 0;
    let devBuyPercent = 0;
    if (body.devBuyAmount !== undefined && body.devBuyAmount > 0) {
      if (body.devBuyAmount > MAX_DEV_BUY_SOL) {
        return NextResponse.json(
          {
            success: false,
            error: `Dev buy exceeds maximum. Max ${MAX_DEV_BUY_SOL} SOL (~${MAX_DEV_BUY_PERCENT}% of supply)`,
          },
          { status: 400 }
        );
      }
      devBuyAmount = body.devBuyAmount;
      // Estimate percentage based on curve position (early buys get more tokens)
      devBuyPercent = Math.min((devBuyAmount / MAX_DEV_BUY_SOL) * MAX_DEV_BUY_PERCENT, MAX_DEV_BUY_PERCENT);
    }

    // Connect to Solana
    const connection = new Connection(SOLANA_RPC, 'confirmed');

    // Check creator's balance (launch fee + optional dev buy + buffer)
    const balance = await connection.getBalance(creatorPubkey);
    const requiredLamports = (LAUNCH_FEE_SOL + devBuyAmount + 0.01) * LAMPORTS_PER_SOL;

    const requiredSol = LAUNCH_FEE_SOL + devBuyAmount + 0.01;
    if (balance < requiredLamports) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient balance. Need ${requiredSol.toFixed(2)} SOL (${LAUNCH_FEE_SOL} fee${devBuyAmount > 0 ? ` + ${devBuyAmount} dev buy` : ''} + 0.01 buffer), have ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
        },
        { status: 400 }
      );
    }

    // Build the launch transaction
    // Step 1: Transfer launch fee to Shipyard
    const launchFeeLamports = LAUNCH_FEE_SOL * LAMPORTS_PER_SOL;
    const launchFeeWallet = new PublicKey(LAUNCH_FEE_WALLET);

    const feeTransferIx = SystemProgram.transfer({
      fromPubkey: creatorPubkey,
      toPubkey: launchFeeWallet,
      lamports: launchFeeLamports,
    });

    // Step 2: Create pool instruction would go here
    // This requires the Meteora SDK on the backend
    // For now, we return a transaction with just the fee transfer
    // The full pool creation will be added once we have server-side signing

    const transaction = new Transaction();
    transaction.add(feeTransferIx);

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = creatorPubkey;

    // Serialize for client signing
    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).toString('base64');

    return NextResponse.json({
      success: true,
      transaction: serializedTx,
      launchFee: LAUNCH_FEE_SOL,

      // These will be populated once pool creation is integrated
      tokenMint: 'pending', // Will be generated
      poolAddress: 'pending', // Will be derived
      configAddress: SHIPYARD_CONFIG,

      curveInfo: {
        migrationThreshold: '85 SOL',
        bondingFee: '1%',
        postMigrationFee: '0.5%',
      },

      engineInfo: {
        tier: engineTier,
        name: engine.name,
        lpPercent: engine.lpPercent,
        burnPercent: engine.burnPercent,
      },

      devBuyInfo: {
        enabled: devBuyAmount > 0,
        solAmount: devBuyAmount,
        estimatedPercent: Math.round(devBuyPercent * 100) / 100,
      },

      message: devBuyAmount > 0
        ? `Sign to pay ${LAUNCH_FEE_SOL} SOL launch fee + ${devBuyAmount} SOL dev buy (~${devBuyPercent.toFixed(1)}% of supply).`
        : `Sign this transaction to pay ${LAUNCH_FEE_SOL} SOL launch fee. Pool creation coming soon.`,

      // Token details (for confirmation)
      tokenDetails: {
        name: body.name,
        symbol: body.symbol.toUpperCase(),
        uri: body.uri || 'pending',
      },
    });

  } catch (error) {
    console.error('Launch token error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
