"use client";
import { useState, useEffect } from 'react';

export interface OnChainData {
  // Signature stats (RPC — up to 5000 sigs)
  txnCount: number;
  txnCountCapped: boolean;
  walletAgeDays: number;
  firstSeenDate: string | null;
  lastActivityDays: number;
  activeMonths: number;
  activeWeeks: number;
  uniqueActiveDays: number;
  // Token holdings (RPC)
  tokenCount: number;
  totalTokenAccounts: number;
  solBalance: number;
  memecoins: number;
  defiTokens: string[];
  defiCategories: string[];
  stakedSol: number;
  nftCount: number;
  deadTokens: number;
  // DEX stats (Helius)
  dexProtocols: { project: string; trades: number }[];
  dexCount: number;
  totalTrades: number;
  solVolume: number;
  biggestTrade: number;
  favToken: string | null;
  favTokenBuys: number;
  // Dapp diversity (Helius)
  uniqueDapps: number;
  uniqueDappsList: string[];
  // Pump.fun
  pfCoinsCreated: number;
  pfCoinsGraduated: number;
  pfGradRate: number;
  pfKothCount: number;
  pfBestCoin: { name: string; symbol: string; athUsd: number } | null;
  pfHoldingsCount: number;
  pfHoldingsValueSol: number;
  pfTopHoldings: { symbol: string; name: string; valueSol: number }[];
  pfCoins: { name: string; symbol: string; complete: boolean; marketCapSol: number; athUsd: number; koth: boolean; replies: number }[];
  pfCommunities: { symbol: string; name: string; usdMarketCap: number }[];
  // PnL (Solana Tracker)
  pnlRealized: number | null;
  pnlUnrealized: number | null;
  pnlTotal: number | null;
  pnlTotalInvested: number | null;
  pnlWinRate: number | null;
  pnlWins: number;
  pnlLosses: number;
  pnlBestTrade: { token: string; pnl: number } | null;
  pnlWorstTrade: { token: string; pnl: number } | null;
  pnlTopTokens: { address: string; pnl: number; invested: number; roi: number }[];
  pnlTokensTraded: number;
}

// Browser cache — same wallet won't re-query within 10 min
const CACHE_TTL = 10 * 60 * 1000;

function getCached(address: string): OnChainData | null {
  try {
    const raw = sessionStorage.getItem(`sailor:${address}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(`sailor:${address}`); return null; }
    return data;
  } catch { return null; }
}

function setCache(address: string, data: OnChainData) {
  try { sessionStorage.setItem(`sailor:${address}`, JSON.stringify({ data, ts: Date.now() })); }
  catch { /* quota exceeded */ }
}

export function useWalletOnChain(address: string | null) {
  const [data, setData] = useState<OnChainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) { setData(null); setLoading(false); return; }

    // Check browser cache first
    const cached = getCached(address);
    if (cached) { setData(cached); setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/sailor-stats/${address}`)
      .then(res => res.json())
      .then(json => {
        if (cancelled) return;
        if (json.success) {
          setData(json.data);
          setCache(address, json.data);
        } else {
          setError(json.error || 'Failed to fetch');
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Network error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [address]);

  return { data, loading, error };
}
