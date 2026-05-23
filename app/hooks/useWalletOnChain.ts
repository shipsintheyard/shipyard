"use client";
import { useState, useEffect, useRef } from 'react';

export interface OnChainData {
  // Core (from Dune — arrives async)
  txnCount: number;
  walletAgeDays: number;
  firstSeenDate: string | null;
  lastActivityDays: number;
  // DEX protocols (from Dune)
  dexProtocols: { project: string; trades: number }[];
  dexCount: number;
  // Tokens (from RPC — instant)
  tokenCount: number;
  totalTokenAccounts: number;
  solBalance: number;
  memecoins: number;
  defiTokens: string[];
  defiCategories: string[];
  stakedSol: number;
  nftCount: number;
  deadTokens: number;
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

    // Clear any previous poll
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

        setData(json.data);

        // If we got Dune execution IDs, start polling
        const execIds = json.data.duneExecIds;
        if (execIds?.activityId && execIds?.dexId) {
          setDuneLoading(true);
          let attempts = 0;
          const maxAttempts = 12; // 12 * 5s = 60s max

          pollRef.current = setInterval(async () => {
            if (cancelled) {
              if (pollRef.current) clearInterval(pollRef.current);
              return;
            }

            attempts++;
            if (attempts > maxAttempts) {
              if (pollRef.current) clearInterval(pollRef.current);
              setDuneLoading(false);
              return;
            }

            try {
              const pollRes = await fetch(
                `/api/dune-poll?activityId=${execIds.activityId}&dexId=${execIds.dexId}`
              );
              const pollJson = await pollRes.json();

              if (pollJson.ready && !cancelled) {
                // Merge Dune data into existing RPC data
                setData(prev => prev ? {
                  ...prev,
                  txnCount: pollJson.data.txnCount,
                  walletAgeDays: pollJson.data.walletAgeDays,
                  firstSeenDate: pollJson.data.firstSeenDate,
                  dexProtocols: pollJson.data.dexProtocols,
                  dexCount: pollJson.data.dexCount,
                } : prev);
                setDuneLoading(false);
                if (pollRef.current) clearInterval(pollRef.current);
              }
            } catch {
              // Poll failed, will retry next interval
            }
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
