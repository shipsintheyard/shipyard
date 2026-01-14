import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import BN from 'bn.js';

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

interface SwapRequest {
  poolAddress: string;
  amountLamports: number;
  buyerWallet: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SwapRequest = await request.json();

    if (!body.poolAddress || !body.amountLamports || !body.buyerWallet) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const client = DynamicBondingCurveClient.create(connection, 'confirmed');

    const poolAddress = new PublicKey(body.poolAddress);
    const buyerPubkey = new PublicKey(body.buyerWallet);

    console.log('Creating swap tx for pool:', poolAddress.toBase58());
    console.log('Amount:', body.amountLamports, 'lamports');
    console.log('Buyer:', buyerPubkey.toBase58());

    // Meteora DBC SDK swap parameters
    const swapTx = await client.pool.swap({
      pool: poolAddress,
      owner: buyerPubkey,
      amountIn: new BN(body.amountLamports),
      minimumAmountOut: new BN(0),
      swapBaseForQuote: false, // false = buying base token with quote (SOL)
      referralTokenAccount: null,
    });

    const { blockhash } = await connection.getLatestBlockhash();
    swapTx.recentBlockhash = blockhash;
    swapTx.feePayer = buyerPubkey;

    const serializedTx = swapTx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).toString('base64');

    console.log('Swap transaction created successfully');

    return NextResponse.json({
      success: true,
      transaction: serializedTx,
    });

  } catch (error) {
    console.error('Swap error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
