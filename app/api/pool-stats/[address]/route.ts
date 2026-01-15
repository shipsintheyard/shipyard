import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';

// ============================================================
// POOL STATS API - Get live on-chain pool data
// ============================================================
// GET /api/pool-stats/[poolAddress]?tokenMint=xxx
// Returns SOL balance, token balance, and calculated stats
// ============================================================

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const DBC_PROGRAM_ID = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN');

// Total supply and curve constants
const TOTAL_SUPPLY = 1_000_000_000; // 1 billion tokens
const CURVE_TOKENS = 800_000_000; // 80% sold through curve
const MIGRATION_THRESHOLD = 85; // SOL needed to migrate

export async function GET(request: NextRequest) {
  try {
    // Extract pool address from URL path
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const poolAddress = pathParts[pathParts.length - 1];
    const tokenMint = url.searchParams.get('tokenMint');

    if (!poolAddress || !tokenMint) {
      return NextResponse.json(
        { success: false, error: 'poolAddress and tokenMint are required' },
        { status: 400 }
      );
    }

    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const poolPubkey = new PublicKey(poolAddress);
    const tokenMintPubkey = new PublicKey(tokenMint);

    // Read the pool account data to find vault addresses
    const poolAccount = await connection.getAccountInfo(poolPubkey);

    if (!poolAccount) {
      return NextResponse.json(
        { success: false, error: 'Pool account not found' },
        { status: 404 }
      );
    }

    // Parse the pool data to extract vault addresses
    // Meteora DBC pool layout has vaults at specific offsets
    // Based on typical Meteora layouts, let's scan for valid pubkeys
    const data = poolAccount.data;

    let solBalance = 0;
    let tokenBalance = 0;
    let baseVaultAddress = '';
    let quoteVaultAddress = '';

    // Method 1: Try to derive vault PDAs (Meteora DBC style)
    try {
      // DBC vaults are typically ATAs owned by the pool or derived PDAs
      const [baseVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), poolPubkey.toBuffer(), tokenMintPubkey.toBuffer()],
        DBC_PROGRAM_ID
      );
      const [quoteVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), poolPubkey.toBuffer(), WSOL_MINT.toBuffer()],
        DBC_PROGRAM_ID
      );

      // Try to read these vaults
      const baseVaultAccount = await connection.getAccountInfo(baseVault);
      const quoteVaultAccount = await connection.getAccountInfo(quoteVault);

      if (baseVaultAccount && quoteVaultAccount) {
        const baseTokenAccount = await getAccount(connection, baseVault);
        const quoteTokenAccount = await getAccount(connection, quoteVault);

        // Token has 6 decimals, so raw amount / 1e6 = actual token count
        // e.g., 818M tokens with 6 decimals = 818,000,000,000,000 raw / 1e6 = 818,000,000 tokens
        tokenBalance = Number(baseTokenAccount.amount) / 1e6;
        solBalance = Number(quoteTokenAccount.amount) / 1e9;  // SOL has 9 decimals

        baseVaultAddress = baseVault.toBase58();
        quoteVaultAddress = quoteVault.toBase58();
      }
    } catch {
      // PDA vault derivation failed, will try alternate method
    }

    // Method 2: Scan pool data for pubkey patterns if PDAs didn't work
    if (solBalance === 0 && tokenBalance === 0) {
      // Look for pubkeys in the pool data (32-byte sequences that are valid pubkeys)
      const pubkeys: PublicKey[] = [];

      for (let i = 0; i <= data.length - 32; i += 8) {
        try {
          const slice = data.slice(i, i + 32);
          const pubkey = new PublicKey(slice);
          const pubkeyStr = pubkey.toBase58();

          // Filter out obvious non-addresses
          if (!pubkeyStr.startsWith('1111') && pubkeyStr.length === 44) {
            pubkeys.push(pubkey);
          }
        } catch {
          // Not a valid pubkey, continue
        }
      }

      // Check each pubkey to see if it's a token account
      for (const pubkey of pubkeys.slice(0, 20)) { // Check first 20 to limit RPC calls
        try {
          const account = await connection.getAccountInfo(pubkey);
          if (account && account.data.length === 165) { // Token account size
            const tokenAccount = await getAccount(connection, pubkey);
            const mint = tokenAccount.mint.toBase58();

            if (mint === tokenMint) {
              tokenBalance = Number(tokenAccount.amount) / 1e6;
              baseVaultAddress = pubkey.toBase58();
            } else if (mint === WSOL_MINT.toBase58()) {
              solBalance = Number(tokenAccount.amount) / 1e9;
              quoteVaultAddress = pubkey.toBase58();
            }
          }
        } catch {
          // Not a token account or error reading
        }
      }
    }

    // Calculate derived stats
    const tokensInPool = tokenBalance;
    const tokensSold = TOTAL_SUPPLY - tokensInPool; // Use total supply, not curve tokens
    const percentSold = (tokensSold / TOTAL_SUPPLY) * 100;
    const percentRemaining = (tokensInPool / TOTAL_SUPPLY) * 100;

    // Progress through the curve (based on curve tokens sold, not total)
    const curveTokensSold = Math.max(0, CURVE_TOKENS - (tokensInPool - (TOTAL_SUPPLY - CURVE_TOKENS)));
    const curveProgress = Math.min(curveTokensSold / CURVE_TOKENS, 1);

    // Estimated SOL raised based on tokens sold (if we couldn't read SOL vault)
    // Using the inverse of our token calculation: tokens = CURVE_TOKENS * (sol/85)^0.65
    // sol = 85 * (tokens/CURVE_TOKENS)^(1/0.65)
    let estimatedSolRaised = solBalance;
    if (solBalance === 0 && tokensSold > 0) {
      const tokenProgress = tokensSold / CURVE_TOKENS;
      estimatedSolRaised = MIGRATION_THRESHOLD * Math.pow(tokenProgress, 1 / 0.65);
    }

    return NextResponse.json({
      success: true,
      pool: poolAddress,
      tokenMint,
      vaults: {
        base: baseVaultAddress || 'not found',
        quote: quoteVaultAddress || 'not found',
      },
      balances: {
        sol: solBalance,
        tokens: tokenBalance,
      },
      stats: {
        tokensSold,
        tokensRemaining: tokensInPool,
        percentSold,
        percentRemaining,
        curveProgress,
        solRaised: solBalance || estimatedSolRaised,
        solToMigration: Math.max(0, MIGRATION_THRESHOLD - (solBalance || estimatedSolRaised)),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
