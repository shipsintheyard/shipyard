"use client";
import { useState, useEffect, useCallback } from 'react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useBoardingProgram } from './useAnchorProgram';
import { BOARDING_PROGRAM_ID, V1_HARD_CAP_SOL, V1_PER_WALLET_SOL, V1_MIN_WALLETS } from '../lib/boarding-idl';

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
      // Fetch all BoardingPool + TickerClaim accounts in parallel
      const [rawPools, rawTickers] = await Promise.all([
        (program.account as any).boardingPool.all(),
        (program.account as any).tickerClaim.all(),
      ]);

      if (rawPools.length === 0) {
        setPools(DEMO_POOLS);
        setLoading(false);
        return;
      }

      // Build ticker lookup: pool pubkey → ticker string
      const tickerMap = new Map<string, string>();
      for (const t of rawTickers) {
        const poolKey = t.account.pool.toString();
        // ticker is [u8; 10] zero-padded uppercase ASCII
        const bytes: number[] = Array.from(t.account.ticker);
        const ticker = String.fromCharCode(...bytes.filter((b: number) => b !== 0));
        tickerMap.set(poolKey, ticker);
      }

      // Fetch mint decimals for proper supply display
      const { connection } = program.provider as any;
      const mintKeys = rawPools.map((p: any) => p.account.tokenMint);
      const mintInfos = await connection.getMultipleAccountsInfo(mintKeys);

      const mapped: BoardingPool[] = rawPools.map((item: any, i: number) => {
        const acc = item.account;
        const pubkey = item.publicKey.toString();
        const ticker = tickerMap.get(pubkey) || '???';

        // Parse mint decimals from raw account data (offset 44, 1 byte)
        let decimals = 6; // default
        if (mintInfos[i]?.data) {
          decimals = mintInfos[i].data[44];
        }

        const rawSupply = acc.tokenSupply.toNumber();
        const humanSupply = rawSupply / (10 ** decimals);

        return {
          publicKey: pubkey,
          creator: acc.creator.toString(),
          tokenMint: acc.tokenMint.toString(),
          tokenName: ticker,       // use ticker as name
          tokenSymbol: ticker,     // use ticker as symbol
          hardCap: acc.hardCap.toNumber() / LAMPORTS_PER_SOL,
          perWalletCap: acc.perWalletCap.toNumber() / LAMPORTS_PER_SOL,
          minWallets: acc.minWallets.toNumber(),
          deadline: acc.deadline.toNumber(),
          status: mapStatus(acc.status),
          totalDeposited: acc.totalDeposited.toNumber() / LAMPORTS_PER_SOL,
          participantCount: acc.participantCount.toNumber(),
          tokenSupply: humanSupply,
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

// ── Deposit PDA layout (82 bytes) ──
// 8 discriminator | 32 depositor | 32 pool | 8 amount (u64 LE) | 1 claimed | 1 tokens_claimed
const DEPOSIT_AMOUNT_OFFSET = 72; // 8 + 32 + 32
const DEPOSIT_CLAIMED_OFFSET = 80;
const DEPOSIT_TOKENS_CLAIMED_OFFSET = 81;

export interface MyDeposit {
  poolPubkey: string;
  amount: number;      // SOL
  claimed: boolean;
  tokensClaimed: boolean;
}

/**
 * Fetches all deposit accounts for the connected wallet across all pools.
 * Returns a map of poolPubkey → deposit info, plus aggregate unclaimed totals.
 */
export function useMyDeposits(pools: BoardingPool[]) {
  const { publicKey } = useWallet();
  const { connection } = useBoardingProgram();
  const [deposits, setDeposits] = useState<Map<string, MyDeposit>>(new Map());
  const [loading, setLoading] = useState(false);

  const programId = new PublicKey(BOARDING_PROGRAM_ID);

  const fetchDeposits = useCallback(async () => {
    if (!publicKey || pools.length === 0) {
      setDeposits(new Map());
      return;
    }

    // Filter out demo pools (can't derive PDAs for fake pubkeys)
    const realPools = pools.filter(p => !p.publicKey.startsWith('demo_'));
    if (realPools.length === 0) {
      setDeposits(new Map());
      return;
    }

    setLoading(true);
    try {
      // Derive deposit PDAs for every real pool
      const pdas = realPools.map(p => {
        const poolKey = new PublicKey(p.publicKey);
        const [pda] = PublicKey.findProgramAddressSync(
          [Buffer.from('deposit'), poolKey.toBuffer(), publicKey.toBuffer()],
          programId
        );
        return pda;
      });

      // Batch fetch all at once
      const accounts = await connection.getMultipleAccountsInfo(pdas);

      const map = new Map<string, MyDeposit>();
      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        if (!acc?.data || acc.data.length < 82) continue;

        const data = Buffer.from(acc.data);
        // Read u64 amount (little-endian)
        const lo = data.readUInt32LE(DEPOSIT_AMOUNT_OFFSET);
        const hi = data.readUInt32LE(DEPOSIT_AMOUNT_OFFSET + 4);
        const lamports = lo + hi * 0x100000000;

        map.set(realPools[i].publicKey, {
          poolPubkey: realPools[i].publicKey,
          amount: lamports / LAMPORTS_PER_SOL,
          claimed: data[DEPOSIT_CLAIMED_OFFSET] !== 0,
          tokensClaimed: data[DEPOSIT_TOKENS_CLAIMED_OFFSET] !== 0,
        });
      }

      setDeposits(map);
    } catch (err) {
      console.error('[boarding] Failed to fetch deposits:', err);
    } finally {
      setLoading(false);
    }
  }, [publicKey, pools, connection, programId]);

  useEffect(() => {
    fetchDeposits();
    const interval = setInterval(fetchDeposits, 30_000);
    return () => clearInterval(interval);
  }, [fetchDeposits]);

  // Compute aggregates
  const unclaimedRefunds: (MyDeposit & { pool: BoardingPool })[] = [];
  const activeDeposits: (MyDeposit & { pool: BoardingPool })[] = [];

  for (const pool of pools) {
    const dep = deposits.get(pool.publicKey);
    if (!dep) continue;
    if (pool.status === 'failed' && !dep.claimed) {
      unclaimedRefunds.push({ ...dep, pool });
    }
    if (pool.status === 'active' || pool.status === 'succeeded') {
      activeDeposits.push({ ...dep, pool });
    }
  }

  const totalUnclaimedSol = unclaimedRefunds.reduce((s, d) => s + d.amount, 0);

  return {
    deposits,
    unclaimedRefunds,
    activeDeposits,
    totalUnclaimedSol,
    loading,
    refetch: fetchDeposits,
  };
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
