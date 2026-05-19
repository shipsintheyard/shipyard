"use client";
import { useCallback } from 'react';
import { useWriteContract, useAccount } from 'wagmi';
import { parseEther } from 'viem';
import { BOARDING_ABI } from '../lib/evm-abi';
import { BASE_BOARDING_ADDRESS, BASE_CHAIN } from '../lib/evm-contracts';

export function useEVMTransactions() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const createPool = useCallback(async (params: {
    token: string;
    hardCap: number;
    perWalletCap: number;
    duration: number;
    tokenSupply: bigint;
    ticker: string;
  }) => {
    if (!address) throw new Error('Wallet not connected');

    const hash = await writeContractAsync({
      address: BASE_BOARDING_ADDRESS,
      abi: BOARDING_ABI,
      functionName: 'createPool',
      args: [
        params.token as `0x${string}`,
        parseEther(String(params.hardCap)),
        parseEther(String(params.perWalletCap)),
        BigInt(params.duration),
        params.tokenSupply,
        params.ticker.toUpperCase(),
      ],
      value: parseEther('0.005'),
      chainId: BASE_CHAIN.id,
    });

    return { tx: hash };
  }, [address, writeContractAsync]);

  const deposit = useCallback(async (params: {
    poolId: number;
    amount: number;
  }) => {
    if (!address) throw new Error('Wallet not connected');

    const hash = await writeContractAsync({
      address: BASE_BOARDING_ADDRESS,
      abi: BOARDING_ABI,
      functionName: 'deposit',
      args: [BigInt(params.poolId)],
      value: parseEther(String(params.amount)),
      chainId: BASE_CHAIN.id,
    });

    return { tx: hash };
  }, [address, writeContractAsync]);

  const claimRefund = useCallback(async (params: { poolId: number }) => {
    if (!address) throw new Error('Wallet not connected');

    const hash = await writeContractAsync({
      address: BASE_BOARDING_ADDRESS,
      abi: BOARDING_ABI,
      functionName: 'claimRefund',
      args: [BigInt(params.poolId)],
      chainId: BASE_CHAIN.id,
    });

    return { tx: hash };
  }, [address, writeContractAsync]);

  const claimTokens = useCallback(async (params: { poolId: number }) => {
    if (!address) throw new Error('Wallet not connected');

    const hash = await writeContractAsync({
      address: BASE_BOARDING_ADDRESS,
      abi: BOARDING_ABI,
      functionName: 'claimTokens',
      args: [BigInt(params.poolId)],
      chainId: BASE_CHAIN.id,
    });

    return { tx: hash };
  }, [address, writeContractAsync]);

  return { createPool, deposit, claimRefund, claimTokens };
}
