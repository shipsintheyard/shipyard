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

// fetchZerionAllTxns removed — Etherscan covers txn count, wallet age,
// active days, and deploy count more accurately (full history vs 100-txn window)

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

// ============================================================================
// Zerion PnL — per-token realized + unrealized PnL
// ============================================================================

interface ZerionPnLData {
  realized: number;
  unrealized: number;
  totalInvested: number;
  totalFee: number;
  tokens: {
    symbol: string;
    name: string;
    icon: string | null;
    realizedGain: number;
    unrealizedGain: number;
    totalInvested: number;
    avgBuyPrice: number;
    avgSellPrice: number;
    relativeRealized: number; // percentage
  }[];
}

async function fetchZerionPnL(addr: string): Promise<ZerionPnLData | null> {
  try {
    // Fetch aggregate PnL
    const res = await fetch(
      `${ZERION_BASE}/${addr}/pnl?currency=usd`,
      { headers: zerionHeaders(), redirect: 'follow' },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const attrs = json.data?.attributes;
    if (!attrs) return null;

    // Per-token breakdown: try positions_pnl, breakdown, or included
    const byId = attrs.positions_pnl ?? attrs.breakdown?.by_id ?? json.included ?? [];
    const tokens: ZerionPnLData['tokens'] = [];

    if (Array.isArray(byId)) {
      for (const entry of byId) {
        const a = entry.attributes ?? entry;
        if (!a) continue;
        tokens.push({
          symbol: a.fungible_info?.symbol ?? a.symbol ?? '???',
          name: a.fungible_info?.name ?? a.name ?? '',
          icon: a.fungible_info?.icon?.url ?? null,
          realizedGain: a.realized_gain ?? 0,
          unrealizedGain: a.unrealized_gain ?? 0,
          totalInvested: a.total_invested ?? 0,
          avgBuyPrice: a.average_buy_price ?? 0,
          avgSellPrice: a.average_sell_price ?? 0,
          relativeRealized: a.relative_realized_gain_percentage ?? 0,
        });
      }
    } else if (typeof byId === 'object') {
      // Handle { tokenId: { ... } } shape
      for (const entry of Object.values(byId)) {
        const a = (entry as Record<string, unknown>)?.attributes ?? entry;
        if (!a || typeof a !== 'object') continue;
        const e = a as Record<string, unknown>;
        const fi = e.fungible_info as Record<string, unknown> | undefined;
        tokens.push({
          symbol: (fi?.symbol as string) ?? (e.symbol as string) ?? '???',
          name: (fi?.name as string) ?? (e.name as string) ?? '',
          icon: ((fi?.icon as Record<string, string>)?.url) ?? null,
          realizedGain: (e.realized_gain as number) ?? 0,
          unrealizedGain: (e.unrealized_gain as number) ?? 0,
          totalInvested: (e.total_invested as number) ?? 0,
          avgBuyPrice: (e.average_buy_price as number) ?? 0,
          avgSellPrice: (e.average_sell_price as number) ?? 0,
          relativeRealized: (e.relative_realized_gain_percentage as number) ?? 0,
        });
      }
    }

    // Sort by realized gain descending
    tokens.sort((a, b) => b.realizedGain - a.realizedGain);

    return {
      realized: attrs.realized_gain ?? 0,
      unrealized: attrs.unrealized_gain ?? 0,
      totalInvested: attrs.net_invested ?? 0,
      totalFee: attrs.total_fee ?? 0,
      tokens,
    };
  } catch { return null; }
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
// Etherscan — gas burned, unique contracts, full wallet history
// ============================================================================

const ETHERSCAN_BASE = 'https://api.etherscan.io/v2/api';

interface EtherscanTx {
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  timeStamp: string;
}

async function fetchEtherscanTxns(addr: string): Promise<EtherscanTx[]> {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) return [];
  const allTxns: EtherscanTx[] = [];
  for (let page = 1; page <= 3; page++) {
    try {
      const res = await fetch(
        `${ETHERSCAN_BASE}?chainid=1&module=account&action=txlist&address=${addr}&startblock=0&endblock=99999999&page=${page}&offset=10000&sort=asc&apikey=${key}`,
      );
      const json = await res.json();
      if (json.status !== '1' || !Array.isArray(json.result)) break;
      allTxns.push(...json.result);
      if (json.result.length < 10000) break;
    } catch { break; }
  }
  return allTxns;
}

function analyzeEtherscanTxns(txns: EtherscanTx[], address: string) {
  let gasBurnedWei = BigInt(0);
  let volumeWei = BigInt(0);
  const contracts = new Set<string>();
  const months = new Set<string>();
  const days = new Set<string>();
  let firstTxDate: string | null = null;
  let deployCount = 0;
  const addrLower = address.toLowerCase();

  for (const tx of txns) {
    if (tx.from.toLowerCase() === addrLower) {
      gasBurnedWei += BigInt(tx.gasUsed) * BigInt(tx.gasPrice);
      if (tx.to) {
        contracts.add(tx.to.toLowerCase());
      } else {
        // Empty `to` = contract creation
        deployCount++;
      }
    }
    if (tx.value && tx.value !== '0') {
      volumeWei += BigInt(tx.value);
    }
    const ts = parseInt(tx.timeStamp);
    if (ts) {
      const d = new Date(ts * 1000);
      months.add(`${d.getFullYear()}-${d.getMonth()}`);
      days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
      if (!firstTxDate) firstTxDate = d.toISOString();
    }
  }

  const gasBurnedEth = Number(gasBurnedWei * BigInt(10000) / BigInt('1000000000000000000')) / 10000;
  const volumeEth = Number(volumeWei * BigInt(10000) / BigInt('1000000000000000000')) / 10000;

  return {
    gasBurnedEth,
    volumeEth,
    uniqueContracts: contracts.size,
    activeMonths: months.size,
    uniqueActiveDays: days.size,
    firstTxDate,
    txnCount: txns.length,
    txnCountCapped: txns.length >= 30000,
    deployCount,
  };
}

// ============================================================================
// Airdrop detection — known distributor contracts
// ============================================================================

const AIRDROP_CONTRACTS: Record<string, { name: string; symbol: string; date: string }> = {
  '0x090d4613473dee047c3f2706764f49e0821d256e': { name: 'Uniswap', symbol: 'UNI', date: '2020-09' },
  '0x1a9c8182c09f50c8318d769245bea52c32be35bc': { name: 'Uniswap V2', symbol: 'UNI', date: '2020-09' },
  '0xc18360217d8f7ab5e7c516566761ea12ce7f9d72': { name: 'ENS', symbol: 'ENS', date: '2021-11' },
  '0x67a24ce4321ab3af51c2d0a4801c3e111d88c9d9': { name: 'Arbitrum', symbol: 'ARB', date: '2023-03' },
  '0xfedfaf1a10335448b7fa0268f56d2b44dbd357de': { name: 'Optimism S1', symbol: 'OP', date: '2022-06' },
  '0xf98f268f9d3256b7aa2ce69c2189b7a48c8a92a1': { name: 'Optimism S2', symbol: 'OP', date: '2023-02' },
  '0xb2ecfe4e4d61f8790bbb9de2d1259b9e2410cea5': { name: 'Blur S1', symbol: 'BLUR', date: '2023-02' },
  '0xe295ad71242373c37c5fda7b57f26f9ea1088afe': { name: '1inch', symbol: '1INCH', date: '2020-12' },
  '0x639192d54431f8c816368d3fb4107bc168d0e871': { name: 'dYdX', symbol: 'DYDX', date: '2021-09' },
  '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8': { name: 'Binance', symbol: 'BNB', date: '2019' },
  '0xd216153c06e857cd7f72665e0af1d7d82172f494': { name: 'Shiba Inu', symbol: 'SHIB', date: '2021-05' },
  '0x902f09715b6303d4173037652fa7dab3068b3f68': { name: 'Aave', symbol: 'AAVE', date: '2020-10' },
  '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2': { name: 'SushiSwap', symbol: 'SUSHI', date: '2020-09' },
  '0x4da27a545c0c5b758a6ba100e3a049001de870f5': { name: 'Aave stkAAVE', symbol: 'stkAAVE', date: '2020-10' },
  '0x84d821f7fbdd595c4c4a50842913e6b1e07d7a53': { name: 'Paraswap', symbol: 'PSP', date: '2021-11' },
  '0x3ef51736315f52d568d6d2cf289419b9cfffe782': { name: 'CoW Protocol', symbol: 'COW', date: '2022-03' },
  '0x41d5d79431a913c4ae7d69a668ecdfe5ff9dfb68': { name: 'Lido', symbol: 'LDO', date: '2021-01' },
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': { name: 'Uniswap Token', symbol: 'UNI', date: '2020-09' },
  '0xc770eefad204b5180df6a14ee197d99d808ee52d': { name: 'Shapeshift', symbol: 'FOX', date: '2021-07' },
  '0xb9d4ad12d1c6cfe7d5475e7c40c5e8a7d89fc781': { name: 'Hop Protocol', symbol: 'HOP', date: '2022-06' },
  '0x5a2b6162bafe63e51b0e589b52543c8cc1be9617': { name: 'Hashflow', symbol: 'HFT', date: '2022-11' },
  '0xe5e2134e0c0a3d83c9b49917dd3712bfe2e5e11d': { name: 'Apecoin', symbol: 'APE', date: '2022-03' },
  '0x00000000000076a84fef008cdabe6409d2fe638b': { name: 'Safe', symbol: 'SAFE', date: '2022-09' },
  '0xd8da6bf26964af9d7eed9e03e53415d37aa96045': { name: 'VB donation', symbol: 'various', date: '' },
  '0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8': { name: 'EigenLayer', symbol: 'EIGEN', date: '2024-05' },
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { name: 'LayerZero', symbol: 'ZRO', date: '2024-06' },
};

interface AirdropReceived {
  name: string;
  symbol: string;
  date: string;
  amount: number;
  tokenAddress: string;
}

async function fetchAirdrops(addr: string): Promise<AirdropReceived[]> {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) return [];
  try {
    // Fetch ERC-20 token transfers TO this wallet
    const res = await fetch(
      `${ETHERSCAN_BASE}?chainid=1&module=account&action=tokentx&address=${addr}&startblock=0&endblock=99999999&page=1&offset=10000&sort=asc&apikey=${key}`,
    );
    const json = await res.json();
    if (json.status !== '1' || !Array.isArray(json.result)) return [];

    const airdrops: AirdropReceived[] = [];
    const seen = new Set<string>(); // dedup by contract
    const addrLower = addr.toLowerCase();

    for (const tx of json.result) {
      const from = (tx.from || '').toLowerCase();
      const to = (tx.to || '').toLowerCase();
      // Only inbound transfers
      if (to !== addrLower) continue;

      const airdrop = AIRDROP_CONTRACTS[from];
      if (airdrop && !seen.has(from)) {
        seen.add(from);
        const decimals = parseInt(tx.tokenDecimal) || 18;
        const amount = parseInt(tx.value) / Math.pow(10, decimals);
        airdrops.push({
          name: airdrop.name,
          symbol: airdrop.symbol,
          date: airdrop.date,
          amount,
          tokenAddress: tx.contractAddress || '',
        });
      }
    }

    return airdrops;
  } catch { return []; }
}

