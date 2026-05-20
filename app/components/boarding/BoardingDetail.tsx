"use client";
import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAccount } from 'wagmi';
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import { type BoardingPool, type MyDeposit, useCountdown } from '../../hooks/useBoarding';
import { useBoardingProgram } from '../../hooks/useAnchorProgram';
import { useEVMTransactions } from '../../hooks/useEVMTransactions';
import { BOARDING_PROGRAM_ID } from '../../lib/boarding-idl';
import { BASE_EXPLORER } from '../../lib/evm-contracts';

interface BoardingDetailProps {
  pool: BoardingPool;
  myDeposit?: MyDeposit;
  onBack: () => void;
}

export default function BoardingDetail({ pool, myDeposit, onBack }: BoardingDetailProps) {
  // Chain helpers
  const isEVM = pool.chain === 'base' || pool.chain === 'eth';
  const currency = isEVM ? 'ETH' : 'SOL';
  const dex = isEVM ? 'Uniswap' : 'Raydium';

  // Solana hooks (always called for hook rules)
  const { connected: solConnected, publicKey, signTransaction } = useWallet();
  const { program, connection } = useBoardingProgram();

  // EVM hooks (always called for hook rules)
  const { address: evmAddress, isConnected: evmConnected } = useAccount();
  const evmTx = useEVMTransactions();

  // Unified connected state
  const connected = isEVM ? evmConnected : solConnected;

  const timeLeft = useCountdown(pool.deadline);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositing, setDepositing] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [txLink, setTxLink] = useState<string | null>(null);

  const progress = (pool.totalDeposited / pool.hardCap) * 100;
  const isExpired = pool.deadline < Math.floor(Date.now() / 1000);
  const isActive = pool.status === 'active' && !isExpired;
  const isAwaitingFinalize = pool.status === 'active' && isExpired;
  const isFailed = pool.status === 'failed';
  const isDemo = pool.publicKey.startsWith('demo_');

  // Extract EVM poolId from publicKey format "base_0", "base_1", etc.
  const evmPoolId = isEVM ? parseInt(pool.publicKey.split('_')[1]) : 0;

  const handleDeposit = async () => {
    if (!connected || isDemo) return;
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0 || amount > pool.perWalletCap) return;

    setDepositing(true);
    setTxStatus(null);
    setTxLink(null);

    try {
      if (isEVM) {
        const { tx } = await evmTx.deposit({ poolId: evmPoolId, amount });
        setTxStatus(`Deposited ${amount} ${currency}`);
        setTxLink(BASE_EXPLORER.tx(tx));
      } else {
        if (!publicKey) return;
        const poolPubkey = new PublicKey(pool.publicKey);
        const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

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
          .accounts({
            pool: poolPubkey,
            depositAccount: depositPda,
            solVault,
            crewPass: null,
            depositor: publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .transaction();

        tx.feePayer = publicKey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        const signed = await signTransaction!(tx);
        const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
        await connection.confirmTransaction(sig, 'confirmed');
        setTxStatus(`Deposited ${amount} SOL`);
        setTxLink(`https://solscan.io/tx/${sig}?cluster=devnet`);
      }
      setDepositAmount('');
    } catch (err: any) {
      console.error('[boarding] deposit error:', err);
      setTxStatus(`Error: ${err.message?.slice(0, 80) || 'Transaction failed'}`);
    } finally {
      setDepositing(false);
    }
  };

  const handleRefund = async () => {
    if (!connected || isDemo) return;

    setRefunding(true);
    setTxStatus(null);
    setTxLink(null);

    try {
      if (isEVM) {
        const { tx } = await evmTx.claimRefund({ poolId: evmPoolId });
        setTxStatus('Refund claimed! Returned to your wallet.');
        setTxLink(BASE_EXPLORER.tx(tx));
      } else {
        if (!publicKey) return;
        const poolPubkey = new PublicKey(pool.publicKey);
        const programId = new PublicKey(BOARDING_PROGRAM_ID);

        const [depositPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('deposit'), poolPubkey.toBuffer(), publicKey.toBuffer()],
          programId
        );
        const [solVault] = PublicKey.findProgramAddressSync(
          [Buffer.from('sol_vault'), poolPubkey.toBuffer()],
          programId
        );

        const tx = await program.methods
          .claimRefund()
          .accounts({
            pool: poolPubkey,
            depositAccount: depositPda,
            solVault,
            depositor: publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .transaction();

        tx.feePayer = publicKey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        const signed = await signTransaction!(tx);
        const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
        await connection.confirmTransaction(sig, 'confirmed');
        setTxStatus('Refund claimed! SOL returned to your wallet.');
        setTxLink(`https://solscan.io/tx/${sig}?cluster=devnet`);
      }
    } catch (err: any) {
      console.error('[boarding] refund error:', err);
      const logs = err?.logs?.join('\n') || '';
      const msg = err.message || 'Transaction failed';
      setTxStatus(`Error: ${msg.slice(0, 120)}${logs ? '\n' + logs.slice(0, 200) : ''}`);
    } finally {
      setRefunding(false);
    }
  };

  // Chain badge for header
  const chainBadge = pool.chain === 'sol'
    ? { icon: '◎', label: 'SOLANA', color: 'text-[#9945FF] bg-[#9945FF]/10 border-[#9945FF]/25' }
    : pool.chain === 'base'
    ? { icon: '🔵', label: 'BASE', color: 'text-[#0052FF] bg-[#0052FF]/10 border-[#0052FF]/25' }
    : { icon: 'Ξ', label: 'ETHEREUM', color: 'text-[#627EEA] bg-[#627EEA]/10 border-[#627EEA]/25' };

  return (
    <div className="fade-up">
      <button
        onClick={onBack}
        className="text-[13px] text-text-muted hover:text-primary transition-colors mb-6 cursor-pointer"
      >
        &larr; BACK
      </button>

      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl border ${
            isFailed
              ? 'bg-burn/8 border-burn/15'
              : 'bg-primary/8 border-[rgba(136,192,255,0.12)]'
          }`}>
            {isFailed ? '\u{1F6DF}' : pool.mode === 'blitz' ? '\uD83D\uDCA5' : pool.mode === 'flash' ? '\u26A1' : '\uD83E\uDDED'}
          </div>
          <div>
            <h1 className={`font-heading text-[28px] font-bold leading-tight ${
              isFailed ? 'text-text-muted line-through decoration-burn/40 decoration-2' : 'text-white'
            }`}>{pool.tokenName}</h1>
            <div className="flex items-center gap-2 text-[14px] text-text-muted font-mono">
              <span>${pool.tokenSymbol} · {pool.mode === 'blitz' ? 'Blitz' : pool.mode === 'flash' ? 'Flash' : 'Voyage'}</span>
              {pool.access === 'crew' ? <span> · Crew</span> : null}
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-[0.5px] border ${chainBadge.color}`}>
                {chainBadge.icon} {chainBadge.label}
              </span>
              {isDemo && <span className="text-burn ml-2">(DEMO)</span>}
            </div>
          </div>
        </div>
        {isActive && (
          <div className="text-right">
            <div className="text-[11px] text-text-muted tracking-[2px] mb-1">TIME LEFT</div>
            <div className="font-mono text-xl font-bold text-primary tabular-nums">{timeLeft}</div>
          </div>
        )}
        {isAwaitingFinalize && (
          <div className="text-right">
            <div className="text-[11px] text-[#f59e0b] tracking-[2px] mb-1">STATUS</div>
            <div className="font-heading text-xl font-bold text-[#f59e0b] animate-pulse">EXPIRED</div>
          </div>
        )}
        {isFailed && (
          <div className="text-right">
            <div className="text-[11px] text-burn tracking-[2px] mb-1">STATUS</div>
            <div className="font-heading text-xl font-bold text-burn">SUNK</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-6">
        {/* Left — pool info */}
        <div>
          {/* Progress */}
          <div className="p-6 bg-bg-glass border border-[rgba(136,192,255,0.1)] rounded-xl mb-5">
            <div className="flex justify-between items-end mb-4">
              <div>
                <div className="text-[11px] text-text-muted tracking-[2px] mb-1">RAISED</div>
                <div className="font-heading text-[32px] font-bold text-white leading-none tabular-nums">
                  {pool.totalDeposited} <span className="text-lg text-text-muted">/ {pool.hardCap} {currency}</span>
                </div>
              </div>
              <span className="font-heading text-[32px] font-bold text-primary tabular-nums">{Math.round(progress)}%</span>
            </div>

            <div className="h-3.5 bg-[rgba(136,192,255,0.08)] rounded-full overflow-hidden mb-5">
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
                { label: 'HARD CAP', value: `${pool.hardCap} ${currency}` },
                { label: 'PER WALLET', value: `${pool.perWalletCap} ${currency}` },
                { label: 'WALLETS', value: pool.minWallets > 0 ? `${pool.participantCount}/${pool.minWallets}` : `${pool.participantCount}` },
                { label: 'SUPPLY', value: `${(pool.tokenSupply / 1e6).toFixed(0)}M` },
              ].map((stat, i) => (
                <div key={i} className="p-3 bg-bg-input rounded-lg">
                  <div className="text-[11px] text-text-muted tracking-[1px] mb-1">{stat.label}</div>
                  <div className="text-sm text-white font-semibold tabular-nums">{stat.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* How it works */}
          <div className="p-6 bg-bg-glass border border-[rgba(136,192,255,0.1)] rounded-xl">
            <div className="text-[11px] text-primary tracking-[2px] mb-4">HOW IT WORKS</div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { n: '01', title: 'COMMIT', desc: `Up to ${pool.perWalletCap} ${currency}` },
                { n: '02', title: 'HIT TARGET', desc: `${pool.hardCap} ${currency}${pool.minWallets > 0 ? ` from ${pool.minWallets}+ wallets` : ''}` },
                { n: '03', title: 'LAUNCH', desc: `Claim 60% of tokens. 35% + ${currency} \u2192 LP (burned).` },
              ].map((s, i) => (
                <div key={i} className="p-4 bg-bg-input rounded-lg">
                  <div className="text-[12px] text-primary/40 font-heading font-bold mb-1">{s.n}</div>
                  <div className="text-[13px] text-white font-semibold mb-1">{s.title}</div>
                  <div className="text-[12px] text-text-muted leading-snug">{s.desc}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 p-3 bg-burn/5 border border-burn/15 rounded-lg">
              <div className="text-[13px] text-burn">
                Miss the target? 100% refund. No fees taken.
              </div>
            </div>
          </div>
        </div>

        {/* Right — actions */}
        <div>
          {/* Tx status toast */}
          {txStatus && (
            <div className={`mb-4 p-3.5 rounded-lg text-[13px] font-mono ${
              txStatus.startsWith('Error')
                ? 'bg-burn/10 border border-burn/20 text-burn'
                : 'bg-success/10 border border-success/20 text-success'
            }`}>
              {txStatus}
              {txLink && (
                <a href={txLink} target="_blank" rel="noopener noreferrer"
                  className="block mt-1 text-[11px] underline opacity-70 hover:opacity-100">
                  View on explorer &rarr;
                </a>
              )}
            </div>
          )}

          {/* Deposit */}
          {isActive && (
            <div className="p-6 bg-bg-glass border border-primary/15 rounded-xl mb-4">
              {pool.access === 'crew' && (
                <div className="flex items-center gap-2 mb-4 p-2.5 bg-[#34d399]/5 border border-[#34d399]/15 rounded-lg">
                  <span className="text-[13px] text-[#34d399]">🔒 Crew only — invite required</span>
                </div>
              )}
              <div className="text-[11px] text-primary tracking-[2px] mb-4 font-semibold">BOARD THIS VESSEL</div>

              {isDemo && (
                <div className="mb-4 p-3 bg-burn/5 border border-burn/15 rounded-lg">
                  <div className="text-[12px] text-burn">Demo pool — connect wallet + create a real pool to deposit</div>
                </div>
              )}

              {/* Allocation boxes */}
              <label className="block text-[11px] text-text-muted tracking-[2px] mb-2.5">SELECT ALLOCATION</label>
              <div className="grid grid-cols-4 gap-2.5 mb-4">
                {(isEVM
                  ? [
                      { amount: 0.01, label: '0.01', tag: null },
                      { amount: 0.025, label: '0.025', tag: null },
                      { amount: 0.05, label: '0.05', tag: null },
                      { amount: 0.1, label: '0.1', tag: 'MAX' },
                    ]
                  : [
                      { amount: 0.5, label: '0.5', tag: null },
                      { amount: 1, label: '1', tag: null },
                      { amount: 1.5, label: '1.5', tag: null },
                      { amount: 2, label: '2', tag: 'MAX' },
                    ]
                ).filter(a => a.amount <= pool.perWalletCap).map((alloc) => {
                  const selected = depositAmount === String(alloc.amount);
                  return (
                    <button
                      key={alloc.amount}
                      onClick={() => setDepositAmount(selected ? '' : String(alloc.amount))}
                      disabled={isDemo}
                      className={`relative p-3.5 rounded-xl text-center transition-all duration-200 cursor-pointer disabled:opacity-40 ${
                        selected
                          ? 'bg-primary/12 border-2 border-primary shadow-[0_0_20px_rgba(136,192,255,0.15)]'
                          : 'bg-bg-input border border-border-primary hover:border-primary/30'
                      }`}
                    >
                      {alloc.tag && (
                        <span className={`absolute -top-2 right-1.5 px-2 py-0.5 rounded text-[9px] font-bold tracking-[1px] ${
                          selected ? 'bg-primary text-bg-base' : 'bg-primary/15 text-primary'
                        }`}>
                          {alloc.tag}
                        </span>
                      )}
                      <div className={`font-heading text-xl font-bold tabular-nums ${selected ? 'text-primary' : 'text-white'}`}>
                        {alloc.label}
                      </div>
                      <div className="text-[11px] text-text-muted">{currency}</div>
                    </button>
                  );
                })}
              </div>

              {/* What you get */}
              {depositAmount && (
                <div className="p-3.5 bg-bg-input rounded-lg mb-4 space-y-2 fade-in">
                  <div className="flex justify-between">
                    <span className="text-[12px] text-text-muted">You commit</span>
                    <span className="text-[12px] text-white font-semibold">{depositAmount} {currency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[12px] text-text-muted">You receive (pro-rata)</span>
                    <span className="text-[12px] text-primary font-semibold">
                      {((parseFloat(depositAmount) / pool.hardCap) * pool.tokenSupply * 0.6 / 1e6).toFixed(1)}M ${pool.tokenSymbol}
                    </span>
                  </div>
                  <div className="h-px bg-[rgba(136,192,255,0.08)]" />
                  <div className="flex justify-between">
                    <span className="text-[12px] text-text-muted">92.5% {currency} &rarr; LP (burned)</span>
                    <span className="text-[12px] text-text-subtle">trustless</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[12px] text-text-muted">Miss target?</span>
                    <span className="text-[12px] text-success font-semibold">100% refund</span>
                  </div>
                </div>
              )}

              <button
                onClick={handleDeposit}
                disabled={!connected || depositing || isDemo || !depositAmount}
                className={`w-full py-4 rounded-lg font-heading text-base font-bold tracking-[1px] transition-all duration-200 ${
                  connected && !isDemo && depositAmount
                    ? 'bg-gradient-to-br from-primary to-primary-dark text-bg-base cursor-pointer shadow-[0_2px_20px_rgba(136,192,255,0.3)] hover:shadow-[0_4px_30px_rgba(136,192,255,0.5)]'
                    : 'bg-primary/8 text-text-dim cursor-not-allowed border border-border-primary'
                }`}
              >
                {!connected ? 'CONNECT WALLET' : depositing ? 'BOARDING...' : isDemo ? 'DEMO POOL' : !depositAmount ? 'SELECT AMOUNT' : `COMMIT ${currency}`}
              </button>
            </div>
          )}

          {/* Expired — awaiting finalization */}
          {isAwaitingFinalize && (
            <div className="p-6 bg-bg-glass border-2 border-[#f59e0b]/30 rounded-xl mb-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl animate-pulse">⏳</span>
                <div>
                  <div className="text-[11px] text-[#f59e0b] tracking-[2px] font-bold">POOL EXPIRED</div>
                  <div className="text-[13px] text-text-muted">Timer ran out — finalizing shortly</div>
                </div>
              </div>
              <div className="p-4 bg-[#f59e0b]/5 border border-[#f59e0b]/15 rounded-lg">
                <div className="text-[13px] text-text-muted">
                  {pool.totalDeposited >= pool.hardCap
                    ? 'Target was hit! Pool will be marked as funded and queued for launch.'
                    : `Only ${pool.totalDeposited} of ${pool.hardCap} ${currency} raised. Pool will be marked as sunk and deposits refundable.`
                  }
                </div>
                <div className="text-[12px] text-text-dim mt-2">
                  Auto-finalization runs every few minutes. No action needed.
                </div>
              </div>
            </div>
          )}

          {/* Refund — sunk vessel */}
          {isFailed && (
            <div className="relative p-6 rounded-xl mb-4 overflow-hidden border-2 border-burn/30 bg-[rgba(15,18,22,0.95)]">
              {/* Bold red X overlay */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
                <line x1="5" y1="5" x2="95" y2="95" stroke="#dc2626" strokeWidth="2" strokeOpacity="0.15" strokeLinecap="round" />
                <line x1="95" y1="5" x2="5" y2="95" stroke="#dc2626" strokeWidth="2" strokeOpacity="0.15" strokeLinecap="round" />
              </svg>
              {/* Water effect at bottom */}
              <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none opacity-20"
                style={{ background: 'linear-gradient(to top, rgba(30,80,120,0.6), transparent)' }}
              />

              <div className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{'\u{1F6DF}'}</span>
                  <div>
                    <div className="text-[11px] text-burn tracking-[2px] font-bold">VESSEL SUNK</div>
                    <div className="text-[13px] text-text-muted">Didn&apos;t hit {pool.hardCap} {currency} target</div>
                  </div>
                </div>

                {/* State 1: Already claimed */}
                {myDeposit?.claimed && (
                  <div className="p-4 bg-success/5 border border-success/20 rounded-lg">
                    <div className="text-[14px] text-success font-semibold mb-1">Refund claimed</div>
                    <div className="text-[13px] text-text-muted">
                      Your {myDeposit.amount} {currency} was returned to your wallet.
                    </div>
                  </div>
                )}

                {/* State 2: Has deposit or might have deposit — show claim button */}
                {!myDeposit?.claimed && (
                  <>
                    <div className="p-4 bg-burn/5 border border-burn/15 rounded-lg mb-4">
                      {myDeposit ? (
                        <>
                          <div className="text-[14px] text-burn font-semibold mb-1">
                            Your {myDeposit.amount} {currency} is safe
                          </div>
                          <div className="text-[13px] text-text-muted">
                            Deposits are held in a trustless vault. Claim your full refund below — no fees taken.
                          </div>
                        </>
                      ) : (
                        <div className="text-[13px] text-text-muted">
                          If you deposited to this pool, claim your refund below.
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleRefund}
                      disabled={!connected || refunding || isDemo}
                      className={`w-full py-4 rounded-lg font-heading text-lg font-bold tracking-[1px] transition-all duration-200 ${
                        connected && !isDemo
                          ? 'bg-gradient-to-r from-burn to-[#dc2626] text-white cursor-pointer shadow-[0_2px_25px_rgba(249,115,22,0.3)] hover:shadow-[0_4px_35px_rgba(249,115,22,0.5)]'
                          : 'bg-burn/8 text-text-dim cursor-not-allowed border border-burn/15'
                      }`}
                    >
                      {!connected ? 'CONNECT WALLET' : refunding ? 'CLAIMING...' : myDeposit ? `CLAIM ${myDeposit.amount} ${currency} REFUND` : 'CLAIM REFUND'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Succeeded */}
          {pool.status === 'succeeded' && (
            <div className="p-6 bg-bg-glass border border-success/20 rounded-xl mb-4">
              <div className="text-[11px] text-success tracking-[2px] mb-2 font-semibold">TARGET REACHED</div>
              <p className="text-[14px] text-text-muted">
                {pool.hardCap} {currency} hit. Awaiting {dex} launch...
              </p>
            </div>
          )}

          {/* Launched */}
          {pool.status === 'launched' && (
            <div className="p-6 bg-bg-glass border border-[#a78bfa]/20 rounded-xl mb-4">
              <div className="text-[11px] text-[#a78bfa] tracking-[2px] mb-2 font-semibold">LIVE ON {dex.toUpperCase()}</div>
              <p className="text-[14px] text-text-muted mb-4">LP created and burned. This vessel is sailing.</p>
              <button className="w-full py-3 bg-[#a78bfa]/8 text-[#a78bfa] border border-[#a78bfa]/20 rounded-lg text-[13px] font-semibold cursor-pointer hover:bg-[#a78bfa]/15 transition-colors">
                VIEW ON {dex.toUpperCase()} &rarr;
              </button>
            </div>
          )}

          {/* Creator */}
          <div className="p-4 bg-bg-glass border border-[rgba(136,192,255,0.1)] rounded-xl">
            <div className="text-[11px] text-text-muted tracking-[2px] mb-2">CREATOR</div>
            <div className="text-sm text-white font-mono">
              {pool.creator.slice(0, 4)}...{pool.creator.slice(-4)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
