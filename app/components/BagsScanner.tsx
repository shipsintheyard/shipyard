"use client";

import React, { useState, useCallback } from 'react';

interface PoolFeeData {
  poolAddress: string;
  tokenMint?: string;
  symbol?: string;
  name?: string;
  quoteFees: number;
  baseFees: number;
  estimatedFees?: number;
  estimatedTotalFees?: number;
  claimedFeesSol?: number;
  unclaimedFeesSol?: number;
  volume24h?: number;
  liquidity?: number;
  marketCap?: number;
  fdv?: number;
  priceUsd?: string;
  isMigrated?: boolean;
  programId?: string;
  opportunityScore?: number;
  claimCount?: number;
  hasClaims?: boolean;
  ageHours?: number;
}

interface ScanResult {
  success: boolean;
  minFeesFilter: number;
  totalFound: number;
  pools: PoolFeeData[];
  note?: string;
  error?: string;
}

interface WalletPosition {
  mint: string;
  symbol: string;
  name: string;
  poolAddress: string;
  unclaimedFeesSol: number;
}

interface WalletResult {
  success: boolean;
  wallet: string;
  totals: {
    unclaimedFeesSol: number;
    positionCount: number;
  };
  positions: WalletPosition[];
}

export default function BagsScanner() {
  const [minFees, setMinFees] = useState('1');
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');

  const [walletAddress, setWalletAddress] = useState('');
  const [isCheckingWallet, setIsCheckingWallet] = useState(false);
  const [walletResults, setWalletResults] = useState<WalletResult | null>(null);
  const [walletError, setWalletError] = useState('');

  const [sortBy, setSortBy] = useState<'opportunity' | 'fees' | 'mcap'>('opportunity');
  const [scanMode, setScanMode] = useState<'estimated' | 'onchain'>('estimated');
  const [showOnlyUnclaimed, setShowOnlyUnclaimed] = useState(false);

  const runScan = useCallback(async () => {
    setIsScanning(true);
    setError('');
    setResults(null);

    try {
      const endpoint = scanMode === 'onchain'
        ? `/api/scan-unclaimed-fees?minFees=${minFees}&sortBy=${sortBy}&unclaimed=${showOnlyUnclaimed}`
        : `/api/scan-bags-fees?minFees=${minFees}&sortBy=${sortBy}&limit=50`;

      const response = await fetch(endpoint);
      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Scan failed');
        return;
      }

      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setIsScanning(false);
    }
  }, [minFees, sortBy, scanMode, showOnlyUnclaimed]);

  const checkWallet = useCallback(async () => {
    if (!walletAddress || walletAddress.length < 32) {
      setWalletError('Please enter a valid Solana wallet address');
      return;
    }

    setIsCheckingWallet(true);
    setWalletError('');
    setWalletResults(null);

    try {
      const response = await fetch(`/api/bags-fees?wallet=${walletAddress}`);
      const data = await response.json();

      if (!data.success) {
        setWalletError(data.error || 'Failed to check wallet');
        return;
      }

      setWalletResults(data);
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Check failed');
    } finally {
      setIsCheckingWallet(false);
    }
  }, [walletAddress]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0f1419 0%, #1a1f2e 50%, #0f1419 100%)',
      color: '#c9d1d9',
      fontFamily: "'Space Mono', monospace",
      position: 'relative',
      overflow: 'hidden'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Outfit:wght@400;500;600;700;800&display=swap');

        * { box-sizing: border-box; }

        @keyframes twinkle {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(136, 192, 255, 0.2); }
          50% { box-shadow: 0 0 40px rgba(136, 192, 255, 0.4); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .float { animation: float 6s ease-in-out infinite; }
        .glow { animation: glow 3s ease-in-out infinite; }
      `}</style>

      {/* Stars Background */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {[...Array(50)].map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: '2px',
              height: '2px',
              background: '#88c0ff',
              borderRadius: '50%',
              animation: `twinkle ${2 + Math.random() * 3}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 3}s`,
              opacity: 0.3
            }}
          />
        ))}
      </div>

      {/* Header */}
      <header style={{
        padding: '16px 40px',
        borderBottom: '1px solid rgba(136, 192, 255, 0.15)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(15, 20, 25, 0.9)',
        backdropFilter: 'blur(10px)',
        position: 'relative',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '14px', textDecoration: 'none' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(136, 192, 255, 0.3)'
            }}>
              <img src="/icon.png" alt="Shipyard" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div>
              <div style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: '20px',
                fontWeight: '700',
                letterSpacing: '1px',
                color: '#fff'
              }}>
                CARGO
              </div>
              <div style={{
                fontSize: '9px',
                color: '#88c0ff',
                letterSpacing: '3px'
              }}>
                BAGS FEE SCANNER
              </div>
            </div>
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main style={{
        maxWidth: '1100px',
        margin: '0 auto',
        padding: '40px 20px',
        position: 'relative',
        zIndex: 10
      }}>
        {/* Title Section */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h1 style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: '42px',
            fontWeight: '800',
            color: '#fff',
            margin: '0 0 12px 0',
            letterSpacing: '2px'
          }}>
            📦 CARGO
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#6e7b8b',
            letterSpacing: '2px'
          }}>
            SCAN BAGS.FM FOR UNCLAIMED FEES
          </p>
        </div>

        {/* Scan Controls Card */}
        <div style={{
          background: 'rgba(136, 192, 255, 0.03)',
          border: '1px solid rgba(136, 192, 255, 0.15)',
          borderRadius: '16px',
          padding: '28px',
          marginBottom: '24px'
        }}>
          <div style={{
            fontSize: '11px',
            color: '#88c0ff',
            letterSpacing: '3px',
            marginBottom: '20px',
            fontWeight: '600'
          }}>
            SCAN MODE
          </div>

          {/* Mode Toggle */}
          <div style={{
            display: 'flex',
            gap: '0',
            marginBottom: '16px',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid rgba(136, 192, 255, 0.2)',
            width: 'fit-content'
          }}>
            <button
              onClick={() => setScanMode('estimated')}
              style={{
                padding: '12px 24px',
                background: scanMode === 'estimated' ? 'rgba(136, 192, 255, 0.15)' : 'transparent',
                border: 'none',
                color: scanMode === 'estimated' ? '#88c0ff' : '#6e7b8b',
                fontFamily: "'Space Mono', monospace",
                fontSize: '11px',
                fontWeight: scanMode === 'estimated' ? '700' : '400',
                cursor: 'pointer',
                letterSpacing: '1px',
                transition: 'all 0.2s'
              }}
            >
              VOLUME ESTIMATE
            </button>
            <button
              onClick={() => setScanMode('onchain')}
              style={{
                padding: '12px 24px',
                background: scanMode === 'onchain' ? 'rgba(136, 192, 255, 0.15)' : 'transparent',
                border: 'none',
                color: scanMode === 'onchain' ? '#88c0ff' : '#6e7b8b',
                fontFamily: "'Space Mono', monospace",
                fontSize: '11px',
                fontWeight: scanMode === 'onchain' ? '700' : '400',
                cursor: 'pointer',
                letterSpacing: '1px',
                transition: 'all 0.2s'
              }}
            >
              ON-CHAIN CHECK
            </button>
          </div>

          <p style={{
            fontSize: '12px',
            color: '#6e7b8b',
            margin: '0 0 20px 0',
            fontStyle: 'italic'
          }}>
            {scanMode === 'estimated'
              ? 'Estimates fees from 24h trading volume (~1% of volume)'
              : 'Checks on-chain claim activity - shows claimed vs unclaimed'}
          </p>

          {/* Unclaimed Filter Checkbox */}
          {scanMode === 'onchain' && (
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '20px',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#88c0ff'
            }}>
              <input
                type="checkbox"
                checked={showOnlyUnclaimed}
                onChange={(e) => setShowOnlyUnclaimed(e.target.checked)}
                style={{
                  width: '18px',
                  height: '18px',
                  accentColor: '#88c0ff',
                  cursor: 'pointer'
                }}
              />
              <span>Only show pools with NO claims (alpha opportunities)</span>
            </label>
          )}

          {/* Scan Controls Row */}
          <div style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}>
            <input
              type="number"
              value={minFees}
              onChange={(e) => setMinFees(e.target.value)}
              min="0.1"
              step="0.1"
              placeholder="Min fees"
              style={{
                width: '100px',
                background: 'rgba(15, 20, 25, 0.6)',
                border: '1px solid rgba(136, 192, 255, 0.2)',
                borderRadius: '8px',
                padding: '14px 16px',
                fontFamily: "'Space Mono', monospace",
                fontSize: '14px',
                color: '#fff',
                outline: 'none'
              }}
            />
            <span style={{ color: '#6e7b8b', fontSize: '13px' }}>SOL min</span>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'opportunity' | 'fees' | 'mcap')}
              style={{
                background: 'rgba(15, 20, 25, 0.6)',
                border: '1px solid rgba(136, 192, 255, 0.2)',
                borderRadius: '8px',
                padding: '14px 16px',
                fontFamily: "'Space Mono', monospace",
                fontSize: '11px',
                color: '#fff',
                outline: 'none',
                cursor: 'pointer',
                minWidth: '180px'
              }}
            >
              <option value="opportunity">Best R/R (Fees/MCap)</option>
              <option value="fees">Highest Fees</option>
              <option value="mcap">Lowest MCap</option>
            </select>

            <button
              onClick={runScan}
              disabled={isScanning}
              style={{
                padding: '14px 32px',
                background: isScanning ? 'rgba(136, 192, 255, 0.3)' : 'linear-gradient(135deg, #88c0ff 0%, #5a9fd4 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#0f1419',
                fontFamily: "'Space Mono', monospace",
                fontSize: '12px',
                fontWeight: '700',
                cursor: isScanning ? 'not-allowed' : 'pointer',
                letterSpacing: '1px',
                marginLeft: 'auto',
                transition: 'all 0.2s',
                boxShadow: isScanning ? 'none' : '0 4px 20px rgba(136, 192, 255, 0.3)'
              }}
            >
              {isScanning ? 'SCANNING...' : '🔍 FIND ALPHA'}
            </button>
          </div>

          {error && (
            <div style={{
              marginTop: '16px',
              padding: '12px 16px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              color: '#ef4444',
              fontSize: '13px'
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Wallet Check Card */}
        <div style={{
          background: 'rgba(136, 192, 255, 0.03)',
          border: '1px solid rgba(136, 192, 255, 0.15)',
          borderRadius: '16px',
          padding: '28px',
          marginBottom: '24px'
        }}>
          <div style={{
            fontSize: '11px',
            color: '#88c0ff',
            letterSpacing: '3px',
            marginBottom: '16px',
            fontWeight: '600'
          }}>
            CHECK YOUR CLAIMABLE FEES
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="Enter wallet address..."
              style={{
                flex: 1,
                background: 'rgba(15, 20, 25, 0.6)',
                border: '1px solid rgba(136, 192, 255, 0.2)',
                borderRadius: '8px',
                padding: '14px 16px',
                fontFamily: "'Space Mono', monospace",
                fontSize: '13px',
                color: '#fff',
                outline: 'none'
              }}
            />
            <button
              onClick={checkWallet}
              disabled={isCheckingWallet}
              style={{
                padding: '14px 24px',
                background: isCheckingWallet ? 'rgba(136, 192, 255, 0.3)' : 'linear-gradient(135deg, #88c0ff 0%, #5a9fd4 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#0f1419',
                fontFamily: "'Space Mono', monospace",
                fontSize: '12px',
                fontWeight: '700',
                cursor: isCheckingWallet ? 'not-allowed' : 'pointer',
                letterSpacing: '1px'
              }}
            >
              {isCheckingWallet ? 'CHECKING...' : 'CHECK'}
            </button>
          </div>

          {walletError && (
            <div style={{
              marginTop: '16px',
              padding: '12px 16px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              color: '#ef4444',
              fontSize: '13px'
            }}>
              {walletError}
            </div>
          )}

          {walletResults && walletResults.positions.length > 0 && (
            <div style={{
              marginTop: '16px',
              padding: '20px',
              background: 'rgba(34, 197, 94, 0.05)',
              border: '1px solid rgba(34, 197, 94, 0.2)',
              borderRadius: '12px'
            }}>
              <div style={{ fontSize: '16px', marginBottom: '16px', color: '#fff' }}>
                Total Claimable: <span style={{ color: '#22c55e', fontWeight: '700' }}>
                  {walletResults.totals.unclaimedFeesSol.toFixed(4)} SOL
                </span>
                <span style={{ color: '#6e7b8b', fontSize: '12px', marginLeft: '8px' }}>
                  ({walletResults.totals.positionCount} positions)
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {walletResults.positions.map((pos, idx) => (
                  <div key={pos.poolAddress + idx} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '12px 16px',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '8px'
                  }}>
                    <span style={{ fontWeight: '600', color: '#fff', minWidth: '80px' }}>{pos.symbol}</span>
                    <span style={{ color: '#22c55e', fontWeight: '500', flex: 1 }}>
                      {pos.unclaimedFeesSol.toFixed(4)} SOL
                    </span>
                    <a
                      href={`https://bags.fm/token/${pos.mint}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '8px 16px',
                        background: 'rgba(136, 192, 255, 0.1)',
                        border: '1px solid rgba(136, 192, 255, 0.3)',
                        borderRadius: '6px',
                        color: '#88c0ff',
                        textDecoration: 'none',
                        fontSize: '11px',
                        fontWeight: '600'
                      }}
                    >
                      CLAIM
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {walletResults && walletResults.positions.length === 0 && (
            <div style={{
              marginTop: '16px',
              padding: '20px',
              background: 'rgba(107, 123, 143, 0.1)',
              borderRadius: '12px',
              color: '#6e7b8b',
              textAlign: 'center'
            }}>
              No claimable fees found for this wallet
            </div>
          )}
        </div>

        {/* Loading State */}
        {isScanning && (
          <div style={{
            textAlign: 'center',
            padding: '60px',
            color: '#6e7b8b'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '3px solid rgba(136, 192, 255, 0.2)',
              borderTopColor: '#88c0ff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 20px'
            }} />
            <p style={{ fontSize: '14px' }}>Scanning for valuable cargo...</p>
            <p style={{ fontSize: '12px', marginTop: '8px', opacity: 0.7 }}>This may take a moment</p>
          </div>
        )}

        {/* Results */}
        {results && !isScanning && (
          <div style={{
            background: 'rgba(136, 192, 255, 0.03)',
            border: '1px solid rgba(136, 192, 255, 0.15)',
            borderRadius: '16px',
            overflow: 'hidden'
          }}>
            {/* Results Header */}
            <div style={{
              padding: '20px 28px',
              borderBottom: '1px solid rgba(136, 192, 255, 0.15)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(136, 192, 255, 0.05)'
            }}>
              <span style={{
                fontSize: '13px',
                fontWeight: '700',
                color: '#88c0ff',
                letterSpacing: '1px'
              }}>
                POOLS WITH ≥ {results.minFeesFilter} SOL
              </span>
              <span style={{ fontSize: '12px', color: '#6e7b8b' }}>
                {results.totalFound} found
              </span>
            </div>

            {results.pools.length > 0 ? (
              <>
                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '13px'
                  }}>
                    <thead>
                      <tr style={{ background: 'rgba(0, 0, 0, 0.2)' }}>
                        <th style={{ padding: '14px 20px', textAlign: 'left', color: '#6e7b8b', fontSize: '10px', letterSpacing: '1px', fontWeight: '600' }}>TOKEN</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', color: '#6e7b8b', fontSize: '10px', letterSpacing: '1px', fontWeight: '600' }}>MCAP</th>
                        {scanMode === 'onchain' ? (
                          <>
                            <th style={{ padding: '14px 16px', textAlign: 'left', color: '#6e7b8b', fontSize: '10px', letterSpacing: '1px', fontWeight: '600' }}>CLAIMED</th>
                            <th style={{ padding: '14px 16px', textAlign: 'left', color: '#6e7b8b', fontSize: '10px', letterSpacing: '1px', fontWeight: '600' }}>UNCLAIMED</th>
                          </>
                        ) : (
                          <th style={{ padding: '14px 16px', textAlign: 'left', color: '#6e7b8b', fontSize: '10px', letterSpacing: '1px', fontWeight: '600' }}>EST. FEES</th>
                        )}
                        <th style={{ padding: '14px 16px', textAlign: 'left', color: '#6e7b8b', fontSize: '10px', letterSpacing: '1px', fontWeight: '600' }}>24H VOL</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', color: '#6e7b8b', fontSize: '10px', letterSpacing: '1px', fontWeight: '600' }}>{scanMode === 'onchain' ? 'STATUS' : 'SCORE'}</th>
                        <th style={{ padding: '14px 20px', textAlign: 'right', color: '#6e7b8b', fontSize: '10px', letterSpacing: '1px', fontWeight: '600' }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.pools.map((pool, index) => {
                        const score = pool.opportunityScore || 0;
                        const mcap = pool.marketCap || pool.fdv || 0;
                        const claimed = pool.claimedFeesSol || 0;
                        const unclaimed = pool.unclaimedFeesSol || pool.quoteFees || 0;
                        const estTotal = pool.estimatedTotalFees || pool.quoteFees || 0;

                        return (
                          <tr key={pool.poolAddress + index} style={{
                            borderBottom: '1px solid rgba(136, 192, 255, 0.05)',
                            transition: 'background 0.2s'
                          }}>
                            <td style={{ padding: '16px 20px' }}>
                              <div style={{ fontWeight: '600', color: '#fff' }}>{pool.name || 'Unknown'}</div>
                              <div style={{ fontSize: '11px', color: '#6e7b8b' }}>${pool.symbol || '???'}</div>
                            </td>
                            <td style={{ padding: '16px', color: '#a78bfa', fontWeight: '500' }}>
                              {mcap > 0 ? (mcap >= 1000000 ? `$${(mcap / 1000000).toFixed(1)}M` : `$${(mcap / 1000).toFixed(0)}K`) : 'N/A'}
                            </td>
                            {scanMode === 'onchain' ? (
                              <>
                                <td style={{ padding: '16px', color: claimed > 0 ? '#f59e0b' : '#4a5568', fontWeight: '500' }}>
                                  {claimed > 0 ? `${claimed.toFixed(2)} SOL` : '0'}
                                </td>
                                <td style={{ padding: '16px', color: '#22c55e', fontWeight: '600' }}>
                                  {unclaimed.toFixed(2)} SOL
                                </td>
                              </>
                            ) : (
                              <td style={{ padding: '16px', color: '#22c55e', fontWeight: '600' }}>
                                {estTotal.toFixed(2)} SOL
                              </td>
                            )}
                            <td style={{ padding: '16px', color: '#60a5fa', fontWeight: '500' }}>
                              {pool.volume24h ? `$${(pool.volume24h / 1000000).toFixed(1)}M` : 'N/A'}
                            </td>
                            <td style={{ padding: '16px' }}>
                              {scanMode === 'onchain' ? (
                                <span style={{
                                  display: 'inline-block',
                                  padding: '5px 10px',
                                  borderRadius: '4px',
                                  fontSize: '10px',
                                  fontWeight: '700',
                                  letterSpacing: '0.5px',
                                  background: pool.hasClaims ? 'rgba(107, 123, 143, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                                  color: pool.hasClaims ? '#6e7b8b' : '#22c55e',
                                  animation: pool.hasClaims ? 'none' : 'pulse 2s infinite'
                                }}>
                                  {pool.hasClaims ? `${pool.claimCount} CLAIMS` : 'UNCLAIMED'}
                                </span>
                              ) : (
                                <span style={{
                                  display: 'inline-block',
                                  padding: '5px 10px',
                                  borderRadius: '4px',
                                  fontSize: '10px',
                                  fontWeight: '700',
                                  letterSpacing: '0.5px',
                                  background: score >= 100 ? 'rgba(34, 197, 94, 0.2)' : score >= 20 ? 'rgba(234, 179, 8, 0.2)' : 'rgba(107, 123, 143, 0.2)',
                                  color: score >= 100 ? '#22c55e' : score >= 20 ? '#eab308' : '#6e7b8b'
                                }}>
                                  {score >= 100 ? 'HIGH' : score >= 20 ? 'MED' : 'LOW'}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                              <a
                                href={`https://bags.fm/token/${pool.tokenMint || pool.poolAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-block',
                                  padding: '8px 16px',
                                  background: 'rgba(136, 192, 255, 0.1)',
                                  border: '1px solid rgba(136, 192, 255, 0.3)',
                                  borderRadius: '6px',
                                  color: '#88c0ff',
                                  textDecoration: 'none',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  letterSpacing: '0.5px',
                                  transition: 'all 0.2s'
                                }}
                              >
                                VIEW
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {results.note && (
                  <div style={{
                    padding: '16px 28px',
                    borderTop: '1px solid rgba(136, 192, 255, 0.1)',
                    background: 'rgba(136, 192, 255, 0.03)',
                    fontSize: '12px',
                    color: '#6e7b8b'
                  }}>
                    {results.note}
                  </div>
                )}
              </>
            ) : (
              <div style={{
                padding: '60px',
                textAlign: 'center',
                color: '#6e7b8b'
              }}>
                <p>No pools found with ≥ {results.minFeesFilter} SOL in fees</p>
                <p style={{ fontSize: '12px', marginTop: '8px', opacity: 0.7 }}>Try lowering the minimum fee threshold</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
