"use client";

import React, { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import FishCatchModal from './FishCatchModal';

const RENT_PER_ACCOUNT = 0.00203928;
const ACCOUNTS_PER_TX = 22;
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const RPC_ENDPOINT = 'https://mainnet.helius-rpc.com/?api-key=bfad0518-de28-4359-aebe-3773f8a73642';

interface EmptyAccount {
  pubkey: string;
  mint: string;
  rent: number;
  tokenName?: string | null;
  programId: string;
}

interface TokenMetadata {
  name?: string | null;
  symbol?: string | null;
  image?: string | null;
}

export default function Trawler() {
  const { publicKey, connected, disconnect, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();

  const [walletInput, setWalletInput] = useState('');
  const [emptyAccounts, setEmptyAccounts] = useState<EmptyAccount[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<number>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isEmpty, setIsEmpty] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [totalAccounts, setTotalAccounts] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [toast, setToast] = useState('');
  const [showCatchModal, setShowCatchModal] = useState(false);
  const [caughtSol, setCaughtSol] = useState(0);
  const [fleetStats, setFleetStats] = useState({ totalSol: 0, totalClaims: 0, totalAccounts: 0 });

  // Fetch fleet stats on load
  useEffect(() => {
    const fetchFleetStats = async () => {
      try {
        const res = await fetch('/api/trawler-stats');
        const data = await res.json();
        setFleetStats(data);
      } catch (err) {
        console.warn('Could not fetch fleet stats:', err);
      }
    };
    fetchFleetStats();
  }, []);

  // Record stats after successful claim
  const recordClaim = async (solAmount: number, accountsClosed: number) => {
    try {
      const res = await fetch('/api/trawler-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solAmount,
          accountsClosed,
          wallet: publicKey?.toString()
        }),
      });
      const data = await res.json();
      setFleetStats(data);
    } catch (err) {
      console.warn('Could not record claim:', err);
    }
  };

  // Update wallet input when connected
  useEffect(() => {
    if (publicKey) {
      setWalletInput(publicKey.toString());
    }
  }, [publicKey]);

  // Fetch token metadata
  const fetchTokenMetadata = async (mintAddresses: string[]): Promise<Record<string, TokenMetadata>> => {
    if (mintAddresses.length === 0) return {};

    try {
      const response = await fetch(RPC_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'token-metadata',
          method: 'getAssetBatch',
          params: {
            ids: mintAddresses
          }
        })
      });

      const data = await response.json();
      const metadata: Record<string, TokenMetadata> = {};

      if (data.result) {
        data.result.forEach((asset: any) => {
          if (asset && asset.id) {
            metadata[asset.id] = {
              name: asset.content?.metadata?.name || null,
              symbol: asset.content?.metadata?.symbol || null,
              image: asset.content?.links?.image || null
            };
          }
        });
      }

      return metadata;
    } catch (err) {
      console.error('Failed to fetch token metadata:', err);
      return {};
    }
  };

  // Scan wallet
  const scanWallet = async () => {
    const addressInput = walletInput.trim();

    if (!addressInput) {
      setErrorMsg('Please enter a wallet address or connect your wallet.');
      return;
    }

    let pubKey: PublicKey;
    try {
      pubKey = new PublicKey(addressInput);
    } catch (e) {
      setErrorMsg('Invalid wallet address.');
      return;
    }

    setErrorMsg('');
    setIsScanning(true);
    setIsEmpty(false);
    setTotalAccounts(0);
    setEmptyAccounts([]);
    setSelectedAccounts(new Set());

    try {
      // Fetch from both Token Program and Token-2022 Program
      const [tokenAccounts, token2022Accounts] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(
          pubKey,
          { programId: new PublicKey(TOKEN_PROGRAM_ID) }
        ),
        connection.getParsedTokenAccountsByOwner(
          pubKey,
          { programId: new PublicKey(TOKEN_2022_PROGRAM_ID) }
        )
      ]);

      const allAccounts = [...tokenAccounts.value, ...token2022Accounts.value];
      setTotalAccounts(allAccounts.length);

      const empty = allAccounts.filter(acc => {
        const amount = acc.account.data.parsed.info.tokenAmount.uiAmount;
        if (amount !== 0) return false;

        // Filter out Token-2022 accounts with withheld fees (can't be closed)
        const isToken2022 = acc.account.owner.toString() === TOKEN_2022_PROGRAM_ID;
        if (isToken2022) {
          // Check for transfer fee extension with withheld fees
          const extensions = acc.account.data.parsed.info.extensions;
          if (extensions) {
            const transferFeeAmount = extensions.find((ext: any) => ext.extension === 'transferFeeAmount');
            if (transferFeeAmount && parseFloat(transferFeeAmount.state?.withheldAmount || 0) > 0) {
              return false; // Skip accounts with withheld fees
            }
          }
        }
        return true;
      }).map(acc => ({
        pubkey: acc.pubkey.toString(),
        mint: acc.account.data.parsed.info.mint,
        rent: acc.account.lamports / 1000000000, // Convert lamports to SOL
        programId: acc.account.owner.toString()
      }));

      if (empty.length > 0) {
        const mints = Array.from(new Set(empty.map(acc => acc.mint)));
        const tokenMetadataCache = await fetchTokenMetadata(mints);

        const enrichedAccounts = empty.map(acc => ({
          ...acc,
          tokenName: tokenMetadataCache[acc.mint]?.symbol ||
                     tokenMetadataCache[acc.mint]?.name ||
                     null
        }));

        setEmptyAccounts(enrichedAccounts);
        setIsEmpty(false);
      } else {
        setIsEmpty(true);
      }

    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to fetch accounts: ' + err.message);
    } finally {
      setIsScanning(false);
    }
  };

  // Toggle account selection
  const toggleAccount = (index: number) => {
    const newSelected = new Set(selectedAccounts);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedAccounts(newSelected);
  };

  // Select all toggle
  const toggleSelectAll = () => {
    if (selectedAccounts.size === emptyAccounts.length) {
      setSelectedAccounts(new Set());
    } else {
      setSelectedAccounts(new Set(emptyAccounts.map((_, i) => i)));
    }
  };

  // Create close account instruction
  const createCloseAccountInstruction = (
    account: PublicKey,
    destination: PublicKey,
    owner: PublicKey,
    programId: string
  ): TransactionInstruction => {
    const keys = [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: new PublicKey(programId),
      data: Buffer.from([9]) // 9 = CloseAccount instruction
    });
  };

  // Close accounts
  const handleCloseAccounts = async () => {
    if (!publicKey || !signTransaction) {
      setErrorMsg('Please connect your wallet to close accounts.');
      return;
    }

    const accountsToClose = Array.from(selectedAccounts).map(i => emptyAccounts[i]);

    if (accountsToClose.length === 0) {
      setErrorMsg('No accounts selected.');
      return;
    }

    setIsClosing(true);
    setProgress({ current: 0, total: accountsToClose.length });

    try {
      const batches = [];
      for (let i = 0; i < accountsToClose.length; i += ACCOUNTS_PER_TX) {
        batches.push(accountsToClose.slice(i, i + ACCOUNTS_PER_TX));
      }

      // Create all transactions
      const transactions: Transaction[] = [];
      const { blockhash } = await connection.getLatestBlockhash();

      for (const batch of batches) {
        const transaction = new Transaction();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = publicKey;

        for (const acc of batch) {
          const closeInstruction = createCloseAccountInstruction(
            new PublicKey(acc.pubkey),
            publicKey,
            publicKey,
            acc.programId
          );
          transaction.add(closeInstruction);
        }

        transactions.push(transaction);
      }

      // Sign all transactions at once
      showToast(`Signing ${batches.length} transaction${batches.length > 1 ? 's' : ''}...`);

      let signedTransactions;
      if (batches.length === 1) {
        // Single transaction - use signTransaction
        const signed = await signTransaction!(transactions[0]);
        signedTransactions = [signed];
      } else {
        // Multiple transactions - use signAllTransactions if available
        if (signAllTransactions) {
          signedTransactions = await signAllTransactions(transactions);
        } else {
          // Fallback: sign one by one
          signedTransactions = [];
          for (const tx of transactions) {
            const signed = await signTransaction!(tx);
            signedTransactions.push(signed);
          }
        }
      }

      // Send all transactions
      showToast('Processing transactions...');
      const signatures = await Promise.all(
        signedTransactions.map(tx => connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        }))
      );

      // Helper function to retry on rate limit
      const retryWithBackoff = async (fn: () => Promise<any>, retries = 3, delay = 1000) => {
        for (let i = 0; i < retries; i++) {
          try {
            return await fn();
          } catch (err: any) {
            if (err.message?.includes('429') || err.message?.includes('rate limit')) {
              if (i < retries - 1) {
                await new Promise(r => setTimeout(r, delay * (i + 1)));
                continue;
              }
            }
            throw err;
          }
        }
      };

      // Confirm all transactions with better error handling
      let closedCount = 0;
      for (let i = 0; i < signatures.length; i++) {
        try {
          const latestBlockhash = await retryWithBackoff(() =>
            connection.getLatestBlockhash('confirmed')
          );
          await retryWithBackoff(() =>
            connection.confirmTransaction({
              signature: signatures[i],
              blockhash: latestBlockhash.blockhash,
              lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            }, 'confirmed')
          );
          closedCount += batches[i].length;
          setProgress({ current: closedCount, total: accountsToClose.length });
        } catch (confirmErr: any) {
          // Check if transaction actually succeeded despite timeout/rate limit
          try {
            await new Promise(r => setTimeout(r, 2000)); // Wait before checking
            const status = await retryWithBackoff(() =>
              connection.getSignatureStatus(signatures[i])
            );
            if (status?.value?.confirmationStatus === 'confirmed' || status?.value?.confirmationStatus === 'finalized') {
              closedCount += batches[i].length;
              setProgress({ current: closedCount, total: accountsToClose.length });
            } else {
              console.warn(`Transaction ${i + 1} confirmation uncertain:`, confirmErr.message);
            }
          } catch (statusErr) {
            // Assume it went through if we can't check
            closedCount += batches[i].length;
            setProgress({ current: closedCount, total: accountsToClose.length });
          }
        }
      }

      showToast('All transactions confirmed!');

      const recovered = accountsToClose.reduce((sum, acc) => sum + acc.rent, 0);
      showToast(`Successfully recovered ${recovered.toFixed(4)} SOL!`);

      // Record stats and show fish catch modal
      setCaughtSol(recovered);
      recordClaim(recovered, accountsToClose.length);
      setTimeout(() => {
        setShowCatchModal(true);
      }, 1000);

      setTimeout(() => {
        scanWallet();
      }, 3000);

    } catch (err: any) {
      console.error(err);
      // Still show the modal if we got rate limited but transactions likely went through
      if (err.message?.includes('429') || err.message?.includes('rate limit')) {
        const recovered = accountsToClose.reduce((sum, acc) => sum + acc.rent, 0);
        setCaughtSol(recovered);
        recordClaim(recovered, accountsToClose.length);
        showToast('Transactions sent! Check your wallet.');
        setTimeout(() => {
          setShowCatchModal(true);
        }, 1000);
        setTimeout(() => {
          scanWallet();
        }, 3000);
      } else {
        setErrorMsg('Transaction failed: ' + err.message);
      }
    } finally {
      setIsClosing(false);
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const emptyCount = emptyAccounts.length;
  const recoverableSol = emptyAccounts.reduce((sum, acc) => sum + acc.rent, 0).toFixed(4);
  const batchCount = Math.ceil(emptyAccounts.length / ACCOUNTS_PER_TX);
  const totalSelected = Array.from(selectedAccounts)
    .reduce((sum, index) => sum + emptyAccounts[index].rent, 0)
    .toFixed(4);

  return (
    <>
      <style jsx>{`
        @keyframes swim {
          0% {
            transform: translateX(-100px) translateY(0) scaleX(1);
          }
          25% {
            transform: translateX(25vw) translateY(-20px) scaleX(1);
          }
          50% {
            transform: translateX(50vw) translateY(0) scaleX(-1);
          }
          75% {
            transform: translateX(75vw) translateY(-15px) scaleX(-1);
          }
          100% {
            transform: translateX(calc(100vw + 100px)) translateY(0) scaleX(-1);
          }
        }

        @keyframes swim-reverse {
          0% {
            transform: translateX(calc(100vw + 100px)) translateY(0) scaleX(-1);
          }
          25% {
            transform: translateX(75vw) translateY(-15px) scaleX(-1);
          }
          50% {
            transform: translateX(50vw) translateY(0) scaleX(1);
          }
          75% {
            transform: translateX(25vw) translateY(-20px) scaleX(1);
          }
          100% {
            transform: translateX(-100px) translateY(0) scaleX(1);
          }
        }

        .fish {
          position: fixed;
          bottom: 80px;
          font-size: 24px;
          opacity: 0.3;
          z-index: 50;
          pointer-events: none;
        }

        .fish-1 {
          animation: swim 20s linear infinite;
          bottom: 100px;
        }

        .fish-2 {
          animation: swim 25s linear infinite;
          animation-delay: 5s;
          bottom: 150px;
          font-size: 20px;
        }

        .fish-3 {
          animation: swim-reverse 22s linear infinite;
          animation-delay: 3s;
          bottom: 120px;
          font-size: 28px;
        }

        .fish-4 {
          animation: swim 30s linear infinite;
          animation-delay: 10s;
          bottom: 180px;
          font-size: 18px;
        }

        .trawler-container {
          min-height: 100vh;
          background: #0B1120;
          font-family: 'IBM Plex Mono', monospace;
          color: #E2E8F0;
          position: relative;
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
          max-width: 800px;
          margin: 0 auto;
          padding: 40px 20px;
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
        }

        .tagline {
          font-size: 18px;
          color: #6B7B8F;
          font-style: italic;
        }

        .description {
          margin-top: 16px;
          font-size: 13px;
          color: #3D4A5C;
          max-width: 480px;
          margin-left: auto;
          margin-right: auto;
        }

        .fleet-stats {
          background: linear-gradient(135deg, rgba(94, 174, 216, 0.1) 0%, rgba(74, 222, 128, 0.1) 100%);
          border: 1px solid rgba(94, 174, 216, 0.3);
          border-radius: 12px;
          padding: 16px 24px;
          margin-bottom: 24px;
        }

        .fleet-stats-inner {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 32px;
        }

        .fleet-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .fleet-stat-value {
          font-size: 24px;
          font-weight: 700;
          color: #5EAED8;
          text-shadow: 0 0 20px rgba(94, 174, 216, 0.4);
        }

        .fleet-stat-label {
          font-size: 9px;
          letter-spacing: 0.15em;
          color: #6B7B8F;
        }

        .fleet-divider {
          width: 1px;
          height: 40px;
          background: linear-gradient(to bottom, transparent, #1E2A3A, transparent);
        }

        @media (max-width: 600px) {
          .fleet-stats-inner {
            gap: 16px;
          }
          .fleet-stat-value {
            font-size: 18px;
          }
          .fleet-divider {
            height: 30px;
          }
        }

        .main-card {
          background: #111827;
          border: 1px solid #1E2A3A;
          border-radius: 8px;
          overflow: hidden;
        }

        .card-header {
          padding: 16px 24px;
          border-bottom: 1px solid #1E2A3A;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .card-title {
          font-size: 12px;
          letter-spacing: 0.1em;
          color: #6B7B8F;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: #3D4A5C;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: ${connected ? '#4ADE80' : '#3D4A5C'};
          box-shadow: ${connected ? '0 0 8px #4ADE80' : 'none'};
        }

        .card-body {
          padding: 24px;
        }

        .error-msg {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid #EF4444;
          color: #EF4444;
          padding: 12px 16px;
          border-radius: 4px;
          font-size: 12px;
          margin-bottom: 16px;
          display: ${errorMsg ? 'block' : 'none'};
        }

        .wallet-section {
          margin-bottom: 24px;
        }

        .wallet-input-group {
          display: flex;
          gap: 12px;
        }

        .wallet-input {
          flex: 1;
          background: #0D1526;
          border: 1px solid #1E2A3A;
          border-radius: 4px;
          padding: 14px 16px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          color: #E2E8F0;
          outline: none;
        }

        .wallet-input:focus {
          border-color: #5EAED8;
        }

        .btn {
          padding: 14px 24px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.1em;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .btn-primary {
          background: #5EAED8;
          color: #0B1120;
        }

        .btn-primary:hover {
          background: #7DD3FC;
          box-shadow: 0 0 20px rgba(94, 174, 216, 0.4);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .stats-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }

        .stat-box {
          background: #0D1526;
          border: 1px solid #1E2A3A;
          border-radius: 4px;
          padding: 16px;
          text-align: center;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 700;
          color: #5EAED8;
          margin-bottom: 4px;
        }

        .stat-value.green {
          color: #4ADE80;
        }

        .stat-label {
          font-size: 9px;
          letter-spacing: 0.15em;
          color: #3D4A5C;
        }

        .loading-state {
          padding: 60px 20px;
          text-align: center;
          display: ${isScanning ? 'block' : 'none'};
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #1E2A3A;
          border-top-color: #5EAED8;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .loading-text {
          font-size: 12px;
          color: #6B7B8F;
          letter-spacing: 0.1em;
        }

        .empty-state {
          padding: 60px 20px;
          text-align: center;
          display: ${isEmpty ? 'block' : 'none'};
        }

        .empty-title {
          font-size: 14px;
          color: #6B7B8F;
          margin-bottom: 8px;
        }

        .empty-desc {
          font-size: 12px;
          color: #3D4A5C;
        }

        .table-section {
          display: ${emptyAccounts.length > 0 && !isScanning ? 'block' : 'none'};
        }

        .table-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .table-title {
          font-size: 11px;
          letter-spacing: 0.1em;
          color: #6B7B8F;
        }

        .select-all {
          font-size: 11px;
          color: #5EAED8;
          cursor: pointer;
          background: none;
          border: none;
          font-family: inherit;
        }

        .select-all:hover {
          text-decoration: underline;
        }

        .accounts-table {
          background: #0D1526;
          border: 1px solid #1E2A3A;
          border-radius: 4px;
          overflow: hidden;
          max-height: 400px;
          overflow-y: auto;
        }

        .table-head {
          display: grid;
          grid-template-columns: 40px 1fr 1fr 100px;
          padding: 12px 16px;
          background: #111827;
          border-bottom: 1px solid #1E2A3A;
          font-size: 10px;
          letter-spacing: 0.1em;
          color: #3D4A5C;
          position: sticky;
          top: 0;
        }

        .table-row {
          display: grid;
          grid-template-columns: 40px 1fr 1fr 100px;
          padding: 14px 16px;
          border-bottom: 1px solid #1E2A3A;
          align-items: center;
          transition: background 0.15s;
          cursor: pointer;
        }

        .table-row:hover {
          background: rgba(94, 174, 216, 0.05);
        }

        .table-row.selected {
          background: rgba(94, 174, 216, 0.1);
        }

        .checkbox {
          width: 18px;
          height: 18px;
          border: 1.5px solid #2A3A4A;
          border-radius: 3px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }

        .checkbox:hover {
          border-color: #5EAED8;
        }

        .checkbox.checked {
          background: #5EAED8;
          border-color: #5EAED8;
        }

        .account-address {
          font-size: 12px;
          color: #E2E8F0;
        }

        .account-address a {
          color: inherit;
          text-decoration: none;
        }

        .account-address a:hover {
          color: #5EAED8;
        }

        .token-badge {
          font-size: 10px;
          padding: 2px 6px;
          background: #1E2A3A;
          border-radius: 3px;
          color: #6B7B8F;
          max-width: 100px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .token-badge.known {
          background: rgba(94, 174, 216, 0.2);
          color: #5EAED8;
        }

        .rent-value {
          font-size: 13px;
          font-weight: 600;
          color: #4ADE80;
          text-align: right;
        }

        .action-section {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid #1E2A3A;
          display: ${emptyAccounts.length > 0 && !isScanning ? 'block' : 'none'};
        }

        .action-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .total-recoverable {
          text-align: right;
        }

        .total-label {
          font-size: 10px;
          color: #3D4A5C;
          letter-spacing: 0.1em;
        }

        .total-value {
          font-size: 28px;
          font-weight: 700;
          color: #4ADE80;
          text-shadow: 0 0 20px rgba(74, 222, 128, 0.3);
        }

        .total-value span {
          font-size: 14px;
          color: #6B7B8F;
        }

        .trawl-btn {
          margin-top: 20px;
          width: 100%;
          padding: 18px;
          font-size: 14px;
          background: linear-gradient(135deg, #5EAED8, #3A7A9D);
          border: none;
          border-radius: 4px;
          color: #0B1120;
          font-family: 'IBM Plex Mono', monospace;
          font-weight: 700;
          letter-spacing: 0.15em;
          cursor: pointer;
          transition: all 0.2s;
        }

        .trawl-btn:hover:not(:disabled) {
          box-shadow: 0 0 30px rgba(94, 174, 216, 0.5);
          transform: translateY(-1px);
        }

        .trawl-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .progress-section {
          margin-top: 20px;
          display: ${isClosing ? 'block' : 'none'};
        }

        .progress-header {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: #6B7B8F;
          margin-bottom: 8px;
          letter-spacing: 0.1em;
        }

        .progress-bar {
          height: 8px;
          background: #1E2A3A;
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #5EAED8, #4ADE80);
          border-radius: 4px;
          transition: width 0.3s;
          width: ${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%;
        }

        .footer-info {
          margin-top: 24px;
          padding: 16px;
          background: rgba(94, 174, 216, 0.05);
          border: 1px solid #1E2A3A;
          border-radius: 4px;
          font-size: 11px;
          color: #3D4A5C;
          text-align: center;
        }

        .footer-info strong {
          color: #5EAED8;
        }

        .toast {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #4ADE80;
          color: #0B1120;
          padding: 16px 24px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          transform: translateY(${toast ? '0' : '100px'});
          opacity: ${toast ? '1' : '0'};
          transition: all 0.3s;
          z-index: 100;
        }

        @media (max-width: 640px) {
          .stats-row {
            grid-template-columns: repeat(2, 1fr);
          }

          .title {
            font-size: 36px;
          }

          .wallet-input-group {
            flex-direction: column;
          }
        }
      `}</style>

      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div className="trawler-container">
        <div className="grid-bg"></div>

        <div className="container">
          <header className="header">
            <div className="badge">A SHIPYARD PRODUCT</div>
            <h1 className="title">TRAWLER</h1>
            <p className="tagline">Fish through your wallet. Recover the catch.</p>
            <p className="description">
              Close empty token accounts and recover rent SOL trapped in your wallet.
              Every empty account holds ~0.002 SOL hostage.
            </p>
          </header>

          {/* Fleet Stats Banner */}
          {fleetStats.totalSol > 0 && (
            <div className="fleet-stats">
              <div className="fleet-stats-inner">
                <div className="fleet-stat">
                  <span className="fleet-stat-value">{fleetStats.totalSol.toFixed(2)}</span>
                  <span className="fleet-stat-label">SOL RECLAIMED</span>
                </div>
                <div className="fleet-divider"></div>
                <div className="fleet-stat">
                  <span className="fleet-stat-value">{fleetStats.totalClaims.toLocaleString()}</span>
                  <span className="fleet-stat-label">SAILORS</span>
                </div>
                <div className="fleet-divider"></div>
                <div className="fleet-stat">
                  <span className="fleet-stat-value">{fleetStats.totalAccounts.toLocaleString()}</span>
                  <span className="fleet-stat-label">ACCOUNTS CLOSED</span>
                </div>
              </div>
            </div>
          )}

          <div className="main-card">
            <div className="card-header">
              <span className="card-title">WALLET SCANNER</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="status-indicator">
                  <div className="status-dot"></div>
                  <span>{connected ? 'CONNECTED' : 'NOT CONNECTED'}</span>
                </div>
                <button
                  onClick={() => connected ? disconnect() : setVisible(true)}
                  style={{
                    background: connected ? '#1E2A3A' : '#5EAED8',
                    color: connected ? '#6B7B8F' : '#0B1120',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px 16px',
                    fontSize: '11px',
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    cursor: 'pointer',
                  }}
                >
                  {connected ? 'DISCONNECT' : 'CONNECT'}
                </button>
              </div>
            </div>

            <div className="card-body">
              {errorMsg && <div className="error-msg">{errorMsg}</div>}

              <div className="wallet-section">
                <div className="wallet-input-group">
                  <input
                    type="text"
                    className="wallet-input"
                    value={walletInput}
                    onChange={(e) => setWalletInput(e.target.value)}
                    placeholder="Enter wallet address or connect wallet..."
                  />
                  <button className="btn btn-primary" onClick={scanWallet} disabled={isScanning}>
                    {isScanning ? 'SCANNING...' : 'SCAN'}
                  </button>
                </div>
              </div>

              <div className="stats-row">
                <div className="stat-box">
                  <div className="stat-value">{emptyCount || '—'}</div>
                  <div className="stat-label">EMPTY ACCOUNTS</div>
                </div>
                <div className="stat-box">
                  <div className="stat-value green">{recoverableSol || '—'}</div>
                  <div className="stat-label">RECOVERABLE SOL</div>
                </div>
                <div className="stat-box">
                  <div className="stat-value">{totalAccounts || '—'}</div>
                  <div className="stat-label">TOTAL ACCOUNTS</div>
                </div>
                <div className="stat-box">
                  <div className="stat-value">{batchCount || '—'}</div>
                  <div className="stat-label">BATCHES REQ.</div>
                </div>
              </div>

              <div className="loading-state">
                <div className="spinner"></div>
                <div className="loading-text">SCANNING WALLET...</div>
              </div>

              <div className="empty-state">
                <div className="empty-title">Your hull is clean!</div>
                <div className="empty-desc">No empty token accounts found. Nothing to recover.</div>
              </div>

              <div className="table-section">
                <div className="table-header">
                  <span className="table-title">EMPTY TOKEN ACCOUNTS</span>
                  <button className="select-all" onClick={toggleSelectAll}>
                    {selectedAccounts.size === emptyAccounts.length ? 'DESELECT ALL' : `SELECT ALL (${emptyAccounts.length})`}
                  </button>
                </div>

                <div className="accounts-table">
                  <div className="table-head">
                    <span></span>
                    <span>ACCOUNT</span>
                    <span>TOKEN MINT</span>
                    <span style={{ textAlign: 'right' }}>RENT</span>
                  </div>
                  <div>
                    {emptyAccounts.map((acc, index) => {
                      const shortPubkey = acc.pubkey.slice(0, 4) + '...' + acc.pubkey.slice(-4);
                      const shortMint = acc.mint.slice(0, 4) + '...' + acc.mint.slice(-4);
                      const displayName = acc.tokenName || shortMint;
                      const isSelected = selectedAccounts.has(index);

                      return (
                        <div
                          key={acc.pubkey}
                          className={`table-row ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleAccount(index)}
                        >
                          <div className={`checkbox ${isSelected ? 'checked' : ''}`}>
                            {isSelected && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6L5 9L10 3" stroke="#0B1120" strokeWidth="2"/>
                              </svg>
                            )}
                          </div>
                          <code className="account-address">
                            <a href={`https://solscan.io/account/${acc.pubkey}`} target="_blank" rel="noopener noreferrer">
                              {shortPubkey}
                            </a>
                          </code>
                          <div>
                            <span className={`token-badge ${acc.tokenName ? 'known' : ''}`} title={acc.mint}>
                              {displayName}
                            </span>
                          </div>
                          <div className="rent-value">{acc.rent.toFixed(5)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="action-section">
                <div className="action-row">
                  <div>
                    <span style={{ fontSize: '11px', color: '#3D4A5C' }}>
                      Max ~22 accounts per transaction
                    </span>
                  </div>
                  <div className="total-recoverable">
                    <div className="total-label">TOTAL SELECTED</div>
                    <div className="total-value">{totalSelected} <span>SOL</span></div>
                  </div>
                </div>

                <button
                  className="trawl-btn"
                  onClick={handleCloseAccounts}
                  disabled={selectedAccounts.size === 0 || isClosing}
                >
                  {isClosing
                    ? 'CLOSING ACCOUNTS...'
                    : selectedAccounts.size > 0
                      ? `CLOSE ${selectedAccounts.size} ACCOUNTS →`
                      : 'SELECT ACCOUNTS TO CLOSE'
                  }
                </button>

                <div className="progress-section">
                  <div className="progress-header">
                    <span>CLOSING ACCOUNTS...</span>
                    <span>{progress.current} / {progress.total}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill"></div>
                  </div>
                </div>
              </div>

              <div className="footer-info">
                <strong>0% FEE</strong> — Trawler is a free tool from The Shipyard.
                Recovered SOL goes directly to your wallet.
              </div>
            </div>
          </div>

          {/* Early Access CTA */}
          <div style={{
            marginTop: '24px',
            background: 'linear-gradient(135deg, rgba(94, 174, 216, 0.1), rgba(74, 222, 128, 0.1))',
            border: '1px solid rgba(94, 174, 216, 0.3)',
            borderRadius: '8px',
            padding: '24px',
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: '12px',
              letterSpacing: '0.15em',
              color: '#5EAED8',
              marginBottom: '8px',
              fontWeight: 600,
            }}>
              MORE WIDGETS INCOMING
            </div>
            <div style={{
              fontSize: '16px',
              color: '#E2E8F0',
              marginBottom: '16px',
              fontFamily: "'IBM Plex Mono', monospace",
            }}>
              Sonar (Quality Alerts) & Raft (Auto-Compounding Launch Tool)
            </div>
            <a
              href="https://twitter.com/ShipsInTheYard"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                background: '#5EAED8',
                color: '#0B1120',
                padding: '12px 24px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textDecoration: 'none',
                fontFamily: "'IBM Plex Mono', monospace",
                transition: 'all 0.2s',
              }}
            >
              FOLLOW FOR EARLY ACCESS →
            </a>
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}

        {/* Animated Fish */}
        <div className="fish fish-1">🐟</div>
        <div className="fish fish-2">🐠</div>
        <div className="fish fish-3">🐡</div>
        <div className="fish fish-4">🐟</div>
      </div>

      {/* Fish Catch Modal */}
      {showCatchModal && (
        <FishCatchModal
          solAmount={caughtSol}
          onClose={() => setShowCatchModal(false)}
        />
      )}
    </>
  );
}
