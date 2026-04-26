"use client";
import { useState } from 'react';
import { type BoardingPool } from '../../hooks/useBoarding';
import BoardingCard from './BoardingCard';

type Filter = 'all' | 'active' | 'succeeded' | 'failed' | 'launched';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'active', label: 'LIVE' },
  { id: 'succeeded', label: 'FUNDED' },
  { id: 'launched', label: 'LAUNCHED' },
  { id: 'failed', label: 'FAILED' },
];

interface BoardingListProps {
  pools: BoardingPool[];
  loading: boolean;
  onSelectPool: (pool: BoardingPool) => void;
}

export default function BoardingList({ pools, loading, onSelectPool }: BoardingListProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const filtered = filter === 'all' ? pools : pools.filter(p => p.status === filter);

  return (
    <div className="fade-in">
      {/* Filters */}
      <div className="flex gap-1.5 mb-6">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-md text-[10px] font-mono tracking-[1px] transition-all duration-200 ${
              filter === f.id
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
          <div className="text-[10px] text-text-dim tracking-[2px]">LOADING POOLS...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 fade-in">
          <div className="text-2xl mb-3 opacity-30">🌊</div>
          <div className="text-[10px] text-text-dim tracking-[2px]">NO POOLS FOUND</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {filtered.map(pool => (
            <BoardingCard
              key={pool.publicKey}
              pool={pool}
              onClick={() => onSelectPool(pool)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
