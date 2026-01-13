import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import BN from 'bn.js';

// ============================================================
// SHIPYARD TOKEN LAUNCH - CREATE POOL
// ============================================================
// POST /api/launch-token/create
//
// Creates pool transaction using Meteora SDK.
// Returns serialized transaction for client to sign.
//
// Flow:
// 1. User calls POST /api/launch-token → gets fee tx
// 2. User signs and sends fee tx
// 3. User calls POST /api/launch-token/create with signature
// 4. Backend verifies fee payment and builds pool creation tx
// 5. User signs and sends pool creation tx
// ============================================================

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// Shipyard Production Config (devnet) - must be pre-created
const SHIPYARD_CONFIG = new PublicKey('FWV59wJ2wHHVjzTS2Er33KwJ2i7LXc1fAMoRbvVSjHJB');

// Launch fee wallet - receives 2 SOL per launch
const LAUNCH_FEE_WALLET = new PublicKey('8G46itYevnA4gFUBFNSUZF1fZEgRWfa4xYsJbuhY6BFj');

// Launch fee (reduced to 0.5 for devnet testing)
const LAUNCH_FEE_SOL = 0.5;

// Dev buy limits
const MAX_DEV_BUY_SOL = 1.5; // ~5% of supply at launch price
const MAX_DEV_BUY_PERCENT = 5;

// Meteora DBC Program
const DBC_PROGRAM_ID = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN');

interface CreatePoolRequest {
  // Fee payment signature (to verify payment)
  feeSignature: string;

  // Token metadata
  name: string;
  symbol: string;
  uri: string;

  // Creator wallet
  creatorWallet: string;

  // Dev buy amount in SOL (optional, max ~5% of supply)
  devBuyAmount?: number;
}

// Derive pool address PDA
function derivePoolAddress(baseMint: PublicKey, quoteMint: PublicKey, config: PublicKey): PublicKey {
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), baseMint.toBuffer(), quoteMint.toBuffer(), config.toBuffer()],
    DBC_PROGRAM_ID
  );
  return pool;
}

