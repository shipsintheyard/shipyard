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
import bs58 from 'bs58';

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

// Engine configs (MAINNET) - ~94 SOL to fill, ~27 SOL start MC, ~500 SOL migration MC
// Slightly more generous than pump.fun but similar curve shape
const ENGINE_CONFIGS: Record<string, PublicKey> = {
  navigator: new PublicKey('Ga4DCnyPHcxfp1k5FRbpn6PHhP9QXaLDczuMJL5RTN6U'),  // 80% LP, 20% Burn, 0% Dev
  lighthouse: new PublicKey('EBiqUqvwEx7k19KZrn8FDPaW8L6tDNmRn1zZG2SsS8VM'), // 50% LP, 0% Burn, 50% Dev
  supernova: new PublicKey('8jFgQdWHcUbjzP3a4wXZXxHWqh1tvApbiQHHrXUynJcP'),  // 25% LP, 75% Burn, 0% Dev
};

// Default config (Navigator)
const DEFAULT_ENGINE = 'navigator';

// Shipyard wallet - receives launch fees and is set as pool creator for all launches
// This ensures all launches appear from Shipyard on explorers/Meteora
// IMPORTANT: Set SHIPYARD_PRIVATE_KEY in environment variables
const SHIPYARD_PRIVATE_KEY = process.env.SHIPYARD_PRIVATE_KEY;
if (!SHIPYARD_PRIVATE_KEY) {
  console.error('SHIPYARD_PRIVATE_KEY environment variable is required');
}
const SHIPYARD_KEYPAIR = SHIPYARD_PRIVATE_KEY
  ? Keypair.fromSecretKey(bs58.decode(SHIPYARD_PRIVATE_KEY))
  : Keypair.generate(); // Fallback for build time only
const SHIPYARD_WALLET = SHIPYARD_KEYPAIR.publicKey;

// Launch fee (reduced to 0.01 for testing, change to 2 for production)
const LAUNCH_FEE_SOL = 0.01;

