"use client";
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Connection, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import Trawler from './components/Trawler';
import Sonar from './components/Sonar';
import Bottles from './components/Bottles';
import LaunchHistory from './components/LaunchHistory';
import { TokenConfig, FeeConfig } from './utils/meteora';

export default function ShipyardPlatform() {
  const { publicKey, connected, disconnect, signTransaction, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const searchParams = useSearchParams();

  // Check for ?dev=1 to enable dev mode (bypasses any redirects, shows full UI)
  const isDevMode = searchParams.get('dev') === '1';

  const [activeTab, setActiveTab] = useState('landing');
  const [launchStep, setLaunchStep] = useState(1);
  const [selectedEngine, setSelectedEngine] = useState('navigator');
  const [docsSection, setDocsSection] = useState('overview');
  
  // Form state
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenDescription, setTokenDescription] = useState('');
  const [twitterUrl, setTwitterUrl] = useState('');
  const [telegramUrl, setTelegramUrl] = useState('');
  const [tokenImage, setTokenImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [useImageUrl, setUseImageUrl] = useState(false);

  // Dev buy state
  const [devBuyEnabled, setDevBuyEnabled] = useState(false);
  const [devBuyAmount, setDevBuyAmount] = useState(0);
  const MAX_DEV_BUY_SOL = 1.5; // ~5% of supply at launch price

  // Vanity address state
  const [vanityEnabled, setVanityEnabled] = useState(false);
  const [vanityKeypair, setVanityKeypair] = useState<{ publicKey: string; secretKey: number[] } | null>(null);
  const [isGrinding, setIsGrinding] = useState(false);
  const [grindProgress, setGrindProgress] = useState<{ attempts: number; elapsed: number; rate: number } | null>(null);
  const [vanityWorker, setVanityWorker] = useState<Worker | null>(null);

  // Launch state
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchStatus, setLaunchStatus] = useState<string>('');
  const [launchSuccess, setLaunchSuccess] = useState(false);
  const [launchedToken, setLaunchedToken] = useState<{
    name: string;
    symbol: string;
    address: string;
    poolAddress: string;
  } | null>(null);

  // Start vanity address grinding (client-side)
  const startVanityGrind = () => {
    if (vanityWorker) {
      vanityWorker.terminate();
    }

    setIsGrinding(true);
    setVanityKeypair(null);
    setGrindProgress(null);

    const worker = new Worker('/vanity-worker.js');
    setVanityWorker(worker);

    worker.onerror = (e) => {
      console.error('Worker error:', e);
      setIsGrinding(false);
      worker.terminate();
      setVanityWorker(null);
      alert('Vanity worker failed to load: ' + (e.message || 'Unknown error'));
    };

    worker.onmessage = (e) => {
      const { type, ...data } = e.data;

      if (type === 'progress') {
        setGrindProgress({ attempts: data.attempts, elapsed: data.elapsed, rate: data.rate });
      } else if (type === 'found') {
        setVanityKeypair({ publicKey: data.publicKey, secretKey: data.secretKey });
        setGrindProgress({ attempts: data.attempts, elapsed: data.elapsed, rate: data.rate });
        setIsGrinding(false);
        worker.terminate();
        setVanityWorker(null);
      } else if (type === 'maxed') {
        setIsGrinding(false);
        worker.terminate();
        setVanityWorker(null);
        alert('Failed to find vanity address after 100M attempts. Try again or disable vanity.');
      } else if (type === 'error') {
        setIsGrinding(false);
        worker.terminate();
        setVanityWorker(null);
        alert('Vanity grind error: ' + (data.error || 'Unknown error'));
      }
    };

    // Note: Base58 doesn't have 'I' or 'O', so we use 'SHiP' (lowercase i is valid)
    worker.postMessage({ suffix: 'SHiP', maxAttempts: 100_000_000, reportInterval: 50_000 });
  };

  // Cancel vanity grinding
  const cancelVanityGrind = () => {
    if (vanityWorker) {
      vanityWorker.terminate();
      setVanityWorker(null);
    }
    setIsGrinding(false);
    setGrindProgress(null);
  };

  // Handle image upload
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please upload an image file');
        return;
      }

      // Validate file size (5MB max)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        alert('Image must be smaller than 5MB');
        return;
      }

      setTokenImage(file);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Real launch function using Meteora DBC via API
  const handleLaunch = async () => {
    if (!connected || !publicKey || !signTransaction) {
      setVisible(true);
      return;
    }

    if (!tokenName || !tokenSymbol) {
      alert('Please fill in token name and symbol');
      return;
    }

    // If vanity is enabled, ensure we have a pre-ground keypair
    if (vanityEnabled && !vanityKeypair) {
      alert('Please grind a vanity address first before launching');
      return;
    }

    setIsLaunching(true);
    setLaunchStatus('Preparing launch...');

    try {
      const engine = engines[selectedEngine];

      // Handle image - either URL or upload
      let finalImageUrl = '';
      if (useImageUrl && imageUrl) {
        console.log('Using image URL:', imageUrl);
        finalImageUrl = imageUrl;
      } else if (tokenImage) {
        console.log('Uploading token image...');
        try {
          const { uploadTokenImage } = await import('./utils/imageUpload');
          const uploadResult = await uploadTokenImage(tokenImage);
          finalImageUrl = uploadResult.url;
          console.log('Image uploaded:', uploadResult.provider, finalImageUrl);
        } catch (imageError) {
          console.error('Image upload failed:', imageError);
        }
      }

      // Create proper Metaplex-standard metadata JSON and upload to IPFS
      setLaunchStatus('Uploading metadata...');
      console.log('Creating metadata JSON...');
      const { uploadMetadataToIPFS } = await import('./utils/imageUpload');

      // Build extensions/links for social data (used by Axiom, Birdeye, etc.)
      const extensions: Record<string, string> = {};
      if (twitterUrl) extensions.twitter = twitterUrl;
      if (telegramUrl) extensions.telegram = telegramUrl;
      extensions.website = 'https://shipyardtools.xyz';

      const metadata = {
        name: tokenName,
        symbol: tokenSymbol,
        description: tokenDescription || `${tokenName} token launched on Shipyard`,
        image: finalImageUrl || undefined,
        external_url: twitterUrl || telegramUrl || 'https://shipyardtools.xyz',
        // Standard extensions format for social links
        extensions,
      };
      const metadataUri = await uploadMetadataToIPFS(metadata);
      console.log('Metadata URI:', metadataUri);

      const connection = new Connection(
        process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com',
        'confirmed'
      );

      console.log('Step 1: Getting fee payment transaction...');

      // Step 1: Get fee payment transaction from API
      const engineMap: Record<string, 1 | 2 | 3> = { navigator: 1, lighthouse: 2, supernova: 3 };
      const feeResponse = await fetch('/api/launch-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tokenName,
          symbol: tokenSymbol,
          description: tokenDescription,
          uri: metadataUri,
          engine: engineMap[selectedEngine] || 2,
          creatorWallet: publicKey.toBase58(),
          devBuyAmount: devBuyEnabled ? devBuyAmount : 0,
        }),
      });

      // Check if response is OK before parsing JSON
      if (!feeResponse.ok) {
        const errorText = await feeResponse.text();
        console.error('Fee API error:', feeResponse.status, errorText);
        throw new Error(`API error ${feeResponse.status}: ${errorText.slice(0, 200)}`);
      }

      const feeData = await feeResponse.json();
      if (!feeData.success) {
        throw new Error(feeData.error || 'Failed to create fee transaction');
      }

      console.log('Fee tx received. Launch fee:', feeData.launchFee, 'SOL');

      // Step 2: Sign and send fee payment
      setLaunchStatus('Sign fee payment...');
      console.log('Step 2: Signing fee payment...');
      const feeTx = Transaction.from(Buffer.from(feeData.transaction, 'base64'));
      const signedFeeTx = await signTransaction(feeTx);

      setLaunchStatus('Sending fee payment...');
      console.log('Sending fee payment...');
      const feeSignature = await connection.sendRawTransaction(signedFeeTx.serialize());
      console.log('Fee tx sent:', feeSignature);

      // Wait for confirmation
      setLaunchStatus('Confirming fee payment...');
      console.log('Waiting for fee confirmation...');
      await connection.confirmTransaction(feeSignature, 'confirmed');
      console.log('Fee payment confirmed!');

      // Step 3: Create pool (Shipyard creates it server-side)
      console.log('Step 3: Creating pool via Shipyard...');
      setLaunchStatus('Creating pool...');

      // Build request body
      const createBody: Record<string, unknown> = {
        feeSignature,
        name: tokenName,
        symbol: tokenSymbol,
        uri: metadataUri,
        creatorWallet: publicKey.toBase58(),
        engine: selectedEngine,
        devBuyAmount: devBuyEnabled ? devBuyAmount : 0,
      };

      // If vanity keypair was pre-ground, send it to the API
      if (vanityEnabled && vanityKeypair) {
        console.log('Using pre-ground vanity address:', vanityKeypair.publicKey);
        createBody.vanitySecretKey = vanityKeypair.secretKey;
      }

      const createResponse = await fetch('/api/launch-token/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createBody),
      });

      // Check if response is OK before parsing JSON
      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('Create pool API error:', createResponse.status, errorText);
        throw new Error(`API error ${createResponse.status}: ${errorText.slice(0, 200)}`);
      }

      const createData = await createResponse.json();
      if (!createData.success) {
        throw new Error(createData.error || 'Failed to create pool');
      }

      // Pool created by Shipyard (with optional dev buy + token transfer)
      console.log('Pool created by Shipyard!');
      console.log('Token:', createData.tokenMint);
      console.log('Pool:', createData.poolAddress);
      console.log('Tx:', createData.poolSignature);
      if (createData.tokenTransferSignature) {
        console.log('Tokens transferred:', createData.tokenTransferSignature);
      }

      // Record the launch in our tracking system
      try {
        await fetch('/api/launches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokenMint: createData.tokenMint,
            poolAddress: createData.poolAddress,
            name: tokenName,
            symbol: tokenSymbol,
            description: tokenDescription,
            imageUrl: finalImageUrl || '',
            creator: publicKey.toBase58(),
            engine: engineMap[selectedEngine] || 2,
            devBuyAmount: devBuyEnabled ? devBuyAmount : 0,
            devBuyPercent: devBuyEnabled ? (devBuyAmount / 1.5) * 5 : 0,
          }),
        });
      } catch (e) {
        console.error('Failed to record launch:', e);
      }

      setLaunchedToken({
        name: tokenName,
        symbol: tokenSymbol,
        address: createData.tokenMint,
        poolAddress: createData.poolAddress
      });

      setLaunchSuccess(true);
      console.log('Launch complete!');

    } catch (error) {
      console.error('Launch failed:', error);
      alert('Launch failed: ' + (error as Error).message);
    } finally {
      setIsLaunching(false);
      setLaunchStatus('');
    }
  };

  const engines: Record<string, { name: string; lp: number; burn: number; dev?: number; icon: string; desc: string }> = {
    navigator: { name: 'NAVIGATOR', lp: 80, burn: 20, icon: '⭐', desc: 'Maximum LP depth, steady burns' },
    lighthouse: { name: 'LIGHTHOUSE', lp: 50, burn: 0, dev: 50, icon: '🏮', desc: '50% LP / 50% Dev - Creator rewards' },
    supernova: { name: 'SUPERNOVA', lp: 25, burn: 75, icon: '☄️', desc: 'Maximum deflation, 25/75 split' }
  };

  const tabs = [
    { id: 'landing', label: 'Home' },
    { id: 'raft', label: 'Raft' },
    { id: 'trawler', label: 'Trawler' },
    { id: 'sonar', label: 'Sonar' },
    { id: 'bottles', label: 'Bottles' },
    { id: 'dock', label: 'The Dock' },
    { id: 'docs', label: 'Docs' },
    { id: 'widgets', label: 'Widgets' }
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0f1419 0%, #1a1f2e 50%, #0f1419 100%)',
      color: '#c9d1d9',
      fontFamily: "'Space Mono', monospace",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Outfit:wght@400;500;600;700;800&display=swap');
        
        * { box-sizing: border-box; }
        
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; }
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(136, 192, 255, 0.2); }
          50% { box-shadow: 0 0 40px rgba(136, 192, 255, 0.4); }
        }
        
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        
        .animate-in { animation: slideIn 0.5s ease-out forwards; }
        .glow { animation: glow 3s ease-in-out infinite; }
        .float { animation: float 6s ease-in-out infinite; }
        
        /* Wallet Modal Overrides */
        .wallet-adapter-modal-wrapper {
          background: rgba(15, 20, 25, 0.95) !important;
          backdrop-filter: blur(10px);
        }
        .wallet-adapter-modal-container {
          background: #0f1419 !important;
          border: 1px solid rgba(136, 192, 255, 0.2) !important;
          border-radius: 16px !important;
        }
        .wallet-adapter-modal-title {
          color: #fff !important;
          font-family: 'Outfit', sans-serif !important;
        }
        .wallet-adapter-modal-list li {
          background: rgba(136, 192, 255, 0.05) !important;
          border: 1px solid rgba(136, 192, 255, 0.1) !important;
          border-radius: 8px !important;
          margin-bottom: 8px !important;
        }
        .wallet-adapter-modal-list li:hover {
          background: rgba(136, 192, 255, 0.1) !important;
        }
        .wallet-adapter-button {
          background: linear-gradient(135deg, #88c0ff 0%, #5a9fd4 100%) !important;
          color: #0f1419 !important;
          font-weight: 600 !important;
          border-radius: 8px !important;
        }
      `}</style>

      {/* Stars Background */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {[...Array(40)].map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: '2px',
              height: '2px',
              background: '#88c0ff',
              borderRadius: '50%',
              animation: `twinkle ${2 + Math.random() * 3}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 3}s`,
              opacity: 0.3
            }}
          />
        ))}
      </div>

      {/* Header */}
      <header style={{
        padding: '16px 40px',
        borderBottom: '1px solid rgba(136, 192, 255, 0.15)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(15, 20, 25, 0.9)',
        backdropFilter: 'blur(10px)',
        position: 'relative',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(136, 192, 255, 0.3)'
          }}>
            <img src="/icon.png" alt="Shipyard" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <div style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: '20px',
              fontWeight: '700',
              letterSpacing: '1px',
              color: '#fff'
            }}>
              THE SHIPYARD
            </div>
            <div style={{
              fontSize: '9px',
              color: '#88c0ff',
              letterSpacing: '3px'
            }}>
              WE SHIP WIDGETS
            </div>
          </div>
        </div>

        <nav style={{ display: 'flex', gap: '6px' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 20px',
                background: activeTab === tab.id 
                  ? 'linear-gradient(135deg, #88c0ff 0%, #5a9fd4 100%)' 
                  : 'transparent',
                color: activeTab === tab.id ? '#0f1419' : '#6e7b8b',
                border: activeTab === tab.id ? 'none' : '1px solid rgba(136, 192, 255, 0.2)',
                borderRadius: '6px',
                fontFamily: "'Space Mono', monospace",
                fontSize: '11px',
                fontWeight: activeTab === tab.id ? '700' : '400',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                letterSpacing: '1px'
              }}
            >
              {tab.label.toUpperCase()}
            </button>
          ))}
        </nav>

        <button 
          onClick={() => connected ? disconnect() : setVisible(true)}
          style={{
            padding: '12px 24px',
            background: connected ? 'rgba(136, 192, 255, 0.1)' : 'transparent',
            color: '#88c0ff',
            border: '1px solid #88c0ff',
            borderRadius: '6px',
            fontFamily: "'Space Mono', monospace",
            fontSize: '11px',
            fontWeight: '600',
            cursor: 'pointer',
            letterSpacing: '1px'
          }}>
          {connected 
            ? `${publicKey?.toBase58().slice(0, 4)}...${publicKey?.toBase58().slice(-4)}`
            : 'CONNECT WALLET'
          }
        </button>
      </header>

      <main>
        {/* LANDING PAGE */}
        {activeTab === 'landing' && (
          <div className="animate-in">
            {/* Hero */}
            <section style={{
              minHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center',
              padding: '60px 40px',
              position: 'relative'
            }}>
              {/* Constellation decoration */}
              <svg className="float" style={{ position: 'absolute', top: '15%', right: '15%', opacity: 0.4 }} width="120" height="120" viewBox="0 0 120 120">
                <line x1="60" y1="10" x2="100" y2="50" stroke="#88c0ff" strokeWidth="1" opacity="0.5"/>
                <line x1="100" y1="50" x2="80" y2="100" stroke="#88c0ff" strokeWidth="1" opacity="0.5"/>
                <line x1="80" y1="100" x2="20" y2="80" stroke="#88c0ff" strokeWidth="1" opacity="0.5"/>
                <line x1="20" y1="80" x2="60" y2="10" stroke="#88c0ff" strokeWidth="1" opacity="0.5"/>
                <circle cx="60" cy="10" r="3" fill="#88c0ff"/>
                <circle cx="100" cy="50" r="3" fill="#88c0ff"/>
                <circle cx="80" cy="100" r="3" fill="#88c0ff"/>
                <circle cx="20" cy="80" r="3" fill="#88c0ff"/>
                <circle cx="60" cy="55" r="4" fill="#fff"/>
              </svg>

              {/* Badge */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                background: 'rgba(136, 192, 255, 0.1)',
                border: '1px solid rgba(136, 192, 255, 0.25)',
                borderRadius: '20px',
                marginBottom: '32px',
                fontSize: '11px',
                color: '#88c0ff',
                letterSpacing: '2px'
              }}>
                <span style={{ 
                  width: '6px', 
                  height: '6px', 
                  background: '#88c0ff', 
                  borderRadius: '50%',
                  boxShadow: '0 0 10px #88c0ff'
                }} />
                A SHIPYARD PRODUCT
              </div>

              {/* Headline */}
              <h1 style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: '72px',
                lineHeight: 1.1,
                marginBottom: '24px',
                color: '#fff',
                letterSpacing: '-1px'
              }}>
                <span style={{ 
                  background: 'linear-gradient(135deg, #88c0ff 0%, #a8d4ff 50%, #88c0ff 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}>RAFT</span>
              </h1>

              <p style={{
                fontSize: '20px',
                color: '#fff',
                maxWidth: '500px',
                lineHeight: 1.5,
                marginBottom: '16px',
                fontFamily: "'Outfit', sans-serif",
                fontWeight: '500'
              }}>
                Stay afloat.
              </p>

              <p style={{
                fontSize: '15px',
                color: '#6e7b8b',
                maxWidth: '520px',
                lineHeight: 1.7,
                marginBottom: '40px'
              }}>
                The trenches became a negative-sum game. Money leaks out every trade.
                <span style={{ color: '#9ab4c8' }}> Raft is a launchpad where the money stays in.</span>
              </p>

              {/* CTAs */}
              <div style={{ display: 'flex', gap: '16px', marginBottom: '70px' }}>
                <button 
                  onClick={() => setActiveTab('raft')}
                  style={{
                    padding: '16px 36px',
                    background: 'linear-gradient(135deg, #88c0ff 0%, #5a9fd4 100%)',
                    color: '#0f1419',
                    border: 'none',
                    borderRadius: '8px',
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    letterSpacing: '1px',
                    boxShadow: '0 4px 30px rgba(136, 192, 255, 0.35)'
                  }}
                >
                  LAUNCH ON RAFT →
                </button>
                <button 
                  onClick={() => setActiveTab('docs')}
                  style={{
                    padding: '16px 36px',
                    background: 'transparent',
                    color: '#6e7b8b',
                    border: '1px solid rgba(136, 192, 255, 0.25)',
                    borderRadius: '8px',
                    fontFamily: "'Space Mono', monospace",
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}>
                  VIEW DOCS
                </button>
              </div>

              {/* Stats */}
              <div className="glow" style={{
                display: 'flex',
                gap: '50px',
                padding: '28px 48px',
                background: 'rgba(15, 20, 25, 0.8)',
                border: '1px solid rgba(136, 192, 255, 0.15)',
                borderRadius: '12px',
                backdropFilter: 'blur(10px)'
              }}>
                {[
                  { value: '847', label: 'VESSELS SHIPPED', color: '#88c0ff' },
                  { value: '12,450', label: 'SOL COMPOUNDED', color: '#88c0ff' },
                  { value: '∞', label: 'LP LOCKED', color: '#a8d4ff' },
                  { value: '0%', label: 'DEV EXTRACTION', color: '#7ee787' }
                ].map((stat, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div style={{
                      fontFamily: "'Outfit', sans-serif",
                      fontSize: '30px',
                      fontWeight: '700',
                      color: stat.color,
                      marginBottom: '4px'
                    }}>
                      {stat.value}
                    </div>
                    <div style={{ fontSize: '9px', color: '#4a5568', letterSpacing: '2px' }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* How It Works */}
            <section style={{ padding: '80px 40px', background: 'rgba(20, 27, 35, 0.5)' }}>
              <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: '50px' }}>
                  <div style={{ fontSize: '10px', color: '#88c0ff', letterSpacing: '3px', marginBottom: '12px' }}>
                    HOW RAFT WORKS
                  </div>
                  <h2 style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: '38px',
                    fontWeight: '700',
                    color: '#fff'
                  }}>
                    LAUNCH IN 3 STEPS
                  </h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                  {[
                    { num: '01', title: 'PAY LAUNCH FEE', desc: '0.01 SOL flat. No ongoing fees. No extraction.', icon: '⚓' },
                    { num: '02', title: 'PICK YOUR SPLIT', desc: 'Choose how fees compound: more LP or more burns.', icon: '⚖️' },
                    { num: '03', title: 'STAY AFLOAT', desc: 'Launch with locked LP, 0% extraction, auto-compound.', icon: '🛟' }
                  ].map((step, i) => (
                    <div key={i} style={{
                      padding: '32px 28px',
                      background: 'rgba(15, 20, 25, 0.8)',
                      border: '1px solid rgba(136, 192, 255, 0.1)',
                      borderRadius: '12px',
                      position: 'relative'
                    }}>
                      <div style={{
                        fontSize: '48px',
                        fontFamily: "'Outfit', sans-serif",
                        fontWeight: '800',
                        color: 'rgba(136, 192, 255, 0.08)',
                        position: 'absolute',
                        top: '12px',
                        right: '20px'
                      }}>
                        {step.num}
                      </div>
                      <div style={{
                        width: '50px',
                        height: '50px',
                        background: 'rgba(136, 192, 255, 0.1)',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '24px',
                        marginBottom: '20px',
                        border: '1px solid rgba(136, 192, 255, 0.15)'
                      }}>
                        {step.icon}
                      </div>
                      <h3 style={{
                        fontFamily: "'Outfit', sans-serif",
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#fff',
                        marginBottom: '10px'
                      }}>
                        {step.title}
                      </h3>
                      <p style={{ fontSize: '13px', color: '#6e7b8b', lineHeight: 1.5 }}>
                        {step.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Seaworthy Guarantee */}
            <section style={{ padding: '80px 40px' }}>
              <div style={{ maxWidth: '850px', margin: '0 auto' }}>
                <div style={{
                  padding: '50px',
                  borderRadius: '16px',
                  border: '2px solid rgba(136, 192, 255, 0.25)',
                  background: 'linear-gradient(135deg, rgba(136, 192, 255, 0.05) 0%, transparent 100%)',
                  position: 'relative'
                }}>
                  {/* Corner stars */}
                  <div style={{ position: 'absolute', top: '-6px', left: '-6px', color: '#88c0ff', fontSize: '12px' }}>✦</div>
                  <div style={{ position: 'absolute', top: '-6px', right: '-6px', color: '#88c0ff', fontSize: '12px' }}>✦</div>
                  <div style={{ position: 'absolute', bottom: '-6px', left: '-6px', color: '#88c0ff', fontSize: '12px' }}>✦</div>
                  <div style={{ position: 'absolute', bottom: '-6px', right: '-6px', color: '#88c0ff', fontSize: '12px' }}>✦</div>

                  <div style={{ fontSize: '10px', color: '#88c0ff', letterSpacing: '3px', marginBottom: '20px' }}>
                    ✓ SEAWORTHY CERTIFICATION
                  </div>

                  <h2 style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: '28px',
                    fontWeight: '700',
                    color: '#fff',
                    marginBottom: '28px',
                    lineHeight: 1.3
                  }}>
                    EVERY RAFT LAUNCH<br />
                    COMES WITH THESE LOCKED IN:
                  </h2>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                    {[
                      { check: '0% dev extraction', desc: 'Money stays in the game' },
                      { check: '100% LP locked forever', desc: 'No rugs. Period.' },
                      { check: 'Immutable metadata', desc: "Can't change name or mint more" },
                      { check: 'Auto-compound forever', desc: 'Fees → LP + Burns, on autopilot' }
                    ].map((item, i) => (
                      <div key={i} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                        <div style={{
                          width: '22px',
                          height: '22px',
                          background: 'linear-gradient(135deg, #88c0ff 0%, #5a9fd4 100%)',
                          borderRadius: '5px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#0f1419',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          flexShrink: 0
                        }}>
                          ✓
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', color: '#fff', fontWeight: '600', marginBottom: '3px' }}>
                            {item.check}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6e7b8b' }}>
                            {item.desc}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* CTA */}
            <section style={{ padding: '80px 40px', textAlign: 'center' }}>
              <h2 style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: '42px',
                fontWeight: '700',
                color: '#fff',
                marginBottom: '14px'
              }}>
                READY TO STAY AFLOAT?
              </h2>
              <p style={{ fontSize: '15px', color: '#6e7b8b', marginBottom: '35px' }}>
                0.01 SOL. Zero extraction. Your token floats.
              </p>
              <button
                onClick={() => setActiveTab('raft')}
                style={{
                  padding: '18px 50px',
                  background: 'linear-gradient(135deg, #88c0ff 0%, #5a9fd4 100%)',
                  color: '#0f1419',
                  border: 'none',
                  borderRadius: '8px',
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: '15px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: '0 4px 35px rgba(136, 192, 255, 0.4)'
                }}
              >
                LAUNCH ON RAFT →
              </button>
            </section>
          </div>
        )}

        {/* RAFT - Launch Flow */}
        {activeTab === 'raft' && (
          <div className="animate-in" style={{ padding: '40px', maxWidth: '950px', margin: '0 auto' }}>
            <div style={{ marginBottom: '35px' }}>
              <div style={{ fontSize: '10px', color: '#88c0ff', letterSpacing: '3px', marginBottom: '6px' }}>
                RAFT BY THE SHIPYARD
              </div>
              <h1 style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: '32px',
                fontWeight: '700',
                color: '#fff'
              }}>
                LAUNCH YOUR TOKEN
              </h1>
            </div>

            {/* Progress */}
            <div style={{ display: 'flex', marginBottom: '35px', position: 'relative' }}>
              <div style={{
                position: 'absolute',
                top: '18px',
                left: '70px',
                right: '70px',
                height: '2px',
                background: 'rgba(136, 192, 255, 0.15)'
              }}>
                <div style={{
                  width: `${((launchStep - 1) / 2) * 100}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #88c0ff, #5a9fd4)',
                  transition: 'width 0.3s ease',
                  boxShadow: '0 0 10px rgba(136, 192, 255, 0.5)'
                }} />
              </div>

              {['TOKEN INFO', 'FEE SPLIT', 'LAUNCH'].map((step, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
                  <div
                    onClick={() => setLaunchStep(i + 1)}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: launchStep > i 
                        ? 'linear-gradient(135deg, #88c0ff, #5a9fd4)' 
                        : launchStep === i + 1 ? 'rgba(15, 20, 25, 0.9)' : 'rgba(15, 20, 25, 0.5)',
                      border: launchStep === i + 1 ? '2px solid #88c0ff' : '1px solid rgba(136, 192, 255, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: launchStep > i ? '#0f1419' : '#6e7b8b',
                      fontWeight: '700',
                      fontSize: '13px',
                      cursor: 'pointer',
                      boxShadow: launchStep === i + 1 ? '0 0 20px rgba(136, 192, 255, 0.3)' : 'none'
                    }}
                  >
                    {launchStep > i ? '✓' : i + 1}
                  </div>
                  <span style={{
                    marginTop: '10px',
                    fontSize: '9px',
                    color: launchStep === i + 1 ? '#88c0ff' : '#4a5568',
                    letterSpacing: '1px'
                  }}>
                    {step}
                  </span>
                </div>
              ))}
            </div>

            {/* Form */}
            <div style={{
              borderRadius: '16px',
              padding: '35px',
              background: 'rgba(15, 20, 25, 0.8)',
              border: '1px solid rgba(136, 192, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              minHeight: '450px'
            }}>
              {/* Step 1 */}
              {launchStep === 1 && (
                <div>
                  <h2 style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: '18px',
                    fontWeight: '600',
                    color: '#fff',
                    marginBottom: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <span style={{ color: '#88c0ff' }}>01</span> TOKEN INFORMATION
                  </h2>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '9px', color: '#88c0ff', marginBottom: '8px', letterSpacing: '2px' }}>
                        TOKEN NAME
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. MyToken"
                        value={tokenName}
                        onChange={(e) => setTokenName(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '14px',
                          background: 'rgba(10, 14, 18, 0.8)',
                          border: '1px solid rgba(136, 192, 255, 0.15)',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '14px',
                          fontFamily: "'Space Mono', monospace",
                          outline: 'none'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '9px', color: '#88c0ff', marginBottom: '8px', letterSpacing: '2px' }}>
                        SYMBOL
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. STAR"
                        value={tokenSymbol}
                        onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                        style={{
                          width: '100%',
                          padding: '14px',
                          background: 'rgba(10, 14, 18, 0.8)',
                          border: '1px solid rgba(136, 192, 255, 0.15)',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '14px',
                          fontFamily: "'Space Mono', monospace",
                          outline: 'none'
                        }}
                      />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ display: 'block', fontSize: '9px', color: '#88c0ff', marginBottom: '8px', letterSpacing: '2px' }}>
                        DESCRIPTION
                      </label>
                      <textarea
                        placeholder="Chart your vessel's journey..."
                        rows={3}
                        value={tokenDescription}
                        onChange={(e) => setTokenDescription(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '14px',
                          background: 'rgba(10, 14, 18, 0.8)',
                          border: '1px solid rgba(136, 192, 255, 0.15)',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '14px',
                          fontFamily: "'Space Mono', monospace",
                          outline: 'none',
                          resize: 'none'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '9px', color: '#88c0ff', marginBottom: '8px', letterSpacing: '2px' }}>
                        VESSEL IMAGE
                      </label>

                      {/* Toggle between URL and Upload */}
                      <div style={{ marginBottom: '10px', display: 'flex', gap: '10px' }}>
                        <button
                          type="button"
                          onClick={() => setUseImageUrl(false)}
                          style={{
                            padding: '8px 16px',
                            background: !useImageUrl ? 'rgba(136, 192, 255, 0.2)' : 'rgba(10, 14, 18, 0.8)',
                            border: '1px solid rgba(136, 192, 255, 0.3)',
                            borderRadius: '6px',
                            color: !useImageUrl ? '#88c0ff' : '#6a7b8c',
                            fontSize: '11px',
                            cursor: 'pointer',
                            fontFamily: "'Space Mono', monospace"
                          }}
                        >
                          Upload File
                        </button>
                        <button
                          type="button"
                          onClick={() => setUseImageUrl(true)}
                          style={{
                            padding: '8px 16px',
                            background: useImageUrl ? 'rgba(136, 192, 255, 0.2)' : 'rgba(10, 14, 18, 0.8)',
                            border: '1px solid rgba(136, 192, 255, 0.3)',
                            borderRadius: '6px',
                            color: useImageUrl ? '#88c0ff' : '#6a7b8c',
                            fontSize: '11px',
                            cursor: 'pointer',
                            fontFamily: "'Space Mono', monospace"
                          }}
                        >
                          Use URL
                        </button>
                      </div>

                      {useImageUrl ? (
                        // Image URL input
                        <input
                          type="text"
                          placeholder="https://example.com/image.png"
                          value={imageUrl}
                          onChange={(e) => {
                            setImageUrl(e.target.value);
                            setImagePreview(e.target.value);
                          }}
                          style={{
                            width: '100%',
                            padding: '14px',
                            background: 'rgba(10, 14, 18, 0.8)',
                            border: '1px solid rgba(136, 192, 255, 0.15)',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '13px',
                            fontFamily: "'Space Mono', monospace",
                            outline: 'none'
                          }}
                        />
                      ) : (
                        // File upload
                        <label style={{ cursor: 'pointer', display: 'block' }}>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            style={{ display: 'none' }}
                          />
                          <div style={{
                            width: '120px',
                            height: '120px',
                            backgroundColor: 'rgba(10, 14, 18, 0.8)',
                            backgroundImage: imagePreview && !useImageUrl ? `url(${imagePreview})` : 'none',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            backgroundRepeat: 'no-repeat',
                            border: '2px dashed rgba(136, 192, 255, 0.2)',
                            borderRadius: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#4a5568',
                            fontSize: '12px',
                            position: 'relative',
                            overflow: 'hidden'
                          }}>
                            {!imagePreview || useImageUrl ? (
                              <>
                                <span style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.5 }}>⭐</span>
                                <span style={{ textAlign: 'center' }}>Drop image or click</span>
                              </>
                            ) : (
                              <div style={{
                                position: 'absolute',
                                bottom: '8px',
                                right: '8px',
                                background: 'rgba(0,0,0,0.7)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                color: '#88c0ff'
                              }}>
                                Click to change
                              </div>
                            )}
                          </div>
                        </label>
                      )}

                      {/* Image preview for URL */}
                      {useImageUrl && imageUrl && (
                        <div style={{
                          marginTop: '10px',
                          height: '80px',
                          background: `url(${imageUrl}) center/cover`,
                          border: '1px solid rgba(136, 192, 255, 0.2)',
                          borderRadius: '8px'
                        }} />
                      )}
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '9px', color: '#88c0ff', marginBottom: '8px', letterSpacing: '2px' }}>
                        SOCIALS (OPTIONAL)
                      </label>
                      <input type="text" placeholder="Twitter URL" value={twitterUrl} onChange={(e) => setTwitterUrl(e.target.value)} style={{
                        width: '100%', padding: '12px', background: 'rgba(10, 14, 18, 0.8)',
                        border: '1px solid rgba(136, 192, 255, 0.15)', borderRadius: '8px',
                        color: '#fff', fontSize: '13px', fontFamily: "'Space Mono', monospace",
                        outline: 'none', marginBottom: '8px'
                      }} />
                      <input type="text" placeholder="Telegram URL" value={telegramUrl} onChange={(e) => setTelegramUrl(e.target.value)} style={{
                        width: '100%', padding: '12px', background: 'rgba(10, 14, 18, 0.8)',
                        border: '1px solid rgba(136, 192, 255, 0.15)', borderRadius: '8px',
                        color: '#fff', fontSize: '13px', fontFamily: "'Space Mono', monospace",
                        outline: 'none'
                      }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2 */}
              {launchStep === 2 && (
                <div>
                  <h2 style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: '18px',
                    fontWeight: '600',
                    color: '#fff',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <span style={{ color: '#88c0ff' }}>02</span> CHOOSE YOUR SPLIT
                  </h2>
                  <p style={{ fontSize: '12px', color: '#6e7b8b', marginBottom: '28px' }}>
                    Fees stay in the ecosystem. Choose how they raise the waters.
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '28px' }}>
                    {Object.entries(engines).map(([key, engine]) => (
                      <div
                        key={key}
                        onClick={() => setSelectedEngine(key)}
                        style={{
                          padding: '22px',
                          background: selectedEngine === key ? 'rgba(136, 192, 255, 0.1)' : 'rgba(10, 14, 18, 0.8)',
                          border: selectedEngine === key ? '2px solid #88c0ff' : '1px solid rgba(136, 192, 255, 0.15)',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: selectedEngine === key ? '0 0 25px rgba(136, 192, 255, 0.2)' : 'none'
                        }}
                      >
                        <div style={{ fontSize: '28px', marginBottom: '10px' }}>{engine.icon}</div>
                        <div style={{
                          fontFamily: "'Outfit', sans-serif",
                          fontSize: '13px',
                          fontWeight: '600',
                          color: selectedEngine === key ? '#88c0ff' : '#fff',
                          marginBottom: '6px'
                        }}>
                          {engine.name}
                        </div>
                        <div style={{ fontSize: '10px', color: '#6e7b8b', marginBottom: '14px' }}>
                          {engine.desc}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <div style={{
                            padding: '5px 8px',
                            background: 'rgba(136, 192, 255, 0.1)',
                            borderRadius: '4px',
                            fontSize: '9px',
                            color: '#88c0ff',
                            border: '1px solid rgba(136, 192, 255, 0.2)'
                          }}>
                            {engine.lp}% LP
                          </div>
                          <div style={{
                            padding: '5px 8px',
                            background: 'rgba(249, 115, 22, 0.1)',
                            borderRadius: '4px',
                            fontSize: '9px',
                            color: '#f97316',
                            border: '1px solid rgba(249, 115, 22, 0.2)'
                          }}>
                            {engine.burn}% BURN
                          </div>
                          {engine.dev !== undefined && engine.dev > 0 && (
                            <div style={{
                              padding: '5px 8px',
                              background: 'rgba(74, 222, 128, 0.1)',
                              borderRadius: '4px',
                              fontSize: '9px',
                              color: '#4ade80',
                              border: '1px solid rgba(74, 222, 128, 0.2)'
                            }}>
                              {engine.dev}% DEV
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Gauge */}
                  <div style={{
                    padding: '22px',
                    background: 'rgba(10, 14, 18, 0.8)',
                    borderRadius: '12px',
                    border: '1px solid rgba(136, 192, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '28px'
                  }}>
                    <div style={{
                      width: '120px',
                      height: '120px',
                      borderRadius: '50%',
                      background: `conic-gradient(#88c0ff 0deg ${engines[selectedEngine].lp * 3.6}deg, #f97316 ${engines[selectedEngine].lp * 3.6}deg 360deg)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 0 30px rgba(136, 192, 255, 0.2)'
                    }}>
                      <div style={{
                        width: '85px',
                        height: '85px',
                        background: '#0f1419',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column'
                      }}>
                        <span style={{ fontSize: '9px', color: '#4a5568' }}>DEV FEE</span>
                        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: '24px', fontWeight: '700', color: '#7ee787' }}>0%</span>
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <span style={{ fontSize: '11px', color: '#6e7b8b' }}>→ Liquidity Pool</span>
                          <span style={{ fontSize: '11px', color: '#88c0ff', fontWeight: '600' }}>{engines[selectedEngine].lp}%</span>
                        </div>
                        <div style={{ height: '8px', background: 'rgba(136, 192, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${engines[selectedEngine].lp}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #88c0ff, #5a9fd4)',
                            borderRadius: '4px',
                            boxShadow: '0 0 10px rgba(136, 192, 255, 0.5)'
                          }} />
                        </div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <span style={{ fontSize: '11px', color: '#6e7b8b' }}>→ Buyback & Burn</span>
                          <span style={{ fontSize: '11px', color: '#f97316', fontWeight: '600' }}>{engines[selectedEngine].burn}%</span>
                        </div>
                        <div style={{ height: '8px', background: 'rgba(249, 115, 22, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${engines[selectedEngine].burn}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #f97316, #ea580c)',
                            borderRadius: '4px'
                          }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dev Buy Section */}
                  <div style={{
                    marginTop: '28px',
                    padding: '22px',
                    background: 'rgba(10, 14, 18, 0.8)',
                    borderRadius: '12px',
                    border: '1px solid rgba(136, 192, 255, 0.1)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div>
                        <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '4px' }}>
                          Dev Buy (Optional)
                        </div>
                        <div style={{ fontSize: '11px', color: '#6e7b8b' }}>
                          Buy up to 5% of supply at launch. Transparent & on-chain.
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setDevBuyEnabled(!devBuyEnabled);
                          if (!devBuyEnabled) setDevBuyAmount(0);
                        }}
                        style={{
                          padding: '8px 16px',
                          background: devBuyEnabled ? 'rgba(126, 231, 135, 0.2)' : 'rgba(136, 192, 255, 0.1)',
                          border: devBuyEnabled ? '1px solid rgba(126, 231, 135, 0.4)' : '1px solid rgba(136, 192, 255, 0.2)',
                          borderRadius: '8px',
                          color: devBuyEnabled ? '#7ee787' : '#6e7b8b',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontFamily: "'Space Mono', monospace",
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {devBuyEnabled ? 'ENABLED' : 'DISABLED'}
                      </button>
                    </div>

                    {devBuyEnabled && (
                      <div>
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '11px', color: '#6e7b8b' }}>Amount (SOL)</span>
                            <span style={{ fontSize: '11px', color: '#88c0ff', fontWeight: '600' }}>
                              {devBuyAmount.toFixed(2)} SOL (~{((devBuyAmount / MAX_DEV_BUY_SOL) * 5).toFixed(1)}% supply)
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max={MAX_DEV_BUY_SOL}
                            step="0.25"
                            value={devBuyAmount}
                            onChange={(e) => setDevBuyAmount(parseFloat(e.target.value))}
                            style={{
                              width: '100%',
                              height: '8px',
                              borderRadius: '4px',
                              background: `linear-gradient(to right, #88c0ff ${(devBuyAmount / MAX_DEV_BUY_SOL) * 100}%, rgba(136, 192, 255, 0.1) ${(devBuyAmount / MAX_DEV_BUY_SOL) * 100}%)`,
                              appearance: 'none',
                              cursor: 'pointer'
                            }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                            <span style={{ fontSize: '9px', color: '#4a5568' }}>0 SOL</span>
                            <span style={{ fontSize: '9px', color: '#4a5568' }}>{MAX_DEV_BUY_SOL} SOL (5%)</span>
                          </div>
                        </div>
                        <div style={{
                          padding: '12px',
                          background: 'rgba(126, 231, 135, 0.05)',
                          border: '1px solid rgba(126, 231, 135, 0.15)',
                          borderRadius: '8px',
                          fontSize: '10px',
                          color: '#7ee787'
                        }}>
                          Dev buys are publicly visible on-chain. This will be shown on your token page.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Vanity Address Section */}
                  <div style={{
                    marginTop: '28px',
                    padding: '22px',
                    background: 'rgba(10, 14, 18, 0.8)',
                    borderRadius: '12px',
                    border: '1px solid rgba(136, 192, 255, 0.1)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div>
                        <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          Vanity Address
                          <span style={{
                            padding: '2px 6px',
                            background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(245, 158, 11, 0.2))',
                            border: '1px solid rgba(251, 191, 36, 0.3)',
                            borderRadius: '4px',
                            fontSize: '9px',
                            color: '#fbbf24',
                            fontWeight: '600'
                          }}>
                            SHIP
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#6e7b8b' }}>
                          Generate a token address ending in &quot;SHIP&quot; (takes 2-4 min)
                        </div>
                      </div>
                      <button
                        onClick={() => setVanityEnabled(!vanityEnabled)}
                        style={{
                          padding: '8px 16px',
                          background: vanityEnabled ? 'rgba(251, 191, 36, 0.2)' : 'rgba(136, 192, 255, 0.1)',
                          border: vanityEnabled ? '1px solid rgba(251, 191, 36, 0.4)' : '1px solid rgba(136, 192, 255, 0.2)',
                          borderRadius: '8px',
                          color: vanityEnabled ? '#fbbf24' : '#6e7b8b',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontFamily: "'Space Mono', monospace",
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {vanityEnabled ? 'ENABLED' : 'DISABLED'}
                      </button>
                    </div>

                    {vanityEnabled && (
                      <div>
                        {/* Grind controls */}
                        {!vanityKeypair && !isGrinding && (
                          <div style={{ marginBottom: '12px' }}>
                            <button
                              onClick={startVanityGrind}
                              style={{
                                padding: '12px 24px',
                                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                                border: 'none',
                                borderRadius: '8px',
                                color: '#0f1419',
                                fontSize: '12px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                fontFamily: "'Space Mono', monospace",
                              }}
                            >
                              ⚡ START GRINDING
                            </button>
                            <div style={{ fontSize: '10px', color: '#6e7b8b', marginTop: '8px' }}>
                              Click to find a vanity address before paying. You can cancel anytime.
                            </div>
                          </div>
                        )}

                        {/* Grinding in progress */}
                        {isGrinding && (
                          <div style={{
                            padding: '16px',
                            background: 'rgba(251, 191, 36, 0.1)',
                            border: '1px solid rgba(251, 191, 36, 0.3)',
                            borderRadius: '8px',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                              <div style={{ fontSize: '12px', color: '#fbbf24', fontWeight: '600' }}>
                                ⏳ Grinding for ...SHIP
                              </div>
                              <button
                                onClick={cancelVanityGrind}
                                style={{
                                  padding: '6px 12px',
                                  background: 'transparent',
                                  border: '1px solid rgba(239, 68, 68, 0.4)',
                                  borderRadius: '4px',
                                  color: '#ef4444',
                                  fontSize: '10px',
                                  cursor: 'pointer',
                                  fontFamily: "'Space Mono', monospace",
                                }}
                              >
                                CANCEL
                              </button>
                            </div>
                            {grindProgress && (
                              <div style={{ fontSize: '11px', color: '#6e7b8b' }}>
                                <div>Attempts: {grindProgress.attempts.toLocaleString()}</div>
                                <div>Time: {grindProgress.elapsed.toFixed(1)}s</div>
                                <div>Rate: {grindProgress.rate.toLocaleString()}/sec</div>
                              </div>
                            )}
                            <div style={{
                              marginTop: '12px',
                              height: '4px',
                              background: 'rgba(251, 191, 36, 0.2)',
                              borderRadius: '2px',
                              overflow: 'hidden'
                            }}>
                              <div style={{
                                width: '100%',
                                height: '100%',
                                background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                                animation: 'shimmer 1.5s ease-in-out infinite',
                              }} />
                            </div>
                          </div>
                        )}

                        {/* Found vanity address */}
                        {vanityKeypair && (
                          <div style={{
                            padding: '16px',
                            background: 'rgba(126, 231, 135, 0.1)',
                            border: '1px solid rgba(126, 231, 135, 0.3)',
                            borderRadius: '8px',
                          }}>
                            <div style={{ fontSize: '12px', color: '#7ee787', fontWeight: '600', marginBottom: '8px' }}>
                              ✓ Vanity Address Found!
                            </div>
                            <div style={{
                              padding: '10px',
                              background: 'rgba(0, 0, 0, 0.3)',
                              borderRadius: '6px',
                              fontFamily: "'Space Mono', monospace",
                              fontSize: '11px',
                              color: '#fbbf24',
                              wordBreak: 'break-all'
                            }}>
                              {vanityKeypair.publicKey}
                            </div>
                            <div style={{ fontSize: '10px', color: '#6e7b8b', marginTop: '8px' }}>
                              This address is ready. Proceed to launch to use it.
                            </div>
                            <button
                              onClick={() => { setVanityKeypair(null); startVanityGrind(); }}
                              style={{
                                marginTop: '10px',
                                padding: '6px 12px',
                                background: 'transparent',
                                border: '1px solid rgba(136, 192, 255, 0.3)',
                                borderRadius: '4px',
                                color: '#6e7b8b',
                                fontSize: '10px',
                                cursor: 'pointer',
                                fontFamily: "'Space Mono', monospace",
                              }}
                            >
                              GRIND NEW ADDRESS
                            </button>
                          </div>
                        )}

                        {/* Info when nothing happening */}
                        {!vanityKeypair && !isGrinding && (
                          <div style={{
                            padding: '12px',
                            background: 'rgba(251, 191, 36, 0.05)',
                            border: '1px solid rgba(251, 191, 36, 0.15)',
                            borderRadius: '8px',
                            fontSize: '10px',
                            color: '#fbbf24',
                            marginTop: '12px'
                          }}>
                            Your token address will end in <strong>...SHIP</strong>. Grind happens in your browser - no payment until you&apos;re ready!
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3 */}
              {launchStep === 3 && (
                <div>
                  <h2 style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: '18px',
                    fontWeight: '600',
                    color: '#fff',
                    marginBottom: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <span style={{ color: '#88c0ff' }}>03</span> READY TO LAUNCH
                  </h2>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px' }}>
                    <div style={{
                      padding: '22px',
                      background: 'rgba(10, 14, 18, 0.8)',
                      borderRadius: '12px',
                      border: '1px solid rgba(136, 192, 255, 0.1)'
                    }}>
                      <div style={{ fontSize: '9px', color: '#4a5568', letterSpacing: '2px', marginBottom: '18px' }}>
                        LAUNCH SUMMARY
                      </div>
                      {[
                        { label: 'Token', value: tokenName ? `${tokenName} (${tokenSymbol})` : 'Not set', color: '#fff' },
                        { label: 'Split', value: engines[selectedEngine].name, color: '#88c0ff' },
                        { label: 'LP Reinvest', value: `${engines[selectedEngine].lp}%`, color: '#88c0ff' },
                        { label: 'Burn Rate', value: `${engines[selectedEngine].burn}%`, color: '#f97316' },
                        { label: 'Dev Buy', value: devBuyEnabled && devBuyAmount > 0 ? `${devBuyAmount.toFixed(2)} SOL (~${((devBuyAmount / MAX_DEV_BUY_SOL) * 5).toFixed(1)}%)` : 'None', color: devBuyEnabled && devBuyAmount > 0 ? '#88c0ff' : '#6e7b8b' },
                        { label: 'Dev Extraction', value: '0% LOCKED', color: '#7ee787' },
                        { label: 'LP Status', value: 'LOCKED FOREVER', color: '#7ee787' },
                      ].map((item, i) => (
                        <div key={i} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '10px 0',
                          borderBottom: '1px solid rgba(136, 192, 255, 0.08)'
                        }}>
                          <span style={{ fontSize: '12px', color: '#6e7b8b' }}>{item.label}</span>
                          <span style={{ fontSize: '12px', color: item.color, fontWeight: '600' }}>{item.value}</span>
                        </div>
                      ))}

                      {/* Vanity Address Display */}
                      {vanityEnabled && vanityKeypair && (
                        <div style={{
                          marginTop: '16px',
                          padding: '14px',
                          background: 'rgba(126, 231, 135, 0.08)',
                          border: '1px solid rgba(126, 231, 135, 0.25)',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '9px', color: '#7ee787', letterSpacing: '1px', marginBottom: '8px' }}>
                            ✓ VANITY TOKEN ADDRESS
                          </div>
                          <div style={{
                            fontFamily: "'Space Mono', monospace",
                            fontSize: '10px',
                            color: '#fbbf24',
                            wordBreak: 'break-all',
                            lineHeight: '1.4'
                          }}>
                            {vanityKeypair.publicKey}
                          </div>
                        </div>
                      )}

                      {vanityEnabled && !vanityKeypair && (
                        <div style={{
                          marginTop: '16px',
                          padding: '14px',
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '10px', color: '#ef4444' }}>
                            ⚠️ Go back to Step 2 and grind a vanity address first
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="glow" style={{
                        padding: '22px',
                        background: 'linear-gradient(135deg, rgba(136, 192, 255, 0.12) 0%, rgba(136, 192, 255, 0.04) 100%)',
                        border: '1px solid rgba(136, 192, 255, 0.25)',
                        borderRadius: '12px',
                        marginBottom: '14px'
                      }}>
                        <div style={{ fontSize: '9px', color: '#88c0ff', letterSpacing: '2px', marginBottom: '14px' }}>
                          LAUNCH FEE
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '12px', color: '#6e7b8b' }}>Raft Fee</span>
                          <span style={{ fontSize: '13px', color: '#fff' }}>2.00 SOL</span>
                        </div>
                        {devBuyEnabled && devBuyAmount > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontSize: '12px', color: '#6e7b8b' }}>Dev Buy</span>
                            <span style={{ fontSize: '13px', color: '#88c0ff' }}>{devBuyAmount.toFixed(2)} SOL</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                          <span style={{ fontSize: '12px', color: '#6e7b8b' }}>Network</span>
                          <span style={{ fontSize: '13px', color: '#fff' }}>~0.01 SOL</span>
                        </div>
                        <div style={{
                          padding: '14px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <span style={{ fontSize: '13px', color: '#6e7b8b' }}>Total</span>
                          <span style={{
                            fontFamily: "'Outfit', sans-serif",
                            fontSize: '26px',
                            fontWeight: '700',
                            color: '#88c0ff'
                          }}>
                            {(2.01 + (devBuyEnabled ? devBuyAmount : 0)).toFixed(2)} SOL
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={handleLaunch}
                        disabled={isLaunching || (vanityEnabled && !vanityKeypair)}
                        style={{
                          width: '100%',
                          padding: '18px',
                          background: isLaunching || (vanityEnabled && !vanityKeypair)
                            ? 'rgba(136, 192, 255, 0.3)'
                            : 'linear-gradient(135deg, #88c0ff 0%, #5a9fd4 100%)',
                          color: isLaunching || (vanityEnabled && !vanityKeypair) ? '#88c0ff' : '#0f1419',
                          border: 'none',
                          borderRadius: '8px',
                          fontFamily: "'Outfit', sans-serif",
                          fontSize: isLaunching ? '13px' : '15px',
                          fontWeight: '700',
                          cursor: isLaunching || (vanityEnabled && !vanityKeypair) ? 'not-allowed' : 'pointer',
                          boxShadow: isLaunching || (vanityEnabled && !vanityKeypair) ? 'none' : '0 4px 25px rgba(136, 192, 255, 0.4)'
                        }}>
                        {isLaunching
                          ? `⏳ ${launchStatus || 'LAUNCHING...'}`
                          : vanityEnabled && !vanityKeypair
                            ? '⚠️ GRIND VANITY ADDRESS FIRST'
                            : '🛟 LAUNCH ON RAFT'}
                      </button>
                      {isLaunching && launchStatus.includes('vanity') && (
                        <div style={{
                          marginTop: '12px',
                          padding: '10px 14px',
                          background: 'rgba(251, 191, 36, 0.1)',
                          border: '1px solid rgba(251, 191, 36, 0.3)',
                          borderRadius: '6px',
                          fontSize: '11px',
                          color: '#fbbf24',
                          textAlign: 'center'
                        }}>
                          Finding a token address ending in <strong>SHIP</strong>... this takes 2-4 minutes. Please wait!
                        </div>
                      )}
                      <p style={{ fontSize: '9px', color: '#4a5568', textAlign: 'center', marginTop: '10px' }}>
                        LP locked forever. 0% extraction. Stay afloat.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Nav */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '35px',
                paddingTop: '20px',
                borderTop: '1px solid rgba(136, 192, 255, 0.1)'
              }}>
                <button
                  onClick={() => setLaunchStep(Math.max(1, launchStep - 1))}
                  disabled={launchStep === 1}
                  style={{
                    padding: '12px 24px',
                    background: 'transparent',
                    color: launchStep === 1 ? 'rgba(136, 192, 255, 0.2)' : '#6e7b8b',
                    border: '1px solid rgba(136, 192, 255, 0.15)',
                    borderRadius: '8px',
                    fontSize: '11px',
                    cursor: launchStep === 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  ← BACK
                </button>
                {launchStep < 3 && (
                  <button
                    onClick={() => setLaunchStep(launchStep + 1)}
                    style={{
                      padding: '12px 24px',
                      background: 'linear-gradient(135deg, #88c0ff 0%, #5a9fd4 100%)',
                      color: '#0f1419',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    CONTINUE →
                  </button>
                )}
              </div>
            </div>

            {/* Launch History */}
            <div style={{ marginTop: '40px' }}>
              <LaunchHistory />
            </div>
          </div>
        )}

        {/* DOCK */}
        {activeTab === 'dock' && (
          <div className="animate-in" style={{ padding: '40px' }}>
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '10px', color: '#88c0ff', letterSpacing: '3px', marginBottom: '6px' }}>THE DOCK</div>
              <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '30px', fontWeight: '700', color: '#fff' }}>
                STARSHIP <span style={{ color: '#6e7b8b', fontSize: '18px' }}>$STAR</span>
              </h1>
            </div>

            {/* Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 16px',
              background: 'rgba(136, 192, 255, 0.1)',
              border: '1px solid rgba(136, 192, 255, 0.25)',
              borderRadius: '8px',
              marginBottom: '28px'
            }}>
              <div style={{
                width: '22px',
                height: '22px',
                background: 'linear-gradient(135deg, #88c0ff, #5a9fd4)',
                borderRadius: '5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0f1419',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>✓</div>
              <span style={{ fontSize: '11px', color: '#88c0ff', letterSpacing: '1px' }}>SEAWORTHY CERTIFIED</span>
              <span style={{ fontSize: '10px', color: '#4a5568' }}>0% dev • LP locked • auto-compound</span>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '28px' }}>
              {[
                { label: 'TOTAL COMPOUNDED', value: '24.5 SOL', sub: '+3.2 today', color: '#88c0ff' },
                { label: 'LP ADDED', value: '19.6 SOL', sub: '80% of fees', color: '#88c0ff' },
                { label: 'TOKENS BURNED', value: '2.4M', sub: '~4.9 SOL value', color: '#f97316' },
                { label: 'LP DEPTH', value: '$127K', sub: '+34% since launch', color: '#7ee787' }
              ].map((stat, i) => (
                <div key={i} style={{
                  padding: '22px',
                  background: 'rgba(15, 20, 25, 0.8)',
                  border: '1px solid rgba(136, 192, 255, 0.1)',
                  borderRadius: '12px'
                }}>
                  <div style={{ fontSize: '9px', color: '#4a5568', letterSpacing: '1px', marginBottom: '10px' }}>{stat.label}</div>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '26px', fontWeight: '700', color: stat.color, marginBottom: '3px' }}>{stat.value}</div>
                  <div style={{ fontSize: '10px', color: '#4a5568' }}>{stat.sub}</div>
                </div>
              ))}
            </div>

            {/* Log */}
            <div style={{
              padding: '22px',
              background: 'rgba(15, 20, 25, 0.8)',
              border: '1px solid rgba(136, 192, 255, 0.1)',
              borderRadius: '12px'
            }}>
              <div style={{ fontSize: '9px', color: '#88c0ff', letterSpacing: '2px', marginBottom: '18px' }}>ENGINE LOG</div>
              {[
                { time: '2h ago', amount: '0.85 SOL', lp: '0.68', burn: '0.17', tx: '4xK...9f2' },
                { time: '6h ago', amount: '0.70.01 SOL', lp: '0.58', burn: '0.14', tx: '7mP...3a1' },
                { time: '14h ago', amount: '0.91 SOL', lp: '0.73', burn: '0.18', tx: '2nR...8k4' },
              ].map((entry, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px',
                  background: 'rgba(10, 14, 18, 0.6)',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  border: '1px solid rgba(136, 192, 255, 0.08)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      background: 'rgba(136, 192, 255, 0.1)',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px'
                    }}>⭐</div>
                    <div>
                      <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600' }}>{entry.amount} compounded</div>
                      <div style={{ fontSize: '10px', color: '#4a5568' }}>{entry.time}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '10px', color: '#88c0ff' }}>+{entry.lp} LP</div>
                      <div style={{ fontSize: '10px', color: '#f97316' }}>🔥 {entry.burn}</div>
                    </div>
                    <span style={{ fontSize: '9px', color: '#4a5568' }}>{entry.tx} ↗</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* WIDGETS */}
        {activeTab === 'widgets' && (
          <div className="animate-in" style={{ padding: '40px' }}>
            <div style={{ marginBottom: '35px' }}>
              <div style={{ fontSize: '10px', color: '#88c0ff', letterSpacing: '3px', marginBottom: '6px' }}>THE SHIPYARD</div>
              <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '30px', fontWeight: '700', color: '#fff', marginBottom: '6px' }}>WIDGETS</h1>
              <p style={{ fontSize: '13px', color: '#6e7b8b' }}>Embeddable components for your token pages.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '18px' }}>
              {[
                { name: 'SEAWORTHY BADGE', desc: 'Show buyers your token is verified safe.', preview: (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'rgba(136, 192, 255, 0.1)', border: '1px solid rgba(136, 192, 255, 0.25)', borderRadius: '6px' }}>
                    <div style={{ width: '22px', height: '22px', background: 'linear-gradient(135deg, #88c0ff, #5a9fd4)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f1419', fontSize: '11px', fontWeight: 'bold' }}>✓</div>
                    <div>
                      <div style={{ fontSize: '10px', color: '#88c0ff' }}>SEAWORTHY</div>
                      <div style={{ fontSize: '9px', color: '#4a5568' }}>0% dev • locked LP</div>
                    </div>
                  </div>
                ), code: '<script src="shipyard.xyz/badge.js" data-token="STAR" />' },
                { name: 'COMPOUND TRACKER', desc: 'Live compound stats from on-chain.', preview: (
                  <div style={{ display: 'flex', gap: '20px' }}>
                    <div><div style={{ fontSize: '9px', color: '#4a5568', marginBottom: '3px' }}>LP ADDED</div><div style={{ fontSize: '16px', color: '#88c0ff', fontWeight: '700' }}>19.6 SOL</div></div>
                    <div><div style={{ fontSize: '9px', color: '#4a5568', marginBottom: '3px' }}>BURNED</div><div style={{ fontSize: '16px', color: '#f97316', fontWeight: '700' }}>2.4M</div></div>
                  </div>
                ), code: '<iframe src="shipyard.xyz/tracker/STAR" />' },
                { name: 'BURN COUNTER', desc: 'Dramatic burn counter for deflation narrative.', preview: (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '9px', color: '#4a5568', marginBottom: '5px' }}>TOKENS INCINERATED</div>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '22px', fontWeight: '700', color: '#f97316' }}>🔥 2,412,847</div>
                  </div>
                ), code: '<iframe src="shipyard.xyz/burn/STAR" />' },
                { name: 'LP DEPTH GAUGE', desc: 'Visual gauge showing liquidity growth.', preview: (
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'conic-gradient(#88c0ff 0deg 270deg, rgba(136, 192, 255, 0.15) 270deg 360deg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: '55px', height: '55px', background: '#0f1419', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                        <span style={{ fontSize: '13px', color: '#88c0ff', fontWeight: '700' }}>$127K</span>
                        <span style={{ fontSize: '8px', color: '#4a5568' }}>DEPTH</span>
                      </div>
                    </div>
                  </div>
                ), code: '<iframe src="shipyard.xyz/gauge/STAR" />' }
              ].map((widget, i) => (
                <div key={i} style={{
                  padding: '28px',
                  background: 'rgba(15, 20, 25, 0.8)',
                  border: '1px solid rgba(136, 192, 255, 0.1)',
                  borderRadius: '12px'
                }}>
                  <div style={{ fontSize: '9px', color: '#88c0ff', letterSpacing: '2px', marginBottom: '16px' }}>{widget.name}</div>
                  <div style={{
                    padding: '18px',
                    background: 'rgba(10, 14, 18, 0.8)',
                    borderRadius: '8px',
                    border: '1px solid rgba(136, 192, 255, 0.08)',
                    marginBottom: '16px'
                  }}>
                    {widget.preview}
                  </div>
                  <p style={{ fontSize: '11px', color: '#6e7b8b', marginBottom: '12px' }}>{widget.desc}</p>
                  <div style={{
                    padding: '10px',
                    background: 'rgba(10, 14, 18, 0.8)',
                    borderRadius: '6px',
                    fontSize: '9px',
                    color: '#88c0ff',
                    fontFamily: "'Space Mono', monospace",
                    border: '1px solid rgba(136, 192, 255, 0.1)'
                  }}>
                    {widget.code}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DOCS PAGE */}
        {activeTab === 'docs' && (
          <div className="animate-in" style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', gap: '40px' }}>
              {/* Sidebar */}
              <div style={{ width: '200px', flexShrink: 0 }}>
                <div style={{ 
                  position: 'sticky', 
                  top: '100px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  {[
                    { id: 'overview', label: 'Overview' },
                    { id: 'how-it-works', label: 'How It Works' },
                    { id: 'engines', label: 'Engines' },
                    { id: 'seaworthy', label: 'Seaworthy Cert' },
                    { id: 'fees', label: 'Fees' },
                    { id: 'technical', label: 'Technical' },
                    { id: 'faq', label: 'FAQ' },
                  ].map(item => (
                    <button
                      key={item.id}
                      onClick={() => setDocsSection(item.id)}
                      style={{
                        padding: '10px 14px',
                        background: docsSection === item.id ? 'rgba(136, 192, 255, 0.1)' : 'transparent',
                        border: 'none',
                        borderLeft: docsSection === item.id ? '2px solid #88c0ff' : '2px solid transparent',
                        color: docsSection === item.id ? '#88c0ff' : '#6e7b8b',
                        fontSize: '12px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content */}
              <div style={{ flex: 1 }}>
                {docsSection === 'overview' && (
                  <div>
                    <div style={{ fontSize: '10px', color: '#88c0ff', letterSpacing: '3px', marginBottom: '8px' }}>
                      DOCUMENTATION
                    </div>
                    <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '32px', fontWeight: '700', color: '#fff', marginBottom: '16px' }}>
                      What is The Shipyard?
                    </h1>
                    <p style={{ fontSize: '15px', color: '#9ab4c8', lineHeight: 1.8, marginBottom: '24px' }}>
                      The Shipyard is a builder studio. We ship widgets — small tools that fix real problems in the trenches.
                      No token. No DAO. Just builders who got tired of complaining and started building.
                    </p>

                    <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '20px', color: '#fff', marginBottom: '12px' }}>
                      Our First Product: Raft
                    </h2>
                    <p style={{ fontSize: '14px', color: '#8b949e', lineHeight: 1.7, marginBottom: '24px' }}>
                      Raft is a token launchpad built on Meteora&apos;s Dynamic Bonding Curve. 
                      Every token launched through Raft is <strong style={{ color: '#fff' }}>forced to stay afloat</strong> at the protocol level.
                    </p>

                    <div style={{ 
                      padding: '24px', 
                      background: 'rgba(136, 192, 255, 0.05)', 
                      border: '1px solid rgba(136, 192, 255, 0.15)', 
                      borderRadius: '12px',
                      marginBottom: '24px'
                    }}>
                      <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '16px', color: '#fff', marginBottom: '16px' }}>
                        Every Raft launch guarantees:
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {[
                          { icon: '🔒', text: '0% dev extraction' },
                          { icon: '♾️', text: '100% LP locked forever' },
                          { icon: '🛡️', text: 'Immutable metadata' },
                          { icon: '⚡', text: 'Auto-compounding fees' },
                        ].map((item, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '18px' }}>{item.icon}</span>
                            <span style={{ fontSize: '13px', color: '#c9d1d9' }}>{item.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '20px', color: '#fff', marginBottom: '12px', marginTop: '32px' }}>
                      The Problem
                    </h2>
                    <p style={{ fontSize: '14px', color: '#8b949e', lineHeight: 1.7, marginBottom: '16px' }}>
                      The trenches became a negative-sum game. Every trade, money leaves:
                    </p>
                    <ul style={{ fontSize: '14px', color: '#8b949e', lineHeight: 1.8, paddingLeft: '20px', marginBottom: '24px' }}>
                      <li>Dev extraction - fees go straight to wallets</li>
                      <li>LP pulls - rugs happen daily</li>
                      <li>Platform cuts - everyone takes a piece</li>
                      <li>The pot shrinks every hand</li>
                    </ul>

                    <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '20px', color: '#fff', marginBottom: '12px' }}>
                      The Solution
                    </h2>
                    <p style={{ fontSize: '14px', color: '#8b949e', lineHeight: 1.7 }}>
                      Raft uses a <strong style={{ color: '#88c0ff' }}>Meteora config key</strong> that enforces rules at the protocol level. 
                      When you launch on Raft, these rules are baked into your token&apos;s pool — they literally cannot be changed. 
                      Not by you, not by us, not by anyone. The money stays in the game.
                    </p>
                  </div>
                )}

                {docsSection === 'how-it-works' && (
                  <div>
                    <div style={{ fontSize: '10px', color: '#88c0ff', letterSpacing: '3px', marginBottom: '8px' }}>
                      DOCUMENTATION
                    </div>
                    <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '32px', fontWeight: '700', color: '#fff', marginBottom: '24px' }}>
                      How Raft Works
                    </h1>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      {[
                        {
                          step: '01',
                          title: 'Pay the Launch Fee',
                          desc: '0.01 SOL flat fee to launch. This is your only cost — no hidden fees, no ongoing extraction. The fee filters out low-effort rugs and funds development.'
                        },
                        {
                          step: '02',
                          title: 'Choose Your Split',
                          desc: 'Select how trading fees get reinvested — more LP (liquidity) or more burns (deflation). All options have 0% dev extraction.'
                        },
                        {
                          step: '03',
                          title: 'Token Launches on Meteora DBC',
                          desc: 'Your token is created with a bonding curve pool. As people buy, price goes up. Trading fees accumulate in the fee wallet.'
                        },
                        {
                          step: '04',
                          title: 'Auto-Compound Kicks In',
                          desc: 'Our bot monitors the fee wallet. When fees hit a threshold, it automatically swaps and adds to LP (or buys back and burns) based on your split choice. This runs forever.'
                        },
                        {
                          step: '05',
                          title: 'Pool Graduates to DAMM',
                          desc: 'When the bonding curve fills, your token graduates to a full Meteora DAMM pool with deep, permanent liquidity. LP stays locked.'
                        },
                      ].map((item, i) => (
                        <div key={i} style={{ 
                          display: 'flex', 
                          gap: '20px',
                          padding: '24px',
                          background: 'rgba(15, 20, 25, 0.8)',
                          border: '1px solid rgba(136, 192, 255, 0.1)',
                          borderRadius: '12px'
                        }}>
                          <div style={{
                            fontFamily: "'Outfit', sans-serif",
                            fontSize: '32px',
                            fontWeight: '800',
                            color: 'rgba(136, 192, 255, 0.2)',
                            lineHeight: 1
                          }}>
                            {item.step}
                          </div>
                          <div>
                            <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '16px', color: '#fff', marginBottom: '8px' }}>
                              {item.title}
                            </h3>
                            <p style={{ fontSize: '13px', color: '#8b949e', lineHeight: 1.6 }}>
                              {item.desc}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {docsSection === 'engines' && (
                  <div>
                    <div style={{ fontSize: '10px', color: '#88c0ff', letterSpacing: '3px', marginBottom: '8px' }}>
                      DOCUMENTATION
                    </div>
                    <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '32px', fontWeight: '700', color: '#fff', marginBottom: '16px' }}>
                      Engines
                    </h1>
                    <p style={{ fontSize: '14px', color: '#8b949e', lineHeight: 1.7, marginBottom: '32px' }}>
                      Engines determine how trading fees are split. All engines have <strong style={{ color: '#7ee787' }}>0% dev extraction</strong> — the only choice is between LP growth and token burns.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {[
                        { 
                          name: 'NAVIGATOR', 
                          icon: '⭐', 
                          lp: 80, 
                          burn: 20, 
                          desc: 'Best for tokens that want deep liquidity and stability. 80% of fees go to LP, making your token harder to dump. 20% burns for steady deflation.',
                          best: 'Long-term projects, utility tokens'
                        },
                        { 
                          name: 'POLARIS', 
                          icon: '✦', 
                          lp: 70, 
                          burn: 30, 
                          desc: 'Balanced approach. Good LP growth with meaningful burns. Most versatile option.',
                          best: 'Community tokens, memecoins with utility'
                        },
                        { 
                          name: 'SUPERNOVA', 
                          icon: '☄️', 
                          lp: 50, 
                          burn: 50, 
                          desc: 'Maximum deflation. Half of all fees burn tokens, creating strong deflationary pressure. LP still grows but slower.',
                          best: 'Pure memecoins, deflationary narratives'
                        },
                      ].map((engine, i) => (
                        <div key={i} style={{
                          padding: '24px',
                          background: 'rgba(15, 20, 25, 0.8)',
                          border: '1px solid rgba(136, 192, 255, 0.1)',
                          borderRadius: '12px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                            <span style={{ fontSize: '28px' }}>{engine.icon}</span>
                            <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: '18px', fontWeight: '600', color: '#fff' }}>
                              {engine.name}
                            </span>
                            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                              <span style={{ padding: '4px 10px', background: 'rgba(136, 192, 255, 0.1)', borderRadius: '4px', fontSize: '11px', color: '#88c0ff' }}>
                                {engine.lp}% LP
                              </span>
                              <span style={{ padding: '4px 10px', background: 'rgba(249, 115, 22, 0.1)', borderRadius: '4px', fontSize: '11px', color: '#f97316' }}>
                                {engine.burn}% BURN
                              </span>
                            </div>
                          </div>
                          <p style={{ fontSize: '13px', color: '#8b949e', lineHeight: 1.6, marginBottom: '12px' }}>
                            {engine.desc}
                          </p>
                          <div style={{ fontSize: '12px', color: '#6e7b8b' }}>
                            <strong style={{ color: '#88c0ff' }}>Best for:</strong> {engine.best}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ 
                      marginTop: '24px', 
                      padding: '16px', 
                      background: 'rgba(126, 231, 135, 0.1)', 
                      border: '1px solid rgba(126, 231, 135, 0.2)', 
                      borderRadius: '8px' 
                    }}>
                      <p style={{ fontSize: '13px', color: '#7ee787', margin: 0 }}>
                        ✓ All engines: 0% dev extraction. You cannot take fees for yourself. This is enforced at the protocol level.
                      </p>
                    </div>
                  </div>
                )}

                {docsSection === 'seaworthy' && (
                  <div>
                    <div style={{ fontSize: '10px', color: '#88c0ff', letterSpacing: '3px', marginBottom: '8px' }}>
                      DOCUMENTATION
                    </div>
                    <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '32px', fontWeight: '700', color: '#fff', marginBottom: '16px' }}>
                      Seaworthy Certification
                    </h1>
                    <p style={{ fontSize: '14px', color: '#8b949e', lineHeight: 1.7, marginBottom: '24px' }}>
                      Every token launched through The Shipyard receives a <strong style={{ color: '#88c0ff' }}>Seaworthy Certification</strong> — a verifiable badge that proves the token meets our safety standards.
                    </p>

                    <div style={{
                      padding: '24px',
                      background: 'rgba(15, 20, 25, 0.8)',
                      border: '1px solid rgba(136, 192, 255, 0.1)',
                      borderRadius: '12px',
                      marginBottom: '24px'
                    }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '12px 18px', background: 'rgba(136, 192, 255, 0.1)', border: '1px solid rgba(136, 192, 255, 0.3)', borderRadius: '8px', marginBottom: '16px' }}>
                        <div style={{ width: '24px', height: '24px', background: 'linear-gradient(135deg, #88c0ff, #5a9fd4)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f1419', fontSize: '14px', fontWeight: 'bold' }}>✓</div>
                        <div>
                          <div style={{ fontSize: '12px', color: '#88c0ff', fontWeight: '600' }}>SEAWORTHY CERTIFIED</div>
                          <div style={{ fontSize: '10px', color: '#6e7b8b' }}>0% dev extraction • LP locked forever</div>
                        </div>
                      </div>
                      <p style={{ fontSize: '13px', color: '#8b949e' }}>
                        This badge can be embedded on any website, and links back to on-chain proof of the token&apos;s configuration.
                      </p>
                    </div>

                    <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '18px', color: '#fff', marginBottom: '12px' }}>
                      What It Verifies
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                      {[
                        'Token was launched through The Shipyard',
                        'Dev fee extraction is 0% (protocol-enforced)',
                        'LP is locked forever (cannot be withdrawn)',
                        'Metadata is immutable (cannot change name, symbol, image)',
                        'Auto-compound is active',
                      ].map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ color: '#7ee787' }}>✓</span>
                          <span style={{ fontSize: '13px', color: '#c9d1d9' }}>{item}</span>
                        </div>
                      ))}
                    </div>

                    <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '18px', color: '#fff', marginBottom: '12px' }}>
                      For Buyers
                    </h2>
                    <p style={{ fontSize: '14px', color: '#8b949e', lineHeight: 1.7 }}>
                      When you see the Seaworthy badge, you know the token <em>cannot</em> rug you in the traditional ways. 
                      The dev can&apos;t pull LP, can&apos;t extract fees, can&apos;t mint more tokens. 
                      This doesn&apos;t guarantee the token will go up — but it guarantees a fair playing field.
                    </p>
                  </div>
                )}

                {docsSection === 'fees' && (
                  <div>
                    <div style={{ fontSize: '10px', color: '#88c0ff', letterSpacing: '3px', marginBottom: '8px' }}>
                      DOCUMENTATION
                    </div>
                    <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '32px', fontWeight: '700', color: '#fff', marginBottom: '16px' }}>
                      Fees
                    </h1>
                    <p style={{ fontSize: '14px', color: '#8b949e', lineHeight: 1.7, marginBottom: '32px' }}>
                      Transparent, simple pricing. No hidden fees, no ongoing extraction.
                    </p>

                    <div style={{
                      padding: '32px',
                      background: 'linear-gradient(135deg, rgba(136, 192, 255, 0.1) 0%, rgba(136, 192, 255, 0.02) 100%)',
                      border: '1px solid rgba(136, 192, 255, 0.2)',
                      borderRadius: '16px',
                      textAlign: 'center',
                      marginBottom: '32px'
                    }}>
                      <div style={{ fontSize: '12px', color: '#6e7b8b', letterSpacing: '2px', marginBottom: '8px' }}>
                        DOCK FEE
                      </div>
                      <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '48px', fontWeight: '700', color: '#88c0ff', marginBottom: '8px' }}>
                        0.01 SOL
                      </div>
                      <div style={{ fontSize: '14px', color: '#8b949e' }}>
                        One-time payment to launch
                      </div>
                    </div>

                    <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '18px', color: '#fff', marginBottom: '16px' }}>
                      What You Get
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
                      {[
                        { label: 'Token creation', included: true },
                        { label: 'Meteora DBC pool', included: true },
                        { label: 'Seaworthy certification', included: true },
                        { label: 'Auto-compound (forever)', included: true },
                        { label: 'Embeddable widgets', included: true },
                        { label: 'Dashboard analytics', included: true },
                      ].map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ color: '#7ee787' }}>✓</span>
                          <span style={{ fontSize: '14px', color: '#c9d1d9' }}>{item.label}</span>
                        </div>
                      ))}
                    </div>

                    <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '18px', color: '#fff', marginBottom: '16px' }}>
                      What You Don&apos;t Pay
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {[
                        'No monthly fees',
                        'No percentage of trading volume',
                        'No fee extraction from your token',
                        'No graduation fees',
                      ].map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ color: '#f97316' }}>✗</span>
                          <span style={{ fontSize: '14px', color: '#8b949e' }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {docsSection === 'technical' && (
                  <div>
                    <div style={{ fontSize: '10px', color: '#88c0ff', letterSpacing: '3px', marginBottom: '8px' }}>
                      DOCUMENTATION
                    </div>
                    <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '32px', fontWeight: '700', color: '#fff', marginBottom: '16px' }}>
                      Technical Details
                    </h1>
                    <p style={{ fontSize: '14px', color: '#8b949e', lineHeight: 1.7, marginBottom: '32px' }}>
                      For developers and the technically curious.
                    </p>

                    <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '18px', color: '#fff', marginBottom: '12px' }}>
                      Meteora Dynamic Bonding Curve
                    </h2>
                    <p style={{ fontSize: '14px', color: '#8b949e', lineHeight: 1.7, marginBottom: '24px' }}>
                      The Shipyard is built on <a href="https://docs.meteora.ag" target="_blank" rel="noopener noreferrer" style={{ color: '#88c0ff' }}>Meteora&apos;s DBC program</a>. 
                      When you launch a token, it creates a bonding curve pool where price increases as supply is bought.
                    </p>

                    <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '18px', color: '#fff', marginBottom: '12px' }}>
                      The Config Key
                    </h2>
                    <p style={{ fontSize: '14px', color: '#8b949e', lineHeight: 1.7, marginBottom: '16px' }}>
                      This is the core innovation. A config key is a Solana account that defines pool parameters. 
                      The Shipyard has ONE config key that ALL launches use. This config specifies:
                    </p>

                    <div style={{
                      padding: '20px',
                      background: 'rgba(10, 14, 18, 0.8)',
                      borderRadius: '8px',
                      fontFamily: "'Space Mono', monospace",
                      fontSize: '12px',
                      marginBottom: '24px',
                      border: '1px solid rgba(136, 192, 255, 0.1)',
                      overflow: 'auto'
                    }}>
                      <pre style={{ margin: 0, color: '#8b949e' }}>{`// Shipyard Config Parameters
{
  partnerLpPercentage: 0,      // Cannot claim LP
  creatorLpPercentage: 0,      // Cannot claim LP
  partnerLockedLpPercentage: 50,
  creatorLockedLpPercentage: 50,
  creatorTradingFeePercentage: 0,  // No dev extraction
  tokenUpdateAuthority: "Immutable",
  feeClaimer: "SHIPYARD_COMPOUND_BOT"
}`}</pre>
                    </div>

                    <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '18px', color: '#fff', marginBottom: '12px' }}>
                      Auto-Compound Bot
                    </h2>
                    <p style={{ fontSize: '14px', color: '#8b949e', lineHeight: 1.7, marginBottom: '16px' }}>
                      A service that monitors the fee claimer wallet. When fees accumulate:
                    </p>
                    <ol style={{ fontSize: '14px', color: '#8b949e', lineHeight: 1.8, paddingLeft: '20px', marginBottom: '24px' }}>
                      <li>Bot detects threshold reached</li>
                      <li>Based on engine, calculates LP/burn split</li>
                      <li>Executes swap via Jupiter</li>
                      <li>Adds liquidity or burns tokens</li>
                      <li>All transactions verifiable on-chain</li>
                    </ol>

                    <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '18px', color: '#fff', marginBottom: '12px' }}>
                      Graduation
                    </h2>
                    <p style={{ fontSize: '14px', color: '#8b949e', lineHeight: 1.7 }}>
                      When the bonding curve fills (reaches migration threshold), the pool automatically migrates to 
                      Meteora DAMM v2 — a full AMM pool with permanent, locked liquidity. The token is now fully launched.
                    </p>
                  </div>
                )}

                {docsSection === 'faq' && (
                  <div>
                    <div style={{ fontSize: '10px', color: '#88c0ff', letterSpacing: '3px', marginBottom: '8px' }}>
                      DOCUMENTATION
                    </div>
                    <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '32px', fontWeight: '700', color: '#fff', marginBottom: '24px' }}>
                      FAQ
                    </h1>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {[
                        {
                          q: "Can I extract fees from my token?",
                          a: "No. The config key sets creator fee extraction to 0%, and this cannot be changed after launch. All fees go to the auto-compound system."
                        },
                        {
                          q: "Can I pull liquidity?",
                          a: "No. LP is locked at the protocol level. Neither you nor The Shipyard can withdraw it. Ever."
                        },
                        {
                          q: "What if I want to update my token's image?",
                          a: "You can't. Metadata is immutable by design. Make sure you're happy with your name, symbol, and image before launching."
                        },
                        {
                          q: "Is The Shipyard audited?",
                          a: "The Shipyard uses Meteora's audited DBC program. We don't have custom smart contracts — we just configure Meteora's existing infrastructure."
                        },
                        {
                          q: "What happens to the 0.01 SOL dock fee?",
                          a: "It goes to The Shipyard treasury to fund development, hosting, and the compound bot infrastructure."
                        },
                        {
                          q: "Can my token still go to zero?",
                          a: "Yes. We prevent rugs, not bad investments. If no one wants your token, it won't have value. But at least the game is fair."
                        },
                        {
                          q: "Why would I launch here if I can't extract fees?",
                          a: "Because buyers trust Seaworthy tokens. They know you can't rug them, so they're more likely to buy. Fair launches build communities."
                        },
                      ].map((item, i) => (
                        <div key={i} style={{
                          padding: '20px',
                          background: 'rgba(15, 20, 25, 0.8)',
                          border: '1px solid rgba(136, 192, 255, 0.1)',
                          borderRadius: '12px'
                        }}>
                          <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '15px', color: '#fff', marginBottom: '8px' }}>
                            {item.q}
                          </h3>
                          <p style={{ fontSize: '13px', color: '#8b949e', lineHeight: 1.6, margin: 0 }}>
                            {item.a}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Success Modal */}
      {launchSuccess && launchedToken && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{
            background: '#0f1419',
            border: '1px solid rgba(136, 192, 255, 0.3)',
            borderRadius: '16px',
            padding: '40px',
            maxWidth: '450px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚀</div>
            <h2 style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: '24px',
              fontWeight: '700',
              color: '#fff',
              marginBottom: '8px'
            }}>
              VESSEL LAUNCHED!
            </h2>
            <p style={{ color: '#7ee787', fontSize: '14px', marginBottom: '24px' }}>
              {launchedToken.name} is now sailing the Solana seas
            </p>
            
            <div style={{
              background: 'rgba(136, 192, 255, 0.1)',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '24px',
              textAlign: 'left'
            }}>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '9px', color: '#6e7b8b', letterSpacing: '1px', marginBottom: '4px' }}>TOKEN ADDRESS</div>
                <div style={{ fontSize: '12px', color: '#88c0ff', fontFamily: "'Space Mono', monospace" }}>{launchedToken.address}</div>
              </div>
              <div>
                <div style={{ fontSize: '9px', color: '#6e7b8b', letterSpacing: '1px', marginBottom: '4px' }}>POOL ADDRESS</div>
                <div style={{ fontSize: '12px', color: '#88c0ff', fontFamily: "'Space Mono', monospace" }}>{launchedToken.poolAddress}</div>
              </div>
            </div>

            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              background: 'rgba(126, 231, 135, 0.1)',
              border: '1px solid rgba(126, 231, 135, 0.3)',
              borderRadius: '8px',
              marginBottom: '24px'
            }}>
              <span style={{ color: '#7ee787', fontSize: '12px' }}>✓</span>
              <span style={{ color: '#7ee787', fontSize: '11px' }}>SEAWORTHY CERTIFIED</span>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setLaunchSuccess(false);
                  setActiveTab('dock');
                }}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: 'linear-gradient(135deg, #88c0ff 0%, #5a9fd4 100%)',
                  color: '#0f1419',
                  border: 'none',
                  borderRadius: '8px',
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                VIEW IN DOCK
              </button>
              <button
                onClick={() => {
                  setLaunchSuccess(false);
                  setLaunchStep(1);
                  setTokenName('');
                  setTokenSymbol('');
                  setTokenDescription('');
                  setDevBuyEnabled(false);
                  setDevBuyAmount(0);
                }}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: 'transparent',
                  color: '#6e7b8b',
                  border: '1px solid rgba(136, 192, 255, 0.2)',
                  borderRadius: '8px',
                  fontFamily: "'Space Mono', monospace",
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                LAUNCH ANOTHER
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'trawler' && (
        <div className="animate-in">
          <Trawler />
        </div>
      )}

      {activeTab === 'sonar' && (
        <div className="animate-in">
          <Sonar />
        </div>
      )}

      {activeTab === 'bottles' && (
        <div className="animate-in">
          <Bottles />
        </div>
      )}

      {/* Footer */}
      <footer style={{
        padding: '35px 40px',
        borderTop: '1px solid rgba(136, 192, 255, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ fontSize: '11px', color: '#4a5568' }}>© 2026 THE SHIPYARD. We ship widgets.</div>
        <div style={{ display: 'flex', gap: '20px' }}>
          <a
            href="https://x.com/ShipsInTheYard"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '11px',
              color: '#6e7b8b',
              textDecoration: 'none',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#88c0ff'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#6e7b8b'}
          >
            Twitter
          </a>
          <a href="#" style={{ fontSize: '11px', color: '#6e7b8b', textDecoration: 'none' }}>Docs</a>
          <a href="#" style={{ fontSize: '11px', color: '#6e7b8b', textDecoration: 'none' }}>GitHub</a>
        </div>
      </footer>
    </div>
  );
}
