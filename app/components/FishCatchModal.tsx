"use client";

import React, { useEffect, useState } from 'react';

interface FishCatchModalProps {
  solAmount: number;
  onClose: () => void;
}

interface FishTier {
  threshold: number;
  size: string;
  emoji: string;
  title: string;
  description: string;
  color: string;
}

const fishTiers: FishTier[] = [
  {
    threshold: 10,
    size: 'LEGENDARY',
    emoji: '🐋',
    title: 'LEVIATHAN CATCH!',
    description: 'A whale of epic proportions!',
    color: '#FFD700'
  },
  {
    threshold: 5,
    size: 'GIANT',
    emoji: '🦈',
    title: 'GIANT CATCH!',
    description: 'The ocean trembles!',
    color: '#FF6B6B'
  },
  {
    threshold: 2.5,
    size: 'TROPHY',
    emoji: '🐬',
    title: 'TROPHY CATCH!',
    description: 'A magnificent specimen!',
    color: '#4ECDC4'
  },
  {
    threshold: 1,
    size: 'LARGE',
    emoji: '🐡',
    title: 'LARGE CATCH!',
    description: 'A keeper for sure!',
    color: '#95E1D3'
  },
  {
    threshold: 0.5,
    size: 'MEDIUM',
    emoji: '🐠',
    title: 'MEDIUM CATCH!',
    description: 'A solid find!',
    color: '#5EAED8'
  },
  {
    threshold: 0.25,
    size: 'SMALL',
    emoji: '🐟',
    title: 'SMALL CATCH!',
    description: 'Every bit counts!',
    color: '#6B7B8F'
  }
];

