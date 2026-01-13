import { Connection, PublicKey, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import BN from 'bn.js';
import {
  DynamicBondingCurveClient,
  buildCurveWithMarketCap,
  ActivationType,
  CollectFeeMode,
  BaseFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenDecimal,
  TokenType,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

export interface TokenConfig {
  name: string;
  symbol: string;
  description?: string;
  decimals?: number;
  imageUrl?: string;
}

export interface FeeConfig {
  lpPercent: number;  // Percentage to autocompound into LP
  burnPercent: number; // Percentage to burn
  devPercent?: number; // Percentage to creator as trading fees (optional)
}

export interface LaunchResult {
  tokenMint: PublicKey;
  poolAddress: PublicKey;
  configAddress: PublicKey;
  signature: string;
}

// ============================================================
// SHIPYARD PUMP.FUN-STYLE BONDING CURVE CONFIGURATION
// ============================================================
// Matches pump.fun parameters:
// - Start MC: ~$4,950 (27.48 SOL at $180)
// - Graduation MC: ~$74,800 (415.49 SOL at $180)
// - SOL to fill: 85 SOL
// - Auto-migration to Meteora DAMM v2
// - 100% LP locked forever
// ============================================================

export const PUMPFUN_STYLE_CONFIG = {
  // Token supply (standard 1B)
  totalTokenSupply: 1_000_000_000,

  // Market cap parameters (USD) - based on SOL at ~$180
  initialMarketCap: 4950,     // ~27.48 SOL starting MC
  migrationMarketCap: 74800,  // ~415.49 SOL graduation MC

  // Migration destination
  migrationOption: MigrationOption.MET_DAMM_V2,

  // LP distribution - 100% locked forever
  partnerLockedLpPercentage: 100, // All LP locked by partner (Shipyard)
  partnerLpPercentage: 0,         // No unlocked partner LP
  creatorLockedLpPercentage: 0,   // No creator locked LP
  creatorLpPercentage: 0,         // No unlocked creator LP

  // Fee configuration
  tradingFeeBps: 100,             // 1% trading fee
  creatorTradingFeePercentage: 0, // No creator fee during bonding

  // Post-migration pool fee
  migratedPoolFeeBps: 100,        // 1% fee on graduated pool
} as const;

// Meteora DBC Program ID (Mainnet/Devnet)
const METEORA_DBC_PROGRAM_ID = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN');

/**
 * Derives the Meteora DBC pool address for a given token and config
 */
export function getPoolAddress(
  baseMint: PublicKey,
  quoteMint: PublicKey,
  config: PublicKey
): PublicKey {
  const [pool] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('pool'),
      baseMint.toBuffer(),
      quoteMint.toBuffer(),
      config.toBuffer()
    ],
    METEORA_DBC_PROGRAM_ID
  );
  return pool;
}

/**
 * Build curve configuration parameters using pump.fun style
 */
export function buildPumpfunStyleCurve(feeConfig: FeeConfig) {
  const curveParams = buildCurveWithMarketCap({
    // Supply and decimals
    totalTokenSupply: PUMPFUN_STYLE_CONFIG.totalTokenSupply,
    tokenBaseDecimal: TokenDecimal.NINE,
    tokenQuoteDecimal: TokenDecimal.NINE,

    // Market cap defines the curve shape
    initialMarketCap: PUMPFUN_STYLE_CONFIG.initialMarketCap,
    migrationMarketCap: PUMPFUN_STYLE_CONFIG.migrationMarketCap,

    // Migration to DAMM v2 when curve fills
    migrationOption: PUMPFUN_STYLE_CONFIG.migrationOption,

    // Fee configuration - 1% trading fee
    baseFeeParams: {
      baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
      feeSchedulerParam: {
        startingFeeBps: PUMPFUN_STYLE_CONFIG.tradingFeeBps,
        endingFeeBps: PUMPFUN_STYLE_CONFIG.tradingFeeBps,
        numberOfPeriod: 0,
        totalDuration: 0
      }
    },

    // LP distribution - 100% locked
    partnerLpPercentage: PUMPFUN_STYLE_CONFIG.partnerLpPercentage,
    creatorLpPercentage: PUMPFUN_STYLE_CONFIG.creatorLpPercentage,
    partnerLockedLpPercentage: PUMPFUN_STYLE_CONFIG.partnerLockedLpPercentage,
    creatorLockedLpPercentage: PUMPFUN_STYLE_CONFIG.creatorLockedLpPercentage,
    creatorTradingFeePercentage: feeConfig.devPercent || PUMPFUN_STYLE_CONFIG.creatorTradingFeePercentage,

    // Other settings
    dynamicFeeEnabled: false,
    activationType: ActivationType.Slot,
    collectFeeMode: CollectFeeMode.QuoteToken,
    migrationFeeOption: MigrationFeeOption.FixedBps100,
    tokenType: TokenType.SPL,
    tokenUpdateAuthority: 0, // Immutable

    // Leftover handling (0 = no leftover)
    leftover: 0,

    // Migration fee (0 = no fee to claim on migration)
    migrationFee: {
      feePercentage: 0,
      creatorFeePercentage: 0,
    },

    // Locked vesting (disabled)
    lockedVestingParam: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },

    // Post-migration pool fee
    migratedPoolFee: {
      collectFeeMode: CollectFeeMode.QuoteToken,
      dynamicFee: 0,
      poolFeeBps: PUMPFUN_STYLE_CONFIG.migratedPoolFeeBps,
    },
  });

  return curveParams;
}

