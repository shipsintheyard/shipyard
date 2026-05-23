import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const DUNE_API_KEY = process.env.DUNE_API_KEY || '';

// ============================================================================
// Known token mints (DeFi, stablecoins, wrapped SOL)
// ============================================================================

const KNOWN_MINTS: Record<string, { name: string; category: string }> = {
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { name: 'USDC', category: 'stablecoin' },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { name: 'USDT', category: 'stablecoin' },
  'USDSwr9ApdHk5bvJKMjXLj5YqAk76DpFXo8H5x4B1QV': { name: 'USDS', category: 'stablecoin' },
  'So11111111111111111111111111111111111111112': { name: 'wSOL', category: 'wrapped' },
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': { name: 'mSOL', category: 'staking' },
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': { name: 'jitoSOL', category: 'staking' },
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': { name: 'bSOL', category: 'staking' },
  'he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A': { name: 'hSOL', category: 'staking' },
  '7Q2afV64in6N6SeZsAAB81TJzwpeLmb4fCzSLcyyDAfB': { name: 'pathSOL', category: 'staking' },
  '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4': { name: 'JLP', category: 'perps' },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': { name: 'JUP', category: 'governance' },
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': { name: 'RAY', category: 'governance' },
  'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE': { name: 'ORCA', category: 'governance' },
  'MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey': { name: 'MNDE', category: 'governance' },
  'DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7': { name: 'DRIFT', category: 'governance' },
  'TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6': { name: 'TNSR', category: 'governance' },
  'SANDsy53MmsG3wziVgYHotiVfdPzFRpEjn3eeFqsywR': { name: 'SAND', category: 'governance' },
  'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS': { name: 'KMNO', category: 'governance' },
};

const STAKING_MINTS = new Set(
  Object.entries(KNOWN_MINTS)
    .filter(([, v]) => v.category === 'staking')
    .map(([k]) => k)
);

const DEFI_CATEGORIES = new Set(['staking', 'perps', 'governance']);

// ============================================================================
// Dune Analytics — single rich query
//
// One CTE query pulls everything: txn count, wallet age, active months,
// DEX protocols, total volume, biggest trade, favorite token.
// Returns execution ID to frontend for polling.
// ============================================================================

function buildDuneSQL(address: string): string {
  return `
WITH activity AS (
  SELECT
    COUNT(*) as total_txns,
    CAST(MIN(block_time) AS VARCHAR) as first_seen,
    COUNT(DISTINCT DATE_TRUNC('month', block_time)) as active_months
  FROM solana.account_activity
  WHERE address = '${address}'
),
dex_stats AS (
  SELECT
    COUNT(*) as total_trades,
    ROUND(COALESCE(SUM(amount_usd), 0), 2) as total_volume_usd,
    ROUND(COALESCE(MAX(amount_usd), 0), 2) as biggest_trade_usd
  FROM dex_solana.trades
  WHERE trader_id = '${address}'
),
dex_projects AS (
  SELECT project as label, COUNT(*) as num
  FROM dex_solana.trades
  WHERE trader_id = '${address}'
  GROUP BY project
  ORDER BY num DESC
  LIMIT 10
),
fav_token AS (
  SELECT token_bought_symbol as label, COUNT(*) as num
  FROM dex_solana.trades
  WHERE trader_id = '${address}'
    AND token_bought_symbol IS NOT NULL
    AND token_bought_symbol NOT IN ('SOL', 'WSOL', 'USDC', 'USDT')
  GROUP BY token_bought_symbol
  ORDER BY num DESC
  LIMIT 1
)

SELECT 'stats' as row_type,
  CAST(a.total_txns AS VARCHAR) as col1,
  a.first_seen as col2,
  CAST(a.active_months AS VARCHAR) as col3,
  CAST(d.total_trades AS VARCHAR) as col4,
  CAST(d.total_volume_usd AS VARCHAR) as col5,
  CAST(d.biggest_trade_usd AS VARCHAR) as col6
FROM activity a CROSS JOIN dex_stats d

UNION ALL

SELECT 'project', label, CAST(num AS VARCHAR), NULL, NULL, NULL, NULL
FROM dex_projects

UNION ALL

SELECT 'fav_token', label, CAST(num AS VARCHAR), NULL, NULL, NULL, NULL
FROM fav_token
`.trim();
}

async function fireDuneQuery(address: string): Promise<string | null> {
  if (!DUNE_API_KEY) return null;

  try {
    const res = await fetch('https://api.dune.com/api/v1/sql/execute', {
      method: 'POST',
      headers: {
        'X-Dune-Api-Key': DUNE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql: buildDuneSQL(address) }),
    });
    const json = await res.json();
    return json.execution_id ?? null;
  } catch {
    return null;
  }
}

// ============================================================================
// Token helpers
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

function getTokenInfo(ta: { account: { data: unknown } }): ParsedTokenInfo | null {
  const data = ta.account.data as { parsed?: { info?: ParsedTokenInfo } };
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

    // Fire single Dune query + RPC calls in parallel
    const [duneExecId, tokenAccounts, balance, signatures] = await Promise.all([
      fireDuneQuery(address),
      connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
      connection.getBalance(pubkey),
      connection.getSignaturesForAddress(pubkey, { limit: 1 }),
    ]);

    // --- Last activity ---
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

      if (amount <= 0) { deadTokens++; continue; }
      tokenCount++;
      if (info.tokenAmount.decimals === 0 && amount === 1) { nftCount++; continue; }

      const known = KNOWN_MINTS[info.mint];
      if (known) {
        if (DEFI_CATEGORIES.has(known.category)) {
          defiTokens.push(known.name);
          defiCategories.add(known.category);
        }
        if (STAKING_MINTS.has(info.mint)) stakedSol += amount;
      } else {
        memecoins++;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        lastActivityDays,
        tokenCount,
        totalTokenAccounts: tokenAccounts.value.length,
        solBalance: balance / 1e9,
        memecoins,
        defiTokens,
        defiCategories: Array.from(defiCategories),
        stakedSol: Math.round(stakedSol * 100) / 100,
        nftCount,
        deadTokens,
        // Single execution ID for frontend to poll
        duneExecId,
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
