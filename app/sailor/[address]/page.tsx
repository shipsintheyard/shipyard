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
      background: '#1a1610',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
      `}</style>

      {/* Navigation */}
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

      {/* Lookup bar */}
      <div style={{
        maxWidth: '640px',
        margin: '24px auto 0',
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
          placeholder="Wallet address..."
          style={{
            flex: 1,
            padding: '10px 14px',
            background: '#2b2418',
            border: '2px solid #5c503c',
            borderRadius: '0',
            color: '#ff981f',
            fontSize: '11px',
            fontFamily: "'Press Start 2P', monospace",
            outline: 'none',
          }}
        />
        <button
          onClick={handleLookup}
          style={{
            padding: '10px 16px',
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
        {publicKey && publicKey.toBase58() !== address && (
          <button
            onClick={() => router.push(`/sailor/${publicKey.toBase58()}`)}
            style={{
              padding: '10px 12px',
              background: '#3e3529',
              border: '2px solid',
              borderColor: '#7a6e5a #2b2418 #2b2418 #7a6e5a',
              color: '#c8aa6e',
              fontSize: '9px',
              fontFamily: "'Press Start 2P', monospace",
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            My Stats
          </button>
        )}
      </div>

      {/* Stat board */}
      <SailorStats address={address} />
    </div>
  );
}
