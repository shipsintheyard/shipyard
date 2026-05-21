import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// ============================================================================
// Known DeFi token mints
// ============================================================================

const DEFI_MINTS: Record<string, { name: string; category: string }> = {
  // Liquid staking
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': { name: 'mSOL', category: 'staking' },
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': { name: 'jitoSOL', category: 'staking' },
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': { name: 'bSOL', category: 'staking' },
  'he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A': { name: 'hSOL', category: 'staking' },
  '7Q2afV64in6N6SeZsAAB81TJzwpeLmb4fCzSLcyyDAfB': { name: 'pathSOL', category: 'staking' },
  // Jupiter
  '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4': { name: 'JLP', category: 'perps' },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': { name: 'JUP', category: 'governance' },
  // Raydium
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': { name: 'RAY', category: 'governance' },
  // Orca
  'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE': { name: 'ORCA', category: 'governance' },
  // Marinade
  'MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey': { name: 'MNDE', category: 'governance' },
  // Drift
  'DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7': { name: 'DRIFT', category: 'governance' },
  // Tensor
  'TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6': { name: 'TNSR', category: 'governance' },
  // Sanctum
  'SANDsy53MmsG3wziVgYHotiVfdPzFRpEjn3eeFqsywR': { name: 'SAND', category: 'governance' },
  // Kamino
  'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS': { name: 'KMNO', category: 'governance' },
};

const STAKING_MINTS = new Set(
  Object.entries(DEFI_MINTS)
    .filter(([, v]) => v.category === 'staking')
    .map(([k]) => k)
);

// ============================================================================
// Pump.fun per-mint check — cached in-memory
// ============================================================================

const pfMintCache = new Map<string, { isPf: boolean; ts: number }>();
const PF_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours — a mint is PF or it isn't

async function isPumpfunMint(mint: string): Promise<boolean> {
  const cached = pfMintCache.get(mint);
  if (cached && Date.now() - cached.ts < PF_CACHE_TTL) return cached.isPf;

  try {
    const res = await fetch(`https://frontend-api-v2.pump.fun/coins/${mint}`, {
      headers: { 'Accept': 'application/json' },
    });
    const isPf = res.ok;
    pfMintCache.set(mint, { isPf, ts: Date.now() });
    return isPf;
  } catch {
    return false;
  }
}

// ============================================================================
// Token account type helpers
// ============================================================================

interface ParsedTokenInfo {
  mint: string;
  owner: string;
  tokenAmount: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
  };
}

function getTokenInfo(
  ta: { account: { data: unknown } }
): ParsedTokenInfo | null {
  const data = ta.account.data as {
    parsed?: { info?: ParsedTokenInfo };
  };
  return data?.parsed?.info ?? null;
}

// ============================================================================
// Route handler
// ============================================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(address);
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid Solana address' },
      { status: 400 }
    );
  }

  try {
    const connection = new Connection(RPC, 'confirmed');

    // 3 RPC calls in parallel
    const [signatures, tokenAccounts, balance] = await Promise.all([
      connection.getSignaturesForAddress(pubkey, { limit: 1000 }),
      connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
      connection.getBalance(pubkey),
    ]);

    // --- Signatures: paginate backward to find true wallet age + total count ---
    let allSigs = signatures;
    let totalTxns = signatures.length;
    const txnCountCapped = signatures.length >= 1000;
    const successfulTxns = signatures.filter(s => !s.err).length;

    // Get latest activity from first batch
    const recentTimes = signatures
      .map(s => s.blockTime)
      .filter((t): t is number => t !== null);
    const now = Date.now() / 1000;
    const lastActivityDays = recentTimes.length > 0
      ? Math.floor((now - Math.max(...recentTimes)) / 86400)
      : 999;

    // Paginate backward to find the earliest transaction (cap at 10 pages = 10k txns)
    let lastBatch = signatures;
    while (lastBatch.length >= 1000) {
      const oldestSig = lastBatch[lastBatch.length - 1].signature;
      lastBatch = await connection.getSignaturesForAddress(pubkey, {
        limit: 1000,
        before: oldestSig,
      });
      totalTxns += lastBatch.length;
      if (totalTxns > 10000) break; // safety cap
    }

    // Wallet age from the actual earliest transaction
    const earliestTimes = lastBatch.length > 0
      ? lastBatch.map(s => s.blockTime).filter((t): t is number => t !== null)
      : recentTimes;
    const earliestTimestamp = earliestTimes.length > 0 ? Math.min(...earliestTimes) : null;
    const walletAgeDays = earliestTimestamp
      ? Math.floor((now - earliestTimestamp) / 86400)
      : 0;
    const firstSeenDate = earliestTimestamp
      ? new Date(earliestTimestamp * 1000).toISOString()
      : null;

    // --- Token analysis ---
    let tokenCount = 0;
    let stakedSol = 0;
    let nftCount = 0;
    let deadTokens = 0;
    const defiTokens: string[] = [];
    const defiCategories = new Set<string>();
    const unknownMints: string[] = []; // mints to check against pump.fun

    for (const ta of tokenAccounts.value) {
      const info = getTokenInfo(ta);
      if (!info) continue;

      const amount = info.tokenAmount.uiAmount ?? 0;

      // Dead tokens: zero-balance accounts (rugged/dumped)
      if (amount <= 0) {
        deadTokens++;
        continue;
      }

      tokenCount++;

      // NFTs: decimals 0 and exactly 1 token
      if (info.tokenAmount.decimals === 0 && amount === 1) {
        nftCount++;
        continue; // NFTs aren't PF coins or DeFi
      }

      // Check DeFi tokens
      const defi = DEFI_MINTS[info.mint];
      if (defi) {
        defiTokens.push(defi.name);
        defiCategories.add(defi.category);
        if (STAKING_MINTS.has(info.mint)) {
          stakedSol += amount;
        }
      } else {
        // Not a known DeFi token — could be pump.fun
        unknownMints.push(info.mint);
      }
    }

    // Check unknown mints against pump.fun API in parallel
    const pfResults = await Promise.all(unknownMints.map(isPumpfunMint));
    const pumpfunCoins = pfResults.filter(Boolean).length;

    // --- SOL balance ---
    const solBalance = balance / 1e9;

    return NextResponse.json({
      success: true,
      data: {
        txnCount: totalTxns,
        txnCountCapped: totalTxns > 10000,
        successfulTxns,
        walletAgeDays,
        firstSeenDate,
        lastActivityDays,
        tokenCount,
        totalTokenAccounts: tokenAccounts.value.length,
        solBalance,
        pumpfunCoins,
        defiTokens,
        defiCategories: Array.from(defiCategories),
        stakedSol: Math.round(stakedSol * 100) / 100,
        nftCount,
        deadTokens,
      },
    }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'RPC error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
