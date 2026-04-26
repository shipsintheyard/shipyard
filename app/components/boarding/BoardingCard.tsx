"use client";
import { type BoardingPool, useCountdown } from '../../hooks/useBoarding';

interface BoardingCardProps {
  pool: BoardingPool;
  onClick: () => void;
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  active:    { label: 'LIVE',     color: 'text-primary bg-primary/10 border-primary/25' },
  succeeded: { label: 'FUNDED',   color: 'text-success bg-success/10 border-success/25' },
  failed:    { label: 'FAILED',   color: 'text-burn bg-burn/10 border-burn/25' },
  launched:  { label: 'LAUNCHED', color: 'text-[#a78bfa] bg-[#a78bfa]/10 border-[#a78bfa]/25' },
};

export default function BoardingCard({ pool, onClick }: BoardingCardProps) {
  const timeLeft = useCountdown(pool.deadline);
  const progress = (pool.totalDeposited / pool.hardCap) * 100;
  const badge = STATUS_BADGE[pool.status] || STATUS_BADGE.active;

  return (
    <div
      onClick={onClick}
      className="group p-5 bg-bg-glass border border-[rgba(136,192,255,0.08)] rounded-xl cursor-pointer transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_40px_rgba(136,192,255,0.08)] hover:-translate-y-0.5"
    >
      {/* Top row: icon + name + badges */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/8 rounded-lg flex items-center justify-center text-lg border border-[rgba(136,192,255,0.1)] group-hover:border-primary/25 transition-colors">
            {pool.mode === 'blitz' ? '💥' : pool.mode === 'flash' ? '⚡' : '🧭'}
          </div>
          <div>
            <div className="font-heading text-[15px] font-semibold text-white leading-tight">{pool.tokenName}</div>
            <div className="text-[10px] text-text-dim font-mono">${pool.tokenSymbol}</div>
          </div>
        </div>
        <div className="flex gap-1.5">
          {pool.access === 'crew' && (
            <span className="px-2 py-0.5 rounded text-[8px] tracking-[1px] border text-[#34d399] bg-[#34d399]/8 border-[#34d399]/20">
              CREW
            </span>
          )}
          <span className={`px-2 py-0.5 rounded text-[8px] font-semibold tracking-[1px] border ${badge.color}`}>
            {badge.label}
          </span>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex justify-between mb-1.5">
          <span className="text-[10px] text-text-muted tabular-nums">
            {pool.totalDeposited} <span className="text-text-dim">/ {pool.hardCap} SOL</span>
          </span>
          <span className="text-[10px] text-primary font-semibold tabular-nums">{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 bg-[rgba(136,192,255,0.08)] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full progress-fill transition-[width] duration-500 ${
              pool.status === 'failed'
                ? 'bg-burn/60'
                : pool.status === 'launched'
                ? 'bg-[#a78bfa]'
                : 'bg-gradient-to-r from-primary/80 to-primary shadow-[0_0_8px_rgba(136,192,255,0.4)]'
            }`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      {/* Bottom stats */}
      <div className="flex justify-between items-end">
        <div className="flex gap-5">
          <div>
            <div className="text-[8px] text-text-dim tracking-[1px] mb-0.5">WALLETS</div>
            <div className="text-xs text-white font-semibold tabular-nums">
              {pool.participantCount}<span className="text-text-dim font-normal">/{pool.minWallets}</span>
            </div>
          </div>
          <div>
            <div className="text-[8px] text-text-dim tracking-[1px] mb-0.5">MAX</div>
            <div className="text-xs text-white font-semibold">{pool.perWalletCap} SOL</div>
          </div>
        </div>
        {pool.status === 'active' && (
          <div className="text-xs font-mono text-primary tabular-nums">
            {timeLeft}
          </div>
        )}
      </div>
    </div>
  );
}
