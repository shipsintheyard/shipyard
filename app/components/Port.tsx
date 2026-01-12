"use client";

import React, { useState } from 'react';

// Common Base tokens
const BASE_TOKENS = {
  ETH: { symbol: 'ETH', address: '0x0000000000000000000000000000000000000000', name: 'Ethereum', image: null },
  WETH: { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', name: 'Wrapped Ether', image: null },
  USDC: { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'USD Coin', image: null },
  DAI: { symbol: 'DAI', address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', name: 'Dai Stablecoin', image: null },
};

interface TokenMetadata {
  name: string;
  symbol: string;
  image: string | null;
  decimals: number;
}

export default function Port() {
  const [fromToken, setFromToken] = useState(BASE_TOKENS.ETH.address);
  const [toToken, setToToken] = useState(BASE_TOKENS.USDC.address);
  const [fromTokenMetadata, setFromTokenMetadata] = useState<TokenMetadata | null>(null);
  const [toTokenMetadata, setToTokenMetadata] = useState<TokenMetadata | null>(null);
  const [amount, setAmount] = useState('');
  const [isSwapping, setIsSwapping] = useState(false);
  const [route, setRoute] = useState<string | null>(null);
  const [loadingFromToken, setLoadingFromToken] = useState(false);
  const [loadingToToken, setLoadingToToken] = useState(false);

  const fetchTokenMetadata = async (address: string): Promise<TokenMetadata | null> => {
    try {
      // Check if it's a known base token
      const baseToken = Object.values(BASE_TOKENS).find(
        t => t.address.toLowerCase() === address.toLowerCase()
      );

      if (baseToken) {
        return {
          name: baseToken.name,
          symbol: baseToken.symbol,
          image: baseToken.image,
          decimals: 18
        };
      }

      // Fetch from Base chain using CoinGecko API or similar
      // For now, we'll use a simple RPC call to get basic ERC20 info
      const response = await fetch('https://mainnet.base.org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [
            {
              to: address,
              data: '0x95d89b41' // symbol() function signature
            },
            'latest'
          ]
        })
      });

      const data = await response.json();

      if (data.result) {
        // Decode the hex response to get symbol
        const hex = data.result.slice(2);
        let symbol = '';
        for (let i = 128; i < hex.length; i += 2) {
          const byte = parseInt(hex.substr(i, 2), 16);
          if (byte === 0) break;
          symbol += String.fromCharCode(byte);
        }

        // Also try to get name
        const nameResponse = await fetch('https://mainnet.base.org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'eth_call',
            params: [
              {
                to: address,
                data: '0x06fdde03' // name() function signature
              },
              'latest'
            ]
          })
        });

        const nameData = await nameResponse.json();
        let name = symbol;

        if (nameData.result) {
          const nameHex = nameData.result.slice(2);
          let decodedName = '';
          for (let i = 128; i < nameHex.length; i += 2) {
            const byte = parseInt(nameHex.substr(i, 2), 16);
            if (byte === 0) break;
            decodedName += String.fromCharCode(byte);
          }
          if (decodedName) name = decodedName;
        }

        return {
          name: name || 'Unknown Token',
          symbol: symbol || 'TOKEN',
          image: null,
          decimals: 18
        };
      }

      return null;
    } catch (err) {
      console.error('Failed to fetch token metadata:', err);
      return null;
    }
  };

  const detectRoute = (tokenAddress: string) => {
    // Placeholder routing logic - will be replaced with actual detection
    if (!tokenAddress) return 'Unknown';

    // Simplified detection (would be more sophisticated in reality)
    if (tokenAddress.toLowerCase().includes('zora')) return 'Zora Protocol';
    if (tokenAddress.toLowerCase().includes('virtual')) return 'Virtuals Router';
    if (tokenAddress.toLowerCase().includes('clanker')) return 'Uniswap V3';
    return 'Aerodrome';
  };

  const handleFromTokenChange = async (value: string) => {
    setFromToken(value);
    if (value && value.length === 42 && value.startsWith('0x')) {
      setLoadingFromToken(true);
      const metadata = await fetchTokenMetadata(value);
      setFromTokenMetadata(metadata);
      setLoadingFromToken(false);
      if (value) setRoute(detectRoute(value));
    } else {
      setFromTokenMetadata(null);
    }
  };

  const handleToTokenChange = async (value: string) => {
    setToToken(value);
    if (value && value.length === 42 && value.startsWith('0x')) {
      setLoadingToToken(true);
      const metadata = await fetchTokenMetadata(value);
      setToTokenMetadata(metadata);
      setLoadingToToken(false);
    } else {
      setToTokenMetadata(null);
    }
  };

  const handleSwap = async () => {
    setIsSwapping(true);
    // Swap logic will go here
    setTimeout(() => {
      setIsSwapping(false);
      alert('Swap executed! (Demo)');
    }, 2000);
  };

  const swapTokens = () => {
    const temp = fromToken;
    const tempMeta = fromTokenMetadata;
    setFromToken(toToken);
    setFromTokenMetadata(toTokenMetadata);
    setToToken(temp);
    setToTokenMetadata(tempMeta);
  };

  return (
    <>
      <style jsx>{`
        .port-container {
          min-height: 100vh;
          background: #0B1120;
          font-family: 'IBM Plex Mono', monospace;
          color: #E2E8F0;
          padding: 40px 20px;
        }

        .grid-bg {
          position: fixed;
          inset: 0;
          background-image:
            radial-gradient(circle at 50% 0%, rgba(94, 174, 216, 0.04) 0%, transparent 50%),
            linear-gradient(rgba(94, 174, 216, 0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(94, 174, 216, 0.015) 1px, transparent 1px);
          background-size: 100% 100%, 40px 40px, 40px 40px;
          pointer-events: none;
          z-index: 0;
        }

        .container {
          max-width: 500px;
          margin: 0 auto;
          position: relative;
          z-index: 1;
        }

        .header {
          text-align: center;
          margin-bottom: 40px;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border: 1px solid #1E2A3A;
          border-radius: 20px;
          font-size: 10px;
          letter-spacing: 0.15em;
          color: #6B7B8F;
          margin-bottom: 20px;
        }

        .badge::before {
          content: '';
          width: 6px;
          height: 6px;
          background: #4ADE80;
          border-radius: 50%;
          box-shadow: 0 0 8px #4ADE80;
        }

        .title {
          font-size: 52px;
          font-weight: 700;
          color: #5EAED8;
          letter-spacing: 0.08em;
          margin-bottom: 8px;
          text-shadow: 0 0 40px rgba(94, 174, 216, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }

        .tagline {
          font-size: 16px;
          color: #6B7B8F;
          font-style: italic;
        }

        .crane-icon {
          font-size: 48px;
          animation: crane-lift 4s ease-in-out infinite;
        }

        @keyframes crane-lift {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        .swap-card {
          background: #111827;
          border: 1px solid #1E2A3A;
          border-radius: 12px;
          padding: 24px;
          position: relative;
          overflow: visible;
        }

        .container-badge {
          position: absolute;
          top: -12px;
          right: 20px;
          background: linear-gradient(135deg, #FF6B35, #F7931E);
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: #0B1120;
          box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
        }

        .token-input-group {
          background: #0D1526;
          border: 1px solid #1E2A3A;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
          transition: border-color 0.2s;
          position: relative;
        }

        .container-icon {
          position: absolute;
          top: 12px;
          right: 12px;
          font-size: 20px;
          opacity: 0.3;
        }

        .token-input-group:focus-within {
          border-color: #5EAED8;
        }

        .input-label {
          font-size: 10px;
          letter-spacing: 0.1em;
          color: #3D4A5C;
          margin-bottom: 8px;
        }

        .token-input {
          width: 100%;
          background: transparent;
          border: none;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 14px;
          color: #E2E8F0;
          outline: none;
          margin-bottom: 8px;
        }

        .token-input::placeholder {
          color: #3D4A5C;
        }

        .amount-input {
          width: 100%;
          background: transparent;
          border: none;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 24px;
          font-weight: 600;
          color: #E2E8F0;
          outline: none;
        }

        .amount-input::placeholder {
          color: #3D4A5C;
        }

        .route-badge {
          display: inline-block;
          padding: 4px 10px;
          background: rgba(94, 174, 216, 0.1);
          border: 1px solid rgba(94, 174, 216, 0.2);
          border-radius: 6px;
          font-size: 9px;
          letter-spacing: 0.1em;
          color: #5EAED8;
        }

        .swap-arrow-container {
          display: flex;
          justify-content: center;
          margin: -6px 0;
          position: relative;
          z-index: 2;
        }

        .swap-arrow {
          width: 40px;
          height: 40px;
          background: #1E2A3A;
          border: 2px solid #0B1120;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          color: #6B7B8F;
        }

        .swap-arrow:hover {
          background: #5EAED8;
          color: #0B1120;
          transform: rotate(180deg);
        }

        .swap-button {
          width: 100%;
          padding: 18px;
          margin-top: 20px;
          background: linear-gradient(135deg, #5EAED8, #3A7A9D);
          border: none;
          border-radius: 8px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.15em;
          color: #0B1120;
          cursor: pointer;
          transition: all 0.2s;
        }

        .swap-button:hover:not(:disabled) {
          box-shadow: 0 0 30px rgba(94, 174, 216, 0.5);
          transform: translateY(-1px);
        }

        .swap-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .info-section {
          margin-top: 24px;
          padding: 16px;
          background: rgba(94, 174, 216, 0.05);
          border: 1px solid #1E2A3A;
          border-radius: 8px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          margin-bottom: 8px;
          color: #6B7B8F;
        }

        .info-row:last-child {
          margin-bottom: 0;
        }

        .info-value {
          color: #E2E8F0;
          font-weight: 600;
        }

        .footer {
          text-align: center;
          margin-top: 40px;
          font-size: 10px;
          color: #3D4A5C;
        }

        .footer a {
          color: #5EAED8;
          text-decoration: none;
        }
      `}</style>

      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div className="port-container">
        <div className="grid-bg"></div>

        <div className="container">
          <header className="header">
            <div className="badge">A SHIPYARD PRODUCT</div>
            <h1 className="title">
              <span className="crane-icon">🏗️</span>
              PORT
              <span className="crane-icon">🚢</span>
            </h1>
            <p className="tagline">Any swap. Any container. We'll load it.</p>
            <div style={{
              fontSize: '11px',
              color: '#5EAED8',
              marginTop: '12px',
              padding: '6px 12px',
              background: 'rgba(94, 174, 216, 0.1)',
              border: '1px solid rgba(94, 174, 216, 0.2)',
              borderRadius: '6px',
              display: 'inline-block'
            }}>
              ⛓️ BASE CHAIN
            </div>
          </header>

          <div className="swap-card">
            {/* From Token */}
            <div className="token-input-group">
              <div className="container-icon">📦</div>
              <div className="input-label">FROM CONTAINER</div>
              {fromTokenMetadata && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                  padding: '6px 10px',
                  background: 'rgba(94, 174, 216, 0.1)',
                  borderRadius: '6px',
                  border: '1px solid rgba(94, 174, 216, 0.2)'
                }}>
                  {fromTokenMetadata.image && (
                    <img
                      src={fromTokenMetadata.image}
                      alt={fromTokenMetadata.symbol}
                      style={{ width: '20px', height: '20px', borderRadius: '50%' }}
                    />
                  )}
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#5EAED8' }}>
                    {fromTokenMetadata.symbol}
                  </span>
                  <span style={{ fontSize: '10px', color: '#6B7B8F' }}>
                    {fromTokenMetadata.name}
                  </span>
                </div>
              )}
              {loadingFromToken && (
                <div style={{ fontSize: '10px', color: '#5EAED8', marginBottom: '8px' }}>
                  🔍 Loading token info...
                </div>
              )}
              <input
                type="text"
                className="token-input"
                placeholder="Token address or symbol"
                value={fromToken}
                onChange={(e) => handleFromTokenChange(e.target.value)}
              />
              <input
                type="number"
                className="amount-input"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {fromToken && (
                <div style={{ marginTop: '8px' }}>
                  <span className="route-badge">
                    ROUTE: {detectRoute(fromToken)}
                  </span>
                </div>
              )}
            </div>

            {/* Swap Arrow */}
            <div className="swap-arrow-container">
              <button className="swap-arrow" onClick={swapTokens} title="Swap containers">
                🏗️
              </button>
            </div>

            {/* To Token */}
            <div className="token-input-group">
              <div className="container-icon">📦</div>
              <div className="input-label">TO CONTAINER</div>
              {toTokenMetadata && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                  padding: '6px 10px',
                  background: 'rgba(94, 174, 216, 0.1)',
                  borderRadius: '6px',
                  border: '1px solid rgba(94, 174, 216, 0.2)'
                }}>
                  {toTokenMetadata.image && (
                    <img
                      src={toTokenMetadata.image}
                      alt={toTokenMetadata.symbol}
                      style={{ width: '20px', height: '20px', borderRadius: '50%' }}
                    />
                  )}
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#5EAED8' }}>
                    {toTokenMetadata.symbol}
                  </span>
                  <span style={{ fontSize: '10px', color: '#6B7B8F' }}>
                    {toTokenMetadata.name}
                  </span>
                </div>
              )}
              {loadingToToken && (
                <div style={{ fontSize: '10px', color: '#5EAED8', marginBottom: '8px' }}>
                  🔍 Loading token info...
                </div>
              )}
              <input
                type="text"
                className="token-input"
                placeholder="Token address or symbol"
                value={toToken}
                onChange={(e) => handleToTokenChange(e.target.value)}
              />
              <input
                type="text"
                className="amount-input"
                placeholder="0.0"
                disabled
                style={{ opacity: 0.5 }}
              />
              {toToken && (
                <div style={{ marginTop: '8px' }}>
                  <span className="route-badge">
                    ROUTE: {detectRoute(toToken)}
                  </span>
                </div>
              )}
            </div>

            {/* Swap Button */}
            <button
              className="swap-button"
              onClick={handleSwap}
              disabled={!fromToken || !toToken || !amount || isSwapping}
            >
              {isSwapping ? '🏗️ LOADING...' : '🚢 SHIP IT →'}
            </button>

            {/* Info Section */}
            {fromToken && toToken && amount && (
              <div className="info-section">
                <div style={{ fontSize: '9px', letterSpacing: '0.1em', color: '#5EAED8', marginBottom: '12px', textAlign: 'center' }}>
                  🚢 SHIPPING MANIFEST
                </div>
                <div className="info-row">
                  <span>📊 Rate</span>
                  <span className="info-value">1 TOKEN = 0.000123 ETH</span>
                </div>
                <div className="info-row">
                  <span>⚖️ Impact</span>
                  <span className="info-value" style={{ color: '#4ADE80' }}>{'<0.01%'}</span>
                </div>
                <div className="info-row">
                  <span>⛽ Fuel</span>
                  <span className="info-value">~$0.05</span>
                </div>
                <div className="info-row">
                  <span>🗺️ Route</span>
                  <span className="info-value">{route || 'Auto'}</span>
                </div>
              </div>
            )}
          </div>

          <footer className="footer">
            Built with <a href="https://x.com/ShipsInTheYard" target="_blank" rel="noopener noreferrer">THE SHIPYARD</a> 🚢
          </footer>
        </div>
      </div>
    </>
  );
}