export default function FishCatchModal({ solAmount, onClose }: FishCatchModalProps) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setTimeout(() => setAnimate(true), 100);
  }, []);

  // Determine fish tier based on SOL amount
  const fishTier = fishTiers.find(tier => solAmount >= tier.threshold) || fishTiers[fishTiers.length - 1];

  const shareToTwitter = async () => {
    // Copy image to clipboard
    await copyImageToClipboard();

    // Then open Twitter with follow intent
    const text = `Just caught a ${fishTier.size} fish with @ShipsInTheYard's Trawler! 🎣\n\nRecovered ${solAmount.toFixed(4)} SOL by closing empty token accounts.\n\nClean your wallet at shipyardtools.xyz`;

    // Twitter intent URL with related accounts to follow
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&related=ShipsInTheYard`;

    // Show toast notification
    showCopyNotification();

    // Open Twitter after a brief delay
    setTimeout(() => {
      window.open(tweetUrl, '_blank');
    }, 500);
  };

  const copyImageToClipboard = async () => {
    const canvas = createCatchCanvas();

    try {
      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob'));
        }, 'image/png');
      });

      // Copy to clipboard
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob
        })
      ]);
    } catch (err) {
      console.error('Failed to copy image to clipboard:', err);
      // Fallback to download if clipboard fails
      downloadFromCanvas(canvas);
    }
  };

  const showCopyNotification = () => {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4ADE80;
      color: #0B1120;
      padding: 16px 24px;
      border-radius: 8px;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 12px;
      font-weight: 600;
      z-index: 10000;
      box-shadow: 0 4px 20px rgba(74, 222, 128, 0.4);
      animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = '📋 Image copied! Paste it in your tweet';

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => document.body.removeChild(notification), 300);
    }, 3000);
  };

  const createCatchCanvas = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    // Set canvas size
    canvas.width = 800;
    canvas.height = 800;

    // Background gradient
    const bgGradient = ctx.createLinearGradient(0, 0, 800, 800);
    bgGradient.addColorStop(0, '#111827');
    bgGradient.addColorStop(1, '#0D1526');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 800, 800);

    // Border
    ctx.strokeStyle = fishTier.color;
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, 780, 780);

    // Grid pattern overlay
    ctx.strokeStyle = 'rgba(94, 174, 216, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 800; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 800);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(800, i);
      ctx.stroke();
    }

    // Title badge
    ctx.fillStyle = `${fishTier.color}33`;
    ctx.fillRect(250, 80, 300, 40);
    ctx.strokeStyle = fishTier.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(250, 80, 300, 40);

    ctx.fillStyle = fishTier.color;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${fishTier.size} CATCH`, 400, 105);

    // Fish emoji (large)
    ctx.font = '180px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(fishTier.emoji, 400, 300);

    // Title
    ctx.fillStyle = '#E2E8F0';
    ctx.font = 'bold 48px Arial';
    ctx.fillText(fishTier.title, 400, 380);

    // Description
    ctx.fillStyle = '#6B7B8F';
    ctx.font = 'italic 20px Arial';
    ctx.fillText(fishTier.description, 400, 420);

    // SOL amount box
    const boxGradient = ctx.createLinearGradient(200, 480, 600, 580);
    boxGradient.addColorStop(0, 'rgba(94, 174, 216, 0.1)');
    boxGradient.addColorStop(1, 'rgba(74, 222, 128, 0.1)');
    ctx.fillStyle = boxGradient;
    ctx.fillRect(200, 480, 400, 120);
    ctx.strokeStyle = 'rgba(94, 174, 216, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(200, 480, 400, 120);

    // "RECOVERED" label
    ctx.fillStyle = '#6B7B8F';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('RECOVERED', 400, 510);

    // SOL amount with gradient (simulate with solid color)
    ctx.fillStyle = '#5EAED8';
    ctx.font = 'bold 56px Arial';
    ctx.fillText(`${solAmount.toFixed(4)} SOL`, 400, 565);

    // Bottom text
    ctx.fillStyle = '#3D4A5C';
    ctx.font = '16px Arial';
    ctx.fillText('Successfully trawled your wallet', 400, 595);

    // Footer branding
    ctx.fillStyle = '#6B7B8F';
    ctx.font = '18px Arial';
    ctx.fillText('Built with', 400, 680);

    ctx.fillStyle = '#5EAED8';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('THE SHIPYARD', 400, 710);

    ctx.font = '16px Arial';
    ctx.fillText('🚢', 400, 740);

    // Twitter handle
    ctx.fillStyle = '#3D4A5C';
    ctx.font = '14px Arial';
    ctx.fillText('@ShipsInTheYard', 400, 765);

    return canvas;
  };

  const downloadFromCanvas = (canvas: HTMLCanvasElement) => {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trawler-catch-${solAmount.toFixed(4)}SOL.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const downloadCatchImage = () => {
    const canvas = createCatchCanvas();
    downloadFromCanvas(canvas);
  };

  return (
    <>
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.8) translateY(20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes fishFloat {
          0%, 100% {
            transform: translateY(0) rotate(0deg);
          }
          25% {
            transform: translateY(-10px) rotate(2deg);
          }
          50% {
            transform: translateY(0) rotate(0deg);
          }
          75% {
            transform: translateY(-5px) rotate(-2deg);
          }
        }

        @keyframes shimmer {
          0% {
            background-position: -200% center;
          }
          100% {
            background-position: 200% center;
          }
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(11, 17, 32, 0.95);
          backdrop-filter: blur(8px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.3s ease-out;
        }

        .modal-content {
          background: linear-gradient(135deg, #111827 0%, #0D1526 100%);
          border: 2px solid ${fishTier.color};
          border-radius: 16px;
          max-width: 500px;
          width: 100%;
          padding: 40px;
          position: relative;
          box-shadow: 0 0 40px ${fishTier.color}40, 0 20px 60px rgba(0, 0, 0, 0.4);
          animation: ${animate ? 'scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none'};
        }

        .close-btn {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #6B7B8F;
          font-size: 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .close-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #E2E8F0;
          transform: rotate(90deg);
        }

        .fish-emoji {
          font-size: 120px;
          text-align: center;
          margin-bottom: 20px;
          animation: fishFloat 3s ease-in-out infinite;
          filter: drop-shadow(0 0 20px ${fishTier.color}80);
        }

        .badge {
          display: inline-block;
          padding: 6px 12px;
          background: ${fishTier.color}20;
          border: 1px solid ${fishTier.color};
          border-radius: 20px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.15em;
          color: ${fishTier.color};
          margin-bottom: 16px;
        }

        .title {
          font-size: 32px;
          font-weight: 700;
          color: #E2E8F0;
          margin-bottom: 8px;
          text-align: center;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        }

        .description {
          font-size: 14px;
          color: #6B7B8F;
          text-align: center;
          margin-bottom: 32px;
          font-style: italic;
        }

        .sol-amount-box {
          background: linear-gradient(135deg, rgba(94, 174, 216, 0.1) 0%, rgba(74, 222, 128, 0.1) 100%);
          border: 1px solid rgba(94, 174, 216, 0.3);
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }

        .sol-amount-box::before {
          content: '';
          position: absolute;
          top: 0;
          left: -200%;
          width: 200%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
          animation: shimmer 3s infinite;
        }

        .sol-label {
          font-size: 11px;
          letter-spacing: 0.15em;
          color: #6B7B8F;
          margin-bottom: 8px;
        }

        .sol-value {
          font-size: 48px;
          font-weight: 700;
          background: linear-gradient(135deg, #5EAED8 0%, #4ADE80 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 4px;
          position: relative;
        }

        .sol-unit {
          font-size: 20px;
          color: #6B7B8F;
          margin-left: 8px;
        }

        .subtitle {
          font-size: 12px;
          color: #3D4A5C;
          text-align: center;
        }

        .actions {
          display: flex;
          gap: 12px;
          margin-top: 24px;
        }

        .btn {
          flex: 1;
          padding: 16px 24px;
          border-radius: 8px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.1em;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .btn-twitter {
          background: linear-gradient(135deg, #1DA1F2 0%, #0d8bd9 100%);
          color: white;
        }

        .btn-twitter:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(29, 161, 242, 0.4);
        }

        .btn-download {
          background: linear-gradient(135deg, #5EAED8 0%, #3A7A9D 100%);
          color: white;
        }

        .btn-download:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(94, 174, 216, 0.4);
        }

        .btn-close {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #E2E8F0;
        }

        .btn-close:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .btn-close-alt {
          padding: 12px 32px;
          border-radius: 8px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
          color: #6B7B8F;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-close-alt:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #E2E8F0;
        }

        .twitter-icon,
        .download-icon {
          width: 16px;
          height: 16px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 24px;
        }

        .stat-item {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 12px;
          text-align: center;
        }

        .stat-value {
          font-size: 20px;
          font-weight: 700;
          color: ${fishTier.color};
          margin-bottom: 4px;
        }

        .stat-label {
          font-size: 9px;
          letter-spacing: 0.1em;
          color: #3D4A5C;
        }

        @media (max-width: 640px) {
          .modal-content {
            padding: 32px 24px;
          }

          .fish-emoji {
            font-size: 80px;
          }

          .title {
            font-size: 24px;
          }

          .sol-value {
            font-size: 36px;
          }

          .actions {
            flex-direction: column;
          }
        }
      `}</style>

      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <button className="close-btn" onClick={onClose}>×</button>

          <div style={{ textAlign: 'center' }}>
            <div className="badge">{fishTier.size} CATCH</div>

            <div className="fish-emoji">{fishTier.emoji}</div>

            <h2 className="title">{fishTier.title}</h2>
            <p className="description">{fishTier.description}</p>
          </div>

          <div className="sol-amount-box">
            <div className="sol-label">RECOVERED</div>
            <div>
              <span className="sol-value">
                {solAmount.toFixed(4)}
                <span className="sol-unit">SOL</span>
              </span>
            </div>
            <div className="subtitle">Successfully trawled your wallet</div>
          </div>

          <div className="actions">
            <button className="btn btn-twitter" onClick={shareToTwitter}>
              <svg className="twitter-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Share on X
            </button>
            <button className="btn btn-download" onClick={downloadCatchImage}>
              <svg className="download-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download
            </button>
          </div>

          <div style={{ marginTop: '12px', textAlign: 'center' }}>
            <button className="btn btn-close-alt" onClick={onClose}>
              Close
            </button>
          </div>

          <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '10px', color: '#3D4A5C' }}>
            Built with <span style={{ color: '#5EAED8' }}>THE SHIPYARD</span> 🚢
          </div>
        </div>
      </div>
    </>
  );
}
