"use client";
import { useState, useEffect, useMemo } from 'react';
import { type BoardingPool, useBoardingPools } from './useBoarding';

// ============================================================================
// Character Stats — derived from on-chain activity
// ============================================================================

export interface CharacterStats {
  wallet: string;

  // Participation
  poolsCreated: number;
  poolsJoined: number;
  poolsLaunched: number;    // successfully launched (as participant or creator)
  poolsFailed: number;      // failed pools participated in

  // Financial
  totalCommitted: number;   // lifetime SOL committed
  totalRefunded: number;    // SOL reclaimed from failed pools
  totalAtRisk: number;      // SOL currently in active pools
  creatorEarnings: number;  // 5% fees earned as creator

  // Derived
  successRate: number;      // 0-100, pools launched / pools finalized
  avgCommitSize: number;    // average deposit size

  // Rank / Title
  rank: CharacterRank;
  title: string;
  xp: number;              // simple XP counter for gamification
}

export type CharacterRank =
  | 'stowaway'     // 0 pools
  | 'deckhand'     // 1-2 pools
  | 'sailor'       // 3-5 pools
  | 'boatswain'    // 6-10 pools
  | 'navigator'    // 11-20 pools
  | 'captain'      // 21-50 pools
  | 'admiral'      // 50+ pools
  | 'shipwright';  // created 5+ successful launches

export interface CharacterBadge {
  id: string;
  name: string;
  icon: string;
  description: string;
  earned: boolean;
}

// XP rewards per action
const XP = {
  JOIN_POOL: 10,
  CREATE_POOL: 25,
  POOL_LAUNCHED: 50,       // bonus when your pool launches
  FIRST_DEPOSIT: 100,      // one-time bonus
  CREW_PARTICIPATION: 15,  // joined a crew pool
  REFUND_CLAIMED: 5,       // at least you showed up
} as const;

function getRank(poolsJoined: number, poolsCreated: number, poolsLaunched: number): { rank: CharacterRank; title: string } {
  // Special rank: created 5+ successful launches
  if (poolsCreated >= 5 && poolsLaunched >= 5) {
    return { rank: 'shipwright', title: 'Shipwright' };
  }

  const total = poolsJoined + poolsCreated;

  if (total >= 50) return { rank: 'admiral', title: 'Admiral' };
  if (total >= 21) return { rank: 'captain', title: 'Captain' };
  if (total >= 11) return { rank: 'navigator', title: 'Navigator' };
  if (total >= 6)  return { rank: 'boatswain', title: 'Boatswain' };
  if (total >= 3)  return { rank: 'sailor', title: 'Sailor' };
  if (total >= 1)  return { rank: 'deckhand', title: 'Deckhand' };
  return { rank: 'stowaway', title: 'Stowaway' };
}

function computeBadges(stats: Omit<CharacterStats, 'rank' | 'title' | 'xp'>): CharacterBadge[] {
  return [
    {
      id: 'first_blood',
      name: 'First Blood',
      icon: '🩸',
      description: 'Joined your first pool',
      earned: stats.poolsJoined >= 1,
    },
    {
      id: 'shipbuilder',
      name: 'Shipbuilder',
      icon: '🔨',
      description: 'Created your first pool',
      earned: stats.poolsCreated >= 1,
    },
    {
      id: 'golden_anchor',
      name: 'Golden Anchor',
      icon: '⚓',
      description: '100% success rate with 3+ pools',
      earned: stats.successRate === 100 && (stats.poolsLaunched + stats.poolsFailed) >= 3,
    },
    {
      id: 'whale',
      name: 'Whale',
      icon: '🐋',
      description: 'Committed 100+ SOL lifetime',
      earned: stats.totalCommitted >= 100,
    },
    {
      id: 'survivor',
      name: 'Survivor',
      icon: '🏊',
      description: 'Survived 3+ failed pools (refunded)',
      earned: stats.poolsFailed >= 3,
    },
    {
      id: 'flash_degen',
      name: 'Flash Degen',
      icon: '⚡',
      description: 'Joined 5+ Flash mode pools',
      earned: false, // TODO: need flash-specific tracking
    },
    {
      id: 'crew_builder',
      name: 'Crew Builder',
      icon: '🔒',
      description: 'Created 3+ crew-gated pools',
      earned: false, // TODO: need crew-specific tracking
    },
    {
      id: 'ten_ship',
      name: 'Ten Ship',
      icon: '🚢',
      description: 'Participated in 10 pools',
      earned: stats.poolsJoined >= 10,
    },
  ];
}

