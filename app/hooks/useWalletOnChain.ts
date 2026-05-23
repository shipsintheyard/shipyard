"use client";
import { useState, useEffect, useRef } from 'react';

export interface OnChainData {
  // RPC (instant)
  lastActivityDays: number;
  tokenCount: number;
  totalTokenAccounts: number;
  solBalance: number;
  memecoins: number;
  defiTokens: string[];
  defiCategories: string[];
  stakedSol: number;
  nftCount: number;
  deadTokens: number;
  // Dune (async — filled in by polling)
  txnCount: number;
  walletAgeDays: number;
  firstSeenDate: string | null;
  activeMonths: number;
  totalTrades: number;
  totalVolumeUsd: number;
  biggestTradeUsd: number;
  favToken: string | null;
  favTokenBuys: number;
  dexProtocols: { project: string; trades: number }[];
  dexCount: number;
}

const DUNE_DEFAULTS = {
  txnCount: 0,
  walletAgeDays: 0,
  firstSeenDate: null,
  activeMonths: 0,
  totalTrades: 0,
  totalVolumeUsd: 0,
  biggestTradeUsd: 0,
  favToken: null,
  favTokenBuys: 0,
  dexProtocols: [],
  dexCount: 0,
};

// Browser-side cache — avoids re-querying Dune for same wallet within 10 min
const CACHE_TTL = 10 * 60 * 1000;

function getCachedDune(address: string) {
  try {
    const raw = sessionStorage.getItem(`dune:${address}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) {
      sessionStorage.removeItem(`dune:${address}`);
      return null;
    }
    return data;
  } catch { return null; }
}

function cacheDune(address: string, data: Record<string, unknown>) {
  try {
    sessionStorage.setItem(`dune:${address}`, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded, ignore */ }
}

export function useWalletOnChain(address: string | null) {
  const [data, setData] = useState<OnChainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [duneLoading, setDuneLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!address) {
      setData(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    fetch(`/api/sailor-stats/${address}`)
      .then(res => res.json())
      .then(json => {
        if (cancelled) return;
        if (!json.success) {
          setError(json.error || 'Failed to fetch');
          return;
        }

        const rpcData = json.data;

        // Check browser cache for Dune data first
        const cached = getCachedDune(address);
        if (cached) {
          setData({ ...rpcData, ...DUNE_DEFAULTS, ...cached });
          return;
        }

        // Set RPC data with Dune defaults
        setData({ ...rpcData, ...DUNE_DEFAULTS });

        // Poll for Dune results if we got an execution ID
        const execId = rpcData.duneExecId;
        if (execId) {
          setDuneLoading(true);
          let attempts = 0;

          pollRef.current = setInterval(async () => {
            if (cancelled) {
              if (pollRef.current) clearInterval(pollRef.current);
              return;
            }

            attempts++;
            if (attempts > 12) { // 60s max
              if (pollRef.current) clearInterval(pollRef.current);
              setDuneLoading(false);
              return;
            }

            try {
              const pollRes = await fetch(`/api/dune-poll?id=${execId}`);
              const pollJson = await pollRes.json();

              if (pollJson.ready && !cancelled) {
                const duneData = pollJson.data;
                // Cache for future visits
                cacheDune(address, duneData);
                // Merge into state
                setData(prev => prev ? { ...prev, ...duneData } : prev);
                setDuneLoading(false);
                if (pollRef.current) clearInterval(pollRef.current);
              }
            } catch { /* retry next interval */ }
          }, 5000);
        }
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message || 'Network error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [address]);

  return { data, loading, duneLoading, error };
}
