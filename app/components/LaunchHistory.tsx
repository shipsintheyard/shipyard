"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';

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

const ENGINE_NAMES: Record<number, string> = {
  1: 'Navigator',
  2: 'Lighthouse',
  3: 'Supernova',
};

const ENGINE_COLORS: Record<number, string> = {
  1: '#88c0ff',
  2: '#f97316',
  3: '#a855f7',
};

export default function LaunchHistory() {
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalLaunches: 0, totalSolRaised: 0, migratedCount: 0 });

  useEffect(() => {
    fetchLaunches();
  }, []);

  const fetchLaunches = async () => {
    try {
      const res = await fetch('/api/launches');
      const data = await res.json();
      if (data.success) {
        setLaunches(data.launches || []);
        setStats({
          totalLaunches: data.totalLaunches || 0,
          totalSolRaised: data.totalSolRaised || 0,
          migratedCount: data.migratedCount || 0,
        });
      }
    } catch (error) {
      console.error('Failed to fetch launches:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const shortenAddress = (addr: string) => {
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  return (
    <div style={{
      background: 'rgba(10, 14, 18, 0.9)',
      borderRadius: '16px',
      border: '1px solid rgba(136, 192, 255, 0.1)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid rgba(136, 192, 255, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <h3 style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: '16px',
            fontWeight: '600',
            color: '#fff',
            margin: 0,
          }}>
            Recent Launches
          </h3>
          <p style={{ fontSize: '11px', color: '#6e7b8b', marginTop: '4px' }}>
            Tokens launched through Shipyard
          </p>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#88c0ff' }}>
              {stats.totalLaunches}
            </div>
            <div style={{ fontSize: '9px', color: '#6e7b8b', letterSpacing: '1px' }}>LAUNCHES</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#7ee787' }}>
              {stats.migratedCount}
            </div>
            <div style={{ fontSize: '9px', color: '#6e7b8b', letterSpacing: '1px' }}>GRADUATED</div>
          </div>
        </div>
      </div>

      {/* Launch List */}
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6e7b8b' }}>
            Loading launches...
          </div>
        ) : launches.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.5 }}>🚢</div>
            <div style={{ color: '#6e7b8b', fontSize: '13px' }}>No launches yet</div>
            <div style={{ color: '#4a5568', fontSize: '11px', marginTop: '4px' }}>
              Be the first to launch on Shipyard!
            </div>
          </div>
        ) : (
          launches.map((launch) => (
            <Link
              key={launch.id}
              href={`/token/${launch.tokenMint}`}
              style={{ textDecoration: 'none' }}
            >
              <div
                style={{
                  padding: '16px 24px',
                  borderBottom: '1px solid rgba(136, 192, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(136, 192, 255, 0.05)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
              {/* Token Image */}
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: launch.imageUrl
                  ? `url(${launch.imageUrl}) center/cover`
                  : 'linear-gradient(135deg, #1a1f2e 0%, #2a3040 100%)',
                border: '1px solid rgba(136, 192, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                flexShrink: 0,
              }}>
                {!launch.imageUrl && '🪙'}
              </div>

              {/* Token Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#fff',
                  }}>
                    {launch.name}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    color: '#6e7b8b',
                    background: 'rgba(136, 192, 255, 0.1)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}>
                    ${launch.symbol}
                  </span>
                  {launch.migrated && (
                    <span style={{
                      fontSize: '9px',
                      color: '#7ee787',
                      background: 'rgba(126, 231, 135, 0.1)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid rgba(126, 231, 135, 0.2)',
                    }}>
                      GRADUATED
                    </span>
                  )}
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginTop: '4px',
                }}>
                  <span style={{ fontSize: '10px', color: '#4a5568' }}>
                    {shortenAddress(launch.creator)}
                  </span>
                  <span style={{
                    fontSize: '9px',
                    color: ENGINE_COLORS[launch.engine],
                    background: `${ENGINE_COLORS[launch.engine]}15`,
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}>
                    {ENGINE_NAMES[launch.engine]}
                  </span>
                  {launch.devBuyPercent > 0 && (
                    <span style={{ fontSize: '10px', color: '#6e7b8b' }}>
                      Dev: {launch.devBuyPercent.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Progress */}
              <div style={{ textAlign: 'right', minWidth: '80px' }}>
                <div style={{ fontSize: '12px', color: '#fff', fontWeight: '500' }}>
                  {launch.solRaised.toFixed(1)} / 85
                </div>
                <div style={{
                  width: '80px',
                  height: '4px',
                  background: 'rgba(136, 192, 255, 0.1)',
                  borderRadius: '2px',
                  marginTop: '4px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${Math.min((launch.solRaised / 85) * 100, 100)}%`,
                    height: '100%',
                    background: launch.migrated
                      ? '#7ee787'
                      : 'linear-gradient(90deg, #88c0ff, #5a9fd4)',
                    borderRadius: '2px',
                  }} />
                </div>
                <div style={{ fontSize: '9px', color: '#4a5568', marginTop: '2px' }}>
                  {formatTime(launch.createdAt)}
                </div>
              </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
