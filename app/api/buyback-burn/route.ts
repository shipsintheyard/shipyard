import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createBurnInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { promises as fs } from 'fs';
import path from 'path';

// ============================================================
// SHIPYARD BUYBACK & BURN API
// ============================================================
// POST /api/buyback-burn - Execute buyback and burn for a specific token
// GET /api/buyback-burn - Check status of pending buyback-burns
//
// This handles the "Supernova" engine feature where 20% of migration
// fees are used to buy back the token and burn supply.
//
// Flow:
// 1. Pool migrates (monitored externally or via webhook)
// 2. This API is called with the token mint
// 3. We calculate 20% of migration fees
// 4. Swap SOL -> Token via Jupiter
// 5. Burn the tokens
// 6. Update launch record
// ============================================================

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const LAUNCHES_FILE = path.join(process.cwd(), 'data', 'launches.json');

// Jupiter API for swaps
const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

function getShipyardKeypair(): Keypair | null {
  const key = process.env.SHIPYARD_PRIVATE_KEY;
  if (!key) return null;
  try {
    return Keypair.fromSecretKey(bs58.decode(key));
  } catch {
    return null;
  }
}

// SOL mint address (wrapped SOL)
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

interface Launch {
  id: string;
  tokenMint: string;
  poolAddress: string;
  name: string;
  symbol: string;
  engine: 1 | 2 | 3;
  engineName: 'navigator' | 'lighthouse' | 'supernova';
  solRaised: number;
  migrated: boolean;
  migratedAt?: number;
  buybackBurnEnabled: boolean;
  buybackBurnPercent: number;
  buybackBurnExecuted: boolean;
  buybackBurnTxSignature?: string;
  buybackBurnAmount?: number;
  tokensBurned?: number;
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

async function saveLaunches(launches: Launch[]) {
  await fs.writeFile(LAUNCHES_FILE, JSON.stringify(launches, null, 2));
}

/**
 * Get Jupiter quote for swapping SOL to token
 */
async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amountLamports: number
): Promise<{ outAmount: string; routePlan: unknown } | null> {
  try {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amountLamports.toString(),
      slippageBps: '100', // 1% slippage
    });

    const response = await fetch(`${JUPITER_QUOTE_API}?${params}`);
    if (!response.ok) {
      console.error('Jupiter quote error:', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Jupiter quote error:', error);
    return null;
  }
}

/**
 * Get Jupiter swap transaction
 */
async function getJupiterSwapTx(
  quoteResponse: unknown,
  userPublicKey: string
): Promise<string | null> {
  try {
    const response = await fetch(JUPITER_SWAP_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });

    if (!response.ok) {
      console.error('Jupiter swap error:', await response.text());
      return null;
    }

    const data = await response.json();
    return data.swapTransaction;
  } catch (error) {
    console.error('Jupiter swap error:', error);
    return null;
  }
}

/**
 * Execute buyback: Swap SOL for token
 */
async function executeBuyback(
  connection: Connection,
  tokenMint: string,
  solAmount: number
): Promise<{ signature: string; tokensReceived: bigint } | null> {
  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
  const keypair = getShipyardKeypair();
  if (!keypair) {
    console.error('Keypair not configured');
    return null;
  }

  console.log(`Executing buyback: ${solAmount} SOL -> ${tokenMint}`);

  // Get Jupiter quote
  const quote = await getJupiterQuote(
    WSOL_MINT.toBase58(),
    tokenMint,
    lamports
  );

  if (!quote) {
    console.error('Failed to get Jupiter quote');
    return null;
  }

  console.log(`Quote: ${lamports} lamports -> ${quote.outAmount} tokens`);

  // Get swap transaction
  const swapTxBase64 = await getJupiterSwapTx(quote, keypair.publicKey.toBase58());

  if (!swapTxBase64) {
    console.error('Failed to get Jupiter swap transaction');
    return null;
  }

  // Deserialize and sign transaction
  const swapTxBuffer = Buffer.from(swapTxBase64, 'base64');
  const transaction = Transaction.from(swapTxBuffer);

  // Get fresh blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;

  // Sign with Shipyard wallet
  transaction.sign(keypair);

  // Send transaction
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  console.log(`Buyback tx sent: ${signature}`);

  // Wait for confirmation
  await connection.confirmTransaction(signature, 'confirmed');

  return {
    signature,
    tokensReceived: BigInt(quote.outAmount),
  };
}

/**
 * Execute burn: Burn tokens from Shipyard wallet
 */
async function executeBurn(
  connection: Connection,
  tokenMint: PublicKey,
  amount: bigint
): Promise<string | null> {
  const keypair = getShipyardKeypair();
  if (!keypair) {
    console.error('Keypair not configured');
    return null;
  }

  console.log(`Burning ${amount} tokens of ${tokenMint.toBase58()}`);

  // Get Shipyard's token account
  const shipyardAta = await getAssociatedTokenAddress(tokenMint, keypair.publicKey);

  // Create burn instruction
  const burnIx = createBurnInstruction(
    shipyardAta,
    tokenMint,
    keypair.publicKey,
    amount
  );

  // Create transaction
  const tx = new Transaction().add(burnIx);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = keypair.publicKey;

  tx.sign(keypair);

  // Send transaction
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  console.log(`Burn tx sent: ${signature}`);

  // Wait for confirmation
  await connection.confirmTransaction(signature, 'confirmed');

  return signature;
}

