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
      background: '#1a1610',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
      `}</style>

      {/* Nav */}
      <div style={{
        padding: '12px 24px',
        borderBottom: '2px solid #2b2418',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#3e3529',
      }}>
        <Link href="/" style={{
          color: '#c8aa6e',
          textDecoration: 'none',
          fontSize: '10px',
          fontFamily: "'Press Start 2P', monospace",
        }}>
          &larr; Shipyard
        </Link>
        <span style={{
          color: '#ff981f',
          fontSize: '10px',
          fontFamily: "'Press Start 2P', monospace",
        }}>
          Sailor Hiscores
        </span>
      </div>

      {/* Center prompt */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 16px',
        gap: '24px',
      }}>
        <div style={{ fontSize: '48px' }}>⚔️</div>
        <div style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '14px',
          color: '#ff981f',
          textAlign: 'center',
          lineHeight: '2',
        }}>
          Sailor Stats
        </div>
        <div style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '8px',
          color: '#5c503c',
          textAlign: 'center',
          lineHeight: '2.2',
        }}>
          Look up any wallet to view their<br />
          OSRS-style stat board
        </div>

        {/* Lookup input */}
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
              background: '#2b2418',
              border: '2px solid #5c503c',
              color: '#ff981f',
              fontSize: '11px',
              fontFamily: "'Press Start 2P', monospace",
              outline: 'none',
            }}
          />
          <button
            onClick={handleLookup}
            style={{
              padding: '12px 20px',
              background: '#5c503c',
              border: '2px solid',
              borderColor: '#7a6e5a #2b2418 #2b2418 #7a6e5a',
              color: '#ff981f',
              fontSize: '10px',
              fontFamily: "'Press Start 2P', monospace",
              cursor: 'pointer',
            }}
          >
            Look up
          </button>
        </div>

        {/* Connected wallet shortcut */}
        {publicKey && (
          <button
            onClick={() => router.push(`/sailor/${publicKey.toBase58()}`)}
            style={{
              padding: '12px 24px',
              background: '#3e3529',
              border: '2px solid',
              borderColor: '#7a6e5a #2b2418 #2b2418 #7a6e5a',
              color: '#c8aa6e',
              fontSize: '9px',
              fontFamily: "'Press Start 2P', monospace",
              cursor: 'pointer',
            }}
          >
            View your stats
          </button>
        )}
      </div>
    </div>
  );
}
