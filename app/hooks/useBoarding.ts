"use client";
import { useState, useEffect, useCallback } from 'react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useBoardingProgram } from './useAnchorProgram';
import { V1_HARD_CAP_SOL, V1_PER_WALLET_SOL, V1_MIN_WALLETS } from '../lib/boarding-idl';

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
  hardCap: number;       // SOL
  perWalletCap: number;  // SOL
  minWallets: number;
  deadline: number;       // unix seconds
  status: PoolStatus;
  totalDeposited: number; // SOL
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

// ── On-chain status → frontend status ──
function mapStatus(raw: any): PoolStatus {
  if (raw.active)    return 'active';
  if (raw.succeeded) return 'succeeded';
  if (raw.failed)    return 'failed';
  if (raw.launched)  return 'launched';
  return 'active';
}

function mapAccess(raw: any): AccessMode {
  if (raw.crew) return 'crew';
  return 'public';
}

// ── Derive mode from remaining time ──
// Not perfect — degrades as pool ages — but good enough for V1.
function deriveMode(deadline: number): BoardingMode {
  const now = Math.floor(Date.now() / 1000);
  const remaining = deadline - now;
  if (remaining <= 0) return 'flash'; // expired, default
  if (remaining <= 3600) return 'blitz';       // ≤ 1h looks like blitz
  if (remaining <= 24 * 3600) return 'flash';  // ≤ 24h looks like flash
  return 'voyage';
}

// ── Demo pools — shown when devnet has no real pools ──
const DEMO_POOLS: BoardingPool[] = [
  {
    publicKey: 'demo_moonbase',
    creator: '9bRz...demo',
    tokenMint: '3mNp...demo',
    tokenName: 'MOONBASE',
    tokenSymbol: 'MOON',
    hardCap: 80,
    perWalletCap: 2,
    minWallets: 40,
    deadline: Math.floor(Date.now() / 1000) + 4 * 3600,
    status: 'active',
    totalDeposited: 52,
    participantCount: 28,
    tokenSupply: 1_000_000_000,
    mode: 'flash',
    access: 'public',
  },
  {
    publicKey: 'demo_sendit',
    creator: '7yKn...demo',
    tokenMint: '8wPq...demo',
    tokenName: 'SENDIT',
    tokenSymbol: 'SEND',
    hardCap: 80,
    perWalletCap: 2,
    minWallets: 40,
    deadline: Math.floor(Date.now() / 1000) + 18 * 60,
    status: 'active',
    totalDeposited: 58,
    participantCount: 31,
    tokenSupply: 1_000_000_000,
    mode: 'blitz',
    access: 'public',
  },
];

export function useBoardingPools() {
  const { program } = useBoardingProgram();
  const [pools, setPools] = useState<BoardingPool[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPools = useCallback(async () => {
    try {
      // Fetch all BoardingPool accounts from devnet
      const raw = await (program.account as any).boardingPool.all();

      if (raw.length === 0) {
        // No pools on-chain yet — show demos
        setPools(DEMO_POOLS);
        setLoading(false);
        return;
      }

      const mapped: BoardingPool[] = raw.map((item: any) => {
        const acc = item.account;
        const pubkey = item.publicKey.toString();
        return {
          publicKey: pubkey,
          creator: acc.creator.toString(),
          tokenMint: acc.tokenMint.toString(),
          tokenName: acc.tokenMint.toString().slice(0, 6), // fallback — no metadata yet
          tokenSymbol: '???',  // TODO: fetch from TickerClaim or Metaplex
          hardCap: acc.hardCap.toNumber() / LAMPORTS_PER_SOL,
          perWalletCap: acc.perWalletCap.toNumber() / LAMPORTS_PER_SOL,
          minWallets: acc.minWallets.toNumber(),
          deadline: acc.deadline.toNumber(),
          status: mapStatus(acc.status),
          totalDeposited: acc.totalDeposited.toNumber() / LAMPORTS_PER_SOL,
          participantCount: acc.participantCount.toNumber(),
          tokenSupply: acc.tokenSupply.toNumber(),
          mode: deriveMode(acc.deadline.toNumber()),
          access: mapAccess(acc.accessMode),
        };
      });

      setPools(mapped);
    } catch (err) {
      console.error('[boarding] Failed to fetch pools:', err);
      setPools(DEMO_POOLS);
    } finally {
      setLoading(false);
    }
  }, [program]);

  useEffect(() => {
    fetchPools();
    // Refresh every 30 seconds
    const interval = setInterval(fetchPools, 30_000);
    return () => clearInterval(interval);
  }, [fetchPools]);

  return { pools, loading, refetch: fetchPools };
}

export function useBoardingPool(poolId: string | null) {
  const { pools } = useBoardingPools();
  const pool = poolId ? pools.find(p => p.publicKey === poolId) || null : null;
  return { pool, loading: false };
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