// GET - Check status of pending buyback-burns
export async function GET() {
  try {
    const launches = await getLaunches();

    // Find launches that need buyback-burn
    const pending = launches.filter(
      (l) => l.buybackBurnEnabled && l.migrated && !l.buybackBurnExecuted
    );

    // Find completed buyback-burns
    const completed = launches.filter(
      (l) => l.buybackBurnEnabled && l.buybackBurnExecuted
    );

    return NextResponse.json({
      success: true,
      pending: pending.map((l) => ({
        id: l.id,
        tokenMint: l.tokenMint,
        symbol: l.symbol,
        solRaised: l.solRaised,
        buybackAmount: (l.solRaised * l.buybackBurnPercent) / 100,
      })),
      completed: completed.map((l) => ({
        id: l.id,
        tokenMint: l.tokenMint,
        symbol: l.symbol,
        buybackBurnTxSignature: l.buybackBurnTxSignature,
        buybackBurnAmount: l.buybackBurnAmount,
        tokensBurned: l.tokensBurned,
      })),
    });
  } catch (error) {
    console.error('Get buyback-burn status error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST - Execute buyback and burn for a specific token
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.tokenMint) {
      return NextResponse.json(
        { success: false, error: 'tokenMint is required' },
        { status: 400 }
      );
    }

    const launches = await getLaunches();
    const launchIndex = launches.findIndex((l) => l.tokenMint === body.tokenMint);

    if (launchIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Launch not found' },
        { status: 404 }
      );
    }

    const launch = launches[launchIndex];

    // Validate launch is eligible for buyback-burn
    if (!launch.buybackBurnEnabled) {
      return NextResponse.json(
        { success: false, error: 'Buyback-burn not enabled for this launch (not Supernova engine)' },
        { status: 400 }
      );
    }

    if (!launch.migrated) {
      return NextResponse.json(
        { success: false, error: 'Pool has not migrated yet' },
        { status: 400 }
      );
    }

    if (launch.buybackBurnExecuted) {
      return NextResponse.json(
        {
          success: false,
          error: 'Buyback-burn already executed',
          txSignature: launch.buybackBurnTxSignature,
        },
        { status: 400 }
      );
    }

    const connection = new Connection(SOLANA_RPC, 'confirmed');

    // Calculate buyback amount (20% of SOL raised)
    const buybackSolAmount = (launch.solRaised * launch.buybackBurnPercent) / 100;

    if (buybackSolAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'No SOL to use for buyback' },
        { status: 400 }
      );
    }

    const keypair = getShipyardKeypair();
    if (!keypair) {
      return NextResponse.json(
        { success: false, error: 'SHIPYARD_PRIVATE_KEY not configured' },
        { status: 500 }
      );
    }

    console.log(`Starting buyback-burn for ${launch.symbol}:`);
    console.log(`  Token: ${launch.tokenMint}`);
    console.log(`  SOL Raised: ${launch.solRaised}`);
    console.log(`  Buyback Amount: ${buybackSolAmount} SOL (${launch.buybackBurnPercent}%)`);

    // Check Shipyard wallet has enough SOL
    const balance = await connection.getBalance(keypair.publicKey);
    const requiredLamports = Math.floor(buybackSolAmount * LAMPORTS_PER_SOL) + 10000000; // +0.01 SOL for fees

    if (balance < requiredLamports) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient SOL in Shipyard wallet. Need ${requiredLamports / LAMPORTS_PER_SOL} SOL, have ${balance / LAMPORTS_PER_SOL} SOL`,
        },
        { status: 400 }
      );
    }

    // Execute buyback (swap SOL -> token)
    const buybackResult = await executeBuyback(
      connection,
      launch.tokenMint,
      buybackSolAmount
    );

    if (!buybackResult) {
      return NextResponse.json(
        { success: false, error: 'Buyback swap failed' },
        { status: 500 }
      );
    }

    console.log(`Buyback complete! Received ${buybackResult.tokensReceived} tokens`);

    // Wait a moment for token account to update
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Execute burn
    const burnSignature = await executeBurn(
      connection,
      new PublicKey(launch.tokenMint),
      buybackResult.tokensReceived
    );

    if (!burnSignature) {
      return NextResponse.json(
        {
          success: false,
          error: 'Burn failed (but buyback succeeded)',
          buybackSignature: buybackResult.signature,
          tokensReceived: buybackResult.tokensReceived.toString(),
        },
        { status: 500 }
      );
    }

    console.log(`Burn complete! Signature: ${burnSignature}`);

    // Update launch record
    launches[launchIndex] = {
      ...launch,
      buybackBurnExecuted: true,
      buybackBurnTxSignature: burnSignature,
      buybackBurnAmount: buybackSolAmount,
      tokensBurned: Number(buybackResult.tokensReceived),
    };

    await saveLaunches(launches);

    return NextResponse.json({
      success: true,
      message: `Buyback-burn complete for ${launch.symbol}!`,
      buybackSignature: buybackResult.signature,
      burnSignature,
      solUsed: buybackSolAmount,
      tokensBurned: buybackResult.tokensReceived.toString(),
    });
  } catch (error) {
    console.error('Buyback-burn error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
