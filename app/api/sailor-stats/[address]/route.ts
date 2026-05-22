import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// ============================================================================
// Known DeFi token mints
// ============================================================================

const KNOWN_MINTS: Record<string, { name: string; category: string }> = {
  // Stablecoins
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { name: 'USDC', category: 'stablecoin' },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { name: 'USDT', category: 'stablecoin' },
  'USDSwr9ApdHk5bvJKMjXLj5YqAk76DpFXo8H5x4B1QV': { name: 'USDS', category: 'stablecoin' },
  // Wrapped SOL
  'So11111111111111111111111111111111111111112': { name: 'wSOL', category: 'wrapped' },
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
  Object.entries(KNOWN_MINTS)
    .filter(([, v]) => v.category === 'staking')
    .map(([k]) => k)
);

const DEFI_CATEGORIES = new Set(['staking', 'perps', 'governance']);

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

const MAX_PAGES = 20; // up to 20k txns

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

    // --- Recent activity from first batch ---
    const now = Date.now() / 1000;
    const recentTimes = signatures
      .map(s => s.blockTime)
      .filter((t): t is number => t !== null);
    const lastActivityDays = recentTimes.length > 0
      ? Math.floor((now - Math.max(...recentTimes)) / 86400)
      : 999;

    // --- Paginate backward to find first tx + total count ---
    let totalTxns = signatures.length;
    let lastBatch = signatures;
    let pages = 1;
    while (lastBatch.length >= 1000 && pages < MAX_PAGES) {
      const oldestSig = lastBatch[lastBatch.length - 1].signature;
      lastBatch = await connection.getSignaturesForAddress(pubkey, {
        limit: 1000,
        before: oldestSig,
      });
      totalTxns += lastBatch.length;
      pages++;
    }
    const txnCountCapped = pages >= MAX_PAGES;

    // First-seen date from the actual earliest batch
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
    let memecoins = 0;
    let stakedSol = 0;
    let nftCount = 0;
    let deadTokens = 0;
    const defiTokens: string[] = [];
    const defiCategories = new Set<string>();

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
        continue;
      }

      // Known tokens (DeFi, stablecoins, wrapped SOL)
      const known = KNOWN_MINTS[info.mint];
      if (known) {
        if (DEFI_CATEGORIES.has(known.category)) {
          defiTokens.push(known.name);
          defiCategories.add(known.category);
        }
        if (STAKING_MINTS.has(info.mint)) {
          stakedSol += amount;
        }
      } else {
        // Not a known token and not an NFT = memecoin
        memecoins++;
      }
    }

    // --- SOL balance ---
    const solBalance = balance / 1e9;

    return NextResponse.json({
      success: true,
      data: {
        txnCount: totalTxns,
        txnCountCapped,
        walletAgeDays,
        firstSeenDate,
        lastActivityDays,
        tokenCount,
        totalTokenAccounts: tokenAccounts.value.length,
        solBalance,
        memecoins,
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
