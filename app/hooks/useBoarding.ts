"use client";
import { useState, useEffect } from 'react';

export type PoolStatus = 'active' | 'succeeded' | 'failed' | 'launched';
export type BoardingMode = 'blitz' | 'flash' | 'voyage';
export type AccessMode = 'public' | 'crew';

export interface BoardingPool {
  publicKey: string;
  creator: string;
  tokenMint: string;
  tokenName: string;
  tokenSymbol: string;
  tokenImage?: string;
  hardCap: number;
  perWalletCap: number;
  minWallets: number;
  deadline: number;
  status: PoolStatus;
  totalDeposited: number;
  participantCount: number;
  tokenSupply: number;
  mode: BoardingMode;
  access: AccessMode;
}

export interface UserDeposit {
  pool: string;
  amount: number;
  claimed: boolean;
}

// Mock pools — will be replaced with on-chain fetching
const MOCK_POOLS: BoardingPool[] = [
  {
    publicKey: '7xKm3pool1',
    creator: '9bRz4creator1',
    tokenMint: '3mNp1mint1',
    tokenName: 'MOONBASE',
    tokenSymbol: 'MOON',
    hardCap: 80,
    perWalletCap: 2,
    minWallets: 40,
    deadline: Math.floor(Date.now() / 1000) + 4 * 3600,  // 4h left
    status: 'active',
    totalDeposited: 52,
    participantCount: 28,
    tokenSupply: 1_000_000_000,
    mode: 'flash',
    access: 'public',
  },
  {
    publicKey: '4yMk2pool2',
    creator: '8kPj5creator2',
    tokenMint: '5jQr2mint2',
    tokenName: 'DEEPWATER',
    tokenSymbol: 'DEEP',
    hardCap: 120,
    perWalletCap: 3,
    minWallets: 40,
    deadline: Math.floor(Date.now() / 1000) + 58 * 3600,  // ~2.5 days
    status: 'active',
    totalDeposited: 27,
    participantCount: 11,
    tokenSupply: 500_000_000,
    mode: 'voyage',
    access: 'crew',
  },
  {
    publicKey: '2zLn3pool3',
    creator: '6wNm6creator3',
    tokenMint: '1hRs3mint3',
    tokenName: 'NEBULA',
    tokenSymbol: 'NEB',
    hardCap: 80,
    perWalletCap: 2,
    minWallets: 40,
    deadline: Math.floor(Date.now() / 1000) - 3600,
    status: 'succeeded',
    totalDeposited: 80,
    participantCount: 43,
    tokenSupply: 2_000_000_000,
    mode: 'flash',
    access: 'public',
  },
  {
    publicKey: '8pJq4pool4',
    creator: '3tQk7creator4',
    tokenMint: '9fKw4mint4',
    tokenName: 'ANCHOR',
    tokenSymbol: 'ANCH',
    hardCap: 60,
    perWalletCap: 1.5,
    minWallets: 40,
    deadline: Math.floor(Date.now() / 1000) - 7200,
    status: 'failed',
    totalDeposited: 18,
    participantCount: 14,
    tokenSupply: 750_000_000,
    mode: 'voyage',
    access: 'public',
  },
  {
    publicKey: '5nHd5pool5',
    creator: '1rSv8creator5',
    tokenMint: '7dMx5mint5',
    tokenName: 'COMPASS',
    tokenSymbol: 'CMP',
    hardCap: 80,
    perWalletCap: 2,
    minWallets: 40,
    deadline: Math.floor(Date.now() / 1000) - 86400,
    status: 'launched',
    totalDeposited: 80,
    participantCount: 44,
    tokenSupply: 1_500_000_000,
    mode: 'flash',
    access: 'crew',
  },
  {
    publicKey: '9gTp6pool6',
    creator: '2mXw9creator6',
    tokenMint: '4kLz6mint6',
    tokenName: 'KRAKEN',
    tokenSymbol: 'KRKN',
    hardCap: 40,
    perWalletCap: 1,
    minWallets: 40,
    deadline: Math.floor(Date.now() / 1000) + 11 * 3600,
    status: 'active',
    totalDeposited: 38,
    participantCount: 39,
    tokenSupply: 420_000_000,
    mode: 'flash',
    access: 'public',
  },
  {
    publicKey: '3bRt7pool7',
    creator: '7yKn2creator7',
    tokenMint: '8wPq7mint7',
    tokenName: 'SENDIT',
    tokenSymbol: 'SEND',
    hardCap: 40,
    perWalletCap: 1,
    minWallets: 40,
    deadline: Math.floor(Date.now() / 1000) + 18 * 60,  // 18 min left
    status: 'active',
    totalDeposited: 29,
    participantCount: 31,
    tokenSupply: 1_000_000_000,
    mode: 'blitz',
    access: 'public',
  },
];

export function useBoardingPools() {
  const [pools, setPools] = useState<BoardingPool[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Replace with on-chain getProgramAccounts
    const timer = setTimeout(() => {
      setPools(MOCK_POOLS);
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  return { pools, loading };
}

export function useBoardingPool(poolId: string | null) {
  const [pool, setPool] = useState<BoardingPool | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!poolId) { setPool(null); setLoading(false); return; }
    const timer = setTimeout(() => {
      setPool(MOCK_POOLS.find(p => p.publicKey === poolId) || null);
      setLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [poolId]);

  return { pool, loading };
}

export function useCountdown(deadline: number) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = deadline - Math.floor(Date.now() / 1000);
      if (diff <= 0) { setTimeLeft('EXPIRED'); return; }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setTimeLeft(`${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return timeLeft;
}
