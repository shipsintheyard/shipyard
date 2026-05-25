import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const HELIUS_RPC = process.env.HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
  : null;
const RPC = HELIUS_RPC || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';

// ============================================================================
// Known token mints
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
  Object.entries(KNOWN_MINTS).filter(([, v]) => v.category === 'staking').map(([k]) => k)
);
const DEFI_CATEGORIES = new Set(['staking', 'perps', 'governance']);
const SKIP_MINTS = new Set([
  ...Object.entries(KNOWN_MINTS).filter(([, v]) => v.category === 'stablecoin' || v.category === 'wrapped').map(([k]) => k),
]);

// ============================================================================
// Helius types
// ============================================================================

interface HeliusTx {
  signature: string;
  type: string;
  source: string;
  timestamp: number;
  fee: number;
  tokenTransfers: { mint: string; tokenAmount: number; fromUserAccount: string; toUserAccount: string }[];
  nativeTransfers: { amount: number; fromUserAccount: string; toUserAccount: string }[];
  accountData: { account: string; nativeBalanceChange: number }[];
}

// ============================================================================
// Helius — fetch parsed transaction history
// ============================================================================

const HELIUS_BASE = 'https://api.helius.xyz/v0/addresses';

async function fetchHelius(address: string, type?: string): Promise<HeliusTx[]> {
  if (!HELIUS_API_KEY) return [];
  const typeParam = type ? `&type=${type}` : '';
  try {
    const res = await fetch(
      `${HELIUS_BASE}/${address}/transactions?api-key=${HELIUS_API_KEY}&limit=100${typeParam}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

// ============================================================================
// Helius — resolve token symbol via DAS
// ============================================================================

async function getTokenSymbol(mint: string): Promise<string | null> {
  const known = KNOWN_MINTS[mint];
  if (known) return known.name;
  if (!HELIUS_API_KEY) return null;

  try {
    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: '1',
        method: 'getAsset',
        params: { id: mint },
      }),
    });
    const json = await res.json();
    return json.result?.content?.metadata?.symbol || null;
  } catch { return null; }
}

// ============================================================================
// Analyze swap transactions
// ============================================================================

// Normalize Helius source names — merge variants (e.g. PUMP_AMM → Pump.fun)
const SOURCE_ALIASES: Record<string, string> = {
  PUMP_FUN: 'Pump.fun', PUMP_AMM: 'Pump.fun', PUMPSWAP: 'Pump.fun',
  RAYDIUM: 'Raydium', RAYDIUM_LAUNCHLAB: 'Raydium',
  JUPITER: 'Jupiter', JUPITERZ: 'Jupiter',
  ORCA: 'Orca', ORCA_WHIRLPOOLS: 'Orca',
  METEORA: 'Meteora',
  MAGIC_EDEN: 'Magic Eden', TENSOR: 'Tensor', MARINADE: 'Marinade',
  DRIFT: 'Drift', KAMINO: 'Kamino', SANCTUM: 'Sanctum',
  PHANTOM: 'Phantom', SOLFI: 'SolFi',
  SOLANA_PROGRAM_LIBRARY: 'SPL',
  ASSOCIATED_TOKEN_PROGRAM: 'SPL',
  TOKEN_PROGRAM: 'SPL',
  COMPUTE_BUDGET: 'SPL',
};

function prettifySource(s: string): string {
  return SOURCE_ALIASES[s] || s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
}

function analyzeSwaps(swaps: HeliusTx[], address: string) {
  const protocols: Record<string, number> = {};
  const tokenBuys: Record<string, number> = {};
  let totalVolumeLamports = 0;
  let biggestTradeLamports = 0;

  for (const swap of swaps) {
    const src = prettifySource(swap.source);
    protocols[src] = (protocols[src] || 0) + 1;

    // Volume = absolute SOL balance change per swap
    const userData = swap.accountData?.find(a => a.account === address);
    if (userData) {
      const abs = Math.abs(userData.nativeBalanceChange);
      totalVolumeLamports += abs;
      if (abs > biggestTradeLamports) biggestTradeLamports = abs;
    }

    // Track tokens bought (received by user)
    for (const tt of swap.tokenTransfers || []) {
      if (tt.toUserAccount === address && tt.mint && !SKIP_MINTS.has(tt.mint)) {
        tokenBuys[tt.mint] = (tokenBuys[tt.mint] || 0) + 1;
      }
    }
  }

  const dexProtocols = Object.entries(protocols)
    .sort(([, a], [, b]) => b - a)
    .map(([project, trades]) => ({ project, trades }));

  // Fav token = most bought (excluding stablecoins/wrapped SOL)
  let favMint: string | null = null;
  let favBuys = 0;
  for (const [mint, count] of Object.entries(tokenBuys)) {
    if (count > favBuys) { favBuys = count; favMint = mint; }
  }

  return {
    dexProtocols,
    dexCount: dexProtocols.length,
    totalTrades: swaps.length,
    solVolume: Math.round(totalVolumeLamports / 1e9 * 100) / 100,
    biggestTrade: Math.round(biggestTradeLamports / 1e9 * 100) / 100,
    favMint,
    favBuys,
  };
}

// ============================================================================
// Analyze all transactions for unique dapps + activity
// ============================================================================

function analyzeActivity(allTxns: HeliusTx[]) {
  const sources = new Set<string>();
  for (const tx of allTxns) {
    if (tx.source && tx.source !== 'SYSTEM_PROGRAM' && tx.source !== 'UNKNOWN') {
      sources.add(prettifySource(tx.source));
    }
  }
  // Remove generic "SPL" — not a real dapp
  sources.delete('SPL');
  return {
    uniqueDapps: sources.size,
    uniqueDappsList: [...sources],
  };
}

// ============================================================================
// RPC — paginate signatures for wallet age + txn count + active days
// ============================================================================

async function getSignatureStats(connection: Connection, pubkey: PublicKey) {
  const allSigs: { blockTime?: number | null | undefined; signature: string }[] = [];
  let before: string | undefined;

  // Use up to 25 pages (25,000 sigs) to find the true funding date.
  // With Helius RPC this typically takes 5-8s for active wallets.
  for (let page = 0; page < 25; page++) {
    const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 1000, before });
    if (sigs.length === 0) break;
    allSigs.push(...sigs);
    before = sigs[sigs.length - 1].signature;
    if (sigs.length < 1000) break;
  }

  if (allSigs.length === 0) {
    return { txnCount: 0, txnCountCapped: false, walletAgeDays: 0, firstSeenDate: null, lastActivityDays: 999, activeMonths: 0, uniqueActiveDays: 0, activeWeeks: 0 };
  }

  const now = Date.now() / 1000;
  const newest = allSigs[0].blockTime ?? now;
  const oldest = allSigs[allSigs.length - 1].blockTime ?? now;

  const days = new Set<string>();
  const weeks = new Set<string>();
  const months = new Set<string>();
  for (const sig of allSigs) {
    if (sig.blockTime) {
      const d = new Date(sig.blockTime * 1000);
      days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
      // ISO week number
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
      weeks.add(`${d.getFullYear()}-W${weekNum}`);
      months.add(`${d.getFullYear()}-${d.getMonth()}`);
    }
  }

  return {
    txnCount: allSigs.length,
    txnCountCapped: allSigs.length >= 25000,
    walletAgeDays: Math.floor((now - oldest) / 86400),
    firstSeenDate: new Date(oldest * 1000).toISOString(),
    lastActivityDays: Math.floor((now - newest) / 86400),
    activeMonths: months.size,
    activeWeeks: weeks.size,
    uniqueActiveDays: days.size,
  };
}

// ============================================================================
// Token helpers
// ============================================================================

interface ParsedTokenInfo {
  mint: string;
  owner: string;
  tokenAmount: { amount: string; decimals: number; uiAmount: number | null; uiAmountString: string };
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
  try { pubkey = new PublicKey(address); }
  catch { return NextResponse.json({ success: false, error: 'Invalid Solana address' }, { status: 400 }); }

  try {
    const connection = new Connection(RPC, 'confirmed');

    // Phase 1: everything in parallel
    const [sigStats, tokenAccounts, balance, swaps, allTxns] = await Promise.all([
      getSignatureStats(connection, pubkey),
      connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
      connection.getBalance(pubkey),
      fetchHelius(address, 'SWAP'),
      fetchHelius(address),
    ]);

    // Analyze Helius data
    const swapStats = analyzeSwaps(swaps, address);
    const activity = analyzeActivity(allTxns);

    // Resolve fav token symbol
    const favToken = swapStats.favMint
      ? await getTokenSymbol(swapStats.favMint)
      : null;

    // Token analysis from RPC
    let tokenCount = 0, memecoins = 0, stakedSol = 0, nftCount = 0, deadTokens = 0;
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
        if (DEFI_CATEGORIES.has(known.category)) { defiTokens.push(known.name); defiCategories.add(known.category); }
        if (STAKING_MINTS.has(info.mint)) stakedSol += amount;
      } else { memecoins++; }
    }

    return NextResponse.json({
      success: true,
      data: {
        // Signature stats (RPC)
        ...sigStats,
        // Token holdings (RPC)
        tokenCount,
        totalTokenAccounts: tokenAccounts.value.length,
        solBalance: balance / 1e9,
        memecoins,
        defiTokens,
        defiCategories: Array.from(defiCategories),
        stakedSol: Math.round(stakedSol * 100) / 100,
        nftCount,
        deadTokens,
        // DEX stats (Helius swaps)
        dexProtocols: swapStats.dexProtocols,
        dexCount: swapStats.dexCount,
        totalTrades: swapStats.totalTrades,
        solVolume: swapStats.solVolume,
        biggestTrade: swapStats.biggestTrade,
        favToken,
        favTokenBuys: swapStats.favBuys,
        // Dapp diversity (Helius all)
        uniqueDapps: activity.uniqueDapps,
        uniqueDappsList: activity.uniqueDappsList,
      },
    }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'RPC error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
