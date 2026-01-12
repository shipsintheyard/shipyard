"use client";

import React, { useState, useEffect } from 'react';

interface TrendingToken {
  symbol: string;
  name: string;
  address: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  txns24h: number;
  chainId: string;
}

interface VolumeData {
  currentHour: number;
  timezone: string;
  activityLevel: 'dead' | 'slow' | 'normal' | 'active' | 'heated';
  trendingTokens: TrendingToken[];
  totalVolume24h: number;
  hotHours: { hour: number; label: string; intensity: number }[];
  lastUpdated: Date;
}

const ACTIVITY_LEVELS = {
  dead: { icon: '💀', label: 'DEAD', color: '#6B7B8F', description: 'Low activity - markets sleeping' },
  slow: { icon: '🐢', label: 'SLOW', color: '#F59E0B', description: 'Below average volume' },
  normal: { icon: '📊', label: 'NORMAL', color: '#60A5FA', description: 'Typical market activity' },
  active: { icon: '🔥', label: 'ACTIVE', color: '#4ADE80', description: 'Above average volume' },
  heated: { icon: '🚀', label: 'HEATED', color: '#F97316', description: 'High volume - markets pumping' },
};

// Historical volume patterns by UTC hour (0-23)
const VOLUME_PATTERNS: Record<number, number> = {
  0: 0.6, 1: 0.5, 2: 0.4, 3: 0.4, 4: 0.5, 5: 0.6,  // Asia wind-down
  6: 0.7, 7: 0.8, 8: 0.9, 9: 1.0, 10: 0.9, 11: 0.8, // EU session
  12: 0.7, 13: 0.8, 14: 1.1, 15: 1.2, 16: 1.1, 17: 1.0, // US open
  18: 0.9, 19: 0.8, 20: 0.7, 21: 0.6, 22: 0.7, 23: 0.6, // US wind-down / Asia pre
};

const getTimezoneName = (offset: number): string => {
  if (offset >= -5 && offset <= -4) return 'US East';
  if (offset >= -8 && offset <= -7) return 'US West';
  if (offset >= 0 && offset <= 2) return 'Europe';
  if (offset >= 8 && offset <= 10) return 'Asia';
  return 'UTC';
};

