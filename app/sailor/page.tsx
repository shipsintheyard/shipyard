"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import Link from 'next/link';

export default function SailorLanding() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const [input, setInput] = useState('');

  const handleLookup = () => {
    const trimmed = input.trim();
    if (trimmed) router.push(`/sailor/${trimmed}`);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0f1419 0%, #1a1f2e 50%, #0f1419 100%)',
      color: '#c9d1d9',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Space+Mono:wght@400;700&family=Outfit:wght@400;600;700&display=swap');
      `}</style>

      {/* Header */}
      <header style={{
        padding: '16px 40px',
        borderBottom: '1px solid rgba(136, 192, 255, 0.15)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(15, 20, 25, 0.9)',
        backdropFilter: 'blur(10px)',
      }}>
        <Link href="/" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          textDecoration: 'none',
        }}>
          <span style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: '16px',
            fontWeight: '700',
            color: '#fff',
            letterSpacing: '1px',
          }}>
            THE SHIPYARD
          </span>
          <span style={{
            fontSize: '9px',
            color: '#88c0ff',
            letterSpacing: '3px',
          }}>
            / SAILOR
          </span>
        </Link>
      </header>

      {/* Center content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 16px',
        gap: '28px',
      }}>
        <div style={{ fontSize: '48px' }}>⚔️</div>
        <div style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: '24px',
          fontWeight: '700',
          color: '#fff',
          letterSpacing: '1px',
        }}>
          Sailor Stats
        </div>
        <div style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: '12px',
          color: '#6e7b8b',
          textAlign: 'center',
          lineHeight: '1.8',
        }}>
          Look up any Solana wallet to see their<br />
          on-chain stat board
        </div>

        {/* Lookup */}
        <div style={{
          display: 'flex',
          gap: '8px',
          width: '100%',
          maxWidth: '500px',
        }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
            placeholder="Wallet address..."
            style={{
              flex: 1,
              padding: '12px 14px',
              background: 'rgba(136, 192, 255, 0.05)',
              border: '1px solid rgba(136, 192, 255, 0.15)',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '13px',
              fontFamily: "'Space Mono', monospace",
              outline: 'none',
            }}
          />
          <button
            onClick={handleLookup}
            style={{
              padding: '12px 20px',
              background: 'linear-gradient(135deg, #88c0ff 0%, #5a9fd4 100%)',
              border: 'none',
              borderRadius: '6px',
              color: '#0f1419',
              fontFamily: "'Outfit', sans-serif",
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            Look up
          </button>
        </div>

        {publicKey && (
          <button
            onClick={() => router.push(`/sailor/${publicKey.toBase58()}`)}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: '1px solid rgba(136, 192, 255, 0.2)',
              borderRadius: '6px',
              color: '#88c0ff',
              fontFamily: "'Space Mono', monospace",
              fontSize: '11px',
              cursor: 'pointer',
              letterSpacing: '1px',
            }}
          >
            VIEW YOUR STATS
          </button>
        )}
      </div>
    </div>
  );
}
