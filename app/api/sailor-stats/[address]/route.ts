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
// Dune Analytics — eventually consistent pattern
//
// Dune free tier takes 30-60s to run queries. Vercel functions timeout at ~10s.
// Solution: fire queries, poll briefly (5s), cache execution IDs.
// - 1st request: submits Dune queries, returns RPC-only data
// - 2nd request: checks cached execution IDs, finds results ready, caches them
// - 3rd+ requests: served from result cache (10 min TTL)
// ============================================================================

interface DuneData {
  txnCount: number;
  firstSeenDate: string | null;
  dexProtocols: { project: string; trades: number }[];
}

// Cache: completed results (10 min TTL)
const duneResultCache = new Map<string, { data: DuneData; ts: number }>();
const RESULT_TTL = 10 * 60 * 1000;

// Cache: pending execution IDs (5 min TTL — enough for Dune to finish)
const dunePendingCache = new Map<string, { activityId: string; dexId: string; ts: number }>();
const PENDING_TTL = 5 * 60 * 1000;

function duneHeaders() {
  return {
    'X-Dune-Api-Key': DUNE_API_KEY,
    'Content-Type': 'application/json',
  };
}

async function getDuneData(address: string): Promise<DuneData | null> {
  if (!DUNE_API_KEY) return null;

  // 1. Check result cache
  const cached = duneResultCache.get(address);
  if (cached && Date.now() - cached.ts < RESULT_TTL) return cached.data;

  // 2. Check if we have pending execution IDs to poll
  const pending = dunePendingCache.get(address);
  if (pending && Date.now() - pending.ts < PENDING_TTL) {
    const data = await tryFetchDuneResults(pending.activityId, pending.dexId);
    if (data) {
      duneResultCache.set(address, { data, ts: Date.now() });
      dunePendingCache.delete(address);
      return data;
    }
    // Not ready yet — return null, next request will try again
    return null;
  }

  // 3. No cache, no pending — submit new queries
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

    // Save execution IDs for next request to pick up
    dunePendingCache.set(address, {
      activityId: activityExec.execution_id,
      dexId: dexExec.execution_id,
      ts: Date.now(),
    });

    // Brief poll — maybe Dune is fast today (cached on their end)
    const data = await tryFetchDuneResults(activityExec.execution_id, dexExec.execution_id);
    if (data) {
      duneResultCache.set(address, { data, ts: Date.now() });
      dunePendingCache.delete(address);
      return data;
    }
  } catch {
    // Dune failure shouldn't block the response
  }

  return null;
}

// Try to fetch results for both execution IDs. Returns null if either isn't done.
async function tryFetchDuneResults(activityId: string, dexId: string): Promise<DuneData | null> {
  try {
    const [activityRes, dexRes] = await Promise.all([
      fetch(`https://api.dune.com/api/v1/execution/${activityId}/results`, {
        headers: { 'X-Dune-Api-Key': DUNE_API_KEY },
      }).then(r => r.json()),
      fetch(`https://api.dune.com/api/v1/execution/${dexId}/results`, {
        headers: { 'X-Dune-Api-Key': DUNE_API_KEY },
      }).then(r => r.json()),
    ]);

    // Both must be finished
    if (!activityRes.is_execution_finished || !dexRes.is_execution_finished) return null;

    // Activity query
    const activityRow = activityRes.result?.rows?.[0] as Record<string, unknown> | undefined;
    if (!activityRow) return null;

    // DEX query (may have 0 rows if wallet never traded)
    const dexRows = (dexRes.result?.rows ?? []) as Record<string, unknown>[];

    return {
      txnCount: Number(activityRow.total_txns ?? 0),
      firstSeenDate: activityRow.first_seen
        ? new Date(String(activityRow.first_seen)).toISOString()
        : null,
      dexProtocols: dexRows.map(r => ({
        project: String(r.project ?? ''),
        trades: Number(r.trades ?? 0),
      })),
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

    // Dune (async, may return null on first request) + RPC in parallel
    const [dune, tokenAccounts, balance, signatures] = await Promise.all([
      getDuneData(address),
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

    // --- Dune data (or zeroes while loading) ---
    const txnCount = dune?.txnCount ?? 0;
    const firstSeenDate = dune?.firstSeenDate ?? null;
    const walletAgeDays = firstSeenDate
      ? Math.floor((now - new Date(firstSeenDate).getTime() / 1000) / 86400)
      : 0;
    const dexProtocols = dune?.dexProtocols ?? [];
    const dexCount = dexProtocols.length;
    const duneLoaded = dune !== null;

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
        txnCount,
        walletAgeDays,
        firstSeenDate,
        lastActivityDays,
        tokenCount,
        totalTokenAccounts: tokenAccounts.value.length,
        solBalance,
        memecoins,
        defiTokens,
        defiCategories: Array.from(defiCategories),
        dexProtocols,
        dexCount,
        stakedSol: Math.round(stakedSol * 100) / 100,
        nftCount,
        deadTokens,
        duneLoaded, // tells frontend if Dune data is ready
      },
    }, {
      // Short cache when Dune isn't ready yet so next request picks it up
      headers: { 'Cache-Control': `public, max-age=${duneLoaded ? 300 : 10}` },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'RPC error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
