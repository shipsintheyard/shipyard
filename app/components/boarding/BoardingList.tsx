"use client";
import { useState } from 'react';
import { type BoardingPool, type MyDeposit } from '../../hooks/useBoarding';
import BoardingCard from './BoardingCard';

type Filter = 'all' | 'active' | 'succeeded' | 'failed' | 'launched';
type ChainFilter = 'all' | 'sol' | 'base' | 'eth';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'active', label: 'LIVE' },
  { id: 'succeeded', label: 'FUNDED' },
  { id: 'launched', label: 'LAUNCHED' },
  { id: 'failed', label: 'FAILED' },
];

const CHAIN_FILTERS: { id: ChainFilter; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'sol', label: '◎ SOL' },
  { id: 'eth', label: 'Ξ ETH' },
  { id: 'base', label: '🔵 BASE' },
];

interface BoardingListProps {
  pools: BoardingPool[];
  loading: boolean;
  deposits: Map<string, MyDeposit>;
  onSelectPool: (pool: BoardingPool) => void;
}

// Sort priority: LIVE first, then FUNDED/LAUNCHED, then SUNK last
const STATUS_ORDER: Record<string, number> = {
  active: 0,
  succeeded: 1,
  launched: 2,
  failed: 3,
};

function sortPools(pools: BoardingPool[]): BoardingPool[] {
  return [...pools].sort((a, b) => {
    const oa = STATUS_ORDER[a.status] ?? 9;
    const ob = STATUS_ORDER[b.status] ?? 9;
    if (oa !== ob) return oa - ob;
    // Within same status, newest first (higher deadline = created more recently)
    return b.deadline - a.deadline;
  });
}

export default function BoardingList({ pools, loading, deposits, onSelectPool }: BoardingListProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [chainFilter, setChainFilter] = useState<ChainFilter>('all');

  const filtered = sortPools(
    pools
      .filter(p => filter === 'all' || p.status === filter)
      .filter(p => chainFilter === 'all' || p.chain === chainFilter)
  );

  return (
    <div className="fade-in">
      {/* Filters */}
      <div className="flex items-center gap-1.5 mb-6">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-md text-[12px] font-mono tracking-[1px] transition-all duration-200 ${
              filter === f.id
                ? 'bg-primary/12 text-primary border border-primary/30'
                : 'bg-transparent text-text-dim border border-transparent hover:text-text-muted'
            }`}
          >
            {f.label}
          </button>
        ))}

        <div className="w-px h-5 bg-border-primary mx-2" />

        {CHAIN_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setChainFilter(f.id)}
            className={`px-3 py-2 rounded-md text-[11px] font-mono tracking-[1px] transition-all duration-200 ${
              chainFilter === f.id
                ? 'bg-primary/12 text-primary border border-primary/30'
                : 'bg-transparent text-text-dim border border-transparent hover:text-text-muted'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-20 fade-in">
          <div className="text-2xl mb-3 animate-pulse">⛵</div>
          <div className="text-[13px] text-text-muted tracking-[2px]">LOADING POOLS...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 fade-in">
          <div className="text-2xl mb-3 opacity-30">🌊</div>
          <div className="text-[13px] text-text-muted tracking-[2px]">NO POOLS FOUND</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {filtered.map(pool => (
            <BoardingCard
              key={pool.publicKey}
              pool={pool}
              myDeposit={deposits.get(pool.publicKey)}
              onClick={() => onSelectPool(pool)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
