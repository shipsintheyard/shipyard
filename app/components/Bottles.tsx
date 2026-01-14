"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Transaction, TransactionInstruction, PublicKey } from '@solana/web3.js';

// Solana Memo Program ID
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

interface Bottle {
  id: string;
  message: string;
  sender: string;
  recipient?: string; // If set, only recipient can read
  signature: string;
  timestamp: number;
  x: number;
  y: number;
  rotation: number;
  animationDelay: number;
  animationDuration: number;
}

type MessageMode = 'ocean' | 'direct';

export default function Bottles() {
  const { publicKey, connected, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();

  const [message, setMessage] = useState('');
  const [messageMode, setMessageMode] = useState<MessageMode>('ocean');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [selectedBottle, setSelectedBottle] = useState<Bottle | null>(null);
  const [throwAnimation, setThrowAnimation] = useState(false);
  const [activeTab, setActiveTab] = useState<'ocean' | 'inbox'>('ocean');
  const [isLoadingBottles, setIsLoadingBottles] = useState(true);

  // Fetch bottles from API on mount
  const fetchBottles = useCallback(async () => {
    try {
      const response = await fetch('/api/bottles');
      const data = await response.json();
      if (data.bottles) {
        setBottles(data.bottles);
      }
    } catch (err) {
      console.error('Failed to fetch bottles:', err);
    } finally {
      setIsLoadingBottles(false);
    }
  }, []);

  useEffect(() => {
    fetchBottles();
  }, [fetchBottles]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const isValidSolanaAddress = (address: string): boolean => {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  };

  const throwBottle = async () => {
    if (!publicKey || !signTransaction) {
      setVisible(true);
      return;
    }

    if (!message.trim()) {
      setError('Write a message first!');
      return;
    }

    if (message.length > 280) {
      setError('Message too long! Max 280 characters.');
      return;
    }

    if (messageMode === 'direct') {
      if (!recipientAddress.trim()) {
        setError('Enter a recipient wallet address!');
        return;
      }
      if (!isValidSolanaAddress(recipientAddress.trim())) {
        setError('Invalid Solana wallet address!');
        return;
      }
      if (recipientAddress.trim() === publicKey.toBase58()) {
        setError("You can't send a bottle to yourself!");
        return;
      }
    }

    setIsLoading(true);
    setError('');
    setThrowAnimation(true);

    try {
      // Create memo with metadata
      const memoPrefix = messageMode === 'direct'
        ? `[Bottle:${recipientAddress.trim()}]`
        : '[Bottle]';

      const memoInstruction = new TransactionInstruction({
        keys: [{ pubkey: publicKey, isSigner: true, isWritable: false }],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(`${memoPrefix} ${message}`, 'utf-8'),
      });

      // Build transaction
      const transaction = new Transaction();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      transaction.add(memoInstruction);

      // Sign and send
      const signed = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      // Confirm transaction
      await connection.confirmTransaction({
        blockhash,
        lastValidBlockHeight,
        signature,
      }, 'confirmed');

      // Save bottle to API (stores in shared database)
      const apiResponse = await fetch('/api/bottles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          sender: publicKey.toBase58(),
          recipient: messageMode === 'direct' ? recipientAddress.trim() : undefined,
          signature,
        }),
      });

      const apiData = await apiResponse.json();

      if (apiData.bottle) {
        // Add to local state immediately
        setBottles(prev => [apiData.bottle, ...prev].slice(0, 200));
      }

      setMessage('');
      setRecipientAddress('');

      if (messageMode === 'direct') {
        showToast('Direct message sent!');
      } else {
        showToast('Message cast into the ocean!');
      }
    } catch (err: any) {
      console.error('Error throwing bottle:', err);
      setError(err.message || 'Failed to throw bottle');
    } finally {
      setIsLoading(false);
      setTimeout(() => setThrowAnimation(false), 1000);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return 'just now';
  };

  // Play cork pop sound when clicking a bottle
  const playBottleSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Cork pop - short percussive sound
      const popOsc = audioContext.createOscillator();
      const popGain = audioContext.createGain();
      popOsc.connect(popGain);
      popGain.connect(audioContext.destination);
      popOsc.frequency.setValueAtTime(400, audioContext.currentTime);
      popOsc.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.1);
      popGain.gain.setValueAtTime(0.3, audioContext.currentTime);
      popGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
      popOsc.start(audioContext.currentTime);
      popOsc.stop(audioContext.currentTime + 0.15);

      // Bubble/water sound
      const bubbleOsc = audioContext.createOscillator();
      const bubbleGain = audioContext.createGain();
      bubbleOsc.type = 'sine';
      bubbleOsc.connect(bubbleGain);
      bubbleGain.connect(audioContext.destination);
      bubbleOsc.frequency.setValueAtTime(600, audioContext.currentTime + 0.05);
      bubbleOsc.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.2);
      bubbleGain.gain.setValueAtTime(0.15, audioContext.currentTime + 0.05);
      bubbleGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
      bubbleOsc.start(audioContext.currentTime + 0.05);
      bubbleOsc.stop(audioContext.currentTime + 0.25);
    } catch (e) {
      // Audio not supported, fail silently
    }
  }, []);

  // Filter bottles for ocean view (public only)
  const oceanBottles = bottles.filter(b => !b.recipient);

  // Filter bottles for inbox (direct messages to current user)
  const inboxBottles = publicKey
    ? bottles.filter(b => b.recipient === publicKey.toBase58())
    : [];

  // Bottles sent by current user (direct messages)
  const sentBottles = publicKey
    ? bottles.filter(b => b.recipient && b.sender === publicKey.toBase58())
    : [];

  // Check if user can read a bottle
  const canReadBottle = (bottle: Bottle): boolean => {
    if (!bottle.recipient) return true; // Public bottle
    if (!publicKey) return false; // Not connected
    return bottle.recipient === publicKey.toBase58() || bottle.sender === publicKey.toBase58();
  };

  return (
    <>
      <style jsx>{`
        .bottles-container {
          min-height: 100vh;
          background: linear-gradient(180deg, #0B1120 0%, #0D1829 30%, #0F2942 60%, #123A5C 100%);
          font-family: 'IBM Plex Mono', monospace;
          color: #E2E8F0;
          position: relative;
          overflow: hidden;
        }

        .ocean-bg {
          position: fixed;
          inset: 0;
          background-image:
            radial-gradient(ellipse at 50% 100%, rgba(94, 174, 216, 0.15) 0%, transparent 60%),
            radial-gradient(circle at 20% 80%, rgba(94, 174, 216, 0.08) 0%, transparent 40%),
            radial-gradient(circle at 80% 70%, rgba(94, 174, 216, 0.08) 0%, transparent 40%);
          pointer-events: none;
          z-index: 0;
        }

        .waves {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 60%;
          pointer-events: none;
          z-index: 1;
          overflow: hidden;
        }

        .wave {
          position: absolute;
          width: 200%;
          height: 100%;
          background: linear-gradient(180deg, transparent 0%, rgba(94, 174, 216, 0.03) 100%);
          animation: wave-move 8s ease-in-out infinite;
          border-top: 1px solid rgba(94, 174, 216, 0.1);
        }

        .wave:nth-child(2) {
          animation-delay: -2s;
          animation-duration: 10s;
          opacity: 0.7;
        }

        .wave:nth-child(3) {
          animation-delay: -4s;
          animation-duration: 12s;
          opacity: 0.5;
        }

        @keyframes wave-move {
          0%, 100% { transform: translateX(0) translateY(0); }
          50% { transform: translateX(-25%) translateY(-10px); }
        }

        .container {
          max-width: 900px;
          margin: 0 auto;
          padding: 40px 20px;
          position: relative;
          z-index: 10;
        }

        .header {
          text-align: center;
          margin-bottom: 40px;
        }

        .title {
          font-size: 48px;
          font-weight: 700;
          color: #5EAED8;
          margin: 0 0 8px 0;
          text-shadow: 0 0 40px rgba(94, 174, 216, 0.3);
          letter-spacing: 0.1em;
        }

        .subtitle {
          font-size: 14px;
          color: #6B7B8F;
          letter-spacing: 0.15em;
        }

        .compose-section {
          background: rgba(17, 24, 39, 0.8);
          border: 1px solid rgba(94, 174, 216, 0.2);
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 40px;
          backdrop-filter: blur(10px);
        }

        .mode-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
        }

        .mode-tab {
          flex: 1;
          padding: 12px 16px;
          background: transparent;
          border: 1px solid rgba(94, 174, 216, 0.2);
          border-radius: 8px;
          color: #6B7B8F;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.1em;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .mode-tab:hover {
          border-color: rgba(94, 174, 216, 0.4);
          color: #E2E8F0;
        }

        .mode-tab.active {
          background: rgba(94, 174, 216, 0.15);
          border-color: #5EAED8;
          color: #5EAED8;
        }

        .mode-icon {
          font-size: 16px;
        }

        .recipient-input {
          width: 100%;
          background: rgba(11, 17, 32, 0.6);
          border: 1px solid rgba(94, 174, 216, 0.15);
          border-radius: 8px;
          padding: 14px 16px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          color: #E2E8F0;
          outline: none;
          transition: border-color 0.2s;
          margin-bottom: 16px;
        }

        .recipient-input:focus {
          border-color: rgba(94, 174, 216, 0.4);
        }

        .recipient-input::placeholder {
          color: #3D4A5C;
        }

        .compose-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .compose-title {
          font-size: 12px;
          color: #5EAED8;
          letter-spacing: 0.15em;
          text-transform: uppercase;
        }

        .char-count {
          font-size: 11px;
          color: ${message.length > 280 ? '#EF4444' : '#6B7B8F'};
        }

        .message-input {
          width: 100%;
          height: 120px;
          background: rgba(11, 17, 32, 0.6);
          border: 1px solid rgba(94, 174, 216, 0.15);
          border-radius: 8px;
          padding: 16px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 14px;
          color: #E2E8F0;
          resize: none;
          outline: none;
          transition: border-color 0.2s;
        }

        .message-input:focus {
          border-color: rgba(94, 174, 216, 0.4);
        }

        .message-input::placeholder {
          color: #3D4A5C;
        }

        .action-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 16px;
          gap: 16px;
        }

        .connect-btn {
          background: transparent;
          border: 1px solid #5EAED8;
          color: #5EAED8;
          padding: 12px 24px;
          border-radius: 6px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.1em;
          cursor: pointer;
          transition: all 0.2s;
        }

        .connect-btn:hover {
          background: rgba(94, 174, 216, 0.1);
          box-shadow: 0 0 20px rgba(94, 174, 216, 0.2);
        }

        .throw-btn {
          background: linear-gradient(135deg, #5EAED8, #3A7A9D);
          border: none;
          color: #0B1120;
          padding: 14px 32px;
          border-radius: 6px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.1em;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .throw-btn.direct {
          background: linear-gradient(135deg, #A78BFA, #7C3AED);
        }

        .throw-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(94, 174, 216, 0.4);
        }

        .throw-btn.direct:hover:not(:disabled) {
          box-shadow: 0 8px 30px rgba(167, 139, 250, 0.4);
        }

        .throw-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .throw-btn.throwing {
          animation: throw-wobble 0.5s ease-in-out;
        }

        @keyframes throw-wobble {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-10deg); }
          75% { transform: rotate(10deg); }
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(11, 17, 32, 0.3);
          border-top-color: #0B1120;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .error-msg {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #EF4444;
          padding: 12px 16px;
          border-radius: 6px;
          font-size: 12px;
          margin-top: 16px;
        }

        .view-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
        }

        .view-tab {
          padding: 10px 20px;
          background: transparent;
          border: 1px solid rgba(94, 174, 216, 0.2);
          border-radius: 6px;
          color: #6B7B8F;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.1em;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .view-tab:hover {
          border-color: rgba(94, 174, 216, 0.4);
          color: #E2E8F0;
        }

        .view-tab.active {
          background: rgba(94, 174, 216, 0.15);
          border-color: #5EAED8;
          color: #5EAED8;
        }

        .tab-badge {
          background: rgba(94, 174, 216, 0.3);
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 10px;
        }

        .view-tab.active .tab-badge {
          background: #5EAED8;
          color: #0B1120;
        }

        .inbox-badge {
          background: rgba(167, 139, 250, 0.3);
        }

        .view-tab.active .inbox-badge {
          background: #A78BFA;
        }

        .ocean-section {
          position: relative;
          min-height: 400px;
        }

        .ocean-title {
          font-size: 12px;
          color: #5EAED8;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .bottle-count {
          background: rgba(94, 174, 216, 0.15);
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 11px;
          color: #5EAED8;
        }

        .ocean-view {
          position: relative;
          background: linear-gradient(180deg, rgba(15, 41, 66, 0.4) 0%, rgba(18, 58, 92, 0.6) 100%);
          border: 1px solid rgba(94, 174, 216, 0.15);
          border-radius: 12px;
          min-height: 350px;
          overflow: hidden;
        }

        .floating-bottle {
          position: absolute;
          cursor: pointer;
          transition: transform 0.3s ease, filter 0.3s ease;
          filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
        }

        .floating-bottle:hover {
          transform: scale(1.2) !important;
          filter: drop-shadow(0 8px 16px rgba(94, 174, 216, 0.4));
          z-index: 100;
        }

        .floating-bottle.direct:hover {
          filter: drop-shadow(0 8px 16px rgba(167, 139, 250, 0.4));
        }

        .bottle-svg {
          width: 40px;
          height: 60px;
          animation: bob var(--duration) ease-in-out infinite;
          animation-delay: var(--delay);
        }

        @keyframes bob {
          0%, 100% { transform: translateY(0) rotate(var(--rotation)); }
          50% { transform: translateY(-8px) rotate(calc(var(--rotation) + 5deg)); }
        }

        .empty-ocean {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 300px;
          color: #6B7B8F;
          text-align: center;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.5;
        }

        .empty-text {
          font-size: 14px;
          letter-spacing: 0.05em;
        }

        .inbox-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .inbox-item {
          background: rgba(17, 24, 39, 0.6);
          border: 1px solid rgba(167, 139, 250, 0.2);
          border-radius: 10px;
          padding: 16px 20px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .inbox-item:hover {
          border-color: rgba(167, 139, 250, 0.4);
          background: rgba(17, 24, 39, 0.8);
        }

        .inbox-item.sent {
          border-color: rgba(94, 174, 216, 0.2);
        }

        .inbox-item.sent:hover {
          border-color: rgba(94, 174, 216, 0.4);
        }

        .inbox-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .inbox-item-from {
          font-size: 11px;
          color: #A78BFA;
          letter-spacing: 0.1em;
        }

        .inbox-item.sent .inbox-item-from {
          color: #5EAED8;
        }

        .inbox-item-time {
          font-size: 10px;
          color: #6B7B8F;
        }

        .inbox-item-preview {
          font-size: 14px;
          color: #E2E8F0;
          line-height: 1.5;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .inbox-empty {
          text-align: center;
          padding: 60px 20px;
          color: #6B7B8F;
        }

        .inbox-empty-icon {
          font-size: 40px;
          margin-bottom: 12px;
          opacity: 0.5;
        }

        .inbox-section-title {
          font-size: 11px;
          color: #6B7B8F;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          margin: 24px 0 12px 0;
        }

        .inbox-section-title:first-child {
          margin-top: 0;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(11, 17, 32, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(4px);
        }

        .modal {
          background: #111827;
          border: 1px solid rgba(94, 174, 216, 0.3);
          border-radius: 12px;
          padding: 32px;
          max-width: 500px;
          width: 90%;
          position: relative;
        }

        .modal.direct {
          border-color: rgba(167, 139, 250, 0.3);
        }

        .modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          background: none;
          border: none;
          color: #6B7B8F;
          font-size: 20px;
          cursor: pointer;
          padding: 4px;
          line-height: 1;
        }

        .modal-close:hover {
          color: #E2E8F0;
        }

        .modal-header {
          margin-bottom: 20px;
        }

        .modal-label {
          font-size: 10px;
          color: #5EAED8;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .modal.direct .modal-label {
          color: #A78BFA;
        }

        .modal-message {
          font-size: 18px;
          color: #E2E8F0;
          line-height: 1.6;
          word-break: break-word;
        }

        .locked-message {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px;
          color: #6B7B8F;
          text-align: center;
        }

        .locked-icon {
          font-size: 32px;
          margin-bottom: 12px;
        }

        .locked-text {
          font-size: 13px;
          line-height: 1.5;
        }

        .modal-meta {
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid rgba(94, 174, 216, 0.15);
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .modal.direct .modal-meta {
          border-top-color: rgba(167, 139, 250, 0.15);
        }

        .meta-item {
          font-size: 11px;
        }

        .meta-label {
          color: #6B7B8F;
          margin-bottom: 4px;
        }

        .meta-value {
          color: #5EAED8;
          font-family: 'IBM Plex Mono', monospace;
        }

        .modal.direct .meta-value {
          color: #A78BFA;
        }

        .meta-value a {
          color: inherit;
          text-decoration: none;
        }

        .meta-value a:hover {
          text-decoration: underline;
        }

        .toast {
          position: fixed;
          bottom: 24px;
          right: 24px;
          background: linear-gradient(135deg, #4ADE80, #22C55E);
          color: #0B1120;
          padding: 16px 24px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.05em;
          z-index: 2000;
          animation: slide-in 0.3s ease-out;
          box-shadow: 0 8px 32px rgba(74, 222, 128, 0.3);
        }

        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        .wallet-status {
          font-size: 11px;
          color: #6B7B8F;
        }

        .wallet-address {
          color: #5EAED8;
        }

        @media (max-width: 640px) {
          .title {
            font-size: 36px;
          }

          .mode-tabs {
            flex-direction: column;
          }

          .action-row {
            flex-direction: column;
          }

          .throw-btn, .connect-btn {
            width: 100%;
            justify-content: center;
          }

          .modal-meta {
            grid-template-columns: 1fr;
          }

          .view-tabs {
            flex-wrap: wrap;
          }
        }
      `}</style>

      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div className="bottles-container">
        <div className="ocean-bg"></div>

        <div className="waves">
          <div className="wave"></div>
          <div className="wave"></div>
          <div className="wave"></div>
        </div>

        <div className="container">
          <div className="header">
            <h1 className="title">BOTTLES</h1>
            <p className="subtitle">CAST YOUR MESSAGE INTO THE SOLANA OCEAN</p>
          </div>

          <div className="compose-section">
            <div className="mode-tabs">
              <button
                className={`mode-tab ${messageMode === 'ocean' ? 'active' : ''}`}
                onClick={() => setMessageMode('ocean')}
              >
                <span className="mode-icon">🌊</span>
                TO THE OCEAN
              </button>
              <button
                className={`mode-tab ${messageMode === 'direct' ? 'active' : ''}`}
                onClick={() => setMessageMode('direct')}
              >
                <span className="mode-icon">🔒</span>
                DIRECT MESSAGE
              </button>
            </div>

            {messageMode === 'direct' && (
              <input
                type="text"
                className="recipient-input"
                placeholder="Recipient wallet address..."
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                disabled={isLoading}
              />
            )}

            <div className="compose-header">
              <span className="compose-title">
                {messageMode === 'direct' ? 'Write Your Private Message' : 'Write Your Message'}
              </span>
              <span className="char-count">{message.length}/280</span>
            </div>

            <textarea
              className="message-input"
              placeholder={messageMode === 'direct'
                ? "Write a private message only the recipient can read..."
                : "What message will you cast into the ocean?"
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={300}
              disabled={isLoading}
            />

            <div className="action-row">
              {connected ? (
                <div className="wallet-status">
                  Connected: <span className="wallet-address">{formatAddress(publicKey?.toBase58() || '')}</span>
                </div>
              ) : (
                <button className="connect-btn" onClick={() => setVisible(true)}>
                  CONNECT WALLET
                </button>
              )}

              <button
                className={`throw-btn ${messageMode === 'direct' ? 'direct' : ''} ${throwAnimation ? 'throwing' : ''}`}
                onClick={throwBottle}
                disabled={isLoading || !message.trim()}
              >
                {isLoading ? (
                  <>
                    <div className="spinner"></div>
                    {messageMode === 'direct' ? 'SENDING...' : 'CASTING...'}
                  </>
                ) : (
                  messageMode === 'direct' ? 'SEND MESSAGE' : 'THROW BOTTLE'
                )}
              </button>
            </div>

            {error && <div className="error-msg">{error}</div>}
          </div>

          {/* View Tabs */}
          <div className="view-tabs">
            <button
              className={`view-tab ${activeTab === 'ocean' ? 'active' : ''}`}
              onClick={() => setActiveTab('ocean')}
            >
              🌊 THE OCEAN
              <span className="tab-badge">{oceanBottles.length}</span>
            </button>
            <button
              className={`view-tab ${activeTab === 'inbox' ? 'active' : ''}`}
              onClick={() => setActiveTab('inbox')}
            >
              📬 YOUR BOTTLES
              {inboxBottles.length > 0 && (
                <span className="tab-badge inbox-badge">{inboxBottles.length}</span>
              )}
            </button>
          </div>

          {activeTab === 'ocean' && (
            <div className="ocean-section">
              <div className="ocean-view">
                {oceanBottles.length === 0 ? (
                  <div className="empty-ocean">
                    <div className="empty-icon">🌊</div>
                    <div className="empty-text">No bottles yet. Be the first to cast a message!</div>
                  </div>
                ) : (
                  oceanBottles.map((bottle) => (
                    <div
                      key={bottle.id}
                      className="floating-bottle"
                      style={{
                        left: `${bottle.x}%`,
                        top: `${bottle.y}%`,
                        ['--rotation' as any]: `${bottle.rotation}deg`,
                        ['--delay' as any]: `${bottle.animationDelay}s`,
                        ['--duration' as any]: `${bottle.animationDuration}s`,
                      }}
                      onClick={() => { playBottleSound(); setSelectedBottle(bottle); }}
                      title="Click to read message"
                    >
                      <svg className="bottle-svg" viewBox="0 0 40 60" fill="none">
                        <path
                          d="M12 20 L12 50 Q12 55 20 55 Q28 55 28 50 L28 20 Q28 15 20 15 Q12 15 12 20Z"
                          fill="rgba(94, 174, 216, 0.3)"
                          stroke="#5EAED8"
                          strokeWidth="1.5"
                        />
                        <path
                          d="M16 15 L16 8 Q16 5 20 5 Q24 5 24 8 L24 15"
                          fill="rgba(94, 174, 216, 0.2)"
                          stroke="#5EAED8"
                          strokeWidth="1.5"
                        />
                        <rect x="17" y="3" width="6" height="5" rx="1" fill="#8B7355" stroke="#6B5344" strokeWidth="0.5" />
                        <rect x="16" y="25" width="8" height="20" rx="1" fill="#E2E8F0" opacity="0.6" />
                        <path
                          d="M14 22 L14 45"
                          stroke="rgba(255, 255, 255, 0.3)"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'inbox' && (
            <div className="ocean-section">
              {!connected ? (
                <div className="inbox-empty">
                  <div className="inbox-empty-icon">🔒</div>
                  <div>Connect your wallet to see your bottles</div>
                  <button
                    className="connect-btn"
                    onClick={() => setVisible(true)}
                    style={{ marginTop: '16px' }}
                  >
                    CONNECT WALLET
                  </button>
                </div>
              ) : (inboxBottles.length === 0 && sentBottles.length === 0) ? (
                <div className="inbox-empty">
                  <div className="inbox-empty-icon">📭</div>
                  <div>No direct messages yet</div>
                </div>
              ) : (
                <div className="inbox-list">
                  {inboxBottles.length > 0 && (
                    <>
                      <div className="inbox-section-title">Received</div>
                      {inboxBottles.map((bottle) => (
                        <div
                          key={bottle.id}
                          className="inbox-item"
                          onClick={() => { playBottleSound(); setSelectedBottle(bottle); }}
                        >
                          <div className="inbox-item-header">
                            <span className="inbox-item-from">From: {formatAddress(bottle.sender)}</span>
                            <span className="inbox-item-time">{formatTime(bottle.timestamp)}</span>
                          </div>
                          <div className="inbox-item-preview">{bottle.message}</div>
                        </div>
                      ))}
                    </>
                  )}

                  {sentBottles.length > 0 && (
                    <>
                      <div className="inbox-section-title">Sent</div>
                      {sentBottles.map((bottle) => (
                        <div
                          key={bottle.id}
                          className="inbox-item sent"
                          onClick={() => { playBottleSound(); setSelectedBottle(bottle); }}
                        >
                          <div className="inbox-item-header">
                            <span className="inbox-item-from">To: {formatAddress(bottle.recipient!)}</span>
                            <span className="inbox-item-time">{formatTime(bottle.timestamp)}</span>
                          </div>
                          <div className="inbox-item-preview">{bottle.message}</div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Message Modal */}
        {selectedBottle && (
          <div className="modal-overlay" onClick={() => setSelectedBottle(null)}>
            <div className={`modal ${selectedBottle.recipient ? 'direct' : ''}`} onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setSelectedBottle(null)}>×</button>

              <div className="modal-header">
                <div className="modal-label">
                  {selectedBottle.recipient ? 'Direct Message' : 'Message in a Bottle'}
                </div>

                {canReadBottle(selectedBottle) ? (
                  <div className="modal-message">{selectedBottle.message}</div>
                ) : (
                  <div className="locked-message">
                    <div className="locked-icon">🔒</div>
                    <div className="locked-text">
                      This message is private.<br />
                      Only the recipient can read it.
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-meta">
                <div className="meta-item">
                  <div className="meta-label">SENDER</div>
                  <div className="meta-value">{formatAddress(selectedBottle.sender)}</div>
                </div>
                <div className="meta-item">
                  <div className="meta-label">{selectedBottle.recipient ? 'RECIPIENT' : 'CAST'}</div>
                  <div className="meta-value">
                    {selectedBottle.recipient
                      ? formatAddress(selectedBottle.recipient)
                      : formatTime(selectedBottle.timestamp)
                    }
                  </div>
                </div>
                <div className="meta-item" style={{ gridColumn: '1 / -1' }}>
                  <div className="meta-label">TRANSACTION</div>
                  <div className="meta-value">
                    <a
                      href={`https://solscan.io/tx/${selectedBottle.signature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {formatAddress(selectedBottle.signature)}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}
