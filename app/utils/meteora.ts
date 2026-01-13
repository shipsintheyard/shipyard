import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID, NATIVE_MINT } from '@solana/spl-token';
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
  TokenUpdateAuthorityOption
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
// Matches pump.fun parameters exactly:
// - Start MC: $3,770
// - Graduation MC: $57,000
// - SOL to fill: 85 SOL
// - Auto-migration to Meteora DAMM v2
// - 100% LP locked forever
// ============================================================

export const PUMPFUN_STYLE_CONFIG = {
  // Token supply (standard 1B)
  totalTokenSupply: 1_000_000_000,

  // Market cap parameters (USD)
  initialMarketCap: 3770,     // $3,770 starting MC
  migrationMarketCap: 57000,  // $57,000 graduation MC

  // SOL required to fill the bonding curve
  migrationQuoteThreshold: 85_000_000_000, // 85 SOL in lamports

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

// Calculate approximate curve points for pump.fun style
// This creates a curve that requires ~85 SOL to graduate
export function calculatePumpfunCurvePoints(solPrice: number = 142) {
  const startMC = 3770;
  const endMC = 57000;
  const solToFill = 85;

  // Calculate the implied token price at start and graduation
  const supply = 1_000_000_000;
  const startPrice = startMC / supply;  // ~$0.00000377 per token
  const endPrice = endMC / supply;      // ~$0.000057 per token

  // Price multiplier from start to graduation
  const priceMultiplier = endPrice / startPrice; // ~15.1x

  // Total USD raised at graduation
  const totalRaised = solToFill * solPrice; // $12,070

  return {
    startMarketCap: startMC,
    graduationMarketCap: endMC,
    startPriceUsd: startPrice,
    graduationPriceUsd: endPrice,
    priceMultiplier,
    solRequired: solToFill,
    totalRaisedUsd: totalRaised,
  };
}

// Meteora DBC Program ID (Mainnet/Devnet)
const METEORA_DBC_PROGRAM_ID = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN');

/**
 * Creates a new SPL token mint
 */
export async function createToken(
  connection: Connection,
  payer: Keypair,
  config: TokenConfig
): Promise<PublicKey> {
  const decimals = config.decimals || 9;

  console.log('Creating SPL token mint...');

  // Create the mint
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null, // no freeze authority for fairness
    decimals,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID
  );

  console.log('Token mint created:', mint.toBase58());

  return mint;
}

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
 * Creates a Meteora Dynamic Bonding Curve config
 * This defines the bonding curve parameters and fee splits
 *
 * PUMP.FUN STYLE CURVE:
 * - Start MC: $3,770
 * - Graduation MC: $57,000
 * - SOL to fill: 85 SOL
 * - 100% LP locked forever
 */
export async function createMeteoraConfig(
  connection: Connection,
  payer: Keypair,
  feeConfig: FeeConfig,
  totalSupply: number = 1_000_000_000,
  usePumpfunStyle: boolean = true
): Promise<PublicKey> {
  console.log('Creating Meteora DBC config with fee split:', feeConfig);
  console.log('Using pump.fun style curve:', usePumpfunStyle);

  // Initialize the DBC client
  const client = new DynamicBondingCurveClient(connection, 'confirmed');

  // Generate a new config keypair
  const configKeypair = Keypair.generate();

  // Market cap parameters - use pump.fun style or custom
  const initialMarketCap = usePumpfunStyle ? PUMPFUN_STYLE_CONFIG.initialMarketCap : 3000;
  const migrationMarketCap = usePumpfunStyle ? PUMPFUN_STYLE_CONFIG.migrationMarketCap : 69000;

  // LP allocation - 100% locked for pump.fun style
  const partnerLockedLpPercentage = usePumpfunStyle
    ? PUMPFUN_STYLE_CONFIG.partnerLockedLpPercentage
    : feeConfig.lpPercent;
  const creatorLockedLpPercentage = 0;

  console.log(`Curve parameters: $${initialMarketCap} → $${migrationMarketCap}`);
  console.log(`LP locked: ${partnerLockedLpPercentage}%`);

  // Build the curve configuration using market cap parameters
  const curveConfig = buildCurveWithMarketCap({
    totalTokenSupply: totalSupply,
    initialMarketCap: initialMarketCap,
    migrationMarketCap: migrationMarketCap,
    migrationOption: MigrationOption.MET_DAMM_V2,
    tokenBaseDecimal: TokenDecimal.NINE,
    tokenQuoteDecimal: TokenDecimal.NINE,

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

    // LP and fee distribution - 100% locked
    partnerLpPercentage: PUMPFUN_STYLE_CONFIG.partnerLpPercentage,
    creatorLpPercentage: PUMPFUN_STYLE_CONFIG.creatorLpPercentage,
    partnerLockedLpPercentage: partnerLockedLpPercentage,
    creatorLockedLpPercentage: creatorLockedLpPercentage,
    creatorTradingFeePercentage: feeConfig.devPercent || PUMPFUN_STYLE_CONFIG.creatorTradingFeePercentage,

    // Dynamic fee settings
    dynamicFeeEnabled: true,

    // Other settings
    activationType: ActivationType.Slot,
    collectFeeMode: CollectFeeMode.QuoteToken,
    migrationFeeOption: MigrationFeeOption.Customizable,
    migratedPoolFee: {
      poolFeeBps: PUMPFUN_STYLE_CONFIG.migratedPoolFeeBps,
      collectFeeMode: CollectFeeMode.QuoteToken,
      dynamicFee: 0,
    },
    tokenType: TokenType.SPL,
    tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,

    // Required fields
    lockedVestingParam: {
      vestingPeriod: 0,
      cliffPeriod: 0,
    },
    leftover: {
      leftoverRecipient: payer.publicKey,
      leftoverPercentage: 0,
    },
    migrationFee: {
      feeRecipient: payer.publicKey,
      feePercentage: 0,
    },
  } as any);

  console.log('Building config transaction...');

  // TODO: Complete Meteora SDK integration
  // The SDK API has changed and needs to be updated
  // Suppress unused variable warnings
  void client;
  void curveConfig;
  void configKeypair;

  throw new Error('Meteora integration is under development');

  // // Create the config on-chain
  // const createConfigTx = await client.createConfig(
  //   configKeypair.publicKey,
  //   curveConfig,
  //   payer.publicKey
  // );

  // console.log('Sending config creation transaction...');

  // const signature = await sendAndConfirmTransaction(
  //   connection,
  //   createConfigTx,
  //   [payer, configKeypair],
  //   { commitment: 'confirmed' }
  // );

  // console.log('Config created successfully!');
  // console.log('Config address:', configKeypair.publicKey.toBase58());
  // console.log('Transaction signature:', signature);

  // return configKeypair.publicKey;
}

