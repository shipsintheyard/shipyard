// ============================================================================
// EVM Sailor Data Fetcher — Zerion + Hyperliquid → SailorChainData shape
// ============================================================================

import type { SailorChainData } from './sailor-xp';

const ZERION_BASE = 'https://api.zerion.io/v1/wallets';

function zerionHeaders(): Record<string, string> {
  const key = process.env.ZERION_API_KEY || '';
  return {
    Accept: 'application/json',
    Authorization: `Basic ${Buffer.from(key + ':').toString('base64')}`,
  };
}

// ============================================================================
// Zerion types (partial — only what we use)
// ============================================================================

interface ZerionPortfolio {
  attributes: {
    total: { positions: number };
    positions_distribution_by_chain: Record<string, number>;
  };
}

interface ZerionPosition {
  attributes: {
    position_type: string; // 'wallet' | 'deposit' | 'staked' | 'locked' | 'reward' etc.
    quantity: { float: number; decimals: number };
    value: number | null;
    fungible_info: {
      name: string;
      symbol: string;
      icon: { url: string } | null;
      implementations: { chain_id: string; address: string | null }[];
    };
    flags: { is_trash: boolean; displayable: boolean };
    name: string | null;  // protocol name
  };
  relationships?: {
    dapp?: { data: { id: string } | null };
  };
}

interface ZerionTransaction {
  attributes: {
    operation_type: string; // 'trade', 'send', 'receive', 'approve', 'deploy', 'execute', etc.
    mined_at: string;       // ISO timestamp
    transfers: {
      direction: 'in' | 'out';
      quantity: { float: number };
      value: number | null;
      fungible_info: { symbol: string; name: string } | null;
    }[];
  };
  relationships?: {
    dapp?: { data: { id: string } | null };
  };
}

interface ZerionNFTPosition {
  attributes: {
    amount: string;
  };
}

// ============================================================================
// Hyperliquid types
// ============================================================================

interface HLClearinghouse {
  marginSummary: { accountValue: string; totalMarginUsed: string };
  assetPositions: { position: { coin: string; szi: string; unrealizedPnl: string; returnOnEquity: string } }[];
}

interface HLFill {
  coin: string;
  px: string;
  sz: string;
  side: 'B' | 'A';
  closedPnl: string;
  time: number;
}

// ============================================================================
// Fetchers
// ============================================================================

