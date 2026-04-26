"use client";
import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

interface CreateBoardingProps {
  onBack: () => void;
  onCreate: () => void;
}

const MODES = {
  blitz:  { label: 'BLITZ',  duration: 0.5, icon: '💥', desc: '30 min. Narrative is hot, send it.' },
  flash:  { label: 'FLASH',  duration: 4,   icon: '⚡', desc: '4 hours. Quick launch window.' },
  voyage: { label: 'VOYAGE', duration: 72,  icon: '🧭', desc: '72 hours. Let the crew assemble.' },
} as const;

export default function CreateBoarding({ onBack, onCreate }: CreateBoardingProps) {
  const { connected } = useWallet();
  const [step, setStep] = useState(1);
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenSupply, setTokenSupply] = useState('1000000000');
  const [hardCap, setHardCap] = useState('80');
  const [perWalletCap, setPerWalletCap] = useState('2');
  const [mode, setMode] = useState<'blitz' | 'flash' | 'voyage'>('flash');
  const [access, setAccess] = useState<'public' | 'crew'>('public');
  const [crewList, setCrewList] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const duration = MODES[mode].duration;
  const minWallets = Math.ceil(parseFloat(hardCap || '0') / parseFloat(perWalletCap || '1'));
  const crewCount = crewList.split('\n').filter(l => l.trim()).length;

  const handleSubmit = async () => {
    if (!connected) return;
    setSubmitting(true);
    // TODO: create_pool instruction via Anchor
    setTimeout(() => { setSubmitting(false); onCreate(); }, 2000);
  };

  const inputCls = "w-full p-3 bg-bg-input border border-border-primary rounded-lg text-white text-sm font-mono";

  return (
    <div className="fade-up">
      <button onClick={onBack} className="text-[11px] text-text-dim hover:text-primary transition-colors mb-6 cursor-pointer">
        ← BACK
      </button>

      <h1 className="font-heading text-[24px] font-bold text-white mb-6">Create Boarding</h1>

      {/* Steps */}
      <div className="flex mb-6 relative">
        <div className="absolute top-[16px] left-[70px] right-[70px] h-px bg-border-primary">
          <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${((step - 1) / 2) * 100}%` }} />
        </div>
        {['Token', 'Pool', 'Launch'].map((label, i) => (
          <div key={i} className="flex-1 flex flex-col items-center z-[1]">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step > i + 1
                ? 'bg-primary text-bg-base'
                : step === i + 1
                ? 'bg-bg-glass border-2 border-primary text-primary shadow-[0_0_15px_rgba(136,192,255,0.2)]'
                : 'bg-bg-input border border-border-primary text-text-dim'
            }`}>
              {step > i + 1 ? '✓' : i + 1}
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
                <label className="block text-[8px] text-primary mb-1.5 tracking-[2px]">SYMBOL *</label>
                <input type="text" value={tokenSymbol} onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g. MOON" maxLength={10} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className="block text-[8px] text-primary mb-1.5 tracking-[2px]">TOTAL SUPPLY *</label>
                <input type="number" value={tokenSupply} onChange={(e) => setTokenSupply(e.target.value)}
                  placeholder="1000000000" className={inputCls} />
                <p className="text-[9px] text-text-dim mt-1">All tokens go into the presale. On success, they pair with SOL on Raydium.</p>
              </div>
              <div>
                <label className="block text-[8px] text-primary mb-1.5 tracking-[2px]">IMAGE</label>
                <div className="h-[100px] bg-bg-input border-2 border-dashed border-[rgba(136,192,255,0.15)] rounded-lg flex flex-col items-center justify-center text-text-dim text-[11px] cursor-pointer hover:border-primary/30 transition-colors">
                  <span className="text-2xl mb-1 opacity-40">🚢</span>
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

        {/* Step 2: Pool */}
        {step === 2 && (
          <div className="fade-in">
            <h2 className="font-heading text-base font-semibold text-white mb-5 flex items-center gap-2">
              <span className="text-primary text-sm">02</span> Pool Parameters
            </h2>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-[8px] text-primary mb-1.5 tracking-[2px]">HARD CAP (SOL)</label>
                <input type="number" value={hardCap} onChange={(e) => setHardCap(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-[8px] text-primary mb-1.5 tracking-[2px]">PER WALLET (SOL)</label>
                <input type="number" value={perWalletCap} onChange={(e) => setPerWalletCap(e.target.value)} className={inputCls} />
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
                  <span>🌊</span>
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
                  <span>🔒</span>
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

            {/* Derived */}
            <div className="mt-4 p-3.5 bg-bg-input rounded-xl border border-[rgba(136,192,255,0.08)]">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[8px] text-text-dim tracking-[1px] mb-0.5">MIN WALLETS</div>
                  <div className="text-base font-heading font-bold text-white tabular-nums">{minWallets}</div>
                </div>
                <div>
                  <div className="text-[8px] text-text-dim tracking-[1px] mb-0.5">TO LP (92.5%)</div>
                  <div className="text-base font-heading font-bold text-primary tabular-nums">{(parseFloat(hardCap || '0') * 0.925).toFixed(1)} SOL</div>
                </div>
                <div>
                  <div className="text-[8px] text-text-dim tracking-[1px] mb-0.5">YOU GET (2.5%)</div>
                  <div className="text-base font-heading font-bold text-success tabular-nums">{(parseFloat(hardCap || '0') * 0.025).toFixed(1)} SOL</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="fade-in">
            <h2 className="font-heading text-base font-semibold text-white mb-5 flex items-center gap-2">
              <span className="text-primary text-sm">03</span> Review & Launch
            </h2>

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
                  { k: 'Access',   v: access === 'crew' ? `🔒 Crew (${crewCount})` : '🌊 Public' },
                  { k: 'Creation Fee', v: '0.5 SOL (non-refundable)' },
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
                    <span className="text-base font-heading font-bold text-burn">0.5 SOL</span>
                  </div>
                  <p className="text-[9px] text-text-dim mt-1.5">Paid upfront to open the pool. You get it back 8x if funded (5% creator fee).</p>
                </div>

                <div className="glow p-4 bg-gradient-to-br from-[rgba(136,192,255,0.1)] to-[rgba(136,192,255,0.03)] border border-primary/15 rounded-xl mb-3">
                  <div className="text-[8px] text-primary tracking-[2px] mb-2">ON SUCCESS</div>
                  <div className="space-y-1.5">
                    <div className="text-[7px] text-text-dim tracking-[1px] mb-1">SOL SPLIT</div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-text-dim">92.5% → Raydium LP</span>
                      <span className="text-[9px] text-primary font-semibold">{(parseFloat(hardCap) * 0.925).toFixed(1)} SOL</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-text-dim">5% → Platform</span>
                      <span className="text-[9px] text-white">{(parseFloat(hardCap) * 0.05).toFixed(1)} SOL</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-text-dim">2.5% → You</span>
                      <span className="text-[9px] text-success font-semibold">{(parseFloat(hardCap) * 0.025).toFixed(1)} SOL</span>
                    </div>
                    <div className="h-px bg-[rgba(136,192,255,0.08)] my-1" />
                    <div className="text-[7px] text-text-dim tracking-[1px] mb-1">TOKEN SPLIT</div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-text-dim">60% → Presale buyers</span>
                      <span className="text-[9px] text-white font-semibold">{((parseInt(tokenSupply || '0') * 0.6) / 1e6).toFixed(0)}M</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-text-dim">35% → LP (burned)</span>
                      <span className="text-[9px] text-primary font-semibold">{((parseInt(tokenSupply || '0') * 0.35) / 1e6).toFixed(0)}M</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-text-dim">5% → You (dev bag)</span>
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
                <p className="text-[8px] text-text-dim text-center mt-1.5">Mint + pool created in one tx</p>
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
            ← BACK
          </button>
          {step < 3 && (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && (!tokenName || !tokenSymbol)}
              className="px-5 py-2.5 bg-gradient-to-br from-primary to-primary-dark text-bg-base border-none rounded-lg text-[10px] font-semibold cursor-pointer"
            >
              CONTINUE →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