/**
 * Creates a Meteora Dynamic Bonding Curve pool
 */
export async function createMeteoraPool(
  connection: Connection,
  payer: Keypair,
  baseMint: PublicKey,
  configAddress: PublicKey
): Promise<{ poolAddress: PublicKey; signature: string }> {
  console.log('Creating Meteora DBC pool...');
  console.log('Base mint:', baseMint.toBase58());
  console.log('Config:', configAddress.toBase58());

  // Initialize the DBC client
  const client = new DynamicBondingCurveClient(connection, 'confirmed');

  // Quote mint is SOL (Native mint)
  const quoteMint = NATIVE_MINT;

  // Derive the pool address
  const poolAddress = getPoolAddress(baseMint, quoteMint, configAddress);
  console.log('Pool address (derived):', poolAddress.toBase58());

  console.log('Building pool creation transaction...');

  // TODO: Complete Meteora SDK integration
  void client;
  void poolAddress;
  void quoteMint;
  void payer;
  void configAddress;

  throw new Error('Meteora integration is under development');

  // // Create the pool
  // const createPoolTx = await client.createPool(
  //   baseMint,
  //   quoteMint,
  //   configAddress,
  //   payer.publicKey
  // );

  // console.log('Sending pool creation transaction...');

  // const signature = await sendAndConfirmTransaction(
  //   connection,
  //   createPoolTx,
  //   [payer],
  //   { commitment: 'confirmed' }
  // );

  // console.log('Pool created successfully!');
  // console.log('Transaction signature:', signature);

  // return { poolAddress, signature };
}

/**
 * Full launch flow: Create config + Create token + Create pool
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

    // Step 1: Create the Meteora config
    console.log('\n⚙️ Step 1: Creating Meteora DBC config...');
    const configAddress = await createMeteoraConfig(connection, payer, feeConfig);
    console.log('✅ Config created:', configAddress.toBase58());

    // Step 2: Create the token
    console.log('\n📝 Step 2: Creating SPL token...');
    const tokenMint = await createToken(connection, payer, tokenConfig);
    console.log('✅ Token created:', tokenMint.toBase58());

    // Step 3: Create Meteora DBC pool
    console.log('\n🌊 Step 3: Creating Meteora DBC pool...');
    const { poolAddress, signature } = await createMeteoraPool(
      connection,
      payer,
      tokenMint,
      configAddress
    );
    console.log('✅ Pool created:', poolAddress.toBase58());

    console.log('\n🎉 Launch complete!');

    return {
      tokenMint,
      poolAddress,
      configAddress,
      signature
    };
  } catch (error) {
    console.error('❌ Launch error:', error);
    throw error;
  }
}

/**
 * Simplified launch that uses a pre-existing config
 * Useful if you've already created configs for your engines
 */
export async function launchTokenWithConfig(
  connection: Connection,
  payer: Keypair,
  tokenConfig: TokenConfig,
  configAddress: PublicKey
): Promise<LaunchResult> {
  try {
    console.log('🚀 Starting token launch with existing config...');
    console.log('Token config:', tokenConfig);
    console.log('Using config:', configAddress.toBase58());

    // Step 1: Create the token
    console.log('\n📝 Step 1: Creating SPL token...');
    const tokenMint = await createToken(connection, payer, tokenConfig);
    console.log('✅ Token created:', tokenMint.toBase58());

    // Step 2: Create Meteora DBC pool
    console.log('\n🌊 Step 2: Creating Meteora DBC pool...');
    const { poolAddress, signature } = await createMeteoraPool(
      connection,
      payer,
      tokenMint,
      configAddress
    );
    console.log('✅ Pool created:', poolAddress.toBase58());

    console.log('\n🎉 Launch complete!');

    return {
      tokenMint,
      poolAddress,
      configAddress,
      signature
    };
  } catch (error) {
    console.error('❌ Launch error:', error);
    throw error;
  }
}