// ============================================================================
// Hook: Compute stats from on-chain data
// ============================================================================

export function useCharacterStats(wallet: string | null) {
  const { pools } = useBoardingPools();
  const [loading, setLoading] = useState(true);

  const stats = useMemo<CharacterStats | null>(() => {
    if (!wallet) return null;

    // TODO: Replace with actual on-chain deposit/creator data
    // For now, derive from mock pool data to prove the system works
    const created = pools.filter(p => p.creator === wallet);
    const joined: BoardingPool[] = []; // TODO: filter by user's deposits

    const poolsLaunched = created.filter(p => p.status === 'launched').length;
    const poolsFailed = created.filter(p => p.status === 'failed').length;
    const finalized = poolsLaunched + poolsFailed;
    const successRate = finalized > 0 ? Math.round((poolsLaunched / finalized) * 100) : 0;

    const totalCommitted = 0; // TODO: sum of user deposits
    const totalRefunded = 0;  // TODO: sum of claimed refunds
    const totalAtRisk = 0;    // TODO: sum of deposits in active pools
    const creatorEarnings = created
      .filter(p => p.status === 'launched')
      .reduce((sum, p) => sum + p.totalDeposited * 0.05, 0);

    const base: Omit<CharacterStats, 'rank' | 'title' | 'xp'> = {
      wallet,
      poolsCreated: created.length,
      poolsJoined: joined.length,
      poolsLaunched,
      poolsFailed,
      totalCommitted,
      totalRefunded,
      totalAtRisk,
      creatorEarnings,
      successRate,
      avgCommitSize: joined.length > 0 ? totalCommitted / joined.length : 0,
    };

    const { rank, title } = getRank(joined.length, created.length, poolsLaunched);

    // Calculate XP
    let xp = 0;
    xp += joined.length * XP.JOIN_POOL;
    xp += created.length * XP.CREATE_POOL;
    xp += poolsLaunched * XP.POOL_LAUNCHED;
    if (joined.length > 0) xp += XP.FIRST_DEPOSIT;

    return { ...base, rank, title, xp };
  }, [wallet, pools]);

  useEffect(() => {
    // Simulate loading
    const t = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(t);
  }, [wallet]);

  const badges = useMemo(() => {
    if (!stats) return [];
    return computeBadges(stats);
  }, [stats]);

  return { stats, badges, loading };
}

// ============================================================================
// Rank progression for UI
// ============================================================================

export const RANK_PROGRESSION: { rank: CharacterRank; minPools: number; icon: string; color: string }[] = [
  { rank: 'stowaway',   minPools: 0,  icon: '🐀', color: '#6e7b8b' },
  { rank: 'deckhand',   minPools: 1,  icon: '🧹', color: '#c9d1d9' },
  { rank: 'sailor',     minPools: 3,  icon: '⛵', color: '#88c0ff' },
  { rank: 'boatswain',  minPools: 6,  icon: '🪢', color: '#7ee787' },
  { rank: 'navigator',  minPools: 11, icon: '🧭', color: '#a78bfa' },
  { rank: 'captain',    minPools: 21, icon: '🎖️', color: '#fbbf24' },
  { rank: 'admiral',    minPools: 50, icon: '⭐', color: '#f97316' },
  { rank: 'shipwright', minPools: 5,  icon: '🔨', color: '#ec4899' },
];
