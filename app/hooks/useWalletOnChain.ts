"use client";
import { useState, useEffect } from 'react';

export interface OnChainData {
  txnCount: number;
  successfulTxns: number;
  walletAgeDays: number;
  lastActivityDays: number;
  tokenCount: number;
  totalTokenAccounts: number;
  solBalance: number;
}

export function useWalletOnChain(address: string | null) {
  const [data, setData] = useState<OnChainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setData(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/sailor-stats/${address}`)
      .then(res => res.json())
      .then(json => {
        if (cancelled) return;
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error || 'Failed to fetch');
        }
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message || 'Network error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [address]);

  return { data, loading, error };
}