async function fetchZerionPortfolio(addr: string): Promise<ZerionPortfolio | null> {
  try {
    const res = await fetch(`${ZERION_BASE}/${addr}/portfolio`, { headers: zerionHeaders() });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch { return null; }
}

async function fetchZerionPositions(addr: string): Promise<ZerionPosition[]> {
  try {
    const res = await fetch(
      `${ZERION_BASE}/${addr}/positions/?filter[positions]=no_filter&currency=usd&page[size]=100`,
      { headers: zerionHeaders() },
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch { return []; }
}

async function fetchZerionTrades(addr: string): Promise<{ data: ZerionTransaction[]; totalCount: number }> {
  try {
    const res = await fetch(
      `${ZERION_BASE}/${addr}/transactions/?filter[operation_types]=trade&currency=usd&page[size]=100`,
      { headers: zerionHeaders() },
    );
    if (!res.ok) return { data: [], totalCount: 0 };
    const json = await res.json();
    return { data: json.data ?? [], totalCount: json.data?.length ?? 0 };
  } catch { return { data: [], totalCount: 0 }; }
}

async function fetchZerionAllTxns(addr: string): Promise<{ data: ZerionTransaction[]; totalCount: number }> {
  try {
    const res = await fetch(
      `${ZERION_BASE}/${addr}/transactions/?currency=usd&page[size]=100`,
      { headers: zerionHeaders() },
    );
    if (!res.ok) return { data: [], totalCount: 0 };
    const json = await res.json();
    // Zerion includes total count in pagination links — parse from response
    const total = json.links?.next ? 100 + (json.data?.length ?? 0) : json.data?.length ?? 0;
    return { data: json.data ?? [], totalCount: total };
  } catch { return { data: [], totalCount: 0 }; }
}

async function fetchZerionNFTs(addr: string): Promise<ZerionNFTPosition[]> {
  try {
    const res = await fetch(
      `${ZERION_BASE}/${addr}/nft-positions/?page[size]=100`,
      { headers: zerionHeaders() },
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch { return []; }
}

async function fetchHLState(addr: string): Promise<HLClearinghouse | null> {
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: addr }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function fetchHLFills(addr: string): Promise<HLFill[]> {
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'userFills', user: addr }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

// ============================================================================
// EVM-specific display data (beyond SailorChainData)
// ============================================================================

export interface EVMDisplayData {
  ethBalance: number;
  totalPortfolioUsd: number;
  chainDistribution: Record<string, number>;
  topPositions: { name: string; symbol: string; value: number; protocol: string | null }[];
  defiProtocols: string[];
  hyperliquidPnl: number | null;
  hyperliquidVolume: number | null;
  ensName: string | null;
}

// ============================================================================
// Main fetcher — returns SailorChainData + EVM display fields
// ============================================================================

export async function fetchEVMSailorData(address: string): Promise<{
  chainData: SailorChainData;
  evmDisplay: EVMDisplayData;
}> {
  // All 7 requests in parallel
  const [portfolio, positions, tradesResult, allTxnsResult, nfts, hlState, hlFills] = await Promise.all([
    fetchZerionPortfolio(address),
    fetchZerionPositions(address),
    fetchZerionTrades(address),
    fetchZerionAllTxns(address),
    fetchZerionNFTs(address),
    fetchHLState(address),
    fetchHLFills(address),
  ]);

  const trades = tradesResult.data;
  const allTxns = allTxnsResult.data;

  // ---- Token analysis from positions ----
  let ethBalance = 0;
  let tokenCount = 0;
  let memecoins = 0;
  let deadTokens = 0;
  let stakedValue = 0;
  const positionTypes = new Set<string>();
  const defiProtocolSet = new Set<string>();
  const topPositionsList: { name: string; symbol: string; value: number; protocol: string | null }[] = [];

  for (const p of positions) {
    const attr = p.attributes;
    const value = attr.value ?? 0;
    const symbol = attr.fungible_info?.symbol ?? '';
    const name = attr.fungible_info?.name ?? '';
    const posType = attr.position_type;

    positionTypes.add(posType);

    // Protocol tracking
    const dappId = p.relationships?.dapp?.data?.id;
    if (dappId) defiProtocolSet.add(dappId);

    // ETH balance
    if (symbol === 'ETH' && posType === 'wallet') {
      ethBalance += attr.quantity.float;
    }

    // Staked ETH (stETH, rETH, cbETH, etc.)
    if (posType === 'staked' || ['stETH', 'rETH', 'cbETH', 'wstETH', 'swETH', 'frxETH', 'sfrxETH', 'mETH', 'ETHx'].includes(symbol)) {
      stakedValue += value;
    }

    // Count tokens
    if (posType === 'wallet') {
      if (attr.flags.is_trash) {
        deadTokens++;
      } else if (value > 0) {
        tokenCount++;
        // Memecoin heuristic: no DeFi protocol, not ETH/stables
        if (!dappId && !['ETH', 'WETH', 'USDC', 'USDT', 'DAI', 'USDS'].includes(symbol)) {
          memecoins++;
        }
      }
    }

    // Top positions (for display)
    if (value > 0) {
      topPositionsList.push({ name, symbol, value, protocol: dappId ?? null });
    }
  }

  topPositionsList.sort((a, b) => b.value - a.value);

  // ---- Trade analysis ----
  const dappNames = new Set<string>();
  const tokenBuys: Record<string, number> = {};
  let tradeVolumeUsd = 0;
  let deployCount = 0;

  for (const tx of trades) {
    const attr = tx.attributes;
    const dappId = tx.relationships?.dapp?.data?.id;
    if (dappId) dappNames.add(dappId);

    // Volume = sum of outgoing transfer values
    for (const t of attr.transfers) {
      if (t.value && t.value > 0) {
        tradeVolumeUsd += t.value;
      }
      // Track tokens received
      if (t.direction === 'in' && t.fungible_info?.symbol) {
        const sym = t.fungible_info.symbol;
        if (!['ETH', 'WETH', 'USDC', 'USDT', 'DAI'].includes(sym)) {
          tokenBuys[sym] = (tokenBuys[sym] || 0) + 1;
        }
      }
    }
  }

  // All txn analysis — dapp diversity + wallet age + deploy count
  const allDapps = new Set<string>();
  const activeDays = new Set<string>();
  let earliestTxn: string | null = null;

  for (const tx of allTxns) {
    const attr = tx.attributes;
    const dappId = tx.relationships?.dapp?.data?.id;
    if (dappId) allDapps.add(dappId);

    // Activity days
    if (attr.mined_at) {
      const day = attr.mined_at.slice(0, 10);
      activeDays.add(day);
      if (!earliestTxn || attr.mined_at < earliestTxn) {
        earliestTxn = attr.mined_at;
      }
    }

    // Deploy count
    if (attr.operation_type === 'deploy') deployCount++;
  }

  // Wallet age
  let walletAgeDays = 0;
  if (earliestTxn) {
    const diff = Date.now() - new Date(earliestTxn).getTime();
    walletAgeDays = Math.floor(diff / 86400000);
  }

  // Fav token
  let favTokenBuys = 0;
  let favTokenSymbol = '';
  for (const [sym, count] of Object.entries(tokenBuys)) {
    if (count > favTokenBuys) { favTokenBuys = count; favTokenSymbol = sym; }
  }

  // ---- Hyperliquid PnL ----
  let pnlRealized: number | null = null;
  let pnlWinRate: number | null = null;
  let pnlWins = 0;
  let pnlLosses = 0;
  let hlPnl: number | null = null;
  let hlVolume: number | null = null;

  if (hlFills.length > 0) {
    let totalPnl = 0;
    let totalVol = 0;
    for (const fill of hlFills) {
      const closed = parseFloat(fill.closedPnl);
      if (closed > 0) { pnlWins++; totalPnl += closed; }
      else if (closed < 0) { pnlLosses++; totalPnl += closed; }
      totalVol += parseFloat(fill.px) * parseFloat(fill.sz);
    }
    pnlRealized = Math.round(totalPnl * 100) / 100;
    hlPnl = pnlRealized;
    hlVolume = Math.round(totalVol * 100) / 100;
    const totalTrades = pnlWins + pnlLosses;
    if (totalTrades > 0) {
      pnlWinRate = Math.round((pnlWins / totalTrades) * 10000) / 100;
    }
  }

  // Account value from HL
  let pnlTotalInvested: number | null = null;
  if (hlState) {
    const accVal = parseFloat(hlState.marginSummary.accountValue);
    const margin = parseFloat(hlState.marginSummary.totalMarginUsed);
    if (accVal > 0) pnlTotalInvested = Math.round(margin * 100) / 100;
  }

  // NFT count
  const nftCount = nfts.length;

  // Unique tokens traded from trades
  const uniqueTokensTraded = new Set<string>();
  for (const tx of trades) {
    for (const t of tx.attributes.transfers) {
      if (t.fungible_info?.symbol) uniqueTokensTraded.add(t.fungible_info.symbol);
    }
  }

  // DeFi categories mapping
  const defiCategories: string[] = [];
  if (stakedValue > 0 || positionTypes.has('staked')) defiCategories.push('staking');
  if (hlFills.length > 0) defiCategories.push('perps');
  if (positionTypes.has('deposit') || positionTypes.has('locked')) defiCategories.push('lending');
  if (defiProtocolSet.size > 0) defiCategories.push('governance');

  // ---- Portfolio data ----
  const totalPortfolioUsd = portfolio?.attributes?.total?.positions ?? 0;
  const chainDist = portfolio?.attributes?.positions_distribution_by_chain ?? {};

  // Convert trade volume from USD to ETH-equivalent for solVolume field
  // The scoring engine uses solVolume as a log-scale measure — 1000 SOL ≈ $200K
  // Map so that $200K trade volume ≈ 1000 "SOL units"
  const solVolumeEquiv = tradeVolumeUsd / 200;

  // ---- Build SailorChainData ----
  const chainData: SailorChainData = {
    txnCount: allTxnsResult.totalCount,
    tokenCount,
    memecoins,
    deadTokens,
    favTokenBuys,
    pfCoinsCreated: deployCount,
    pfCoinsGraduated: 0,       // N/A for EVM
    pfKothCount: 0,             // N/A for EVM
    solBalance: ethBalance,     // maps to ETH
    stakedSol: stakedValue / 2000, // rough ETH equiv for scoring (stake USD / ~ETH price placeholder)
    solVolume: solVolumeEquiv,
    pnlRealized,
    pnlWinRate,
    pnlWins,
    pnlLosses,
    pnlTotalInvested,
    pnlTokensTraded: uniqueTokensTraded.size,
    dexCount: dappNames.size,
    uniqueDapps: allDapps.size,
    defiCategories,
    walletAgeDays,
    uniqueActiveDays: activeDays.size,
    nftCount,
    totalTrades: tradesResult.totalCount,
  };

  const evmDisplay: EVMDisplayData = {
    ethBalance: Math.round(ethBalance * 10000) / 10000,
    totalPortfolioUsd: Math.round(totalPortfolioUsd * 100) / 100,
    chainDistribution: chainDist,
    topPositions: topPositionsList.slice(0, 5),
    defiProtocols: [...defiProtocolSet],
    hyperliquidPnl: hlPnl,
    hyperliquidVolume: hlVolume,
    ensName: null, // Could be resolved via Zerion if available
  };

  return { chainData, evmDisplay };
}
