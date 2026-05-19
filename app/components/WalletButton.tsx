"use client";
import { useChain } from '../providers/ChainProvider';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useAccount, useConnect, useDisconnect } from 'wagmi';

const btnStyle = (connected: boolean): React.CSSProperties => ({
  padding: '10px 20px',
  borderRadius: '6px',
  fontFamily: 'Space Mono, monospace',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
  letterSpacing: '1px',
  transition: 'all 0.2s',
  background: connected ? 'rgba(136, 192, 255, 0.1)' : 'transparent',
  color: '#88c0ff',
  border: '1px solid #88c0ff',
});

export default function WalletButton() {
  const { chain } = useChain();

  if (chain === 'sol') return <SolanaWalletButton />;
  return <EVMWalletButton />;
}

function SolanaWalletButton() {
  const { publicKey, disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();

  const handleClick = () => {
    if (connected) disconnect();
    else setVisible(true);
  };

  const displayAddress = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : null;

  return (
    <button onClick={handleClick} style={btnStyle(connected)}>
      {displayAddress || 'CONNECT WALLET'}
    </button>
  );
}

function EVMWalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const handleClick = () => {
    if (isConnected) {
      disconnect();
    } else {
      const connector = connectors.find(c => c.id === 'injected') || connectors[0];
      if (connector) connect({ connector });
    }
  };

  const displayAddress = address
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : null;

  return (
    <button onClick={handleClick} style={btnStyle(isConnected)}>
      {displayAddress || 'CONNECT WALLET'}
    </button>
  );
}