// ============================================================================
// ENS resolution — ensdata.net (free, no key)
// ============================================================================

async function fetchENSName(addr: string): Promise<string | null> {
  try {
    const res = await fetch(`https://ensdata.net/${addr}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.ens || json.ens_primary || null;
  } catch { return null; }
}

// ============================================================================
// Snapshot — governance votes (free GraphQL, no key)
// ============================================================================

async function fetchSnapshotVotes(addr: string): Promise<{ totalVotes: number; spaces: string[] }> {
  try {
    const res = await fetch('https://hub.snapshot.org/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{
          votes(
            first: 1000
            where: { voter: "${addr}" }
            orderBy: "created"
            orderDirection: desc
          ) {
            space { id }
          }
        }`,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { totalVotes: 0, spaces: [] };
    const json = await res.json();
    const votes = json.data?.votes ?? [];
    const spaceSet = new Set<string>();
    for (const v of votes) {
      if (v.space?.id) spaceSet.add(v.space.id);
    }
    return { totalVotes: votes.length, spaces: [...spaceSet] };
  } catch { return { totalVotes: 0, spaces: [] }; }
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
  // New — Etherscan
  gasBurnedEth: number;
  uniqueContracts: number;
  activeMonths: number;
  firstTxDate: string | null;
  etherscanTxnCount: number;
  etherscanTxnCapped: boolean;
  // New — Snapshot
  governanceVotes: number;
  governanceSpaces: string[];
  // Etherscan volume
  volumeEth: number;
  // Airdrops
  airdrops: AirdropReceived[];
  // Zerion PnL (spot trading)
  spotPnl: ZerionPnLData | null;
  // Fav token
  favToken: string | null;
}

// ============================================================================
// Main fetcher — returns SailorChainData + EVM display fields
// ============================================================================

export async function fetchEVMSailorData(address: string): Promise<{
  chainData: SailorChainData;
  evmDisplay: EVMDisplayData;
}> {
  // 11 requests in parallel (removed redundant Zerion all-txns — Etherscan covers it better)
  const [portfolio, positions, tradesResult, nfts, zerionPnl, hlState, hlFills, etherscanTxns, ensName, snapshotData, airdrops] = await Promise.all([
    fetchZerionPortfolio(address),
    fetchZerionPositions(address),
    fetchZerionTrades(address),
    fetchZerionNFTs(address),
    fetchZerionPnL(address),
    fetchHLState(address),
    fetchHLFills(address),
    fetchEtherscanTxns(address),
    fetchENSName(address),
    fetchSnapshotVotes(address),
    fetchAirdrops(address),
  ]);

  // Analyze Etherscan data (full tx history — much better than Zerion's 100-txn window)
  const etherscanStats = analyzeEtherscanTxns(etherscanTxns, address);

  const trades = tradesResult.data;

  // ---- Token analysis from positions ----
  const STAKING_SYMBOLS = new Set(['stETH', 'rETH', 'cbETH', 'wstETH', 'swETH', 'frxETH', 'sfrxETH', 'mETH', 'ETHx']);
  let ethBalance = 0;
  let stakedEth = 0;
  let tokenCount = 0;
  let memecoins = 0;
  let deadTokens = 0;
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

    const dappId = p.relationships?.dapp?.data?.id;
    if (dappId) defiProtocolSet.add(dappId);

    // ETH balance (native)
    if (symbol === 'ETH' && posType === 'wallet') {
      ethBalance += attr.quantity.float;
    }

    // Staked ETH — use token quantity (≈1:1 with ETH), not USD value
    if (posType === 'staked' || STAKING_SYMBOLS.has(symbol)) {
      stakedEth += attr.quantity.float;
    }

    // Count tokens
    if (posType === 'wallet') {
      if (attr.flags.is_trash) {
        deadTokens++;
      } else if (value > 0) {
        tokenCount++;
        if (!dappId && !['ETH', 'WETH', 'USDC', 'USDT', 'DAI', 'USDS'].includes(symbol)) {
          memecoins++;
        }
      }
    }

    if (value > 0) {
      topPositionsList.push({ name, symbol, value, protocol: dappId ?? null });
    }
  }

  topPositionsList.sort((a, b) => b.value - a.value);

  // ---- Trade analysis + per-token win/loss ----
  const dappNames = new Set<string>();
  const tokenBuys: Record<string, number> = {};
  const STABLE_SYMS = new Set(['ETH', 'WETH', 'USDC', 'USDT', 'DAI', 'USDS', 'FRAX']);
  // Per-token value tracking for win/loss computation
  const tokenTrades: Record<string, { bought: number; sold: number }> = {};
  let tradeVolumeUsd = 0;

  for (const tx of trades) {
    const attr = tx.attributes;
    const dappId = tx.relationships?.dapp?.data?.id;
    if (dappId) dappNames.add(dappId);

    for (const t of attr.transfers) {
      if (t.value && t.value > 0) {
        tradeVolumeUsd += t.value;
      }
      const sym = t.fungible_info?.symbol;
      if (!sym) continue;

      // Track token buys for favToken
      if (t.direction === 'in' && !STABLE_SYMS.has(sym)) {
        tokenBuys[sym] = (tokenBuys[sym] || 0) + 1;
      }

      // Track per-token bought/sold USD values for win/loss
      if (!STABLE_SYMS.has(sym) && t.value && t.value > 0) {
        if (!tokenTrades[sym]) tokenTrades[sym] = { bought: 0, sold: 0 };
        if (t.direction === 'in') tokenTrades[sym].bought += t.value;
        else if (t.direction === 'out') tokenTrades[sym].sold += t.value;
      }
    }
  }

  // Compute win/loss from per-token trade data
  let tradeWins = 0;
  let tradeLosses = 0;
  for (const { bought, sold } of Object.values(tokenTrades)) {
    // Only count tokens that have been both bought and sold (completed trades)
    if (bought > 1 && sold > 1) {
      if (sold > bought * 1.02) tradeWins++;   // 2% threshold for "win"
      else if (bought > sold * 1.02) tradeLosses++;
    }
  }

  // Fav token
  let favTokenBuys = 0;
  let favTokenSymbol = '';
  for (const [sym, count] of Object.entries(tokenBuys)) {
    if (count > favTokenBuys) { favTokenBuys = count; favTokenSymbol = sym; }
  }

  // Unique tokens traded
  const uniqueTokensTraded = new Set<string>();
  for (const tx of trades) {
    for (const t of tx.attributes.transfers) {
      if (t.fungible_info?.symbol) uniqueTokensTraded.add(t.fungible_info.symbol);
    }
  }

  // ---- Zerion Spot PnL (primary) ----
  let pnlRealized: number | null = null;
  let pnlUnrealized: number | null = null;
  let pnlWinRate: number | null = null;
  let pnlWins = 0;
  let pnlLosses = 0;
  let pnlTotalInvested: number | null = null;

  if (zerionPnl) {
    pnlRealized = Math.round(zerionPnl.realized * 100) / 100;
    pnlUnrealized = Math.round(zerionPnl.unrealized * 100) / 100;
    pnlTotalInvested = Math.round(zerionPnl.totalInvested * 100) / 100;

    // Try per-token breakdown from Zerion PnL first
    if (zerionPnl.tokens.length > 0) {
      for (const t of zerionPnl.tokens) {
        if (t.realizedGain > 0) pnlWins++;
        else if (t.realizedGain < 0) pnlLosses++;
      }
    } else {
      // Fallback: use trade-level wins/losses computed from trade txns
      pnlWins = tradeWins;
      pnlLosses = tradeLosses;
    }

    const totalPnlTrades = pnlWins + pnlLosses;
    if (totalPnlTrades > 0) {
      pnlWinRate = Math.round((pnlWins / totalPnlTrades) * 10000) / 100;
    }
  } else {
    // No Zerion PnL — use trade-computed wins/losses
    pnlWins = tradeWins;
    pnlLosses = tradeLosses;
    const totalPnlTrades = pnlWins + pnlLosses;
    if (totalPnlTrades > 0) {
      pnlWinRate = Math.round((pnlWins / totalPnlTrades) * 10000) / 100;
    }
  }

  // ---- Hyperliquid Perps PnL (supplementary) ----
  let hlPnl: number | null = null;
  let hlVolume: number | null = null;

  if (hlFills.length > 0) {
    let totalPnl = 0;
    let totalVol = 0;
    let hlWins = 0;
    let hlLosses = 0;
    for (const fill of hlFills) {
      const closed = parseFloat(fill.closedPnl);
      if (closed > 0) { hlWins++; totalPnl += closed; }
      else if (closed < 0) { hlLosses++; totalPnl += closed; }
      totalVol += parseFloat(fill.px) * parseFloat(fill.sz);
    }
    hlPnl = Math.round(totalPnl * 100) / 100;
    hlVolume = Math.round(totalVol * 100) / 100;

    // If no Zerion PnL, fall back to HL data for scoring
    if (!zerionPnl) {
      pnlRealized = hlPnl;
      pnlWins += hlWins;
      pnlLosses += hlLosses;
      const totalTrades = pnlWins + pnlLosses;
      if (totalTrades > 0) {
        pnlWinRate = Math.round((pnlWins / totalTrades) * 10000) / 100;
      }
    }
  }

  // Account value from HL (for scoring pnlTotalInvested fallback)
  if (!pnlTotalInvested && hlState) {
    const margin = parseFloat(hlState.marginSummary.totalMarginUsed);
    if (margin > 0) pnlTotalInvested = Math.round(margin * 100) / 100;
  }

  // NFT count
  const nftCount = nfts.length;

  // DeFi categories
  const defiCategories: string[] = [];
  if (stakedEth > 0 || positionTypes.has('staked')) defiCategories.push('staking');
  if (hlFills.length > 0) defiCategories.push('perps');
  if (positionTypes.has('deposit') || positionTypes.has('locked')) defiCategories.push('lending');
  if (defiProtocolSet.size > 0) defiCategories.push('defi');

  // ---- Portfolio data ----
  const portfolioFromEndpoint = portfolio?.attributes?.total?.positions ?? 0;
  const portfolioFromPositions = topPositionsList.reduce((sum, p) => sum + p.value, 0);
  const totalPortfolioUsd = portfolioFromEndpoint > 0 ? portfolioFromEndpoint : portfolioFromPositions;
  const chainDist = portfolio?.attributes?.positions_distribution_by_chain ?? {};

  // Volume: convert USD trade volume to ETH-equivalent for scoring
  // Scoring cap is 1000 (same as SOL). ~2500 USD/ETH estimate.
  const ETH_PRICE_EST = 2500;
  const solVolumeEquiv = tradeVolumeUsd > 0
    ? tradeVolumeUsd / ETH_PRICE_EST
    : etherscanStats.volumeEth;

  // Dapp diversity: trade protocols + position protocols + governance
  const zerionDapps = dappNames.size + defiProtocolSet.size + (snapshotData.spaces.length > 0 ? 1 : 0);
  const totalUniqueDapps = Math.max(zerionDapps, Math.min(etherscanStats.uniqueContracts, 50));

  // Tokens traded: prefer trade-computed count over empty Zerion PnL tokens
  const tokensTraded = zerionPnl?.tokens?.length || uniqueTokensTraded.size || Object.keys(tokenTrades).length;

  // ---- Build SailorChainData ----
  const chainData: SailorChainData = {
    txnCount: etherscanStats.txnCount > 0 ? etherscanStats.txnCount : tradesResult.totalCount,
    tokenCount,
    memecoins,
    deadTokens,
    favTokenBuys,
    pfCoinsCreated: etherscanStats.deployCount,
    pfCoinsGraduated: 0,
    pfKothCount: 0,
    solBalance: ethBalance,
    stakedSol: stakedEth,   // ETH quantity (≈1:1 mapping to SOL for scoring)
    solVolume: solVolumeEquiv,
    pnlRealized,
    pnlWinRate,
    pnlWins,
    pnlLosses,
    pnlTotalInvested,
    pnlTokensTraded: tokensTraded,
    dexCount: dappNames.size,
    uniqueDapps: totalUniqueDapps,
    defiCategories: snapshotData.totalVotes > 0
      ? [...new Set([...defiCategories, 'governance'])]
      : defiCategories,
    walletAgeDays: etherscanStats.firstTxDate
      ? Math.floor((Date.now() - new Date(etherscanStats.firstTxDate).getTime()) / 86400000)
      : 0,
    uniqueActiveDays: etherscanStats.uniqueActiveDays,
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
    ensName,
    volumeEth: etherscanStats.volumeEth,
    airdrops,
    spotPnl: zerionPnl,
    gasBurnedEth: etherscanStats.gasBurnedEth,
    uniqueContracts: etherscanStats.uniqueContracts,
    activeMonths: etherscanStats.activeMonths,
    firstTxDate: etherscanStats.firstTxDate,
    etherscanTxnCount: etherscanStats.txnCount,
    etherscanTxnCapped: etherscanStats.txnCountCapped,
    governanceVotes: snapshotData.totalVotes,
    governanceSpaces: snapshotData.spaces,
    favToken: favTokenSymbol || null,
  };

  return { chainData, evmDisplay };
}
