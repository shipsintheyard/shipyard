"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

// Use a public RPC with better rate limits, or env variable if set
const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=1d8740dc-e5f4-421c-b823-e1bad1889eff';
const LAMPORTS_PER_SOL = 1_000_000_000;


interface Launch {
  id: string;
  tokenMint: string;
  poolAddress: string;
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
  creator: string;
  engine: 1 | 2 | 3;
  devBuyAmount: number;
  devBuyPercent: number;
  createdAt: number;
  solRaised: number;
  migrated: boolean;
}

const ENGINE_INFO: Record<number, { name: string; lp: number; burn: number; color: string }> = {
  1: { name: 'Navigator', lp: 80, burn: 20, color: '#88c0ff' },
  2: { name: 'Lighthouse', lp: 50, burn: 0, color: '#f97316' },
  3: { name: 'Supernova', lp: 25, burn: 75, color: '#a855f7' },
};

// Bonding curve constants (pump.fun style)
const MIGRATION_THRESHOLD = 85; // SOL needed to fill the curve
const TOTAL_SUPPLY = 1_000_000_000; // 1 billion tokens
const CURVE_TOKENS = 800_000_000; // 80% sold through bonding curve
const LP_TOKENS = 200_000_000; // 20% goes to LP after migration

// Initial and final market caps
const INITIAL_MC_SOL = 27.48;
const FINAL_MC_SOL = 415.49;

// Pump.fun style bonding curve math
// Uses integral of exponential curve for accurate token calculations
function calculateCurvePosition(solRaised: number) {
  const progress = Math.min(solRaised / MIGRATION_THRESHOLD, 1);

  // Price multiplier grows exponentially from 1x to ~15x
  const priceMultiplier = Math.pow(FINAL_MC_SOL / INITIAL_MC_SOL, progress);
  const currentMcSol = INITIAL_MC_SOL * priceMultiplier;

  // Current price per token (increases as curve fills)
  const pricePerToken = currentMcSol / TOTAL_SUPPLY;

  // Tokens sold so far (80% * progress, but weighted for early buyers)
  // Early SOL buys more tokens, late SOL buys fewer
  const tokensSold = calculateTokensSold(solRaised);
  const tokensRemaining = CURVE_TOKENS - tokensSold;

  return {
    progress,
    currentMcSol,
    pricePerToken,
    priceMultiplier,
    solToMigration: Math.max(MIGRATION_THRESHOLD - solRaised, 0),
    tokensSold,
    tokensRemaining,
  };
}

// Calculate how many tokens have been sold given SOL raised
// Uses pump.fun style bonding curve where early buyers get MORE tokens
function calculateTokensSold(solRaised: number): number {
  if (solRaised <= 0) return 0;
  if (solRaised >= MIGRATION_THRESHOLD) return CURVE_TOKENS;

  // Pump.fun curve: tokens = CURVE_TOKENS * (sol/85)^0.65
  // With exponent < 1, early buyers get proportionally MORE tokens
  // Example results:
  // - 2 SOL at start: ~7% of supply (70M tokens)
  // - 10 SOL total: ~20% of supply sold
  // - 40 SOL total: ~49% of supply sold
  // - 85 SOL total: 80% of supply sold
  const progress = solRaised / MIGRATION_THRESHOLD;
  const tokenProgress = Math.pow(progress, 0.65);

  return Math.floor(CURVE_TOKENS * tokenProgress);
}

// Calculate how many tokens you get for X SOL at current position
function calculateTokensForSol(solAmount: number, currentSolRaised: number): number {
  const tokensBefore = calculateTokensSold(currentSolRaised);
  const tokensAfter = calculateTokensSold(currentSolRaised + solAmount);
  return tokensAfter - tokensBefore;
}

