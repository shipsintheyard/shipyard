"use client";
import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import { type BoardingPool, useCountdown } from '../../hooks/useBoarding';
import { useBoardingProgram } from '../../hooks/useAnchorProgram';
import { BOARDING_PROGRAM_ID } from '../../lib/boarding-idl';

interface BoardingDetailProps {
  pool: BoardingPool;
  onBack: () => void;
}

export default function BoardingDetail({ pool, onBack }: BoardingDetailProps) {
  const { connected, publicKey, sendTransaction } = useWallet();
  const { program, connection } = useBoardingProgram();
  const timeLeft = useCountdown(pool.deadline);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositing, setDepositing] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  const progress = (pool.totalDeposited / pool.hardCap) * 100;
  const isActive = pool.status === 'active';
  const isFailed = pool.status === 'failed';
  const isDemo = pool.publicKey.startsWith('demo_');

  const handleDeposit = async () => {
    if (!connected || !publicKey || isDemo) return;
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0 || amount > pool.perWalletCap) return;

    setDepositing(true);
    setTxStatus(null);
    try {
      const poolPubkey = new PublicKey(pool.publicKey);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

      // Derive PDAs
      const [depositPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('deposit'), poolPubkey.toBuffer(), publicKey.toBuffer()],
        new PublicKey(BOARDING_PROGRAM_ID)
      );
      const [solVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('sol_vault'), poolPubkey.toBuffer()],
        new PublicKey(BOARDING_PROGRAM_ID)
      );

      const tx = await program.methods
        .deposit(new (await import('@coral-xyz/anchor')).BN(lamports))
        .accountsPartial({
          pool: poolPubkey,
          depositAccount: depositPda,
          solVault,
          depositor: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, 'confirmed');

      setTxStatus(`Deposited ${amount} SOL`);
      setDepositAmount('');
    } catch (err: any) {
      console.error('[boarding] deposit error:', err);
      setTxStatus(`Error: ${err.message?.slice(0, 80) || 'Transaction failed'}`);
    } finally {
      setDepositing(false);
    }
  };

  const handleRefund = async () => {
    if (!connected || !publicKey || isDemo) return;

    setRefunding(true);
    setTxStatus(null);
    try {
      const poolPubkey = new PublicKey(pool.publicKey);

      const [depositPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('deposit'), poolPubkey.toBuffer(), publicKey.toBuffer()],
        new PublicKey(BOARDING_PROGRAM_ID)
      );
      const [solVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('sol_vault'), poolPubkey.toBuffer()],
        new PublicKey(BOARDING_PROGRAM_ID)
      );

      const tx = await program.methods
        .claimRefund()
        .accounts({
          pool: poolPubkey,
          depositAccount: depositPda,
          solVault,
          depositor: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, 'confirmed');

      setTxStatus('Refund claimed!');
    } catch (err: any) {
      console.error('[boarding] refund error:', err);
      setTxStatus(`Error: ${err.message?.slice(0, 80) || 'Transaction failed'}`);
    } finally {
      setRefunding(false);
    }
  };

  return (
    <div className="fade-up">
      <button
        onClick={onBack}
        className="text-[11px] text-text-dim hover:text-primary transition-colors mb-6 cursor-pointer"
      >
        &larr; BACK
      </button>

      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 bg-primary/8 rounded-xl flex items-center justify-center text-xl border border-[rgba(136,192,255,0.1)]">
            {pool.mode === 'blitz' ? '\uD83D\uDCA5' : pool.mode === 'flash' ? '\u26A1' : '\uD83E\uDDED'}
          </div>
          <div>
            <h1 className="font-heading text-[24px] font-bold text-white leading-tight">{pool.tokenName}</h1>
            <div className="text-[11px] text-text-dim font-mono">
              ${pool.tokenSymbol} · {pool.mode === 'blitz' ? 'Blitz' : pool.mode === 'flash' ? 'Flash' : 'Voyage'}
              {pool.access === 'crew' ? ' · Crew' : ''}
              {isDemo && <span className="text-burn ml-2">(DEMO)</span>}
            </div>
          </div>
        </div>
        {isActive && (
          <div className="text-right">
            <div className="text-[8px] text-text-dim tracking-[2px] mb-0.5">TIME LEFT</div>
            <div className="font-mono text-lg font-bold text-primary tabular-nums">{timeLeft}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-5">
        {/* Left — pool info */}
        <div>
          {/* Progress */}
          <div className="p-5 bg-bg-glass border border-[rgba(136,192,255,0.08)] rounded-xl mb-4">
            <div className="flex justify-between items-end mb-3">
              <div>
                <div className="text-[8px] text-text-dim tracking-[2px] mb-1">RAISED</div>
                <div className="font-heading text-[28px] font-bold text-white leading-none tabular-nums">
                  {pool.totalDeposited} <span className="text-base text-text-dim">/ {pool.hardCap} SOL</span>
                </div>
              </div>
              <span className="font-heading text-[28px] font-bold text-primary tabular-nums">{Math.round(progress)}%</span>
            </div>

            <div className="h-3 bg-[rgba(136,192,255,0.06)] rounded-full overflow-hidden mb-4">
              <div
                className={`h-full rounded-full progress-fill ${
                  isFailed
                    ? 'bg-burn/60'
                    : 'bg-gradient-to-r from-primary/80 to-primary shadow-[0_0_12px_rgba(136,192,255,0.3)]'
                }`}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>

            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'HARD CAP', value: `${pool.hardCap} SOL` },
                { label: 'PER WALLET', value: `${pool.perWalletCap} SOL` },
                { label: 'WALLETS', value: `${pool.participantCount}/${pool.minWallets}` },
                { label: 'SUPPLY', value: `${(pool.tokenSupply / 1e6).toFixed(0)}M` },
              ].map((stat, i) => (
                <div key={i} className="p-2.5 bg-bg-input rounded-lg">
                  <div className="text-[7px] text-text-dim tracking-[1px] mb-0.5">{stat.label}</div>
                  <div className="text-xs text-white font-semibold tabular-nums">{stat.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* How it works */}
          <div className="p-5 bg-bg-glass border border-[rgba(136,192,255,0.08)] rounded-xl">
            <div className="text-[8px] text-primary tracking-[2px] mb-3">HOW IT WORKS</div>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { n: '01', title: 'COMMIT', desc: `Up to ${pool.perWalletCap} SOL` },
                { n: '02', title: 'HIT TARGET', desc: `${pool.hardCap} SOL from ${pool.minWallets}+ wallets` },
                { n: '03', title: 'LAUNCH', desc: 'Claim 60% of tokens. 35% + SOL \u2192 LP (burned).' },
              ].map((s, i) => (
                <div key={i} className="p-3 bg-bg-input rounded-lg">
                  <div className="text-[9px] text-primary/30 font-heading font-bold mb-1">{s.n}</div>
                  <div className="text-[10px] text-white font-semibold mb-0.5">{s.title}</div>
                  <div className="text-[9px] text-text-dim leading-snug">{s.desc}</div>
                </div>
              ))}
            </div>
            <div className="mt-2.5 p-2.5 bg-burn/5 border border-burn/10 rounded-lg">
              <div className="text-[9px] text-burn">
                Miss the target? 100% refund. No fees taken.
              </div>
            </div>
          </div>
        </div>

        {/* Right — actions */}
        <div>
          {/* Tx status toast */}
          {txStatus && (
            <div className={`mb-3 p-3 rounded-lg text-[11px] font-mono ${
              txStatus.startsWith('Error')
                ? 'bg-burn/10 border border-burn/20 text-burn'
                : 'bg-success/10 border border-success/20 text-success'
            }`}>
              {txStatus}
            </div>
          )}

          {/* Deposit */}
          {isActive && (
            <div className="p-5 bg-bg-glass border border-primary/15 rounded-xl mb-4">
              {pool.access === 'crew' && (
                <div className="flex items-center gap-2 mb-3 p-2 bg-[#34d399]/5 border border-[#34d399]/15 rounded-lg">
                  <span className="text-[10px] text-[#34d399]">🔒 Crew only — invite required</span>
                </div>
              )}
              <div className="text-[8px] text-primary tracking-[2px] mb-3">BOARD THIS VESSEL</div>

              {isDemo && (
                <div className="mb-3 p-2.5 bg-burn/5 border border-burn/15 rounded-lg">
                  <div className="text-[9px] text-burn">Demo pool — connect wallet + create a real pool to deposit</div>
                </div>
              )}

              <div className="mb-3">
                <label className="block text-[8px] text-text-dim tracking-[2px] mb-1.5">AMOUNT (SOL)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max={pool.perWalletCap}
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder={`Max ${pool.perWalletCap}`}
                    disabled={isDemo}
                    className="w-full p-3 bg-bg-input border border-border-primary rounded-lg text-white text-sm font-mono pr-16 disabled:opacity-40"
                  />
                  <button
                    onClick={() => setDepositAmount(String(pool.perWalletCap))}
                    disabled={isDemo}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-primary/10 text-primary text-[8px] rounded border border-primary/20 cursor-pointer hover:bg-primary/20 transition-colors disabled:opacity-40"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Fee breakdown */}
              <div className="p-2.5 bg-bg-input rounded-lg mb-3 space-y-1">
                <div className="flex justify-between">
                  <span className="text-[9px] text-text-dim">60% tokens &rarr; you (presale)</span>
                  <span className="text-[9px] text-white">claim after launch</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[9px] text-text-dim">35% tokens + 92.5% SOL &rarr; LP</span>
                  <span className="text-[9px] text-primary">burned</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[9px] text-text-dim">7.5% SOL &rarr; creator + platform</span>
                  <span className="text-[9px] text-text-muted">fees</span>
                </div>
              </div>

              <button
                onClick={handleDeposit}
                disabled={!connected || depositing || isDemo}
                className={`w-full py-3.5 rounded-lg font-heading text-sm font-bold tracking-[1px] transition-all duration-200 ${
                  connected && !isDemo
                    ? 'bg-gradient-to-br from-primary to-primary-dark text-bg-base cursor-pointer shadow-[0_2px_20px_rgba(136,192,255,0.3)] hover:shadow-[0_4px_30px_rgba(136,192,255,0.5)]'
                    : 'bg-primary/8 text-text-dim cursor-not-allowed border border-border-primary'
                }`}
              >
                {!connected ? 'CONNECT WALLET' : depositing ? 'BOARDING...' : isDemo ? 'DEMO POOL' : 'COMMIT SOL'}
              </button>
            </div>
          )}

          {/* Refund */}
          {isFailed && (
            <div className="p-5 bg-bg-glass border border-burn/20 rounded-xl mb-4">
              <div className="text-[8px] text-burn tracking-[2px] mb-2">POOL FAILED</div>
              <p className="text-[11px] text-text-muted mb-3">
                Didn&apos;t hit {pool.hardCap} SOL. Your deposit is fully refundable.
              </p>
              <button
                onClick={handleRefund}
                disabled={!connected || refunding || isDemo}
                className={`w-full py-3.5 rounded-lg font-heading text-sm font-bold tracking-[1px] ${
                  connected && !isDemo
                    ? 'bg-gradient-to-r from-burn to-burn-dark text-white cursor-pointer'
                    : 'bg-burn/8 text-text-dim cursor-not-allowed border border-burn/15'
                }`}
              >
                {connected ? (refunding ? 'CLAIMING...' : 'CLAIM REFUND') : 'CONNECT WALLET'}
              </button>
            </div>
          )}

          {/* Succeeded */}
          {pool.status === 'succeeded' && (
            <div className="p-5 bg-bg-glass border border-success/20 rounded-xl mb-4">
              <div className="text-[8px] text-success tracking-[2px] mb-2">TARGET REACHED</div>
              <p className="text-[11px] text-text-muted">
                {pool.hardCap} SOL hit. Awaiting Raydium launch...
              </p>
            </div>
          )}

          {/* Launched */}
          {pool.status === 'launched' && (
            <div className="p-5 bg-bg-glass border border-[#a78bfa]/20 rounded-xl mb-4">
              <div className="text-[8px] text-[#a78bfa] tracking-[2px] mb-2">LIVE ON RAYDIUM</div>
              <p className="text-[11px] text-text-muted mb-3">LP created and burned. This vessel is sailing.</p>
              <button className="w-full py-2.5 bg-[#a78bfa]/8 text-[#a78bfa] border border-[#a78bfa]/20 rounded-lg text-[11px] font-semibold cursor-pointer hover:bg-[#a78bfa]/15 transition-colors">
                VIEW ON RAYDIUM &rarr;
              </button>
            </div>
          )}

          {/* Creator */}
          <div className="p-4 bg-bg-glass border border-[rgba(136,192,255,0.08)] rounded-xl">
            <div className="text-[8px] text-text-dim tracking-[2px] mb-2">CREATOR</div>
            <div className="text-xs text-white font-mono">
              {pool.creator.slice(0, 4)}...{pool.creator.slice(-4)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
