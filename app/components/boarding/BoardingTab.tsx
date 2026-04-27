"use client";
import { useState } from 'react';
import { useBoardingPools, type BoardingPool } from '../../hooks/useBoarding';
import BoardingList from './BoardingList';
import BoardingDetail from './BoardingDetail';
import CreateBoarding from './CreateBoarding';

type View = 'list' | 'detail' | 'create';

export default function BoardingTab() {
  const { pools, loading } = useBoardingPools();
  const [view, setView] = useState<View>('list');
  const [selectedPool, setSelectedPool] = useState<BoardingPool | null>(null);

  const handleSelectPool = (pool: BoardingPool) => {
    setSelectedPool(pool);
    setView('detail');
  };

  const handleBack = () => {
    setSelectedPool(null);
    setView('list');
  };

  const activePools = pools.filter(p => p.status === 'active');
  const totalRaised = pools.reduce((a, p) => a + (p.status !== 'failed' ? p.totalDeposited : 0), 0);

  return (
    <div className="animate-in px-10 py-10 max-w-[1200px] mx-auto">
      {view === 'list' && (
        <>
          {/* Header */}
          <div className="flex justify-between items-end mb-8">
            <div>
              <h1 className="font-heading text-[28px] font-bold text-white mb-1">Boarding</h1>
              <p className="text-[15px] text-text-muted">
                All-or-nothing presales. Hit the target or get 100% refunded.
              </p>
            </div>
            <button
              onClick={() => setView('create')}
              className="px-5 py-2.5 bg-gradient-to-br from-primary to-primary-dark text-bg-base border-none rounded-lg font-heading text-[11px] font-bold cursor-pointer tracking-[1px] shadow-[0_2px_15px_rgba(136,192,255,0.25)] hover:shadow-[0_4px_25px_rgba(136,192,255,0.4)] transition-shadow"
            >
              + CREATE
            </button>
          </div>

          {/* Quick stats — compact row */}
          <div className="flex gap-6 mb-7 px-1">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-heading font-bold text-primary tabular-nums">{activePools.length}</span>
              <span className="text-[12px] text-text-muted tracking-[1px]">LIVE</span>
            </div>
            <div className="w-px h-5 bg-border-primary self-center" />
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-heading font-bold text-white tabular-nums">{totalRaised.toFixed(0)}</span>
              <span className="text-[12px] text-text-muted tracking-[1px]">SOL RAISED</span>
            </div>
            <div className="w-px h-5 bg-border-primary self-center" />
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-heading font-bold text-success tabular-nums">{pools.filter(p => p.status === 'launched').length}</span>
              <span className="text-[12px] text-text-muted tracking-[1px]">LAUNCHED</span>
            </div>
          </div>

          <BoardingList pools={pools} loading={loading} onSelectPool={handleSelectPool} />
        </>
      )}

      {view === 'detail' && selectedPool && (
        <BoardingDetail pool={selectedPool} onBack={handleBack} />
      )}

      {view === 'create' && (
        <CreateBoarding onBack={handleBack} onCreate={handleBack} />
      )}
    </div>
  );
}