export async function POST(request: NextRequest) {
  try {
    const body: CreatePoolRequest = await request.json();

    // Validate required fields
    if (!body.feeSignature || !body.name || !body.symbol || !body.uri || !body.creatorWallet) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: feeSignature, name, symbol, uri, creatorWallet',
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

    const connection = new Connection(SOLANA_RPC, 'confirmed');

    // Verify fee payment
    console.log('Verifying fee payment:', body.feeSignature);

    const txInfo = await connection.getTransaction(body.feeSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!txInfo) {
      return NextResponse.json(
        { success: false, error: 'Fee payment transaction not found. Please wait for confirmation.' },
        { status: 400 }
      );
    }

    if (txInfo.meta?.err) {
      return NextResponse.json(
        { success: false, error: 'Fee payment transaction failed' },
        { status: 400 }
      );
    }

    // Verify the fee was paid to Launch Fee Wallet
    const accountKeys = txInfo.transaction.message.getAccountKeys();
    const launchFeeWalletIndex = accountKeys.staticAccountKeys.findIndex(
      (key) => key.equals(LAUNCH_FEE_WALLET)
    );

    if (launchFeeWalletIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Fee payment not sent to Shipyard wallet' },
        { status: 400 }
      );
    }

    const preBalance = txInfo.meta?.preBalances[launchFeeWalletIndex] || 0;
    const postBalance = txInfo.meta?.postBalances[launchFeeWalletIndex] || 0;
    const receivedLamports = postBalance - preBalance;
    const expectedLamports = LAUNCH_FEE_SOL * LAMPORTS_PER_SOL;

    if (receivedLamports < expectedLamports * 0.99) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient fee. Expected ${LAUNCH_FEE_SOL} SOL, received ${receivedLamports / LAMPORTS_PER_SOL} SOL`,
        },
        { status: 400 }
      );
    }

    console.log('Fee payment verified!');

    // Generate new token mint keypair
    const baseMintKeypair = Keypair.generate();
    const baseMint = baseMintKeypair.publicKey;

    // Derive pool address
    const poolAddress = derivePoolAddress(baseMint, NATIVE_MINT, SHIPYARD_CONFIG);

    // Validate and truncate metadata fields to prevent buffer overflow
    // Meteora DBC has strict limits on metadata field sizes
    // Based on SDK examples: name should be short, symbol 3-10 chars, uri should be a URL
    const tokenName = body.name.slice(0, 32);
    const tokenSymbol = body.symbol.toUpperCase().slice(0, 10);
    // Use a placeholder URI if none provided or if too long
    // The SDK seems to have issues with long URIs - use a short one
    const tokenUri = body.uri && body.uri.length < 100
      ? body.uri
      : `https://shipyard.so/${tokenSymbol}`;

    console.log('Creating pool transaction:');
    console.log('  Token Mint:', baseMint.toBase58());
    console.log('  Pool:', poolAddress.toBase58());
    console.log('  Config:', SHIPYARD_CONFIG.toBase58());
    console.log('  Name:', JSON.stringify(tokenName), `(${tokenName.length} chars)`);
    console.log('  Symbol:', JSON.stringify(tokenSymbol), `(${tokenSymbol.length} chars)`);
    console.log('  URI:', JSON.stringify(tokenUri), `(${tokenUri.length} chars)`);
    console.log('  Payer:', creatorPubkey.toBase58());

    // Initialize Meteora client
    const client = DynamicBondingCurveClient.create(connection, 'confirmed');

    // Calculate dev buy
    const devBuyAmount = body.devBuyAmount
      ? Math.min(body.devBuyAmount, MAX_DEV_BUY_SOL)
      : 0;
    const devBuyLamports = Math.floor(devBuyAmount * LAMPORTS_PER_SOL);
    const devBuyPercent = (devBuyAmount / MAX_DEV_BUY_SOL) * MAX_DEV_BUY_PERCENT;

    let createPoolTx;
    let swapBuyTx;

    // TEMP: Always use createPool without first buy to debug the encoding issue
    // The createPoolWithFirstBuy has a buffer encoding error
    console.log('Creating pool (dev buy disabled for debugging)');

    try {
      createPoolTx = await client.pool.createPool({
        name: tokenName,
        symbol: tokenSymbol,
        uri: tokenUri,
        payer: creatorPubkey,
        poolCreator: creatorPubkey,
        config: SHIPYARD_CONFIG,
        baseMint: baseMint,
      });
      console.log('Pool transaction created successfully!');
    } catch (poolError) {
      console.error('createPool error:', poolError);
      throw poolError;
    }

    // TODO: Re-enable dev buy once basic pool creation works
    // if (devBuyAmount > 0) {
    //   // Create swap transaction separately after pool creation
    // }

    // Get blockhash for transactions
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    // Set transaction properties
    createPoolTx.recentBlockhash = blockhash;
    createPoolTx.lastValidBlockHeight = lastValidBlockHeight;
    createPoolTx.feePayer = creatorPubkey;

    // Partially sign with baseMint keypair (user will add their signature)
    createPoolTx.partialSign(baseMintKeypair);

    // Serialize for client
    const serializedPoolTx = createPoolTx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).toString('base64');

    // Prepare response
    const response: Record<string, unknown> = {
      success: true,

      // Transactions to sign
      createPoolTransaction: serializedPoolTx,

      // Pool details
      tokenMint: baseMint.toBase58(),
      poolAddress: poolAddress.toBase58(),
      configAddress: SHIPYARD_CONFIG.toBase58(),

      // Token details
      tokenDetails: {
        name: tokenName,
        symbol: tokenSymbol,
        uri: tokenUri,
      },

      // Dev buy info
      devBuyInfo: {
        enabled: devBuyAmount > 0,
        solAmount: devBuyAmount,
        estimatedPercent: Math.round(devBuyPercent * 100) / 100,
      },

      message: devBuyAmount > 0
        ? `Sign to create ${tokenSymbol} pool + dev buy ${devBuyAmount} SOL (~${devBuyPercent.toFixed(1)}% of supply)`
        : `Sign to create ${tokenSymbol} pool on Shipyard`,
    };

    // Add swap transaction if dev buy
    if (swapBuyTx) {
      swapBuyTx.recentBlockhash = blockhash;
      swapBuyTx.lastValidBlockHeight = lastValidBlockHeight;
      swapBuyTx.feePayer = creatorPubkey;

      response.swapBuyTransaction = swapBuyTx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      }).toString('base64');

      response.instructions = [
        '1. Sign and send createPoolTransaction first',
        '2. Wait for confirmation',
        '3. Sign and send swapBuyTransaction for dev buy',
      ];
    } else {
      response.instructions = [
        '1. Sign and send createPoolTransaction',
        '2. Pool will be live on Shipyard!',
      ];
    }

    console.log('Pool transaction created successfully!');
    return NextResponse.json(response);

  } catch (error) {
    console.error('Create pool error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