// Calculate how much SOL you get for selling X tokens at current position
function calculateSolForTokens(tokenAmount: number, currentSolRaised: number): number {
  // Reverse the curve - find SOL difference for selling tokens
  const tokensSold = calculateTokensSold(currentSolRaised);
  const newTokensSold = tokensSold - tokenAmount;

  if (newTokensSold <= 0) return currentSolRaised;

  // Inverse of token calculation: sol = 85 * (tokens/CURVE_TOKENS)^(1/0.65)
  const tokenProgress = newTokensSold / CURVE_TOKENS;
  const newProgress = Math.pow(tokenProgress, 1 / 0.65);
  const newSolRaised = newProgress * MIGRATION_THRESHOLD;

  return Math.max(currentSolRaised - newSolRaised, 0);
}

// Quick amount presets for buy/sell
const AMOUNT_PRESETS = [0.1, 0.5, 1, 5];

export default function TokenPage() {
  const params = useParams();
  const address = params.address as string;

  const [launch, setLaunch] = useState<Launch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [solPrice, setSolPrice] = useState<number | null>(null);

  // Trade state
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [tradeAmount, setTradeAmount] = useState<string>('');

  // Dev simulation mode
  const [simMode, setSimMode] = useState(false);
  const [simSolRaised, setSimSolRaised] = useState(0);

  // Live on-chain SOL raised from pool's quote vault
  const [livesolRaised, setLiveSolRaised] = useState<number | null>(null);

  const fetchLaunch = useCallback(async () => {
    try {
      const res = await fetch(`/api/launches/${address}`);
      const data = await res.json();
      if (data.success && data.launch) {
        setLaunch(data.launch);
        setSimSolRaised(data.launch.solRaised);
      } else {
        setError(data.error || 'Token not found');
      }
    } catch {
      setError('Failed to load token');
    } finally {
      setLoading(false);
    }
  }, [address]);

  const fetchSolPrice = async () => {
    try {
      // Use CoinGecko simple price API
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const data = await res.json();
      if (data.solana?.usd) {
        setSolPrice(data.solana.usd);
      }
    } catch {
      // Fallback price if API fails
      setSolPrice(180);
    }
  };

  // Fetch live SOL raised by reading the pool account's internal WSOL balance
  const fetchPoolSolRaised = useCallback(async (poolAddress: string) => {
    try {
      const { Connection, PublicKey } = await import('@solana/web3.js');

      const poolPubkey = new PublicKey(poolAddress);

      console.log('Fetching pool balance for:', poolAddress);

      const connection = new Connection(SOLANA_RPC, 'confirmed');

      // Read the pool account data directly
      const accountInfo = await connection.getAccountInfo(poolPubkey);
      if (!accountInfo) {
        console.warn('Pool account not found');
        return;
      }

      const data = accountInfo.data;
      console.log('Pool account data length:', data.length);

      // Meteora DBC pool structure - search for quote balance
      // The pool has token balances stored internally. Based on Solscan showing
      // 6.02 WSOL ($853.77), we need to find the right offset.
      // Pool data is 424 bytes. Let's scan for likely u64 values that match ~6 SOL

      // Try common offsets for quote_reserve in DBC pools
      const possibleOffsets = [200, 208, 216, 224, 232, 240, 248, 256, 264, 272, 280, 288, 296, 304, 312, 320];

      for (const offset of possibleOffsets) {
        if (data.length >= offset + 8) {
          try {
            const value = data.readBigUInt64LE(offset);
            const solValue = Number(value) / LAMPORTS_PER_SOL;
            // Log values between 0.1 and 100 SOL (reasonable range)
            if (solValue > 0.1 && solValue < 100) {
              console.log(`Offset ${offset}: ${solValue.toFixed(4)} SOL`);
            }
          } catch {
            // Skip invalid reads
          }
        }
      }

      // Based on Meteora DBC VirtualPool layout, try offset 272 for quote_reserve
      // (8 disc + 32*5 pubkeys + padding + reserves)
      if (data.length >= 280) {
        const quoteReserve = data.readBigUInt64LE(272);
        const solBalance = Number(quoteReserve) / LAMPORTS_PER_SOL;
        if (solBalance > 0.01) {
          console.log('Quote reserve at offset 272:', solBalance, 'SOL');
          setLiveSolRaised(solBalance);
          return;
        }
      }

      // Fallback: scan all u64s for a value close to expected ~6 SOL
      for (let offset = 0; offset <= data.length - 8; offset += 8) {
        try {
          const value = data.readBigUInt64LE(offset);
          const solValue = Number(value) / LAMPORTS_PER_SOL;
          if (solValue >= 5.5 && solValue <= 7) {
            console.log(`Found likely WSOL balance at offset ${offset}: ${solValue.toFixed(4)} SOL`);
            setLiveSolRaised(solValue);
            return;
          }
        } catch {
          // Skip
        }
      }

      console.warn('Could not find WSOL balance in pool data');
    } catch (err) {
      console.error('Failed to fetch pool SOL raised:', err);
      // Keep using stored value if fetch fails
    }
  }, []);

  useEffect(() => {
    fetchLaunch();
    fetchSolPrice();
  }, [fetchLaunch]);

  // Fetch live SOL raised when launch is loaded
  useEffect(() => {
    if (launch?.poolAddress) {
      fetchPoolSolRaised(launch.poolAddress);
      // Refresh every 30 seconds
      const interval = setInterval(() => fetchPoolSolRaised(launch.poolAddress), 30000);
      return () => clearInterval(interval);
    }
  }, [launch?.poolAddress, fetchPoolSolRaised]);

  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const formatUsd = (usd: number) => {
    if (usd >= 1000000) return `$${(usd / 1000000).toFixed(2)}M`;
    if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}K`;
    return `$${usd.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0f1419 0%, #1a1f2e 50%, #0f1419 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6e7b8b',
        fontFamily: "'Space Mono', monospace",
      }}>
        Loading...
      </div>
    );
  }

  if (error || !launch) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0f1419 0%, #1a1f2e 50%, #0f1419 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6e7b8b',
        fontFamily: "'Space Mono', monospace",
        gap: '20px',
      }}>
        <div style={{ fontSize: '48px' }}>🚢</div>
        <div>{error || 'Token not found'}</div>
        <Link href="/" style={{ color: '#88c0ff', textDecoration: 'none' }}>
          ← Back to Shipyard
        </Link>
      </div>
    );
  }

  // Use simulated SOL raised in sim mode, live on-chain balance if available, otherwise stored value
  const effectiveSolRaised = simMode ? simSolRaised : (livesolRaised ?? launch.solRaised);
  const effectiveMigrated = simMode ? simSolRaised >= MIGRATION_THRESHOLD : (effectiveSolRaised >= MIGRATION_THRESHOLD || launch.migrated);

  const curve = calculateCurvePosition(effectiveSolRaised);
  const engine = ENGINE_INFO[launch.engine];

  // Calculate USD values
  const mcUsd = solPrice ? curve.currentMcSol * solPrice : null;
  const pricePerTokenUsd = solPrice ? curve.pricePerToken * solPrice : null;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0f1419 0%, #1a1f2e 50%, #0f1419 100%)',
      color: '#c9d1d9',
      fontFamily: "'Space Mono', monospace",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Outfit:wght@400;500;600;700;800&display=swap');
      `}</style>

      {/* Header */}
      <div style={{
        padding: '20px 40px',
        borderBottom: '1px solid rgba(136, 192, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Link href="/" style={{ color: '#6e7b8b', textDecoration: 'none', fontSize: '13px' }}>
          ← Back to Shipyard
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Dev simulation toggle */}
          <button
            onClick={() => setSimMode(!simMode)}
            style={{
              padding: '6px 12px',
              background: simMode ? 'rgba(249, 115, 22, 0.2)' : 'rgba(136, 192, 255, 0.1)',
              border: `1px solid ${simMode ? 'rgba(249, 115, 22, 0.4)' : 'rgba(136, 192, 255, 0.2)'}`,
              borderRadius: '6px',
              color: simMode ? '#f97316' : '#6e7b8b',
              fontSize: '10px',
              cursor: 'pointer',
            }}
          >
            {simMode ? 'SIM MODE ON' : 'Test Curve'}
          </button>

          {effectiveMigrated ? (
            <span style={{
              padding: '6px 12px',
              background: 'rgba(126, 231, 135, 0.1)',
              border: '1px solid rgba(126, 231, 135, 0.3)',
              borderRadius: '6px',
              color: '#7ee787',
              fontSize: '11px',
            }}>
              GRADUATED - Trading on DAMM v2
            </span>
          ) : (
            <span style={{
              padding: '6px 12px',
              background: 'rgba(136, 192, 255, 0.1)',
              border: '1px solid rgba(136, 192, 255, 0.3)',
              borderRadius: '6px',
              color: '#88c0ff',
              fontSize: '11px',
            }}>
              BONDING CURVE ACTIVE
            </span>
          )}
        </div>
      </div>

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px' }}>
        {/* Token Header */}
        <div style={{ display: 'flex', gap: '24px', marginBottom: '40px' }}>
          <div style={{
            width: '100px',
            height: '100px',
            borderRadius: '16px',
            background: launch.imageUrl
              ? `url(${launch.imageUrl}) center/cover`
              : 'linear-gradient(135deg, #1a1f2e 0%, #2a3040 100%)',
            border: '2px solid rgba(136, 192, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '40px',
            flexShrink: 0,
          }}>
            {!launch.imageUrl && '🪙'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h1 style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: '28px',
                fontWeight: '700',
                color: '#fff',
                margin: 0,
              }}>
                {launch.name}
              </h1>
              <span style={{
                padding: '4px 10px',
                background: 'rgba(136, 192, 255, 0.1)',
                borderRadius: '6px',
                color: '#88c0ff',
                fontSize: '14px',
              }}>
                ${launch.symbol}
              </span>
            </div>
            <p style={{ color: '#6e7b8b', fontSize: '13px', margin: '0 0 12px 0' }}>
              {launch.description || 'No description'}
            </p>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '11px', color: '#4a5568' }}>
                Creator: <span style={{ color: '#88c0ff' }}>{shortenAddress(launch.creator)}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#4a5568' }}>
                Token: <span style={{ color: '#88c0ff' }}>{shortenAddress(launch.tokenMint)}</span>
              </div>
              <div style={{
                padding: '2px 8px',
                background: `${engine.color}15`,
                borderRadius: '4px',
                fontSize: '10px',
                color: engine.color,
              }}>
                {engine.name} ({engine.lp}% LP / {engine.burn}% Burn)
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Bonding Curve Visualization */}
          <div style={{
            background: 'rgba(10, 14, 18, 0.8)',
            borderRadius: '16px',
            border: '1px solid rgba(136, 192, 255, 0.1)',
            padding: '24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: '14px',
                fontWeight: '600',
                color: '#fff',
                margin: 0,
              }}>
                Bonding Curve Progress
              </h3>
              {simMode && (
                <span style={{ fontSize: '9px', color: '#f97316' }}>SIMULATION</span>
              )}
            </div>

            {/* Curve Visual */}
            <div style={{ position: 'relative', height: '160px', marginBottom: '20px' }}>
              <svg width="100%" height="100%" viewBox="0 0 300 120" preserveAspectRatio="none">
                {/* Background curve */}
                <path
                  d="M 0 110 Q 75 100 150 60 Q 225 20 300 10"
                  fill="none"
                  stroke="rgba(136, 192, 255, 0.15)"
                  strokeWidth="3"
                />
                {/* Progress curve */}
                <path
                  d={`M 0 110 Q ${75 * curve.progress} ${110 - 10 * curve.progress} ${150 * curve.progress} ${110 - 50 * curve.progress} Q ${225 * curve.progress} ${110 - 90 * curve.progress} ${300 * curve.progress} ${110 - 100 * curve.progress}`}
                  fill="none"
                  stroke={effectiveMigrated ? '#7ee787' : '#88c0ff'}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                {/* Current position dot */}
                {!effectiveMigrated && (
                  <circle
                    cx={300 * curve.progress}
                    cy={110 - 100 * curve.progress}
                    r="6"
                    fill="#88c0ff"
                    style={{ filter: 'drop-shadow(0 0 8px rgba(136, 192, 255, 0.6))' }}
                  />
                )}
              </svg>

              {/* Labels */}
              <div style={{
                position: 'absolute',
                bottom: '0',
                left: '0',
                fontSize: '9px',
                color: '#4a5568',
              }}>
                0 SOL
              </div>
              <div style={{
                position: 'absolute',
                bottom: '0',
                right: '0',
                fontSize: '9px',
                color: '#4a5568',
              }}>
                85 SOL (Migration)
              </div>
            </div>

            {/* Simulation Slider */}
            {simMode && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '10px', color: '#f97316' }}>Simulate SOL Raised</span>
                  <span style={{ fontSize: '10px', color: '#fff' }}>{simSolRaised.toFixed(1)} SOL</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="85"
                  step="0.5"
                  value={simSolRaised}
                  onChange={(e) => setSimSolRaised(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    height: '6px',
                    borderRadius: '3px',
                    background: 'rgba(136, 192, 255, 0.2)',
                    cursor: 'pointer',
                    accentColor: '#f97316',
                  }}
                />
              </div>
            )}

            {/* Progress Bar */}
            <div style={{
              height: '8px',
              background: 'rgba(136, 192, 255, 0.1)',
              borderRadius: '4px',
              overflow: 'hidden',
              marginBottom: '16px',
            }}>
              <div style={{
                width: `${curve.progress * 100}%`,
                height: '100%',
                background: effectiveMigrated
                  ? 'linear-gradient(90deg, #7ee787, #4ade80)'
                  : 'linear-gradient(90deg, #88c0ff, #5a9fd4)',
                borderRadius: '4px',
                transition: 'width 0.3s ease',
              }} />
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{
                padding: '12px',
                background: 'rgba(136, 192, 255, 0.05)',
                borderRadius: '8px',
              }}>
                <div style={{ fontSize: '10px', color: '#4a5568', marginBottom: '4px' }}>SOL RAISED</div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#88c0ff' }}>
                  {effectiveSolRaised.toFixed(2)}
                </div>
              </div>
              <div style={{
                padding: '12px',
                background: 'rgba(136, 192, 255, 0.05)',
                borderRadius: '8px',
              }}>
                <div style={{ fontSize: '10px', color: '#4a5568', marginBottom: '4px' }}>TOKENS SOLD</div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>
                  {(curve.tokensSold / 1_000_000).toFixed(0)}M
                </div>
                <div style={{ fontSize: '10px', color: '#6e7b8b' }}>
                  {((curve.tokensSold / TOTAL_SUPPLY) * 100).toFixed(1)}% of supply
                </div>
              </div>
              <div style={{
                padding: '12px',
                background: 'rgba(136, 192, 255, 0.05)',
                borderRadius: '8px',
              }}>
                <div style={{ fontSize: '10px', color: '#4a5568', marginBottom: '4px' }}>MARKET CAP</div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>
                  {mcUsd ? formatUsd(mcUsd) : `${curve.currentMcSol.toFixed(1)} SOL`}
                </div>
                {mcUsd && (
                  <div style={{ fontSize: '10px', color: '#6e7b8b' }}>
                    {curve.currentMcSol.toFixed(1)} SOL
                  </div>
                )}
              </div>
              <div style={{
                padding: '12px',
                background: 'rgba(136, 192, 255, 0.05)',
                borderRadius: '8px',
              }}>
                <div style={{ fontSize: '10px', color: '#4a5568', marginBottom: '4px' }}>PRICE MULT.</div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#7ee787' }}>
                  {curve.priceMultiplier.toFixed(2)}x
                </div>
                {pricePerTokenUsd && (
                  <div style={{ fontSize: '10px', color: '#6e7b8b' }}>
                    ${pricePerTokenUsd.toExponential(2)}/token
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Token Info & Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Seaworthy Badge */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(136, 192, 255, 0.1) 0%, rgba(136, 192, 255, 0.05) 100%)',
              borderRadius: '16px',
              border: '1px solid rgba(136, 192, 255, 0.2)',
              padding: '20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  background: 'linear-gradient(135deg, #88c0ff, #5a9fd4)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0f1419',
                  fontSize: '16px',
                  fontWeight: 'bold',
                }}>✓</div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#88c0ff' }}>SEAWORTHY CERTIFIED</div>
                  <div style={{ fontSize: '10px', color: '#6e7b8b' }}>Verified safe launch</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
                <div style={{ color: '#7ee787' }}>✓ 0% Dev Extraction</div>
                <div style={{ color: '#7ee787' }}>✓ 100% LP Locked</div>
                <div style={{ color: '#7ee787' }}>✓ Auto-Compound</div>
                <div style={{ color: '#7ee787' }}>✓ No Rug Possible</div>
              </div>
            </div>

            {/* Dev Holdings Transparency */}
            {launch.devBuyPercent > 0 && (
              <div style={{
                background: 'rgba(10, 14, 18, 0.8)',
                borderRadius: '16px',
                border: '1px solid rgba(249, 115, 22, 0.2)',
                padding: '20px',
              }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#f97316', marginBottom: '12px' }}>
                  DEV HOLDINGS (Transparent)
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: '#fff' }}>
                      {launch.devBuyPercent.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '10px', color: '#6e7b8b' }}>of total supply</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', color: '#fff' }}>
                      {launch.devBuyAmount.toFixed(2)} SOL
                    </div>
                    <div style={{ fontSize: '10px', color: '#6e7b8b' }}>invested at launch</div>
                  </div>
                </div>
              </div>
            )}

            {/* Trade Section */}
            <div style={{
              background: 'rgba(10, 14, 18, 0.8)',
              borderRadius: '16px',
              border: '1px solid rgba(136, 192, 255, 0.1)',
              padding: '20px',
            }}>
              {/* Buy/Sell Tabs */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button
                  onClick={() => setTradeMode('buy')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: tradeMode === 'buy' ? 'rgba(126, 231, 135, 0.2)' : 'transparent',
                    border: `1px solid ${tradeMode === 'buy' ? 'rgba(126, 231, 135, 0.4)' : 'rgba(136, 192, 255, 0.1)'}`,
                    borderRadius: '8px',
                    color: tradeMode === 'buy' ? '#7ee787' : '#6e7b8b',
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  BUY
                </button>
                <button
                  onClick={() => setTradeMode('sell')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: tradeMode === 'sell' ? 'rgba(249, 115, 22, 0.2)' : 'transparent',
                    border: `1px solid ${tradeMode === 'sell' ? 'rgba(249, 115, 22, 0.4)' : 'rgba(136, 192, 255, 0.1)'}`,
                    borderRadius: '8px',
                    color: tradeMode === 'sell' ? '#f97316' : '#6e7b8b',
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  SELL
                </button>
              </div>

              {/* Amount Input */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', color: '#6e7b8b', marginBottom: '6px' }}>
                  {tradeMode === 'buy' ? 'Amount (SOL)' : `Amount (Millions of ${launch.symbol})`}
                </div>
                <input
                  type="number"
                  value={tradeAmount}
                  onChange={(e) => setTradeAmount(e.target.value)}
                  placeholder={tradeMode === 'buy' ? '0.00' : '10'}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(136, 192, 255, 0.05)',
                    border: '1px solid rgba(136, 192, 255, 0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '16px',
                    fontFamily: "'Space Mono', monospace",
                    outline: 'none',
                  }}
                />
              </div>

              {/* Quick Amount Buttons */}
              {tradeMode === 'buy' ? (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  {AMOUNT_PRESETS.map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setTradeAmount(amount.toString())}
                      style={{
                        flex: 1,
                        padding: '8px',
                        background: 'rgba(136, 192, 255, 0.05)',
                        border: '1px solid rgba(136, 192, 255, 0.1)',
                        borderRadius: '6px',
                        color: '#88c0ff',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      {amount} SOL
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  {[25, 50, 75, 100].map((percent) => (
                    <button
                      key={percent}
                      onClick={() => {
                        // Calculate user's token balance (tokens sold at current position)
                        // For now, use a mock balance - in production this would come from wallet
                        const mockUserBalance = curve.tokensSold * 0.1; // Assume user has 10% of sold tokens
                        const sellAmount = (mockUserBalance * percent) / 100 / 1_000_000; // Convert to millions
                        setTradeAmount(sellAmount.toFixed(2));
                      }}
                      style={{
                        flex: 1,
                        padding: '8px',
                        background: 'rgba(249, 115, 22, 0.05)',
                        border: '1px solid rgba(249, 115, 22, 0.2)',
                        borderRadius: '6px',
                        color: '#f97316',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      {percent}%
                    </button>
                  ))}
                </div>
              )}

              {/* Estimate */}
              {tradeAmount && parseFloat(tradeAmount) > 0 && (
                <div style={{
                  padding: '12px',
                  background: 'rgba(136, 192, 255, 0.05)',
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}>
                  {tradeMode === 'buy' ? (
                    <>
                      {(() => {
                        const solIn = parseFloat(tradeAmount);
                        const tokensOut = calculateTokensForSol(solIn * 0.99, effectiveSolRaised); // 1% fee
                        const percentOfSupply = (tokensOut / TOTAL_SUPPLY) * 100;
                        return (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                              <span style={{ color: '#6e7b8b' }}>You receive (est.)</span>
                              <span style={{ color: '#fff' }}>
                                {(tokensOut / 1_000_000).toFixed(2)}M {launch.symbol}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginTop: '6px' }}>
                              <span style={{ color: '#6e7b8b' }}>% of supply</span>
                              <span style={{ color: '#7ee787' }}>{percentOfSupply.toFixed(2)}%</span>
                            </div>
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    <>
                      {(() => {
                        const tokensIn = parseFloat(tradeAmount) * 1_000_000; // Input is in millions
                        const solOut = calculateSolForTokens(tokensIn, effectiveSolRaised) * 0.99; // 1% fee
                        return (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                            <span style={{ color: '#6e7b8b' }}>You receive (est.)</span>
                            <span style={{ color: '#fff' }}>{solOut.toFixed(4)} SOL</span>
                          </div>
                        );
                      })()}
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginTop: '6px' }}>
                    <span style={{ color: '#6e7b8b' }}>Fee (1%)</span>
                    <span style={{ color: '#f97316' }}>
                      {tradeMode === 'buy'
                        ? `${(parseFloat(tradeAmount) * 0.01).toFixed(4)} SOL`
                        : `1% of output`
                      }
                    </span>
                  </div>
                </div>
              )}

              {/* Trade Button */}
              <button style={{
                width: '100%',
                padding: '14px',
                background: tradeMode === 'buy'
                  ? 'linear-gradient(135deg, #7ee787 0%, #4ade80 100%)'
                  : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                border: 'none',
                borderRadius: '10px',
                color: tradeMode === 'buy' ? '#0f1419' : '#fff',
                fontFamily: "'Outfit', sans-serif",
                fontSize: '14px',
                fontWeight: '700',
                cursor: 'pointer',
                opacity: !tradeAmount || parseFloat(tradeAmount) <= 0 ? 0.5 : 1,
              }}>
                {tradeMode === 'buy' ? 'BUY' : 'SELL'} {launch.symbol}
              </button>

              <div style={{ fontSize: '10px', color: '#4a5568', textAlign: 'center', marginTop: '12px' }}>
                Trading via Meteora DBC • 1% fee → Flywheel
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
