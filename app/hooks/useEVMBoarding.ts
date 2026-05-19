"use client";
import { useState, useEffect } from 'react';
import { readContract } from '@wagmi/core';
import { wagmiConfig } from '../providers/EVMProvider';
import { BOARDING_ABI } from '../lib/evm-abi';
import { BASE_BOARDING_ADDRESS, BASE_CHAIN } from '../lib/evm-contracts';

export type EVMPoolStatus = 'active' | 'succeeded' | 'failed' | 'launched';

export interface EVMBoardingPool {
  poolId: number;
  creator: string;
  token: string;
  ticker: string;
  hardCap: number;       // ETH
  perWalletCap: number;  // ETH
  deadline: number;
  status: EVMPoolStatus;
  totalDeposited: number; // ETH
  participantCount: number;
  tokenSupply: number;
}

const STATUS_MAP: EVMPoolStatus[] = ['active', 'succeeded', 'failed', 'launched'];

export function useEVMBoardingPools() {
  const [pools, setPools] = useState<EVMBoardingPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetch() {
      try {
        const count = await readContract(wagmiConfig, {
          address: BASE_BOARDING_ADDRESS,
          abi: BOARDING_ABI,
          functionName: 'poolCount',
          chainId: BASE_CHAIN.id,
        });

        const poolCount = Number(count);
        if (poolCount === 0) {
          setPools([]);
          setLoading(false);
          return;
        }

        const results = await Promise.all(
          Array.from({ length: poolCount }, (_, i) =>
            readContract(wagmiConfig, {
              address: BASE_BOARDING_ADDRESS,
              abi: BOARDING_ABI,
              functionName: 'getPool',
              args: [BigInt(i)],
              chainId: BASE_CHAIN.id,
            })
          )
        );

        if (cancelled) return;

        const mapped: EVMBoardingPool[] = results.map((pool: any, i) => ({
          poolId: i,
          creator: pool.creator,
          token: pool.token,
          ticker: pool.ticker || `Pool #${i}`,
          hardCap: Number(pool.hardCap) / 1e18,
          perWalletCap: Number(pool.perWalletCap) / 1e18,
          deadline: Number(pool.deadline),
          status: STATUS_MAP[pool.status] || 'active',
          totalDeposited: Number(pool.totalDeposited) / 1e18,
          participantCount: Number(pool.participantCount),
          tokenSupply: Number(pool.tokenSupply),
        }));

        setPools(mapped);
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, []);

  return { pools, loading, error };
}
