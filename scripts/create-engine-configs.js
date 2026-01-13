/**
 * CREATE SHIPYARD ENGINE CONFIGS
 * Creates 3 configs for different fee split engines:
 * - Navigator: 80% LP, 20% Burn, 0% Dev
 * - Lighthouse: 50% LP, 0% Burn, 50% Dev
 * - Supernova: 25% LP, 75% Burn, 0% Dev
 */

const {
  PoolService,
  createDbcProgram,
  DYNAMIC_BONDING_CURVE_PROGRAM_ID,
  buildCurveWithMarketCap,
  ActivationType,
  CollectFeeMode,
  BaseFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenDecimal,
  TokenType,
  TokenUpdateAuthorityOption,
} = require('@meteora-ag/dynamic-bonding-curve-sdk');
const { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } = require('@solana/web3.js');
const { NATIVE_MINT } = require('@solana/spl-token');
const bs58 = require('bs58');
const fs = require('fs');

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const DEVNET_KEY = 'tHroq5X3iaSVQ6eYbtuCQeritmheWtkeiTs5vHYPJwzDNZ7r8gmTuYE7pqW48AhuMptWdQrPJKsKuEm6NnedRFT';
const keypair = Keypair.fromSecretKey(bs58.decode(DEVNET_KEY));
const program = createDbcProgram(connection, DYNAMIC_BONDING_CURVE_PROGRAM_ID);
const poolService = new PoolService(connection, program);

// Fee receiver wallet (same for all configs) - derived from keypair to avoid encoding issues
const FEE_RECEIVER = keypair.publicKey;

// Engine definitions - these control the fee splits
// Note: In Meteora DBC, trading fees can go to:
// - LP (stays in pool, raises floor)
// - Creator (dev wallet)
// - Burns happen through a different mechanism (migration fees or special burn setup)
const engines = {
  navigator: {
    name: 'NAVIGATOR',
    desc: '80% LP, 20% Burn, 0% Dev',
    // High LP reinvestment
    creatorTradingFeePercentage: 0,  // 0% to dev
    partnerLpPercentage: 80,         // 80% to LP
    // The remaining 20% would need burn mechanism
  },
  lighthouse: {
    name: 'LIGHTHOUSE',
    desc: '50% LP, 0% Burn, 50% Dev',
    creatorTradingFeePercentage: 50, // 50% to dev
    partnerLpPercentage: 50,         // 50% to LP
  },
  supernova: {
    name: 'SUPERNOVA',
    desc: '25% LP, 75% Burn, 0% Dev',
    creatorTradingFeePercentage: 0,  // 0% to dev
    partnerLpPercentage: 25,         // 25% to LP
    // 75% would need burn mechanism
  }
};

async function createEngineConfig(engineKey, engine) {
  console.log(`\n🔧 Creating ${engine.name} config...`);
  console.log(`   ${engine.desc}`);

  // Use same curve parameters as existing config
  const initialMC = 26.55 * 3.2; // ~85 SOL threshold
  const migrationMC = 401.4 * 3.2;

  const curveConfig = buildCurveWithMarketCap({
    totalTokenSupply: 1_000_000_000,
    migrationOption: MigrationOption.MET_DAMM_V2,
    tokenBaseDecimal: TokenDecimal.NINE,
    tokenQuoteDecimal: TokenDecimal.NINE,
    lockedVestingParam: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    baseFeeParams: {
      baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
      feeSchedulerParam: {
        startingFeeBps: 100,  // 1% trading fee
        endingFeeBps: 100,
        numberOfPeriod: 0,
        totalDuration: 0,
      },
    },
    dynamicFeeEnabled: false,
    activationType: ActivationType.Slot,
    collectFeeMode: CollectFeeMode.QuoteToken,
    migrationFeeOption: MigrationFeeOption.FixedBps100,
    tokenType: TokenType.SPL,
    // Fee split configuration
    partnerLpPercentage: engine.partnerLpPercentage,
    creatorLpPercentage: 0,
    partnerLockedLpPercentage: 100 - engine.partnerLpPercentage,
    creatorLockedLpPercentage: 0,
    creatorTradingFeePercentage: engine.creatorTradingFeePercentage,
    leftover: 0,
    tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,
    migrationFee: {
      feePercentage: 0,
      creatorFeePercentage: 0,
    },
    initialMarketCap: initialMC,
    migrationMarketCap: migrationMC,
  });

  const thresholdSol = Number(curveConfig.migrationQuoteThreshold) / LAMPORTS_PER_SOL;
  console.log(`   Migration threshold: ${thresholdSol.toFixed(2)} SOL`);

  const configKeypair = Keypair.generate();
  console.log(`   Config address: ${configKeypair.publicKey.toBase58()}`);

  try {
    const tx = await poolService.createConfigTx(
      {
        ...curveConfig,
        tokenDecimal: 9,
      },
      configKeypair.publicKey,
      keypair.publicKey,     // Config authority
      FEE_RECEIVER,          // Fee claimer - receives trading fees
      NATIVE_MINT,           // Quote token (SOL)
      keypair.publicKey      // Payer
    );

    tx.feePayer = keypair.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.sign(configKeypair, keypair);

    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
      preflightCommitment: 'confirmed'
    });

    console.log(`   Tx: ${sig}`);
    await connection.confirmTransaction(sig, 'confirmed');
    console.log(`   ✅ Created!`);

    return {
      engine: engineKey,
      name: engine.name,
      config: configKeypair.publicKey.toBase58(),
      signature: sig,
    };
  } catch (err) {
    console.error(`   ❌ Failed: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('🚢 CREATE SHIPYARD ENGINE CONFIGS');
  console.log('==================================');
  console.log('Wallet:', keypair.publicKey.toBase58());
  console.log('Fee Receiver:', FEE_RECEIVER.toBase58());

  const balance = await connection.getBalance(keypair.publicKey);
  console.log('Balance:', balance / LAMPORTS_PER_SOL, 'SOL');

  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.log('\n⚠️ Need at least 0.1 SOL to create configs');
    return;
  }

  const results = [];

  for (const [key, engine] of Object.entries(engines)) {
    const result = await createEngineConfig(key, engine);
    if (result) {
      results.push(result);
    }
    // Wait a bit between transactions
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n\n📋 RESULTS');
  console.log('===========');

  const configMap = {};
  for (const r of results) {
    console.log(`${r.name}: ${r.config}`);
    configMap[r.engine] = r.config;
  }

  // Save to a file for easy reference
  const output = {
    created: new Date().toISOString(),
    network: 'devnet',
    feeReceiver: FEE_RECEIVER.toBase58(),
    configs: configMap,
  };

  fs.writeFileSync('data/engine-configs.json', JSON.stringify(output, null, 2));
  console.log('\n✅ Saved to data/engine-configs.json');

  // Output the code to paste into the API
  console.log('\n\n📝 CODE TO ADD TO API:');
  console.log('========================');
  console.log(`const ENGINE_CONFIGS: Record<string, PublicKey> = {`);
  for (const [key, config] of Object.entries(configMap)) {
    console.log(`  ${key}: new PublicKey('${config}'),`);
  }
  console.log(`};`);
}

main().catch(console.error);
