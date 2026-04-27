"use client";
import { type BoardingPool, useCountdown } from '../../hooks/useBoarding';

interface BoardingCardProps {
  pool: BoardingPool;
  onClick: () => void;
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  active:    { label: 'LIVE',     color: 'text-primary bg-primary/10 border-primary/25' },
  succeeded: { label: 'FUNDED',   color: 'text-success bg-success/10 border-success/25' },
  failed:    { label: 'SUNK',     color: 'text-burn bg-burn/10 border-burn/25' },
  launched:  { label: 'LAUNCHED', color: 'text-[#a78bfa] bg-[#a78bfa]/10 border-[#a78bfa]/25' },
};

export default function BoardingCard({ pool, onClick }: BoardingCardProps) {
  const timeLeft = useCountdown(pool.deadline);
  const progress = (pool.totalDeposited / pool.hardCap) * 100;
  const badge = STATUS_BADGE[pool.status] || STATUS_BADGE.active;
  const isFailed = pool.status === 'failed';

  return (
    <div
      onClick={onClick}
      className={`group relative p-6 rounded-xl cursor-pointer transition-all duration-300 overflow-hidden ${
        isFailed
          ? 'bg-[rgba(15,18,22,0.9)] border border-burn/20 hover:border-burn/40'
          : 'bg-bg-glass border border-[rgba(136,192,255,0.1)] hover:border-primary/30 hover:shadow-[0_0_40px_rgba(136,192,255,0.08)] hover:-translate-y-0.5'
      }`}
    >
      {/* Sunk overlay for failed pools */}
      {isFailed && (
        <>
          {/* Bold red X across the card */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
            <line x1="8" y1="8" x2="92" y2="92" stroke="#dc2626" strokeWidth="2.5" strokeOpacity="0.18" strokeLinecap="round" />
            <line x1="92" y1="8" x2="8" y2="92" stroke="#dc2626" strokeWidth="2.5" strokeOpacity="0.18" strokeLinecap="round" />
          </svg>
          {/* Sunken water overlay at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none opacity-30"
            style={{
              background: 'linear-gradient(to top, rgba(30,80,120,0.5), transparent)',
            }}
          />
        </>
      )}

      {/* Top row: icon + name + badges */}
      <div className="flex justify-between items-start mb-4 relative">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-lg flex items-center justify-center text-xl border transition-colors ${
            isFailed
              ? 'bg-burn/8 border-burn/15 grayscale-[50%]'
              : 'bg-primary/8 border-[rgba(136,192,255,0.12)] group-hover:border-primary/25'
          }`}>
            {isFailed ? '\u{1F6DF}' : pool.mode === 'blitz' ? '\uD83D\uDCA5' : pool.mode === 'flash' ? '\u26A1' : '\uD83E\uDDED'}
          </div>
          <div>
            <div className={`font-heading text-[17px] font-semibold leading-tight ${
              isFailed ? 'text-text-muted line-through decoration-burn/40' : 'text-white'
            }`}>{pool.tokenName}</div>
            <div className="text-[13px] text-text-muted font-mono">${pool.tokenSymbol}</div>
          </div>
        </div>
        <div className="flex gap-1.5">
          {pool.access === 'crew' && (
            <span className="px-2.5 py-1 rounded text-[10px] tracking-[1px] border text-[#34d399] bg-[#34d399]/8 border-[#34d399]/20">
              CREW
            </span>
          )}
          <span className={`px-2.5 py-1 rounded text-[10px] font-semibold tracking-[1px] border ${badge.color}`}>
            {badge.label}
          </span>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-4 relative">
        <div className="flex justify-between mb-2">
          <span className={`text-[13px] tabular-nums ${isFailed ? 'text-text-muted' : 'text-text-body'}`}>
            {pool.totalDeposited} <span className="text-text-muted">/ {pool.hardCap} SOL</span>
          </span>
          <span className={`text-[13px] font-semibold tabular-nums ${isFailed ? 'text-burn' : 'text-primary'}`}>
            {Math.round(progress)}%
          </span>
        </div>
        <div className="h-2 bg-[rgba(136,192,255,0.08)] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full progress-fill transition-[width] duration-500 ${
              isFailed
                ? 'bg-burn/50'
                : pool.status === 'launched'
                ? 'bg-[#a78bfa]'
                : 'bg-gradient-to-r from-primary/80 to-primary shadow-[0_0_8px_rgba(136,192,255,0.4)]'
            }`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      {/* Bottom stats */}
      <div className="flex justify-between items-end relative">
        <div className="flex gap-6">
          <div>
            <div className="text-[11px] text-text-muted tracking-[1px] mb-0.5">WALLETS</div>
            <div className={`text-sm font-semibold tabular-nums ${isFailed ? 'text-text-muted' : 'text-white'}`}>
              {pool.participantCount}<span className="text-text-muted font-normal">/{pool.minWallets}</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] text-text-muted tracking-[1px] mb-0.5">MAX</div>
            <div className={`text-sm font-semibold ${isFailed ? 'text-text-muted' : 'text-white'}`}>{pool.perWalletCap} SOL</div>
          </div>
        </div>
        {pool.status === 'active' && (
          <div className="text-sm font-mono text-primary font-semibold tabular-nums">
            {timeLeft}
          </div>
        )}
        {isFailed && (
          <div className="text-[13px] font-mono text-burn font-semibold">
            CLAIM REFUND &rarr;
          </div>
        )}
      </div>
    </div>
  );
}
