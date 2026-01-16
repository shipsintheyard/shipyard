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
} from '@solana/spl-token';
import bs58 from 'bs58';

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ============================================================
// MANUAL BUYBACK & BURN
// ============================================================
// POST /api/buyback-burn-manual
//
// Manually execute buyback + burn with a specified SOL amount
// Use this when fees were claimed but buyback wasn't triggered
// ============================================================

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Jupiter API
const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

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
    const tokenMint = body.tokenMint;
    const solAmount = parseFloat(body.solAmount);
    const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

    console.log('=== MANUAL BUYBACK + BURN ===');
    console.log('Token:', tokenMint);
    console.log('SOL Amount:', solAmount);
    console.log('Lamports:', lamports);
    console.log('RPC:', SOLANA_RPC.substring(0, 50) + '...');

    // Check wallet balance
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
    if (balance < lamports + 10000000) { // +0.01 for fees
      return NextResponse.json(
        { success: false, error: `Insufficient balance. Have ${balance / LAMPORTS_PER_SOL} SOL, need ${solAmount + 0.01} SOL` },
        { status: 400, headers: corsHeaders }
      );
    }

    // Step 2: Get Jupiter quote (with retry)
    console.log('Step 2: Getting Jupiter quote...');
    const quoteParams = new URLSearchParams({
      inputMint: WSOL_MINT.toBase58(),
      outputMint: tokenMint,
      amount: lamports.toString(),
      slippageBps: '100',
    });

    let quote;
    let quoteAttempts = 0;
    const maxQuoteAttempts = 3;

    while (quoteAttempts < maxQuoteAttempts) {
      quoteAttempts++;
      try {
        console.log(`Quote attempt ${quoteAttempts}/${maxQuoteAttempts}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        const quoteRes = await fetch(`${JUPITER_QUOTE_API}?${quoteParams}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!quoteRes.ok) {
          const error = await quoteRes.text();
          console.error(`Quote attempt ${quoteAttempts} failed:`, error);
          if (quoteAttempts === maxQuoteAttempts) {
            return NextResponse.json(
              { success: false, error: `Jupiter quote failed after ${maxQuoteAttempts} attempts: ${error}` },
              { status: 500, headers: corsHeaders }
            );
          }
          await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
          continue;
        }
        quote = await quoteRes.json();
        console.log('Quote received. Expected tokens:', quote.outAmount);
        break; // Success, exit retry loop
      } catch (quoteError) {
        console.error(`Quote attempt ${quoteAttempts} error:`, quoteError);
        if (quoteAttempts === maxQuoteAttempts) {
          return NextResponse.json(
            { success: false, error: `Jupiter quote fetch failed after ${maxQuoteAttempts} attempts: ${quoteError instanceof Error ? quoteError.message : 'Unknown'}` },
            { status: 500, headers: corsHeaders }
          );
        }
        await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
      }
    }

    // Step 3: Get swap transaction
    console.log('Step 3: Building swap transaction...');
    let swapData;
    try {
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
        const error = await swapRes.text();
        return NextResponse.json(
          { success: false, error: `Jupiter swap build failed: ${error}` },
          { status: 500, headers: corsHeaders }
        );
      }
      swapData = await swapRes.json();
      console.log('Swap transaction built');
    } catch (swapBuildError) {
      console.error('Jupiter swap build fetch failed:', swapBuildError);
      return NextResponse.json(
        { success: false, error: `Jupiter swap build fetch failed: ${swapBuildError instanceof Error ? swapBuildError.message : 'Unknown'}` },
        { status: 500, headers: corsHeaders }
      );
    }

    const swapTx = Transaction.from(Buffer.from(swapData.swapTransaction, 'base64'));

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    swapTx.recentBlockhash = blockhash;
    swapTx.lastValidBlockHeight = lastValidBlockHeight;

    swapTx.sign(SHIPYARD_KEYPAIR);

    // Step 3: Execute swap
    console.log('Executing swap...');
    const swapSignature = await connection.sendRawTransaction(swapTx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    await connection.confirmTransaction(swapSignature, 'confirmed');
    console.log('Swap complete! Signature:', swapSignature);

    const tokensReceived = parseInt(quote.outAmount);

    // Step 4: Wait for token account to update
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 5: Burn the tokens
    console.log('Burning tokens...');
    const tokenMintPubkey = new PublicKey(tokenMint);
    const tokenAccount = await getAssociatedTokenAddress(tokenMintPubkey, SHIPYARD_KEYPAIR.publicKey);

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
      tokensBurned: tokensReceived,
      swapSignature,
      burnSignature,
      swapExplorer: `https://solscan.io/tx/${swapSignature}`,
      burnExplorer: `https://solscan.io/tx/${burnSignature}`,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Buyback-burn error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