/**
 * Full launch flow: Create config + token + pool in one transaction
 * This uses the newer SDK methods that combine config and pool creation
 */
export async function launchToken(
  connection: Connection,
  payer: Keypair,
  tokenConfig: TokenConfig,
  feeConfig: FeeConfig
): Promise<LaunchResult> {
  try {
    console.log('🚀 Starting token launch process...');
    console.log('Token config:', tokenConfig);
    console.log('Fee config:', feeConfig);

    // Initialize the DBC client
    const client = DynamicBondingCurveClient.create(connection, 'confirmed');

    // Generate keypairs for config and base mint
    const configKeypair = Keypair.generate();
    const baseMintKeypair = Keypair.generate();

    console.log('Config address:', configKeypair.publicKey.toBase58());
    console.log('Base mint:', baseMintKeypair.publicKey.toBase58());

    // Build the curve parameters
    const curveParams = buildPumpfunStyleCurve(feeConfig);
    console.log('Curve parameters built');

    // Create metadata URI (for now just use a placeholder, later we can use IPFS)
    const metadataUri = tokenConfig.imageUrl || '';

    // Use createConfigAndPool to create both in one transaction
    console.log('Creating config and pool...');

    const createTx = await client.pool.createConfigAndPool({
      // Config parameters (spread from curve params)
      ...curveParams,

      // Config accounts
      config: configKeypair.publicKey,
      feeClaimer: payer.publicKey,
      leftoverReceiver: payer.publicKey,
      quoteMint: NATIVE_MINT,
      payer: payer.publicKey,

      // Pool parameters
      preCreatePoolParam: {
        name: tokenConfig.name,
        symbol: tokenConfig.symbol,
        uri: metadataUri,
        poolCreator: payer.publicKey,
        baseMint: baseMintKeypair.publicKey,
      }
    });

    // Derive the pool address
    const poolAddress = getPoolAddress(
      baseMintKeypair.publicKey,
      NATIVE_MINT,
      configKeypair.publicKey
    );

    console.log('Sending transaction...');

    // Sign and send the transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      createTx,
      [payer, configKeypair, baseMintKeypair],
      { commitment: 'confirmed' }
    );

    console.log('✅ Launch successful!');
    console.log('Token mint:', baseMintKeypair.publicKey.toBase58());
    console.log('Pool address:', poolAddress.toBase58());
    console.log('Config address:', configKeypair.publicKey.toBase58());
    console.log('Signature:', signature);

    return {
      tokenMint: baseMintKeypair.publicKey,
      poolAddress,
      configAddress: configKeypair.publicKey,
      signature
    };
  } catch (error) {
    console.error('❌ Launch error:', error);
    throw error;
  }
}

/**
 * Launch token with a dev buy (creator first buy)
 * This allows the creator to buy tokens at launch
 */
