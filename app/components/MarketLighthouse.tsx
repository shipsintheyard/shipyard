"use client";

import React, { useState } from 'react';

interface MarketLighthouseProps {
  platformVolumes: {
    bonk: { volume: number; change: number };
    pumpfun: { volume: number; change: number };
    bags: { volume: number; change: number };
    meteora: { volume: number; change: number };
  };
  marketStats: {
    totalTrades: number;
    tradesChange: number;
    traders: number;
    tradersChange: number;
    buyVolume: number;
    sellVolume: number;
    volumeChange: number;
  };
}

export default function MarketLighthouse({ platformVolumes, marketStats }: MarketLighthouseProps) {
  const [isVisible, setIsVisible] = useState(true);

  const totalVolume = platformVolumes.bonk.volume + platformVolumes.pumpfun.volume +
                     platformVolumes.meteora.volume + platformVolumes.bags.volume;

  const buyPercent = (marketStats.buyVolume / (marketStats.buyVolume + marketStats.sellVolume)) * 100;
  const sellPercent = 100 - buyPercent;

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(0);
  };

  if (!isVisible) return null;

  return (
    <div style={{
      position: 'fixed' as const,
      bottom: '20px',
      right: '20px',
      background: '#0B1120',
      border: '1px solid #1E2A3A',
      borderRadius: '12px',
      padding: '16px',
      minWidth: '300px',
      maxWidth: '340px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
      zIndex: 999,
      fontFamily: "'IBM Plex Mono', monospace"
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            background: '#4ADE80',
            borderRadius: '50%',
            boxShadow: '0 0 8px #4ADE80',
            animation: 'pulse 2s ease-in-out infinite'
          }} />
          <span style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: '#E2E8F0'
          }}>
            Market Lighthouse
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            fontSize: '8px',
            color: '#6B7B8F',
            background: '#1E2A3A',
            padding: '3px 8px',
            borderRadius: '4px'
          }}>
            24H
          </div>
          <button
            onClick={() => setIsVisible(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#6B7B8F',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              lineHeight: '1',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#E2E8F0')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#6B7B8F')}
          >
            ×
          </button>
        </div>
      </div>

      {/* Total Trades & Traders */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        marginBottom: '14px'
      }}>
        <div style={{
          background: '#111827',
          padding: '10px',
          borderRadius: '6px',
          border: '1px solid #1E2A3A'
        }}>
          <div style={{ fontSize: '8px', color: '#6B7B8F', marginBottom: '4px' }}>Total Trades</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#E2E8F0', marginBottom: '2px' }}>
            {formatNumber(marketStats.totalTrades)}
          </div>
          <div style={{
            fontSize: '9px',
            fontWeight: 600,
            color: marketStats.tradesChange >= 0 ? '#4ADE80' : '#F87171'
          }}>
            {marketStats.tradesChange >= 0 ? '+' : ''}{marketStats.tradesChange.toFixed(2)}%
          </div>
        </div>

        <div style={{
          background: '#111827',
          padding: '10px',
          borderRadius: '6px',
          border: '1px solid #1E2A3A'
        }}>
          <div style={{ fontSize: '8px', color: '#6B7B8F', marginBottom: '4px' }}>Traders</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#E2E8F0', marginBottom: '2px' }}>
            {formatNumber(marketStats.traders)}
          </div>
          <div style={{
            fontSize: '9px',
            fontWeight: 600,
            color: marketStats.tradersChange >= 0 ? '#4ADE80' : '#F87171'
          }}>
            {marketStats.tradersChange >= 0 ? '+' : ''}{marketStats.tradersChange.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* 24h Volume with Buy/Sell Bar */}
      <div style={{
        background: '#111827',
        padding: '12px',
        borderRadius: '6px',
        border: '1px solid #1E2A3A',
        marginBottom: '14px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px'
        }}>
          <div style={{ fontSize: '8px', color: '#6B7B8F' }}>24h Vol</div>
          <div style={{
            fontSize: '9px',
            fontWeight: 600,
            color: marketStats.volumeChange >= 0 ? '#4ADE80' : '#F87171'
          }}>
            {marketStats.volumeChange >= 0 ? '+' : ''}{marketStats.volumeChange.toFixed(1)}%
          </div>
        </div>

        {/* Volume Bar */}
        <div style={{
          display: 'flex',
          height: '6px',
          borderRadius: '3px',
          overflow: 'hidden',
          marginBottom: '6px'
        }}>
          <div style={{
            width: `${buyPercent}%`,
            background: 'linear-gradient(90deg, #10B981 0%, #059669 100%)'
          }} />
          <div style={{
            width: `${sellPercent}%`,
            background: 'linear-gradient(90deg, #EF4444 0%, #DC2626 100%)'
          }} />
        </div>

        {/* Buy/Sell Labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
          <span style={{ color: '#10B981' }}>${(marketStats.buyVolume / 1000000).toFixed(1)}M</span>
          <span style={{ color: '#EF4444' }}>${(marketStats.sellVolume / 1000000).toFixed(1)}M</span>
        </div>
      </div>

      {/* Top Launchpads */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{
          fontSize: '8px',
          color: '#6B7B8F',
          marginBottom: '8px',
          letterSpacing: '0.1em'
        }}>
          TOP LAUNCHPADS
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {/* Pump.fun */}
          <div style={{
            flex: 1,
            background: '#111827',
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid #1E2A3A',
            cursor: 'pointer'
          }}>
            <div style={{
              width: '20px',
              height: '20px',
              background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
              borderRadius: '50%',
              marginBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px'
            }}>🚀</div>
            <div style={{ fontSize: '9px', color: '#E2E8F0', fontWeight: 600, marginBottom: '2px' }}>
              ${(platformVolumes.pumpfun.volume / 1000000).toFixed(1)}M
            </div>
            <div style={{ fontSize: '8px', color: platformVolumes.pumpfun.change >= 0 ? '#4ADE80' : '#F87171' }}>
              {platformVolumes.pumpfun.change >= 0 ? '+' : ''}{platformVolumes.pumpfun.change.toFixed(1)}%
            </div>
          </div>

          {/* Meteora */}
          <div style={{
            flex: 1,
            background: '#111827',
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid #1E2A3A',
            cursor: 'pointer'
          }}>
            <div style={{
              width: '20px',
              height: '20px',
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              borderRadius: '50%',
              marginBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px'
            }}>⚡</div>
            <div style={{ fontSize: '9px', color: '#E2E8F0', fontWeight: 600, marginBottom: '2px' }}>
              ${(platformVolumes.meteora.volume / 1000000).toFixed(1)}M
            </div>
            <div style={{ fontSize: '8px', color: platformVolumes.meteora.change >= 0 ? '#4ADE80' : '#F87171' }}>
              {platformVolumes.meteora.change >= 0 ? '+' : ''}{platformVolumes.meteora.change.toFixed(1)}%
            </div>
          </div>

          {/* Bags.fm */}
          <div style={{
            flex: 1,
            background: '#111827',
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid #1E2A3A',
            cursor: 'pointer'
          }}>
            <div style={{
              width: '20px',
              height: '20px',
              background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
              borderRadius: '50%',
              marginBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px'
            }}>🎒</div>
            <div style={{ fontSize: '9px', color: '#E2E8F0', fontWeight: 600, marginBottom: '2px' }}>
              ${(platformVolumes.bags.volume / 1000000).toFixed(2)}M
            </div>
            <div style={{ fontSize: '8px', color: platformVolumes.bags.change >= 0 ? '#4ADE80' : '#F87171' }}>
              {platformVolumes.bags.change >= 0 ? '+' : ''}{platformVolumes.bags.change.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* BONK as Top Protocol */}
      <div>
        <div style={{
          fontSize: '8px',
          color: '#6B7B8F',
          marginBottom: '8px',
          letterSpacing: '0.1em'
        }}>
          TOP PROTOCOL
        </div>
        <div style={{
          background: '#111827',
          padding: '10px',
          borderRadius: '6px',
          border: '1px solid #1E2A3A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px'
            }}>🐕</div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#E2E8F0', marginBottom: '2px' }}>
                BONK
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#5EAED8' }}>
                ${(platformVolumes.bonk.volume / 1000000).toFixed(1)}M
              </div>
            </div>
          </div>
          <div style={{
            fontSize: '10px',
            fontWeight: 600,
            color: platformVolumes.bonk.change >= 0 ? '#4ADE80' : '#F87171'
          }}>
            {platformVolumes.bonk.change >= 0 ? '+' : ''}{platformVolumes.bonk.change.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}
