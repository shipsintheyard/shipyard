"use client";
import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram, Keypair } from '@solana/web3.js';
import { useBoardingProgram } from '../../hooks/useAnchorProgram';
import {
  BOARDING_PROGRAM_ID,
  PLATFORM_TREASURY,
  V1_HARD_CAP_SOL,
  V1_PER_WALLET_SOL,
  V1_MIN_WALLETS,
  CREATION_FEE_SOL,
  MODE_DURATIONS,
} from '../../lib/boarding-idl';

interface CreateBoardingProps {
  onBack: () => void;
  onCreate: () => void;
}

const MODES = {
  blitz:  { label: 'BLITZ',  duration: 0.5, icon: '\uD83D\uDCA5', desc: '30 min. Narrative is hot, send it.' },
  flash:  { label: 'FLASH',  duration: 4,   icon: '\u26A1', desc: '4 hours. Quick launch window.' },
  voyage: { label: 'VOYAGE', duration: 72,  icon: '\uD83E\uDDED', desc: '72 hours. Let the crew assemble.' },
} as const;

export default function CreateBoarding({ onBack, onCreate }: CreateBoardingProps) {
  const { connected, publicKey, sendTransaction } = useWallet();
  const { program, connection } = useBoardingProgram();
  const [step, setStep] = useState(1);
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenSupply, setTokenSupply] = useState('1000000000');
  const [mode, setMode] = useState<'blitz' | 'flash' | 'voyage'>('flash');
  const [access, setAccess] = useState<'public' | 'crew'>('public');
  const [crewList, setCrewList] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // V1: Fixed raise params
  const hardCap = V1_HARD_CAP_SOL;
  const perWalletCap = V1_PER_WALLET_SOL;
  const minWallets = V1_MIN_WALLETS;

  const duration = MODES[mode].duration;
  const crewCount = crewList.split('\n').filter(l => l.trim()).length;

  const handleSubmit = async () => {
    if (!connected || !publicKey) return;
    setSubmitting(true);
    setTxStatus(null);

    try {
      const BN = (await import('@coral-xyz/anchor')).BN;
      const { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } = await import('@solana/spl-token');

      // For V1: creator needs to have already minted the token.
      // We'll need the token mint address. For now, show that this requires
      // a pre-existing mint. In V2 we'll inline the mint.
      // TODO: For now we'll create a test with a placeholder
      // The real flow: user enters their token mint address

      const hardCapLamports = new BN(hardCap * LAMPORTS_PER_SOL);
      const perWalletCapLamports = new BN(perWalletCap * LAMPORTS_PER_SOL);
      const durationSec = new BN(MODE_DURATIONS[mode]);
      const supplyRaw = new BN(parseInt(tokenSupply));
      const accessMode = access === 'crew' ? { crew: {} } : { public: {} };

      // TODO: For real usage, creator provides their existing token mint
      // This is the V1 placeholder — will add mint creation in V2
      setTxStatus('V1 requires an existing token mint. Full creation flow coming in V2.');

      // Uncomment when ready for real pool creation:
      /*
      const tokenMint = new PublicKey('YOUR_TOKEN_MINT');
      const programId = new PublicKey(BOARDING_PROGRAM_ID);

      const [poolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('boarding_pool'), tokenMint.toBuffer(), publicKey.toBuffer()],
        programId
      );
      const [tokenVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('token_vault'), poolPda.toBuffer()],
        programId
      );
      const [solVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('sol_vault'), poolPda.toBuffer()],
        programId
      );

      const tickerUpper = tokenSymbol.toUpperCase();
      const [tickerClaim] = PublicKey.findProgramAddressSync(
        [Buffer.from('ticker'), Buffer.from(tickerUpper)],
        programId
      );

      const creatorTokenAccount = await getAssociatedTokenAddress(tokenMint, publicKey);

      const tx = await program.methods
        .createPool(
          hardCapLamports,
          perWalletCapLamports,
          durationSec,
          supplyRaw,
          accessMode,
          tickerUpper
        )
        .accounts({
          pool: poolPda,
          tokenVault,
          solVault,
          tickerClaim,
          tokenMint,
          creatorTokenAccount,
          platformTreasury: new PublicKey(PLATFORM_TREASURY),
          creator: publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .transaction();

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, 'confirmed');

      setTxStatus('Pool created!');
      setTimeout(onCreate, 1500);
      */
    } catch (err: any) {
      console.error('[boarding] create_pool error:', err);
      setTxStatus(`Error: ${err.message?.slice(0, 100) || 'Failed'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full p-3 bg-bg-input border border-border-primary rounded-lg text-white text-sm font-mono";

  return (
    <div className="fade-up">
      <button onClick={onBack} className="text-[11px] text-text-dim hover:text-primary transition-colors mb-6 cursor-pointer">
        &larr; BACK
      </button>

      <h1 className="font-heading text-[24px] font-bold text-white mb-6">Create Boarding</h1>

      {/* Steps */}
      <div className="flex mb-6 relative">
        <div className="absolute top-[16px] left-[70px] right-[70px] h-px bg-border-primary">
          <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${((step - 1) / 2) * 100}%` }} />
        </div>
        {['Token', 'Config', 'Launch'].map((label, i) => (
          <div key={i} className="flex-1 flex flex-col items-center z-[1]">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step > i + 1
                ? 'bg-primary text-bg-base'
                : step === i + 1
                ? 'bg-bg-glass border-2 border-primary text-primary shadow-[0_0_15px_rgba(136,192,255,0.2)]'
                : 'bg-bg-input border border-border-primary text-text-dim'
            }`}>
              {step > i + 1 ? '\u2713' : i + 1}
            </div>
            <span className={`mt-2 text-[9px] tracking-[1px] ${step === i + 1 ? 'text-primary' : 'text-text-dim'}`}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Form */}
      <div className="rounded-xl p-6 bg-bg-glass border border-[rgba(136,192,255,0.08)]">

        {/* Step 1: Token */}
        {step === 1 && (
          <div className="fade-in">
            <h2 className="font-heading text-base font-semibold text-white mb-5 flex items-center gap-2">
              <span className="text-primary text-sm">01</span> Token Details
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[8px] text-primary mb-1.5 tracking-[2px]">NAME *</label>
                <input type="text" value={tokenName} onChange={(e) => setTokenName(e.target.value)}
                  placeholder="e.g. MOONBASE" className={inputCls} />
              </div>
              <div>
                <label className="block text-[8px] text-primary mb-1.5 tracking-[2px]">TICKER *</label>
                <input type="text" value={tokenSymbol} onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g. MOON" maxLength={10} className={inputCls} />
                <p className="text-[9px] text-text-dim mt-1">1-10 alphanumeric. Must be unique across all pools.</p>
              </div>
              <div className="col-span-2">
                <label className="block text-[8px] text-primary mb-1.5 tracking-[2px]">TOTAL SUPPLY *</label>
                <input type="number" value={tokenSupply} onChange={(e) => setTokenSupply(e.target.value)}
                  placeholder="1000000000" className={inputCls} />
                <p className="text-[9px] text-text-dim mt-1">60% presale &middot; 35% LP (burned) &middot; 5% dev bag</p>
              </div>
              <div>
                <label className="block text-[8px] text-primary mb-1.5 tracking-[2px]">IMAGE</label>
                <div className="h-[100px] bg-bg-input border-2 border-dashed border-[rgba(136,192,255,0.15)] rounded-lg flex flex-col items-center justify-center text-text-dim text-[11px] cursor-pointer hover:border-primary/30 transition-colors">
                  <span className="text-2xl mb-1 opacity-40">{'\uD83D\uDEA2'}</span>
                  Drop or click
                </div>
              </div>
              <div>
                <label className="block text-[8px] text-primary mb-1.5 tracking-[2px]">SOCIALS</label>
                <input type="text" placeholder="Twitter" className={`${inputCls} mb-2`} />
                <input type="text" placeholder="Telegram" className={inputCls} />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Config (simplified V1) */}
        {step === 2 && (
          <div className="fade-in">
            <h2 className="font-heading text-base font-semibold text-white mb-5 flex items-center gap-2">
              <span className="text-primary text-sm">02</span> Pool Config
            </h2>

            {/* V1 fixed params — shown but not editable */}
            <div className="mb-5 p-4 bg-bg-input rounded-xl border border-[rgba(136,192,255,0.08)]">
              <div className="text-[8px] text-text-dim tracking-[2px] mb-3">V1 FIXED PARAMETERS</div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-[8px] text-text-dim tracking-[1px] mb-0.5">HARD CAP</div>
                  <div className="text-lg font-heading font-bold text-white tabular-nums">{hardCap} SOL</div>
                </div>
                <div>
                  <div className="text-[8px] text-text-dim tracking-[1px] mb-0.5">PER WALLET</div>
                  <div className="text-lg font-heading font-bold text-white tabular-nums">{perWalletCap} SOL</div>
                </div>
                <div>
                  <div className="text-[8px] text-text-dim tracking-[1px] mb-0.5">MIN WALLETS</div>
                  <div className="text-lg font-heading font-bold text-white tabular-nums">{minWallets}</div>
                </div>
              </div>
            </div>

            {/* Mode */}
            <label className="block text-[8px] text-primary mb-2 tracking-[2px]">MODE</label>
            <div className="grid grid-cols-3 gap-3 mb-5">
              {(Object.entries(MODES) as [keyof typeof MODES, typeof MODES[keyof typeof MODES]][]).map(([key, m]) => (
                <div
                  key={key}
                  onClick={() => setMode(key)}
                  className={`p-4 rounded-xl cursor-pointer transition-all duration-200 ${
                    mode === key
                      ? 'bg-primary/10 border-2 border-primary shadow-[0_0_20px_rgba(136,192,255,0.15)]'
                      : 'bg-bg-input border border-border-primary hover:border-border-accent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="text-xl">{m.icon}</span>
                    <span className={`font-heading text-sm font-bold ${mode === key ? 'text-primary' : 'text-white'}`}>{m.label}</span>
                  </div>
                  <div className="text-[10px] text-text-muted">{m.desc}</div>
                </div>
              ))}
            </div>

            {/* Access */}
            <label className="block text-[8px] text-primary mb-2 tracking-[2px]">ACCESS</label>
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setAccess('public')}
                className={`p-3.5 rounded-xl cursor-pointer transition-all duration-200 ${
                  access === 'public' ? 'bg-primary/10 border-2 border-primary' : 'bg-bg-input border border-border-primary hover:border-border-accent'
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span>{'\uD83C\uDF0A'}</span>
                  <span className={`font-heading text-sm font-bold ${access === 'public' ? 'text-primary' : 'text-white'}`}>PUBLIC</span>
                </div>
                <div className="text-[9px] text-text-muted">Open to everyone</div>
              </div>
              <div
                onClick={() => setAccess('crew')}
                className={`p-3.5 rounded-xl cursor-pointer transition-all duration-200 ${
                  access === 'crew' ? 'bg-[#34d399]/10 border-2 border-[#34d399]' : 'bg-bg-input border border-border-primary hover:border-border-accent'
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span>{'\uD83D\uDD12'}</span>
                  <span className={`font-heading text-sm font-bold ${access === 'crew' ? 'text-[#34d399]' : 'text-white'}`}>CREW</span>
                </div>
                <div className="text-[9px] text-text-muted">Invite-only whitelist</div>
              </div>
            </div>

            {access === 'crew' && (
              <div className="mt-3 p-3.5 bg-bg-input rounded-xl border border-[#34d399]/15">
                <label className="block text-[8px] text-[#34d399] mb-1.5 tracking-[2px]">CREW LIST</label>
                <textarea
                  value={crewList}
                  onChange={(e) => setCrewList(e.target.value)}
                  placeholder={"Wallet addresses or @twitter, one per line"}
                  rows={4}
                  className="w-full p-2.5 bg-[rgba(5,10,14,0.8)] border border-[#34d399]/10 rounded-lg text-white text-xs font-mono resize-none"
                />
                <p className="text-[9px] text-text-dim mt-1">{crewCount} member{crewCount !== 1 ? 's' : ''}</p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="fade-in">
            <h2 className="font-heading text-base font-semibold text-white mb-5 flex items-center gap-2">
              <span className="text-primary text-sm">03</span> Review & Launch
            </h2>

            {txStatus && (
              <div className={`mb-4 p-3 rounded-lg text-[11px] font-mono ${
                txStatus.startsWith('Error')
                  ? 'bg-burn/10 border border-burn/20 text-burn'
                  : txStatus.startsWith('V1')
                  ? 'bg-[#f59e0b]/10 border border-[#f59e0b]/20 text-[#f59e0b]'
                  : 'bg-success/10 border border-success/20 text-success'
              }`}>
                {txStatus}
              </div>
            )}

            <div className="grid grid-cols-[1.4fr_1fr] gap-4">
              {/* Manifest */}
              <div className="p-4 bg-bg-input rounded-xl border border-[rgba(136,192,255,0.08)]">
                <div className="text-[8px] text-text-dim tracking-[2px] mb-3">MANIFEST</div>
                {[
                  { k: 'Token',    v: `${tokenName} ($${tokenSymbol})` },
                  { k: 'Supply',   v: `${(parseInt(tokenSupply || '0') / 1e6).toFixed(0)}M` },
                  { k: 'Hard Cap', v: `${hardCap} SOL` },
                  { k: 'Per Wallet', v: `${perWalletCap} SOL` },
                  { k: 'Wallets',  v: `${minWallets} minimum` },
                  { k: 'Mode',     v: `${MODES[mode].icon} ${MODES[mode].label} (${duration < 1 ? '30m' : duration + 'h'})` },
                  { k: 'Access',   v: access === 'crew' ? `\uD83D\uDD12 Crew (${crewCount})` : '\uD83C\uDF0A Public' },
                  { k: 'Creation Fee', v: `${CREATION_FEE_SOL} SOL (non-refundable)` },
                ].map((row, i) => (
                  <div key={i} className="flex justify-between py-2 border-b border-[rgba(136,192,255,0.06)] last:border-0">
                    <span className="text-[10px] text-text-muted">{row.k}</span>
                    <span className="text-[10px] text-white font-semibold">{row.v}</span>
                  </div>
                ))}
              </div>

              {/* Launch */}
              <div>
                {/* Creation fee */}
                <div className="p-3.5 bg-burn/5 border border-burn/15 rounded-xl mb-3">
                  <div className="text-[8px] text-burn tracking-[2px] mb-2">CREATION FEE</div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] text-text-muted">Non-refundable</span>
                    <span className="text-base font-heading font-bold text-burn">{CREATION_FEE_SOL} SOL</span>
                  </div>
                  <p className="text-[9px] text-text-dim mt-1.5">Paid upfront to open the pool. You get it back 4x if funded (2.5% creator fee on {hardCap} SOL = {hardCap * 0.025} SOL).</p>
                </div>

                <div className="glow p-4 bg-gradient-to-br from-[rgba(136,192,255,0.1)] to-[rgba(136,192,255,0.03)] border border-primary/15 rounded-xl mb-3">
                  <div className="text-[8px] text-primary tracking-[2px] mb-2">ON SUCCESS</div>
                  <div className="space-y-1.5">
                    <div className="text-[7px] text-text-dim tracking-[1px] mb-1">SOL SPLIT</div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-text-dim">92.5% &rarr; Raydium LP</span>
                      <span className="text-[9px] text-primary font-semibold">{(hardCap * 0.925).toFixed(1)} SOL</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-text-dim">5% &rarr; Platform</span>
                      <span className="text-[9px] text-white">{(hardCap * 0.05).toFixed(1)} SOL</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-text-dim">2.5% &rarr; You</span>
                      <span className="text-[9px] text-success font-semibold">{(hardCap * 0.025).toFixed(1)} SOL</span>
                    </div>
                    <div className="h-px bg-[rgba(136,192,255,0.08)] my-1" />
                    <div className="text-[7px] text-text-dim tracking-[1px] mb-1">TOKEN SPLIT</div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-text-dim">60% &rarr; Presale buyers</span>
                      <span className="text-[9px] text-white font-semibold">{((parseInt(tokenSupply || '0') * 0.6) / 1e6).toFixed(0)}M</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-text-dim">35% &rarr; LP (burned)</span>
                      <span className="text-[9px] text-primary font-semibold">{((parseInt(tokenSupply || '0') * 0.35) / 1e6).toFixed(0)}M</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-text-dim">5% &rarr; You (dev bag)</span>
                      <span className="text-[9px] text-success font-semibold">{((parseInt(tokenSupply || '0') * 0.05) / 1e6).toFixed(0)}M</span>
                    </div>
                  </div>
                </div>

                <div className="p-2.5 bg-bg-input border border-[rgba(136,192,255,0.08)] rounded-lg mb-3">
                  <div className="text-[9px] text-text-dim">On failure: depositors get 100% refund. Creation fee is not returned.</div>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={!connected || submitting}
                  className={`w-full py-3.5 rounded-lg font-heading text-sm font-bold tracking-[1px] transition-all ${
                    connected
                      ? 'bg-gradient-to-br from-primary to-primary-dark text-bg-base cursor-pointer shadow-[0_2px_20px_rgba(136,192,255,0.3)]'
                      : 'bg-primary/8 text-text-dim cursor-not-allowed border border-border-primary'
                  }`}
                >
                  {!connected ? 'CONNECT WALLET' : submitting ? 'LAUNCHING...' : 'LAUNCH BOARDING'}
                </button>
                <p className="text-[8px] text-text-dim text-center mt-1.5">Devnet &middot; V1 fixed params</p>
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <div className="flex justify-between mt-6 pt-4 border-t border-[rgba(136,192,255,0.08)]">
          <button
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
            className={`px-5 py-2.5 bg-transparent border border-border-primary rounded-lg text-[10px] ${
              step === 1 ? 'text-text-dim/30 cursor-not-allowed' : 'text-text-muted cursor-pointer hover:border-border-accent'
            }`}
          >
            &larr; BACK
          </button>
          {step < 3 && (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && (!tokenName || !tokenSymbol)}
              className="px-5 py-2.5 bg-gradient-to-br from-primary to-primary-dark text-bg-base border-none rounded-lg text-[10px] font-semibold cursor-pointer"
            >
              CONTINUE &rarr;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
