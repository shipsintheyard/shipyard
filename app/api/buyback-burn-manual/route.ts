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

// ============================================================
// MANUAL BUYBACK & BURN
// ============================================================
// POST /api/buyback-burn-manual
//
// Manually execute buyback + burn with a specified SOL amount
// Use this when fees were claimed but buyback wasn't triggered
// ============================================================

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

const SHIPYARD_PRIVATE_KEY = process.env.SHIPYARD_PRIVATE_KEY;
const SHIPYARD_KEYPAIR = SHIPYARD_PRIVATE_KEY
  ? Keypair.fromSecretKey(bs58.decode(SHIPYARD_PRIVATE_KEY))
  : null;

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.tokenMint) {
      return NextResponse.json(
        { success: false, error: 'tokenMint is required' },
        { status: 400 }
      );
    }

    if (!body.solAmount || body.solAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'solAmount is required (in SOL)' },
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
    const tokenMint = body.tokenMint;
    const solAmount = parseFloat(body.solAmount);
    const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

    console.log('=== MANUAL BUYBACK + BURN ===');
    console.log('Token:', tokenMint);
    console.log('SOL Amount:', solAmount);
    console.log('Lamports:', lamports);

    // Check wallet balance
    const balance = await connection.getBalance(SHIPYARD_KEYPAIR.publicKey);
    if (balance < lamports + 10000000) { // +0.01 for fees
      return NextResponse.json(
        { success: false, error: `Insufficient balance. Have ${balance / LAMPORTS_PER_SOL} SOL, need ${solAmount + 0.01} SOL` },
        { status: 400 }
      );
    }

    // Step 1: Get Jupiter quote
    console.log('Getting Jupiter quote...');
    const quoteParams = new URLSearchParams({
      inputMint: WSOL_MINT.toBase58(),
      outputMint: tokenMint,
      amount: lamports.toString(),
      slippageBps: '100',
    });

    const quoteRes = await fetch(`${JUPITER_QUOTE_API}?${quoteParams}`);
    if (!quoteRes.ok) {
      const error = await quoteRes.text();
      return NextResponse.json(
        { success: false, error: `Jupiter quote failed: ${error}` },
        { status: 500 }
      );
    }
    const quote = await quoteRes.json();
    console.log('Quote received. Expected tokens:', quote.outAmount);

    // Step 2: Get swap transaction
    console.log('Building swap transaction...');
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
        { success: false, error: `Jupiter swap failed: ${error}` },
        { status: 500 }
      );
    }

    const swapData = await swapRes.json();
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
    });
  } catch (error) {
    console.error('Buyback-burn error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
