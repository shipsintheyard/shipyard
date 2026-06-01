import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { detectChain } from '../../../lib/chain-detect';
import { fetchEVMSailorData } from '../../../lib/evm-sailor';
import { computeDegenScore } from '../../../lib/sailor-xp';

const HELIUS_RPC = process.env.HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
  : null;
const RPC = HELIUS_RPC || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
// Solana Tracker — custom subdomain URL acts as auth (no separate API key needed)
const SOLTRACKER_URL = process.env.SOLANA_TRACKER_URL || '';

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
// Pump.fun API — free, no auth
// ============================================================================

const PF_HEADERS: Record<string, string> = {
  'Accept': 'application/json',
  'Origin': 'https://pump.fun',
  'Referer': 'https://pump.fun/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
};

interface PFCoin {
  mint: string;
  name: string;
  symbol: string;
  image_uri: string;
  creator: string;
  created_timestamp: number;
  complete: boolean;
  market_cap: number;       // SOL
  usd_market_cap: number;
  ath_market_cap: number;    // USD
  king_of_the_hill_timestamp: number | null;
  raydium_pool: string | null;
  pump_swap_pool: string | null;
  reply_count: number;
}

interface PFBalance {
  mint: string;
  balance: number;
  symbol: string;
  name: string;
  market_cap: number; // SOL
  value: number;      // SOL
}

