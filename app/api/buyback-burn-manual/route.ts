import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createBurnInstruction,
  TOKEN_PROGRAM_ID,
  getAccount,
} from '@solana/spl-token';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import BN from 'bn.js';
import bs58 from 'bs58';

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ============================================================
// MANUAL BUYBACK & BURN (using Meteora DBC)
// ============================================================
// POST /api/buyback-burn-manual
//
// Manually execute buyback + burn with a specified SOL amount
// Uses Meteora DBC pool directly instead of Jupiter
// ============================================================

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

function getShipyardKeypair(): Keypair | null {
  const key = process.env.SHIPYARD_PRIVATE_KEY;
  if (!key) return null;
  try {
    return Keypair.fromSecretKey(bs58.decode(key));
  } catch {
    return null;
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.tokenMint) {
      return NextResponse.json(
        { success: false, error: 'tokenMint is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!body.poolAddress) {
      return NextResponse.json(
        { success: false, error: 'poolAddress is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!body.solAmount || body.solAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'solAmount is required (in SOL)' },
        { status: 400, headers: corsHeaders }
      );
    }

    const SHIPYARD_KEYPAIR = getShipyardKeypair();
    if (!SHIPYARD_KEYPAIR) {
      return NextResponse.json(
        { success: false, error: 'SHIPYARD_PRIVATE_KEY not configured or invalid' },
        { status: 500, headers: corsHeaders }
      );
    }

    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const client = DynamicBondingCurveClient.create(connection, 'confirmed');

    const tokenMint = body.tokenMint;
    const poolAddress = new PublicKey(body.poolAddress);
    const solAmount = parseFloat(body.solAmount);
    const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

    console.log('=== MANUAL BUYBACK + BURN (Meteora DBC) ===');
    console.log('Token:', tokenMint);
    console.log('Pool:', body.poolAddress);
    console.log('SOL Amount:', solAmount);
    console.log('Lamports:', lamports);

    // Step 1: Check wallet balance
    console.log('Step 1: Checking balance...');
    let balance: number;
    try {
      balance = await connection.getBalance(SHIPYARD_KEYPAIR.publicKey);
      console.log('Balance:', balance / LAMPORTS_PER_SOL, 'SOL');
    } catch (rpcError) {
      console.error('RPC getBalance failed:', rpcError);
      return NextResponse.json(
        { success: false, error: `RPC connection failed: ${rpcError instanceof Error ? rpcError.message : 'Unknown'}` },
        { status: 500, headers: corsHeaders }
      );
    }

    if (balance < lamports + 10000000) {
      return NextResponse.json(
        { success: false, error: `Insufficient balance. Have ${balance / LAMPORTS_PER_SOL} SOL, need ${solAmount + 0.01} SOL` },
        { status: 400, headers: corsHeaders }
      );
    }

    // Step 2: Get token balance before swap
    console.log('Step 2: Getting token balance before swap...');
    const tokenMintPubkey = new PublicKey(tokenMint);
    const tokenAccount = await getAssociatedTokenAddress(tokenMintPubkey, SHIPYARD_KEYPAIR.publicKey);

    let tokenBalanceBefore = BigInt(0);
    try {
      const accountInfo = await getAccount(connection, tokenAccount);
      tokenBalanceBefore = accountInfo.amount;
      console.log('Token balance before:', tokenBalanceBefore.toString());
    } catch {
      console.log('No existing token account, will be created');
    }

    // Step 3: Execute swap on Meteora DBC (buy tokens with SOL)
    console.log('Step 3: Executing swap on Meteora DBC...');
    try {
      // Get pool state
      const poolState = await client.state.getPool(poolAddress);
      console.log('Pool found, base mint:', poolState.baseMint.toBase58());

      // Build swap transaction (buy base token with quote/SOL)
      // inAmount is SOL (quote), we want to receive tokens (base)
      const swapTx = await client.swap.swapQuoteToBase({
        payer: SHIPYARD_KEYPAIR.publicKey,
        pool: poolAddress,
        amountIn: new BN(lamports),
        minimumAmountOut: new BN(0), // Accept any amount (we'll check after)
        referralTokenAccount: undefined,
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      swapTx.recentBlockhash = blockhash;
      swapTx.lastValidBlockHeight = lastValidBlockHeight;
      swapTx.feePayer = SHIPYARD_KEYPAIR.publicKey;

      const swapSignature = await sendAndConfirmTransaction(
        connection,
        swapTx,
        [SHIPYARD_KEYPAIR],
        { commitment: 'confirmed' }
      );

      console.log('Swap complete! Signature:', swapSignature);

      // Step 4: Wait and get tokens received
      console.log('Step 4: Checking tokens received...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      let tokensReceived = BigInt(0);
      try {
        const accountInfoAfter = await getAccount(connection, tokenAccount);
        tokensReceived = accountInfoAfter.amount - tokenBalanceBefore;
        console.log('Tokens received:', tokensReceived.toString());
      } catch (e) {
        console.error('Failed to get token balance after swap:', e);
        return NextResponse.json(
          { success: false, error: 'Swap succeeded but failed to get token balance' },
          { status: 500, headers: corsHeaders }
        );
      }

      if (tokensReceived <= BigInt(0)) {
        return NextResponse.json(
          { success: false, error: 'No tokens received from swap' },
          { status: 500, headers: corsHeaders }
        );
      }

      // Step 5: Burn the tokens
      console.log('Step 5: Burning tokens...');
      const burnIx = createBurnInstruction(
        tokenAccount,
        tokenMintPubkey,
        SHIPYARD_KEYPAIR.publicKey,
        tokensReceived,
        [],
        TOKEN_PROGRAM_ID
      );

      const burnTx = new Transaction().add(burnIx);
      const { blockhash: burnBlockhash, lastValidBlockHeight: burnHeight } = await connection.getLatestBlockhash();
      burnTx.recentBlockhash = burnBlockhash;
      burnTx.lastValidBlockHeight = burnHeight;
      burnTx.feePayer = SHIPYARD_KEYPAIR.publicKey;

      const burnSignature = await sendAndConfirmTransaction(
        connection,
        burnTx,
        [SHIPYARD_KEYPAIR],
        { commitment: 'confirmed' }
      );

      console.log('Burn complete! Signature:', burnSignature);
      console.log('=== BUYBACK + BURN COMPLETE ===');

      return NextResponse.json({
        success: true,
        message: 'Buyback and burn complete!',
        solUsed: solAmount,
        tokensBurned: tokensReceived.toString(),
        swapSignature,
        burnSignature,
        swapExplorer: `https://solscan.io/tx/${swapSignature}`,
        burnExplorer: `https://solscan.io/tx/${burnSignature}`,
      }, { headers: corsHeaders });

    } catch (swapError) {
      console.error('Meteora swap failed:', swapError);
      return NextResponse.json(
        { success: false, error: `Meteora swap failed: ${swapError instanceof Error ? swapError.message : 'Unknown'}` },
        { status: 500, headers: corsHeaders }
      );
    }

  } catch (error) {
    console.error('Buyback-burn error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
