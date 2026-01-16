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

    console.log('Burn request for mint:', tokenMint);
    console.log('Shipyard wallet:', SHIPYARD_KEYPAIR.publicKey.toBase58());

    // Detect token program - try both Token and Token-2022
    let tokenProgramId = TOKEN_PROGRAM_ID;
    const mintAccountInfo = await connection.getAccountInfo(tokenMintPubkey);
    if (mintAccountInfo) {
      tokenProgramId = mintAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;
    } else {
      // Mint not found with getAccountInfo, try Token-2022 explicitly
      console.log('Mint not found via getAccountInfo, trying Token-2022...');
      tokenProgramId = TOKEN_2022_PROGRAM_ID;
    }

    console.log('Using token program:', tokenProgramId.toBase58());

    // Try to find token account - check both Token and Token-2022 ATAs
    let tokenAccount: PublicKey;
    let balance: bigint = BigInt(0);
    let actualTokenProgramId = tokenProgramId;

    // First try with detected program
    tokenAccount = await getAssociatedTokenAddress(
      tokenMintPubkey,
      SHIPYARD_KEYPAIR.publicKey,
      false,
      tokenProgramId
    );
    console.log('Trying token account:', tokenAccount.toBase58());

    try {
      const accountInfo = await getAccount(connection, tokenAccount, 'confirmed', tokenProgramId);
      balance = accountInfo.amount;
      console.log('Found balance with', tokenProgramId.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'Token', ':', balance.toString());
    } catch (e) {
      console.log('Not found with primary program, trying alternate...');

      // Try the other program
      const altProgramId = tokenProgramId.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
      const altTokenAccount = await getAssociatedTokenAddress(
        tokenMintPubkey,
        SHIPYARD_KEYPAIR.publicKey,
        false,
        altProgramId
      );
      console.log('Trying alternate token account:', altTokenAccount.toBase58());

      try {
        const accountInfo = await getAccount(connection, altTokenAccount, 'confirmed', altProgramId);
        balance = accountInfo.amount;
        tokenAccount = altTokenAccount;
        actualTokenProgramId = altProgramId;
        console.log('Found balance with alternate program:', balance.toString());
      } catch {
        return NextResponse.json(
          { success: false, error: 'No token account found with either Token or Token-2022 program' },
          { status: 404 }
        );
      }
    }

    if (balance <= BigInt(0)) {
      return NextResponse.json(
        { success: false, error: 'No tokens to burn' },
        { status: 400 }
      );
    }

    console.log(`Burning ${balance.toString()} tokens of mint ${tokenMint}`);

    // Create burn instruction using the actual program where we found the tokens
    const burnIx = createBurnInstruction(
      tokenAccount,
      tokenMintPubkey,
      SHIPYARD_KEYPAIR.publicKey,
      balance,
      [],
      actualTokenProgramId
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
