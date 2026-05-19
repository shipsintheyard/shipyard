"use client";
import { useChain, type Chain } from '../providers/ChainProvider';

const chains: { id: Chain; label: string }[] = [
  { id: 'sol', label: 'SOL' },
  { id: 'eth', label: 'ETH' },
  { id: 'base', label: 'BASE' },
];

export default function ChainSelector() {
  const { chain, setChain } = useChain();

  return (
    <div style={{
      display: 'flex',
      background: 'rgba(15, 20, 25, 0.8)',
      borderRadius: '6px',
      border: '1px solid rgba(136, 192, 255, 0.15)',
      overflow: 'hidden',
    }}>
      {chains.map(c => (
        <button
          key={c.id}
          onClick={() => setChain(c.id)}
          style={{
            padding: '6px 12px',
            fontSize: '10px',
            fontFamily: 'Space Mono, monospace',
            letterSpacing: '1px',
            background: chain === c.id ? 'rgba(136, 192, 255, 0.15)' : 'transparent',
            color: chain === c.id ? '#88c0ff' : '#6e7b8b',
            fontWeight: chain === c.id ? 600 : 400,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
