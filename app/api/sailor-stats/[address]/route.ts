import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const DUNE_API_KEY = process.env.DUNE_API_KEY || '';

// ============================================================================
// Known token mints (DeFi, stablecoins, wrapped SOL)
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
// Dune Analytics — fire-and-forget
//
// Submits Dune queries and returns execution IDs to the frontend.
// Frontend polls /api/dune-poll with those IDs to get results.
// This avoids Vercel's 10s timeout entirely.
// ============================================================================

function duneHeaders() {
  return {
    'X-Dune-Api-Key': DUNE_API_KEY,
    'Content-Type': 'application/json',
  };
}

async function fireDuneQueries(address: string): Promise<{ activityId: string; dexId: string } | null> {
  if (!DUNE_API_KEY) return null;

  try {
    const [activityExec, dexExec] = await Promise.all([
      fetch('https://api.dune.com/api/v1/sql/execute', {
        method: 'POST',
        headers: duneHeaders(),
        body: JSON.stringify({
          sql: `SELECT COUNT(*) as total_txns, MIN(block_time) as first_seen FROM solana.account_activity WHERE address = '${address}'`,
        }),
      }).then(r => r.json()),
      fetch('https://api.dune.com/api/v1/sql/execute', {
        method: 'POST',
        headers: duneHeaders(),
        body: JSON.stringify({
          sql: `SELECT project, COUNT(*) as trades FROM dex_solana.trades WHERE trader_id = '${address}' GROUP BY project ORDER BY trades DESC LIMIT 10`,
        }),
      }).then(r => r.json()),
    ]);

    if (!activityExec.execution_id || !dexExec.execution_id) return null;

    return {
      activityId: activityExec.execution_id,
      dexId: dexExec.execution_id,
    };
  } catch {
    return null;
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

    // Fire Dune queries (returns execution IDs, doesn't wait for results)
    // Run in parallel with RPC calls
    const [duneExecIds, tokenAccounts, balance, signatures] = await Promise.all([
      fireDuneQueries(address),
      connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
      connection.getBalance(pubkey),
      connection.getSignaturesForAddress(pubkey, { limit: 1 }),
    ]);

    // --- Last activity from most recent signature ---
    const now = Date.now() / 1000;
    const lastSigTime = signatures[0]?.blockTime;
    const lastActivityDays = lastSigTime
      ? Math.floor((now - lastSigTime) / 86400)
      : 999;

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

      if (amount <= 0) {
        deadTokens++;
        continue;
      }

      tokenCount++;

      if (info.tokenAmount.decimals === 0 && amount === 1) {
        nftCount++;
        continue;
      }

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
        memecoins++;
      }
    }

    const solBalance = balance / 1e9;

    return NextResponse.json({
      success: true,
      data: {
        // Dune data will come from polling — zeroes for now
        txnCount: 0,
        walletAgeDays: 0,
        firstSeenDate: null,
        dexProtocols: [],
        dexCount: 0,
        // RPC data (instant)
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
        // Execution IDs for frontend to poll
        duneExecIds,
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