export async function launchTokenWithDevBuy(
  connection: Connection,
  payer: Keypair,
  tokenConfig: TokenConfig,
  feeConfig: FeeConfig,
  devBuyAmountLamports: BN
): Promise<LaunchResult> {
  try {
    console.log('🚀 Starting token launch with dev buy...');
    console.log('Token config:', tokenConfig);
    console.log('Fee config:', feeConfig);
    console.log('Dev buy amount:', devBuyAmountLamports.toString(), 'lamports');

    // Initialize the DBC client
    const client = DynamicBondingCurveClient.create(connection, 'confirmed');

    // Generate keypairs for config and base mint
    const configKeypair = Keypair.generate();
    const baseMintKeypair = Keypair.generate();

    console.log('Config address:', configKeypair.publicKey.toBase58());
    console.log('Base mint:', baseMintKeypair.publicKey.toBase58());

    // Build the curve parameters
    const curveParams = buildPumpfunStyleCurve(feeConfig);

    // Create metadata URI
    const metadataUri = tokenConfig.imageUrl || '';

    // Use createConfigAndPoolWithFirstBuy if we have a dev buy
    console.log('Creating config, pool, and executing first buy...');

    const { createConfigTx, createPoolTx, swapBuyTx } = await client.pool.createConfigAndPoolWithFirstBuy({
      // Config parameters
      ...curveParams,

      // Config accounts
      config: configKeypair.publicKey,
      feeClaimer: payer.publicKey,
      leftoverReceiver: payer.publicKey,
      quoteMint: NATIVE_MINT,
      payer: payer.publicKey,

      // Pool parameters
      preCreatePoolParam: {
        name: tokenConfig.name,
        symbol: tokenConfig.symbol,
        uri: metadataUri,
        poolCreator: payer.publicKey,
        baseMint: baseMintKeypair.publicKey,
      },

      // First buy parameters (dev buy)
      firstBuyParam: {
        buyer: payer.publicKey,
        buyAmount: devBuyAmountLamports,
        minimumAmountOut: new BN(0), // No slippage protection for simplicity
        referralTokenAccount: null,
      }
    });

    // Derive the pool address
    const poolAddress = getPoolAddress(
      baseMintKeypair.publicKey,
      NATIVE_MINT,
      configKeypair.publicKey
    );

    console.log('Sending config transaction...');
    const configSig = await sendAndConfirmTransaction(
      connection,
      createConfigTx,
      [payer, configKeypair],
      { commitment: 'confirmed' }
    );
    console.log('Config created:', configSig);

    console.log('Sending pool transaction...');
    const poolSig = await sendAndConfirmTransaction(
      connection,
      createPoolTx,
      [payer, baseMintKeypair],
      { commitment: 'confirmed' }
    );
    console.log('Pool created:', poolSig);

    let finalSig = poolSig;

    if (swapBuyTx) {
      console.log('Sending dev buy transaction...');
      finalSig = await sendAndConfirmTransaction(
        connection,
        swapBuyTx,
        [payer],
        { commitment: 'confirmed' }
      );
      console.log('Dev buy executed:', finalSig);
    }

    console.log('✅ Launch with dev buy successful!');
    console.log('Token mint:', baseMintKeypair.publicKey.toBase58());
    console.log('Pool address:', poolAddress.toBase58());

    return {
      tokenMint: baseMintKeypair.publicKey,
      poolAddress,
      configAddress: configKeypair.publicKey,
      signature: finalSig
    };
  } catch (error) {
    console.error('❌ Launch error:', error);
    throw error;
  }
}

/**
 * Buy tokens from a bonding curve pool
 * swapBaseForQuote: false = buying tokens (SOL → Token)
 */
export async function buyTokens(
  connection: Connection,
  payer: Keypair,
  poolAddress: PublicKey,
  amountLamports: BN,
  minAmountOut: BN = new BN(0)
): Promise<string> {
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');

  const swapTx = await client.pool.swap({
    owner: payer.publicKey,
    pool: poolAddress,
    amountIn: amountLamports,
    minimumAmountOut: minAmountOut,
    swapBaseForQuote: false, // false = buying tokens (quote → base)
    referralTokenAccount: null,
  });

  const signature = await sendAndConfirmTransaction(
    connection,
    swapTx,
    [payer],
    { commitment: 'confirmed' }
  );

  return signature;
}

/**
 * Sell tokens back to the bonding curve pool
 * swapBaseForQuote: true = selling tokens (Token → SOL)
 */
export async function sellTokens(
  connection: Connection,
  payer: Keypair,
  poolAddress: PublicKey,
  tokenAmount: BN,
  minSolOut: BN = new BN(0)
): Promise<string> {
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');

  const swapTx = await client.pool.swap({
    owner: payer.publicKey,
    pool: poolAddress,
    amountIn: tokenAmount,
    minimumAmountOut: minSolOut,
    swapBaseForQuote: true, // true = selling tokens (base → quote)
    referralTokenAccount: null,
  });

  const signature = await sendAndConfirmTransaction(
    connection,
    swapTx,
    [payer],
    { commitment: 'confirmed' }
  );

  return signature;
}

/**
 * Get pool state from on-chain
 */
export async function getPoolState(
  connection: Connection,
  poolAddress: PublicKey
) {
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');
  return await client.state.getPool(poolAddress);
}

/**
 * Check if a pool has migrated
 */
export async function isPoolMigrated(
  connection: Connection,
  poolAddress: PublicKey
): Promise<boolean> {
  try {
    const poolState = await getPoolState(connection, poolAddress);
    // isMigrated is a number (0 = not migrated, 1 = migrated)
    return poolState?.isMigrated === 1;
  } catch {
    return false;
  }
}
