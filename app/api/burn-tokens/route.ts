import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createBurnInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAccount,
} from '@solana/spl-token';
import bs58 from 'bs58';

// ============================================================
// BURN TOKENS API
// ============================================================
// POST /api/burn-tokens - Burns all tokens of a given mint held by Shipyard wallet
//
// Used to clean up tokens from failed buyback attempts
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

export async function POST(request: NextRequest) {
  try {
    const SHIPYARD_KEYPAIR = getShipyardKeypair();
    if (!SHIPYARD_KEYPAIR) {
      return NextResponse.json(
        { success: false, error: 'Shipyard keypair not configured' },
        { status: 500 }
      );
    }

    const { tokenMint } = await request.json();

    if (!tokenMint) {
      return NextResponse.json(
        { success: false, error: 'tokenMint is required' },
        { status: 400 }
      );
    }

    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const tokenMintPubkey = new PublicKey(tokenMint);

    // Detect token program
    const mintAccountInfo = await connection.getAccountInfo(tokenMintPubkey);
    if (!mintAccountInfo) {
      return NextResponse.json(
        { success: false, error: 'Token mint not found' },
        { status: 404 }
      );
    }

    const tokenProgramId = mintAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;

    // Get token account
    const tokenAccount = await getAssociatedTokenAddress(
      tokenMintPubkey,
      SHIPYARD_KEYPAIR.publicKey,
      false,
      tokenProgramId
    );

    // Get current balance
    let balance: bigint;
    try {
      const accountInfo = await getAccount(connection, tokenAccount, 'confirmed', tokenProgramId);
      balance = accountInfo.amount;
    } catch {
      return NextResponse.json(
        { success: false, error: 'No token account found or zero balance' },
        { status: 404 }
      );
    }

    if (balance <= BigInt(0)) {
      return NextResponse.json(
        { success: false, error: 'No tokens to burn' },
        { status: 400 }
      );
    }

    console.log(`Burning ${balance.toString()} tokens of mint ${tokenMint}`);

    // Create burn instruction
    const burnIx = createBurnInstruction(
      tokenAccount,
      tokenMintPubkey,
      SHIPYARD_KEYPAIR.publicKey,
      balance,
      [],
      tokenProgramId
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

    console.log(`Burn complete! Signature: ${signature}`);

    return NextResponse.json({
      success: true,
      tokensBurned: balance.toString(),
      signature,
    });
  } catch (error) {
    console.error('Burn tokens error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
