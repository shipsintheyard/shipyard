import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createBurnInstruction } from '@solana/spl-token';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import BN from 'bn.js';

// ============================================================
// SHIPYARD FEE FLYWHEEL
// ============================================================
// Implements the buyback + burn mechanism for DBC pools
//
// Flow:
// 1. Fees accrue in the Meteora DBC pool (trading fees)
// 2. This keeper claims accumulated fees via Meteora SDK
// 3. Fees are split: X% → LP compound, Y% → buyback + burn
// 4. Buyback uses Jupiter aggregator for best execution
// 5. Bought tokens are burned forever
// ============================================================

export interface FlywheelConfig {
  poolAddress: PublicKey;           // Meteora DBC pool address
  tokenMint: PublicKey;             // Token to buyback
  quoteMint: PublicKey;             // SOL/USDC (quote token from fees)
  lpCompoundPercent: number;        // % of fees to add to LP (0-100)
  buybackBurnPercent: number;       // % of fees to buyback + burn (0-100)
  keeperAuthority: PublicKey;       // Who can trigger the flywheel
  minFeeThreshold: number;          // Minimum fees before triggering (in lamports)
}

export interface FlywheelStats {
  totalFeesCollected: number;       // Total SOL collected
  totalBurned: number;              // Total tokens burned
  totalCompounded: number;          // Total SOL compounded to LP
  lastExecution: Date | null;       // Last flywheel run
  executionCount: number;           // Number of times executed
}

// Jupiter aggregator API endpoint
const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

// Native SOL mint
const NATIVE_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

/**
 * Get a Jupiter swap quote for buyback
 */
export async function getJupiterQuote(
  inputMint: PublicKey,   // SOL
  outputMint: PublicKey,  // Token to buy
  amount: number,         // Amount in lamports
  slippageBps: number = 100 // 1% default slippage
): Promise<any> {
  const params = new URLSearchParams({
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
    amount: amount.toString(),
    slippageBps: slippageBps.toString(),
  });

  const response = await fetch(`${JUPITER_QUOTE_API}?${params}`);
  if (!response.ok) {
    throw new Error(`Jupiter quote failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Build a Jupiter swap transaction for buyback
 */
export async function buildJupiterSwap(
  quoteResponse: any,
  userPublicKey: PublicKey
): Promise<{ transaction: Transaction; expectedOutput: number }> {
  const response = await fetch(JUPITER_SWAP_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: userPublicKey.toBase58(),
      wrapAndUnwrapSol: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Jupiter swap failed: ${response.statusText}`);
  }

  const data = await response.json();
  const swapTransaction = Transaction.from(
    Buffer.from(data.swapTransaction, 'base64')
  );

  return {
    transaction: swapTransaction,
    expectedOutput: parseInt(quoteResponse.outAmount),
  };
}

/**
 * Burns tokens by sending them to the token's burn address
 */
export async function burnTokens(
  connection: Connection,
  payer: Keypair,
  tokenMint: PublicKey,
  amount: number
): Promise<string> {
  console.log(`Burning ${amount} tokens of ${tokenMint.toBase58()}`);

  // Get the payer's token account
  const payerTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    payer.publicKey
  );

  // Create burn instruction
  const burnIx = createBurnInstruction(
    payerTokenAccount,
    tokenMint,
    payer.publicKey,
    amount,
    [],
    TOKEN_PROGRAM_ID
  );

  const transaction = new Transaction().add(burnIx);

  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer],
    { commitment: 'confirmed' }
  );

  console.log(`Burned successfully! Signature: ${signature}`);
  return signature;
}

/**
 * Claim trading fees from a Meteora DBC pool
 */
export async function claimPoolFees(
  connection: Connection,
  keeper: Keypair,
  poolAddress: PublicKey,
  claimType: 'partner' | 'creator' = 'partner'
): Promise<{
  success: boolean;
  signature?: string;
  error?: string;
}> {
  try {
    const client = DynamicBondingCurveClient.create(connection, 'confirmed');

    // Get pool and config state
    const poolState = await client.state.getPool(poolAddress);
    const configState = await client.state.getPoolConfig(poolState.config);

    console.log('Claiming fees from pool:', poolAddress.toBase58());
    console.log('Fee claimer:', configState.feeClaimer?.toBase58());
    console.log('Creator:', poolState.creator?.toBase58());

    // Use max values to claim all available fees
    const maxBaseAmount = new BN('18446744073709551615'); // u64 max
    const maxQuoteAmount = new BN('18446744073709551615'); // u64 max

    let transaction: Transaction;

    if (claimType === 'creator' && poolState.creator) {
      transaction = await client.creator.claimCreatorTradingFee({
        creator: poolState.creator,
        payer: keeper.publicKey,
        pool: poolAddress,
        maxBaseAmount,
        maxQuoteAmount,
        receiver: keeper.publicKey,
      });
    } else if (configState.feeClaimer) {
      transaction = await client.partner.claimPartnerTradingFee({
        feeClaimer: configState.feeClaimer,
        payer: keeper.publicKey,
        pool: poolAddress,
        maxBaseAmount,
        maxQuoteAmount,
        receiver: keeper.publicKey,
      });
    } else {
      return { success: false, error: 'No fee claimer configured for pool' };
    }

    // Sign and send
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = keeper.publicKey;

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keeper],
      { commitment: 'confirmed' }
    );

    return { success: true, signature };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Execute the fee flywheel
 *
 * This is the main keeper function that:
 * 1. Claims fees from the Meteora DBC pool via SDK
 * 2. Splits fees according to config
 * 3. Executes buyback via Jupiter
 * 4. Burns purchased tokens
 */
