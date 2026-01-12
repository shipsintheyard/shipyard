"use client";

import Sonar from '../components/Sonar';
import { useState } from 'react';

/**
 * Enhanced Trawler page with optional landing/intro section
 * Rename this to page.tsx to use instead of the minimal version
 */
export default function TrawlerPageEnhanced() {
  const [showIntro, setShowIntro] = useState(true);

  if (showIntro) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0B1120',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        fontFamily: "'IBM Plex Mono', monospace"
      }}>
        {/* Hero Section */}
        <div style={{
          maxWidth: '800px',
          textAlign: 'center',
          marginBottom: '60px'
        }}>
          <h1 style={{
            fontSize: '64px',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #5EAED8 0%, #4ADE80 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '20px',
            letterSpacing: '-0.02em'
          }}>
            Trawler
          </h1>

          <p style={{
            fontSize: '24px',
            color: '#9CA3AF',
            marginBottom: '40px',
            lineHeight: '1.6'
          }}>
            Real-time Solana event monitoring. Track launches, migrations,
            and market activity as it happens.
          </p>

          {/* Features Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px',
            marginBottom: '50px'
          }}>
            {[
              { icon: '🚀', label: 'Pump.fun Launches', desc: 'Track new tokens' },
              { icon: '📊', label: 'Market Analytics', desc: 'Live volume data' },
              { icon: '🔥', label: 'Activity Forecast', desc: 'Peak hour detection' },
              { icon: '🎯', label: 'Smart Filters', desc: 'Customize your feed' }
            ].map((feature, i) => (
              <div key={i} style={{
                background: '#111827',
                border: '1px solid #1E2A3A',
                borderRadius: '12px',
                padding: '24px',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#5EAED8';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#1E2A3A';
                e.currentTarget.style.transform = 'translateY(0)';
              }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>{feature.icon}</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#E2E8F0', marginBottom: '6px' }}>
                  {feature.label}
                </div>
                <div style={{ fontSize: '12px', color: '#6B7B8F' }}>
                  {feature.desc}
                </div>
              </div>
            ))}
          </div>

          {/* CTA Button */}
          <button
            onClick={() => setShowIntro(false)}
            style={{
              background: 'linear-gradient(135deg, #5EAED8 0%, #4ADE80 100%)',
              border: 'none',
              borderRadius: '8px',
              padding: '16px 48px',
              fontSize: '16px',
              fontWeight: 600,
              color: '#0B1120',
              cursor: 'pointer',
              transition: 'all 0.3s',
              boxShadow: '0 4px 20px rgba(94, 174, 216, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 6px 30px rgba(94, 174, 216, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(94, 174, 216, 0.3)';
            }}
          >
            Launch Trawler →
          </button>

          {/* Stats Row */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '40px',
            marginTop: '60px',
            paddingTop: '40px',
            borderTop: '1px solid #1E2A3A'
          }}>
            {[
              { value: '100K+', label: 'Events Tracked' },
              { value: '24/7', label: 'Live Monitoring' },
              { value: '4', label: 'Platforms' }
            ].map((stat, i) => (
              <div key={i}>
                <div style={{ fontSize: '28px', fontWeight: 700, color: '#5EAED8', marginBottom: '4px' }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: '12px', color: '#6B7B8F' }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          position: 'fixed',
          bottom: '20px',
          fontSize: '12px',
          color: '#6B7B8F'
        }}>
          Built by <span style={{ color: '#5EAED8' }}>THE SHIPYARD</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0B1120'
    }}>
      <Sonar />
    </div>
  );
}