export default function VolumeRadar() {
  const [data, setData] = useState<VolumeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVolumeData = async () => {
    try {
      // Fetch trending Solana tokens from DexScreener
      const trendingRes = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
      const trendingData = await trendingRes.json();

      // Filter for Solana tokens and get top 5
      const solanaTokens = trendingData
        .filter((t: any) => t.chainId === 'solana')
        .slice(0, 5);

      // Fetch detailed pair data for each token
      const tokenDetails: TrendingToken[] = [];
      let totalVolume = 0;

      for (const token of solanaTokens) {
        try {
          const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token.tokenAddress}`);
          const pairData = await pairRes.json();

          if (pairData.pairs && pairData.pairs.length > 0) {
            const topPair = pairData.pairs[0];
            const vol24h = topPair.volume?.h24 || 0;
            totalVolume += vol24h;

            tokenDetails.push({
              symbol: topPair.baseToken?.symbol || 'UNKNOWN',
              name: topPair.baseToken?.name || 'Unknown Token',
              address: token.tokenAddress,
              price: parseFloat(topPair.priceUsd || 0),
              priceChange24h: topPair.priceChange?.h24 || 0,
              volume24h: vol24h,
              txns24h: (topPair.txns?.h24?.buys || 0) + (topPair.txns?.h24?.sells || 0),
              chainId: 'solana',
            });
          }
        } catch (e) {
          console.warn('Failed to fetch token details:', e);
        }
      }

      // Calculate current activity level
      const now = new Date();
      const utcHour = now.getUTCHours();
      const localOffset = -now.getTimezoneOffset() / 60;

      // Calculate hot hours (next 6 hours)
      const hotHours = [];
      for (let i = 0; i < 6; i++) {
        const hour = (utcHour + i) % 24;
        const localHour = (hour + localOffset + 24) % 24;
        const intensity = VOLUME_PATTERNS[hour];

        let label = '';
        if (hour >= 14 && hour <= 16) label = 'US Open';
        else if (hour >= 8 && hour <= 10) label = 'EU Active';
        else if (hour >= 1 && hour <= 3) label = 'Asia Peak';
        else if (hour >= 21 || hour <= 5) label = 'Low Vol';

        hotHours.push({
          hour: localHour,
          label: label || `${localHour}:00`,
          intensity,
        });
      }

      // Determine activity level based on volume and time
      const currentPattern = VOLUME_PATTERNS[utcHour];
      let activityLevel: VolumeData['activityLevel'] = 'normal';

      if (currentPattern <= 0.5) activityLevel = 'dead';
      else if (currentPattern <= 0.7) activityLevel = 'slow';
      else if (currentPattern <= 0.9) activityLevel = 'normal';
      else if (currentPattern <= 1.1) activityLevel = 'active';
      else activityLevel = 'heated';

      // Boost activity level if we see high trending token volume
      if (totalVolume > 50000000 && activityLevel !== 'heated') {
        const levels: VolumeData['activityLevel'][] = ['dead', 'slow', 'normal', 'active', 'heated'];
        const idx = levels.indexOf(activityLevel);
        if (idx < levels.length - 1) activityLevel = levels[idx + 1];
      }

      setData({
        currentHour: utcHour,
        timezone: getTimezoneName(localOffset),
        activityLevel,
        trendingTokens: tokenDetails,
        totalVolume24h: totalVolume,
        hotHours,
        lastUpdated: new Date(),
      });
      setError(null);
    } catch (err) {
      console.error('Failed to fetch volume data:', err);
      setError('Unable to fetch market data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVolumeData();
    const interval = setInterval(fetchVolumeData, 3 * 60 * 1000); // Refresh every 3 min
    return () => clearInterval(interval);
  }, []);

  const formatVolume = (vol: number): string => {
    if (vol >= 1000000000) return `$${(vol / 1000000000).toFixed(1)}B`;
    if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
    if (vol >= 1000) return `$${(vol / 1000).toFixed(1)}K`;
    return `$${vol.toFixed(0)}`;
  };

  const formatPrice = (price: number): string => {
    if (price >= 1) return `$${price.toFixed(2)}`;
    if (price >= 0.01) return `$${price.toFixed(4)}`;
    if (price >= 0.0001) return `$${price.toFixed(6)}`;
    return `$${price.toExponential(2)}`;
  };

  if (loading) {
    return (
      <div style={{
        background: '#0B1120',
        border: '1px solid #1E2A3A',
        borderRadius: '12px',
        padding: '24px',
        fontFamily: "'IBM Plex Mono', monospace"
      }}>
        <div style={{ color: '#6B7B8F', textAlign: 'center' }}>
          Scanning volume...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{
        background: '#0B1120',
        border: '1px solid #1E2A3A',
        borderRadius: '12px',
        padding: '24px',
        fontFamily: "'IBM Plex Mono', monospace"
      }}>
        <div style={{ color: '#EF4444', textAlign: 'center' }}>
          {error || 'Unable to load volume data'}
        </div>
      </div>
    );
  }

  const activity = ACTIVITY_LEVELS[data.activityLevel];

  return (
    <div style={{
      background: '#0B1120',
      border: '1px solid #1E2A3A',
      borderRadius: '12px',
      padding: '20px',
      fontFamily: "'IBM Plex Mono', monospace",
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
      }}>
        <div style={{
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.1em',
          color: '#6B7B8F'
        }}>
          VOLUME RADAR
        </div>
        <div style={{
          fontSize: '9px',
          color: '#6B7B8F',
          background: '#1E2A3A',
          padding: '4px 8px',
          borderRadius: '4px'
        }}>
          {data.timezone}
        </div>
      </div>

      {/* Activity Level */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '16px',
        padding: '16px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: '8px',
        borderLeft: `3px solid ${activity.color}`
      }}>
        <span style={{ fontSize: '32px' }}>{activity.icon}</span>
        <div>
          <div style={{
            fontSize: '18px',
            fontWeight: 700,
            color: activity.color,
            letterSpacing: '0.05em'
          }}>
            {activity.label}
          </div>
          <div style={{ fontSize: '11px', color: '#6B7B8F' }}>
            {activity.description}
          </div>
        </div>
      </div>

      {/* Hot Hours Timeline */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          fontSize: '9px',
          color: '#6B7B8F',
          letterSpacing: '0.1em',
          marginBottom: '8px'
        }}>
          NEXT 6 HOURS
        </div>
        <div style={{
          display: 'flex',
          gap: '4px'
        }}>
          {data.hotHours.map((hour, idx) => (
            <div
              key={idx}
              style={{
                flex: 1,
                background: `rgba(94, 174, 216, ${hour.intensity * 0.3})`,
                borderRadius: '4px',
                padding: '8px 4px',
                textAlign: 'center',
                border: idx === 0 ? '1px solid #5EAED8' : '1px solid transparent'
              }}
            >
              <div style={{
                fontSize: '12px',
                fontWeight: 700,
                color: hour.intensity >= 1 ? '#4ADE80' : hour.intensity >= 0.7 ? '#60A5FA' : '#6B7B8F'
              }}>
                {hour.hour}:00
              </div>
              {hour.label && (
                <div style={{
                  fontSize: '7px',
                  color: '#6B7B8F',
                  marginTop: '2px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {hour.label}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Trending Tokens */}
      {data.trendingTokens.length > 0 && (
        <div>
          <div style={{
            fontSize: '9px',
            color: '#6B7B8F',
            letterSpacing: '0.1em',
            marginBottom: '8px'
          }}>
            TRENDING ON SOLANA
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {data.trendingTokens.slice(0, 4).map((token, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: '#111827',
                  borderRadius: '6px',
                  border: '1px solid #1E2A3A'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '24px',
                    height: '24px',
                    background: `linear-gradient(135deg, ${idx === 0 ? '#F97316' : idx === 1 ? '#5EAED8' : '#4ADE80'} 0%, #1E2A3A 100%)`,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#fff'
                  }}>
                    {idx + 1}
                  </div>
                  <div>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#E2E8F0'
                    }}>
                      {token.symbol}
                    </div>
                    <div style={{
                      fontSize: '9px',
                      color: '#6B7B8F'
                    }}>
                      {formatVolume(token.volume24h)} vol
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#E2E8F0'
                  }}>
                    {formatPrice(token.price)}
                  </div>
                  <div style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: token.priceChange24h >= 0 ? '#4ADE80' : '#EF4444'
                  }}>
                    {token.priceChange24h >= 0 ? '+' : ''}{token.priceChange24h.toFixed(1)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last Updated */}
      <div style={{
        fontSize: '8px',
        color: '#6B7B8F',
        marginTop: '12px',
        textAlign: 'center'
      }}>
        Updated {data.lastUpdated.toLocaleTimeString()}
      </div>
    </div>
  );
}