export async function executeFlywheel(
  connection: Connection,
  keeper: Keypair,
  config: FlywheelConfig
): Promise<{
  feesCollected: number;
  tokensBought: number;
  tokensBurned: number;
  signature: string;
}> {
  console.log('=== SHIPYARD FEE FLYWHEEL ===');
  console.log('Pool:', config.poolAddress.toBase58());
  console.log('LP Compound:', config.lpCompoundPercent, '%');
  console.log('Buyback+Burn:', config.buybackBurnPercent, '%');

  // Step 1: Get keeper's SOL balance before claiming
  const balanceBefore = await connection.getBalance(keeper.publicKey);
  console.log(`Balance before: ${balanceBefore} lamports`);

  // Step 2: Claim fees from the DBC pool via Meteora SDK
  console.log('Claiming fees from pool via Meteora SDK...');
  const claimResult = await claimPoolFees(connection, keeper, config.poolAddress, 'partner');

  if (!claimResult.success) {
    console.log(`Fee claim failed: ${claimResult.error}`);
    // Continue anyway - there might be fees from previous claims
  } else {
    console.log(`Fee claim tx: ${claimResult.signature}`);
  }

  // Step 3: Check balance after claiming to determine fees collected
  const balanceAfter = await connection.getBalance(keeper.publicKey);
  const feesCollected = Math.max(0, balanceAfter - balanceBefore);
  console.log(`Balance after: ${balanceAfter} lamports`);
  console.log(`Fees collected: ${feesCollected} lamports`);

  if (feesCollected < config.minFeeThreshold) {
    console.log(`Fees (${feesCollected}) below threshold (${config.minFeeThreshold}). Skipping buyback.`);
    return {
      feesCollected,
      tokensBought: 0,
      tokensBurned: 0,
      signature: claimResult.signature || '',
    };
  }

  // Step 4: Calculate splits
  const buybackAmount = Math.floor(feesCollected * (config.buybackBurnPercent / 100));
  const compoundAmount = feesCollected - buybackAmount;

  console.log(`Buyback amount: ${buybackAmount} lamports`);
  console.log(`Compound amount: ${compoundAmount} lamports`);

  // Step 5: Execute buyback via Jupiter
  let tokensBought = 0;
  let burnSignature = '';

  if (buybackAmount > 0) {
    console.log('Getting Jupiter quote for buyback...');

    try {
      const quote = await getJupiterQuote(
        NATIVE_SOL_MINT,
        config.tokenMint,
        buybackAmount
      );

      console.log(`Expected tokens: ${quote.outAmount}`);

      const { transaction: swapTx, expectedOutput } = await buildJupiterSwap(
        quote,
        keeper.publicKey
      );

      // Execute the swap
      const swapSig = await sendAndConfirmTransaction(
        connection,
        swapTx,
        [keeper],
        { commitment: 'confirmed' }
      );

      console.log(`Buyback executed! Signature: ${swapSig}`);
      tokensBought = expectedOutput;

      // Step 6: Burn the purchased tokens
      console.log('Burning purchased tokens...');
      burnSignature = await burnTokens(
        connection,
        keeper,
        config.tokenMint,
        tokensBought
      );
    } catch (error) {
      console.error('Buyback/burn failed:', error);
    }
  }

  // Note: LP compounding would require additional Meteora SDK integration
  // for adding liquidity to the migrated DAMM pool

  console.log('=== FLYWHEEL COMPLETE ===');
  console.log(`Fees collected: ${feesCollected} lamports`);
  console.log(`Tokens bought: ${tokensBought}`);
  console.log(`Tokens burned: ${tokensBought}`);

  return {
    feesCollected,
    tokensBought,
    tokensBurned: tokensBought,
    signature: burnSignature,
  };
}

/**
 * Create a cron-compatible keeper function
 * Designed to be called by a serverless function or cron job
 */
export async function flywheelKeeper(
  connectionUrl: string,
  keeperPrivateKey: number[],
  configs: FlywheelConfig[]
): Promise<{ success: boolean; results: any[] }> {
  const connection = new Connection(connectionUrl, 'confirmed');
  const keeper = Keypair.fromSecretKey(new Uint8Array(keeperPrivateKey));

  console.log('Starting flywheel keeper run...');
  console.log(`Processing ${configs.length} pools`);

  const results = [];

  for (const config of configs) {
    try {
      const result = await executeFlywheel(connection, keeper, config);
      results.push({ pool: config.poolAddress.toBase58(), ...result });
    } catch (error) {
      console.error(`Failed for pool ${config.poolAddress.toBase58()}:`, error);
      results.push({
        pool: config.poolAddress.toBase58(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return { success: true, results };
}

/**
 * Estimate the buyback impact
 * Useful for displaying to users before they launch
 */
export async function estimateBuybackImpact(
  dailyVolumeUsd: number,
  tradingFeeBps: number,
  buybackPercent: number,
  tokenPriceUsd: number
): Promise<{
  dailyFeesUsd: number;
  dailyBuybackUsd: number;
  dailyTokensBurned: number;
  annualTokensBurned: number;
  annualBurnPercentOfSupply: number;
}> {
  const dailyFeesUsd = dailyVolumeUsd * (tradingFeeBps / 10000);
  const dailyBuybackUsd = dailyFeesUsd * (buybackPercent / 100);
  const dailyTokensBurned = dailyBuybackUsd / tokenPriceUsd;
  const annualTokensBurned = dailyTokensBurned * 365;

  // Assuming 1B supply
  const totalSupply = 1_000_000_000;
  const annualBurnPercentOfSupply = (annualTokensBurned / totalSupply) * 100;

  return {
    dailyFeesUsd,
    dailyBuybackUsd,
    dailyTokensBurned,
    annualTokensBurned,
    annualBurnPercentOfSupply,
  };
}
