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
 */
export async function createMeteoraConfig(
  connection: Connection,
  payer: Keypair,
  feeConfig: FeeConfig,
  totalSupply: number = 1_000_000_000
): Promise<PublicKey> {
  console.log('Creating Meteora DBC config with fee split:', feeConfig);

  // Initialize the DBC client
  const client = new DynamicBondingCurveClient(connection, 'confirmed');

  // Generate a new config keypair
  const configKeypair = Keypair.generate();

  // Calculate LP percentages based on fee config
  // The LP percentages determine how much goes to liquidity vs gets burned
  // partnerLockedLpPercentage is the LP that gets locked (autocompounding)
  const partnerLockedLpPercentage = feeConfig.lpPercent;
  const creatorLockedLpPercentage = 0; // We use partner percentage for our LP

  // Build the curve configuration using market cap parameters
  // Pump.fun style: $3k start → $69k graduation
  const curveConfig = buildCurveWithMarketCap({
    totalTokenSupply: totalSupply,
    initialMarketCap: 3000, // Starting market cap: $3,000 (like pump.fun)
    migrationMarketCap: 69000, // Graduation at $69,000 market cap
    migrationOption: MigrationOption.MET_DAMM_V2,
    tokenBaseDecimal: TokenDecimal.NINE, // Token decimals (9 for SPL standard)
    tokenQuoteDecimal: TokenDecimal.NINE, // SOL decimals

    // Fee configuration
    baseFeeParams: {
      baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
      feeSchedulerParam: {
        startingFeeBps: 100, // 1% starting fee
        endingFeeBps: 100,   // 1% ending fee
        numberOfPeriod: 0,
        totalDuration: 0
      }
    },

    // LP and fee distribution
    partnerLpPercentage: 0,
    creatorLpPercentage: 0,
    partnerLockedLpPercentage: partnerLockedLpPercentage,
    creatorLockedLpPercentage: creatorLockedLpPercentage,
    creatorTradingFeePercentage: feeConfig.devPercent || 0, // Dev fee from trading

    // Dynamic fee settings
    dynamicFeeEnabled: true,

    // Other settings
    activationType: ActivationType.Slot,
    collectFeeMode: CollectFeeMode.QuoteToken,
    migrationFeeOption: MigrationFeeOption.Customizable,
    migratedPoolFee: {
      poolFeeBps: 100, // 1% base fee after migration (in basis points)
      collectFeeMode: CollectFeeMode.QuoteToken,
      dynamicFee: 0, // Static fee
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
