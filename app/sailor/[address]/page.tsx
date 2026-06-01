"use client";
import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import Link from 'next/link';
import SailorStats from '../../components/SailorStats';

export default function SailorPage() {
  const params = useParams();
  const router = useRouter();
  const { publicKey } = useWallet();
  const address = params.address as string;
  const [lookupInput, setLookupInput] = useState(address);

  const handleLookup = () => {
    const trimmed = lookupInput.trim();
    if (trimmed && trimmed !== address) {
      router.push(`/sailor/${trimmed}`);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0f1419 0%, #1a1f2e 50%, #0f1419 100%)',
      color: '#c9d1d9',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Space+Mono:wght@400;700&family=Outfit:wght@400;600;700&display=swap');
      `}</style>

      {/* Header — matches Shipyard nav style */}
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {publicKey && publicKey.toBase58() !== address && (
            <button
              onClick={() => router.push(`/sailor/${publicKey.toBase58()}`)}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                border: '1px solid rgba(136, 192, 255, 0.2)',
                borderRadius: '6px',
                color: '#6e7b8b',
                fontFamily: "'Space Mono', monospace",
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              MY STATS
            </button>
          )}
        </div>
      </header>

      {/* Lookup bar */}
      <div style={{
        maxWidth: '640px',
        margin: '20px auto 0',
        padding: '0 16px',
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
      }}>
        <input
          type="text"
          value={lookupInput}
          onChange={(e) => setLookupInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
          placeholder="Solana or EVM wallet address..."
          style={{
            flex: 1,
            padding: '10px 14px',
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
            padding: '10px 18px',
            background: 'rgba(136, 192, 255, 0.1)',
            border: '1px solid rgba(136, 192, 255, 0.2)',
            borderRadius: '6px',
            color: '#88c0ff',
            fontFamily: "'Space Mono', monospace",
            fontSize: '11px',
            cursor: 'pointer',
            letterSpacing: '1px',
          }}
        >
          LOOK UP
        </button>
      </div>

      {/* Stat board */}
      <SailorStats address={address} />
    </div>
  );
}