// Dev buy limits
const MAX_DEV_BUY_SOL = 1; // ~6.6% of supply at launch price
const MAX_DEV_BUY_PERCENT = 6.6;

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

  // Engine selection (navigator, lighthouse, supernova)
  engine?: string;

  // Dev buy amount in SOL (optional, max ~5% of supply)
  devBuyAmount?: number;

  // Pre-ground vanity keypair secret key (from client-side grinding)
  // This is an array of 64 bytes representing the secret key
  vanitySecretKey?: number[];
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
      (key) => key.equals(SHIPYARD_WALLET)
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

    // Calculate expected payment: launch fee + dev buy amount
    const devBuyAmount = body.devBuyAmount ? Math.min(body.devBuyAmount, MAX_DEV_BUY_SOL) : 0;
    const expectedLamports = (LAUNCH_FEE_SOL + devBuyAmount) * LAMPORTS_PER_SOL;

    if (receivedLamports < expectedLamports * 0.99) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient payment. Expected ${(LAUNCH_FEE_SOL + devBuyAmount).toFixed(2)} SOL (${LAUNCH_FEE_SOL} fee${devBuyAmount > 0 ? ` + ${devBuyAmount} dev buy` : ''}), received ${(receivedLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
        },
        { status: 400 }
      );
    }

    console.log(`Fee payment verified! Received ${receivedLamports / LAMPORTS_PER_SOL} SOL (${LAUNCH_FEE_SOL} fee + ${devBuyAmount} dev buy)`);

    // Get engine config
    const engineKey = body.engine && ENGINE_CONFIGS[body.engine] ? body.engine : DEFAULT_ENGINE;
    const engineConfig = ENGINE_CONFIGS[engineKey];
    console.log('Selected engine:', engineKey);

    // Generate token mint keypair (with optional pre-ground vanity address)
    let baseMintKeypair: Keypair;
    let isVanity = false;

    if (body.vanitySecretKey && Array.isArray(body.vanitySecretKey) && body.vanitySecretKey.length === 64) {
      // Use pre-ground vanity keypair from client
      console.log('Using pre-ground vanity keypair from client...');
      baseMintKeypair = Keypair.fromSecretKey(Uint8Array.from(body.vanitySecretKey));
      isVanity = true;

      // Verify it actually ends in SHIP
      const address = baseMintKeypair.publicKey.toBase58();
      if (!address.toUpperCase().endsWith('SHIP')) {
        console.warn('Warning: Provided keypair does not end in SHIP:', address);
      } else {
        console.log('Vanity address verified:', address);
      }
    } else {
      baseMintKeypair = Keypair.generate();
      console.log('Using random keypair:', baseMintKeypair.publicKey.toBase58());
    }

    const baseMint = baseMintKeypair.publicKey;

    // Derive pool address
    const poolAddress = derivePoolAddress(baseMint, NATIVE_MINT, engineConfig);

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
    console.log('  Config:', engineConfig.toBase58(), `(${engineKey})`);
    console.log('  Name:', JSON.stringify(tokenName), `(${tokenName.length} chars)`);
    console.log('  Symbol:', JSON.stringify(tokenSymbol), `(${tokenSymbol.length} chars)`);
    console.log('  URI:', JSON.stringify(tokenUri), `(${tokenUri.length} chars)`);
    console.log('  Payer:', creatorPubkey.toBase58());

    // Initialize Meteora client
    const client = DynamicBondingCurveClient.create(connection, 'confirmed');

    // Dev buy was already calculated above during fee verification
    const devBuyLamports = Math.floor(devBuyAmount * LAMPORTS_PER_SOL);
    const devBuyPercent = (devBuyAmount / MAX_DEV_BUY_SOL) * MAX_DEV_BUY_PERCENT;

    let createPoolTx;

    // Create pool with SHIPYARD as both payer and creator
    // This ensures all launches appear from Shipyard on explorers
    console.log('Creating pool with Shipyard as payer/creator...');

    // If dev buy enabled, Shipyard will create pool + do the dev buy + transfer tokens to user
    // This keeps Shipyard as the creator and prevents frontrunning
    if (devBuyAmount > 0) {
      console.log('Using createPoolWithFirstBuy - Shipyard buys, then transfers to user...');

      try {
        const result = await client.pool.createPoolWithFirstBuy({
          createPoolParam: {
            name: tokenName,
            symbol: tokenSymbol,
            uri: tokenUri,
            payer: SHIPYARD_WALLET,         // Shipyard pays for everything
            poolCreator: SHIPYARD_WALLET,   // Shipyard is the creator
            config: engineConfig,
            baseMint: baseMint,
          },
          firstBuyParam: {
            buyer: SHIPYARD_WALLET,         // Shipyard does the dev buy
            buyAmount: new BN(devBuyLamports),
            minimumAmountOut: new BN(0),    // Accept any amount
            referralTokenAccount: null,     // No referral
          },
        });

        createPoolTx = result.createPoolTx;

        // If there's a swap tx, combine the instructions
        if (result.swapBuyTx) {
          for (const ix of result.swapBuyTx.instructions) {
            createPoolTx.add(ix);
          }
          console.log('Combined pool creation + dev buy into single transaction');
        }
      } catch (poolError) {
        console.error('createPoolWithFirstBuy error:', poolError);
        throw poolError;
      }
    } else {
      // No dev buy - just create the pool
      try {
        createPoolTx = await client.pool.createPool({
          name: tokenName,
          symbol: tokenSymbol,
          uri: tokenUri,
          payer: SHIPYARD_WALLET,
          poolCreator: SHIPYARD_WALLET,
          config: engineConfig,
          baseMint: baseMint,
        });
        console.log('Pool transaction created successfully!');
      } catch (poolError) {
        console.error('createPool error:', poolError);
        throw poolError;
      }
    }

    // Get blockhash for transactions
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    // Shipyard is always the fee payer
    createPoolTx.recentBlockhash = blockhash;
    createPoolTx.lastValidBlockHeight = lastValidBlockHeight;
    createPoolTx.feePayer = SHIPYARD_WALLET;
    createPoolTx.partialSign(baseMintKeypair);
    createPoolTx.partialSign(SHIPYARD_KEYPAIR);

    // Send transaction from Shipyard
    console.log('Sending pool creation transaction from Shipyard...');
    const poolSignature = await connection.sendRawTransaction(createPoolTx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    console.log('Pool tx sent:', poolSignature);

    // Wait for confirmation
    await connection.confirmTransaction(poolSignature, 'confirmed');
    console.log('Pool created successfully!');

    // If dev buy was done, we need to transfer tokens from Shipyard to the user
    let tokenTransferSignature = null;
    if (devBuyAmount > 0) {
      console.log('Transferring purchased tokens to user...');

      // Wait a bit for token accounts to be created
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        const { getAssociatedTokenAddress, createTransferInstruction, getAccount } = await import('@solana/spl-token');
        const { Transaction: SolTransaction } = await import('@solana/web3.js');

        // Get Shipyard's token account
        const shipyardAta = await getAssociatedTokenAddress(baseMint, SHIPYARD_WALLET);
        const userAta = await getAssociatedTokenAddress(baseMint, creatorPubkey);

        // Check Shipyard's balance
        const shipyardAccount = await getAccount(connection, shipyardAta);
        const tokensToTransfer = shipyardAccount.amount;
        console.log('Tokens to transfer:', tokensToTransfer.toString());

        if (tokensToTransfer > 0n) {
          // Create transfer instruction
          const transferTx = new SolTransaction();

          // Create user's ATA if needed (using createAssociatedTokenAccountIdempotentInstruction)
          const { createAssociatedTokenAccountIdempotentInstruction } = await import('@solana/spl-token');
          transferTx.add(
            createAssociatedTokenAccountIdempotentInstruction(
              SHIPYARD_WALLET,
              userAta,
              creatorPubkey,
              baseMint
            )
          );

          // Transfer all tokens
          transferTx.add(
            createTransferInstruction(
              shipyardAta,
              userAta,
              SHIPYARD_WALLET,
              tokensToTransfer
            )
          );

          const { blockhash: transferBlockhash } = await connection.getLatestBlockhash();
          transferTx.recentBlockhash = transferBlockhash;
          transferTx.feePayer = SHIPYARD_WALLET;
          transferTx.sign(SHIPYARD_KEYPAIR);

          tokenTransferSignature = await connection.sendRawTransaction(transferTx.serialize());
          await connection.confirmTransaction(tokenTransferSignature, 'confirmed');
          console.log('Tokens transferred to user:', tokenTransferSignature);
        }
      } catch (transferError) {
        console.error('Token transfer failed:', transferError);
        // Pool is created, tokens just stayed with Shipyard - user can contact support
      }
    }

    // Build response
    const response: Record<string, unknown> = {
      success: true,
      poolCreated: true,
      poolSignature: poolSignature,

      // Pool details
      tokenMint: baseMint.toBase58(),
      poolAddress: poolAddress.toBase58(),
      configAddress: engineConfig.toBase58(),

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
        tokenTransferSignature: tokenTransferSignature,
      },

      // Vanity address info
      vanityInfo: {
        enabled: isVanity,
        suffix: isVanity ? 'SHIP' : null,
      },

      message: devBuyAmount > 0
        ? `${tokenSymbol} pool created with ${devBuyAmount} SOL dev buy!`
        : `${tokenSymbol} pool created by Shipyard!`,
    };

    // Include token transfer signature if dev buy was done
    if (tokenTransferSignature) {
      response.tokenTransferSignature = tokenTransferSignature;
    }

    console.log('Pool created by Shipyard:', poolSignature);
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