async function fetchPFCoins(address: string): Promise<PFCoin[]> {
  try {
    const res = await fetch(
      `https://frontend-api-v3.pump.fun/coins?creator=${address}&limit=50&offset=0&sort=created_timestamp&order=DESC&includeNsfw=true`,
      { headers: PF_HEADERS },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function fetchPFBalances(address: string): Promise<PFBalance[]> {
  try {
    const res = await fetch(
      `https://frontend-api-v3.pump.fun/balances/${address}?offset=0&limit=50&minBalance=0`,
      { headers: PF_HEADERS },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function fetchTopPFCoins(): Promise<Map<string, { symbol: string; name: string; usdMarketCap: number }>> {
  try {
    // Fetch top graduated PF coins — same for every user, Next.js caches via fetch dedup
    const res = await fetch(
      'https://frontend-api-v3.pump.fun/coins?complete=true&limit=100&sort=usd_market_cap&order=DESC&includeNsfw=true',
      { headers: PF_HEADERS, next: { revalidate: 600 } },
    );
    if (!res.ok) return new Map();
    const data = await res.json();
    if (!Array.isArray(data)) return new Map();
    // Sort client-side in case API ignores sort param
    data.sort((a: PFCoin, b: PFCoin) => (b.usd_market_cap || 0) - (a.usd_market_cap || 0));
    const map = new Map<string, { symbol: string; name: string; usdMarketCap: number }>();
    for (const c of data.slice(0, 100)) {
      if (c.mint) {
        map.set(c.mint, { symbol: c.symbol, name: c.name, usdMarketCap: c.usd_market_cap || 0 });
      }
    }
    return map;
  } catch { return new Map(); }
}

function analyzePumpFun(coins: PFCoin[], balances: PFBalance[]) {
  const graduated = coins.filter(c => c.complete);
  const kothCoins = coins.filter(c => c.king_of_the_hill_timestamp != null);

  // Best coin by ATH market cap (USD)
  let bestCoin: { name: string; symbol: string; athUsd: number } | null = null;
  for (const c of coins) {
    if (!bestCoin || (c.ath_market_cap || 0) > bestCoin.athUsd) {
      bestCoin = { name: c.name, symbol: c.symbol, athUsd: c.ath_market_cap || 0 };
    }
  }

  // Holdings value (SOL)
  const totalHoldingsValue = balances.reduce((sum, b) => sum + (b.value || 0), 0);

  // Top holdings by value
  const topHoldings = [...balances]
    .sort((a, b) => (b.value || 0) - (a.value || 0))
    .slice(0, 5)
    .map(b => ({
      symbol: b.symbol,
      name: b.name,
      valueSol: Math.round((b.value || 0) * 1000) / 1000,
    }));

  return {
    pfCoinsCreated: coins.length,
    pfCoinsGraduated: graduated.length,
    pfGradRate: coins.length > 0 ? Math.round((graduated.length / coins.length) * 100) : 0,
    pfKothCount: kothCoins.length,
    pfBestCoin: bestCoin,
    pfHoldingsCount: balances.length,
    pfHoldingsValueSol: Math.round(totalHoldingsValue * 1000) / 1000,
    pfTopHoldings: topHoldings,
    pfCoins: coins.slice(0, 10).map(c => ({
      name: c.name,
      symbol: c.symbol,
      complete: c.complete,
      marketCapSol: Math.round((c.market_cap || 0) * 100) / 100,
      athUsd: Math.round((c.ath_market_cap || 0) * 100) / 100,
      koth: c.king_of_the_hill_timestamp != null,
      replies: c.reply_count || 0,
    })),
  };
}

// ============================================================================
// Solana Tracker — pre-computed PnL + win rate
// ============================================================================

interface SolTrackerPnL {
  realized: number;
  unrealized: number;
  total: number;
  totalInvested: number;
  totalWins: number;
  totalLosses: number;
  winPercentage: number;
  lossPercentage: number;
  averageBuyAmount: number;
}

interface SolTrackerToken {
  holding: number;
  realized: number;
  unrealized: number;
  total: number;            // realized + unrealized
  total_invested: number;
  current_value: number;
  cost_basis: number;
  buy_transactions: number;
  sell_transactions: number;
  total_transactions: number;
  first_buy_time: number;
  last_trade_time: number;
  [key: string]: unknown;   // API may include extra fields
}

async function fetchPnL(address: string): Promise<{
  summary: SolTrackerPnL | null;
  bestTrade: { token: string; pnl: number } | null;
  worstTrade: { token: string; pnl: number } | null;
  topTokens: { address: string; pnl: number; invested: number; roi: number }[];
  bottomTokens: { address: string; pnl: number; invested: number; roi: number }[];
  totalTokensTraded: number;
}> {
  if (!SOLTRACKER_URL) return { summary: null, bestTrade: null, worstTrade: null, topTokens: [], bottomTokens: [], totalTokensTraded: 0 };
  try {
    const res = await fetch(
      `${SOLTRACKER_URL}/pnl/${address}?holdingCheck=true`,
    );
    if (!res.ok) return { summary: null, bestTrade: null, worstTrade: null, topTokens: [], bottomTokens: [], totalTokensTraded: 0 };
    const data = await res.json();
    const summary: SolTrackerPnL | null = data.summary || null;
    const tokens: Record<string, SolTrackerToken> = data.tokens || {};

    // Only skip known cashback/reward token addresses (BONK).
    // Note: Solana Tracker's buy_transactions/total_invested fields are
    // inconsistent across requests, so we can't reliably filter by those.
    const PNL_SKIP = new Set([
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
      '4bXCaDUciWA5Qj1zmcZ9ryJsoqv4rahKD4r8zYYsbonk',  // BONK (vanity)
    ]);

    let bestTrade: { token: string; pnl: number } | null = null;
    let worstTrade: { token: string; pnl: number } | null = null;
    const tokenEntries: { address: string; pnl: number; invested: number; roi: number }[] = [];

    for (const [addr, t] of Object.entries(tokens)) {
      if (PNL_SKIP.has(addr)) continue;
      const pnl = t.total ?? (t.realized + t.unrealized);
      const invested = t.total_invested ?? 0;
      const roi = invested > 0 ? (pnl / invested) * 100 : 0;
      tokenEntries.push({ address: addr, pnl, invested, roi });
      if (!bestTrade || pnl > bestTrade.pnl) bestTrade = { token: addr, pnl };
      if (!worstTrade || pnl < worstTrade.pnl) worstTrade = { token: addr, pnl };
    }

    // Top 5 by PnL (best first) + bottom 3 (worst losses)
    tokenEntries.sort((a, b) => b.pnl - a.pnl);
    const topTokens = tokenEntries.slice(0, 5);
    const bottomTokens = tokenEntries.filter(t => t.pnl < 0).slice(-3).reverse();

    return { summary, bestTrade, worstTrade, topTokens, bottomTokens, totalTokensTraded: tokenEntries.length };
  } catch { return { summary: null, bestTrade: null, worstTrade: null, topTokens: [], bottomTokens: [], totalTokensTraded: 0 }; }
}

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

interface TokenMeta { symbol: string | null; image: string | null; name: string | null }

async function getTokenMeta(mint: string): Promise<TokenMeta> {
  const known = KNOWN_MINTS[mint];
  if (known) return { symbol: known.name, image: null, name: known.name };
  if (!HELIUS_API_KEY) return { symbol: null, image: null, name: null };

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
    const meta = json.result?.content?.metadata;
    const links = json.result?.content?.links;
    const files = json.result?.content?.files;
    return {
      symbol: meta?.symbol || null,
      name: meta?.name || null,
      image: links?.image || files?.[0]?.uri || null,
    };
  } catch { return { symbol: null, image: null, name: null }; }
}

async function getTokenSymbol(mint: string): Promise<string | null> {
  const meta = await getTokenMeta(mint);
  return meta.symbol;
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
  const chain = detectChain(address);

  if (!chain) {
    return NextResponse.json({ success: false, error: 'Invalid wallet address' }, { status: 400 });
  }

  // ---- EVM path ----
  if (chain === 'evm') {
    try {
      const { chainData, evmDisplay } = await fetchEVMSailorData(address);
      const score = computeDegenScore(chainData);
      return NextResponse.json({
        success: true,
        data: {
          chain: 'evm',
          // Core scoring data
          txnCount: chainData.txnCount,
          tokenCount: chainData.tokenCount,
          memecoins: chainData.memecoins,
          deadTokens: chainData.deadTokens,
          favTokenBuys: chainData.favTokenBuys,
          pfCoinsCreated: chainData.pfCoinsCreated,
          pfCoinsGraduated: 0,
          pfGradRate: 0,
          pfKothCount: 0,
          pfBestCoin: null,
          pfHoldingsCount: 0,
          pfHoldingsValueSol: 0,
          pfTopHoldings: [],
          pfCoins: [],
          pfCommunities: [],
          solBalance: chainData.solBalance,
          stakedSol: chainData.stakedSol,
          solVolume: chainData.solVolume,
          dexCount: chainData.dexCount,
          dexProtocols: evmDisplay.defiProtocols.map(p => ({ project: p, trades: 0 })),
          totalTrades: chainData.totalTrades,
          biggestTrade: 0,
          favToken: chainData.favTokenBuys > 0 ? null : null,
          uniqueDapps: chainData.uniqueDapps,
          uniqueDappsList: evmDisplay.defiProtocols,
          defiTokens: [],
          defiCategories: chainData.defiCategories,
          nftCount: chainData.nftCount,
          // Wallet age
          walletAgeDays: chainData.walletAgeDays,
          txnCountCapped: evmDisplay.etherscanTxnCapped,
          firstSeenDate: evmDisplay.firstTxDate ?? (chainData.walletAgeDays > 0
            ? new Date(Date.now() - chainData.walletAgeDays * 86400000).toISOString()
            : null),
          lastActivityDays: 0,
          activeMonths: evmDisplay.activeMonths,
          activeWeeks: 0,
          uniqueActiveDays: chainData.uniqueActiveDays,
          totalTokenAccounts: chainData.tokenCount,
          // PnL
          pnlRealized: chainData.pnlRealized,
          pnlUnrealized: null,
          pnlTotal: chainData.pnlRealized,
          pnlTotalInvested: chainData.pnlTotalInvested,
          pnlWinRate: chainData.pnlWinRate,
          pnlWins: chainData.pnlWins,
          pnlLosses: chainData.pnlLosses,
          pnlBestTrade: null,
          pnlWorstTrade: null,
          pnlTopTokens: [],
          pnlBottomTokens: [],
          pnlTokensTraded: chainData.pnlTokensTraded,
          // EVM-specific display
          evmDisplay,
        },
      }, {
        headers: { 'Cache-Control': 'public, max-age=300' },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'EVM data fetch error';
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  }

  // ---- Solana path ----
  let pubkey: PublicKey;
  try { pubkey = new PublicKey(address); }
  catch { return NextResponse.json({ success: false, error: 'Invalid Solana address' }, { status: 400 }); }

  try {
    const connection = new Connection(RPC, 'confirmed');

    // Phase 1: everything in parallel (RPC + Helius + Pump.fun + Solana Tracker)
    const [sigStats, tokenAccounts, balance, swaps, allTxns, pfCoins, pfBalances, topPFMints, pnlData] = await Promise.all([
      getSignatureStats(connection, pubkey),
      connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
      connection.getBalance(pubkey),
      fetchHelius(address, 'SWAP'),
      fetchHelius(address),
      fetchPFCoins(address),
      fetchPFBalances(address),
      fetchTopPFCoins(),
      fetchPnL(address),
    ]);

    // Analyze Helius data
    const swapStats = analyzeSwaps(swaps, address);
    const activity = analyzeActivity(allTxns);
    const pf = analyzePumpFun(pfCoins, pfBalances);

    // Resolve token metadata in parallel: fav token + top PnL tokens
    const metaPromises: Promise<TokenMeta>[] = [];
    const metaKeys: string[] = [];

    if (swapStats.favMint) { metaKeys.push(swapStats.favMint); metaPromises.push(getTokenMeta(swapStats.favMint)); }
    if (pnlData.bestTrade) { metaKeys.push(pnlData.bestTrade.token); metaPromises.push(getTokenMeta(pnlData.bestTrade.token)); }
    if (pnlData.worstTrade) { metaKeys.push(pnlData.worstTrade.token); metaPromises.push(getTokenMeta(pnlData.worstTrade.token)); }
    for (const t of pnlData.topTokens.slice(0, 3)) { metaKeys.push(t.address); metaPromises.push(getTokenMeta(t.address)); }
    for (const t of pnlData.bottomTokens.slice(0, 3)) {
      if (!metaKeys.includes(t.address)) { metaKeys.push(t.address); metaPromises.push(getTokenMeta(t.address)); }
    }

    const metaResults = await Promise.all(metaPromises);
    const metaMap = new Map<string, TokenMeta>();
    metaKeys.forEach((k, i) => metaMap.set(k, metaResults[i]));

    const favToken = swapStats.favMint ? metaMap.get(swapStats.favMint)?.symbol ?? null : null;

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

    // Cross-reference user's tokens with top PF coins → communities
    const pfCommunities: { symbol: string; name: string; usdMarketCap: number }[] = [];
    if (topPFMints.size > 0) {
      for (const ta of tokenAccounts.value) {
        const info = getTokenInfo(ta);
        if (!info) continue;
        const amount = info.tokenAmount.uiAmount ?? 0;
        if (amount <= 0) continue;
        const top = topPFMints.get(info.mint);
        if (top) pfCommunities.push(top);
      }
      pfCommunities.sort((a, b) => b.usdMarketCap - a.usdMarketCap);
    }

    return NextResponse.json({
      success: true,
      data: {
        chain: 'solana',
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
        // Pump.fun creator + holdings
        ...pf,
        // Top PF communities user belongs to
        pfCommunities,
        // PnL (Solana Tracker)
        pnlRealized: pnlData.summary?.realized ?? null,
        pnlUnrealized: pnlData.summary?.unrealized ?? null,
        pnlTotal: pnlData.summary?.total ?? null,
        pnlTotalInvested: pnlData.summary?.totalInvested ?? null,
        pnlWinRate: pnlData.summary?.winPercentage ?? null,
        pnlWins: pnlData.summary?.totalWins ?? 0,
        pnlLosses: pnlData.summary?.totalLosses ?? 0,
        pnlBestTrade: pnlData.bestTrade ? {
          ...pnlData.bestTrade,
          symbol: metaMap.get(pnlData.bestTrade.token)?.symbol ?? null,
          image: metaMap.get(pnlData.bestTrade.token)?.image ?? null,
        } : null,
        pnlWorstTrade: pnlData.worstTrade ? {
          ...pnlData.worstTrade,
          symbol: metaMap.get(pnlData.worstTrade.token)?.symbol ?? null,
          image: metaMap.get(pnlData.worstTrade.token)?.image ?? null,
        } : null,
        pnlTopTokens: pnlData.topTokens.slice(0, 3).map(t => ({
          ...t,
          symbol: metaMap.get(t.address)?.symbol ?? null,
          name: metaMap.get(t.address)?.name ?? null,
          image: metaMap.get(t.address)?.image ?? null,
        })),
        pnlBottomTokens: pnlData.bottomTokens.slice(0, 3).map(t => ({
          ...t,
          symbol: metaMap.get(t.address)?.symbol ?? null,
          name: metaMap.get(t.address)?.name ?? null,
          image: metaMap.get(t.address)?.image ?? null,
        })),
        pnlTokensTraded: pnlData.totalTokensTraded,
      },
    }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'RPC error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
