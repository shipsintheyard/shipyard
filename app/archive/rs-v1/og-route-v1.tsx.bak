import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { computeSkills, getRankFromLevel, formatCompact } from '../../../lib/sailor-xp';
import type { SailorChainData } from '../../../lib/sailor-xp';

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`;

  // Fetch stats from our own API
  const host = request.headers.get('host') || process.env.VERCEL_URL || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';

  let data: SailorChainData & Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${protocol}://${host}/api/sailor-stats/${address}`, {
      headers: { 'Accept': 'application/json' },
    });
    const json = await res.json();
    if (json.success) data = json.data;
  } catch { /* fallback to generic card */ }

  // Fallback: generic card if API fails
  if (!data) {
    return new ImageResponse(
      (
        <div style={{
          display: 'flex', width: '100%', height: '100%',
          backgroundColor: '#1a1610',
          alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column',
        }}>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            backgroundColor: '#d5c4a1', border: '4px solid #8b7355',
            padding: '60px 80px',
          }}>
            <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#3b2e1a' }}>
              SAILOR STATS
            </span>
            <span style={{ fontSize: '18px', color: '#5c503c', marginTop: '12px' }}>
              {shortAddr}
            </span>
            <span style={{ fontSize: '16px', color: '#8b7355', marginTop: '8px' }}>
              shipsintheyard.com
            </span>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  const skills = computeSkills(data);
  const totalLevel = skills.reduce((s, sk) => s + sk.level, 0);
  const rank = getRankFromLevel(totalLevel);
  const combatLevel = skills.length >= 4
    ? Math.floor((skills[0].level + skills[1].level + skills[2].level) / 3 + skills[3].level * 0.2)
    : 0;

  const pnlRealized = typeof data.pnlRealized === 'number' ? data.pnlRealized : null;
  const winRate = typeof data.pnlWinRate === 'number' ? data.pnlWinRate as number : null;

  return new ImageResponse(
    (
      <div style={{
        display: 'flex', flexDirection: 'column',
        width: '100%', height: '100%',
        backgroundColor: '#1a1610',
        padding: '28px',
        fontFamily: 'sans-serif',
      }}>
        {/* Parchment card */}
        <div style={{
          display: 'flex', flexDirection: 'column', flex: 1,
          backgroundColor: '#d5c4a1',
          border: '4px solid #8b7355',
          padding: '24px 32px',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            marginBottom: '16px', borderBottom: '3px solid #8b7355', paddingBottom: '14px',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '36px', fontWeight: 'bold', color: rank.color }}>
                {rank.icon} {rank.title}
              </span>
              <span style={{ fontSize: '16px', color: '#5c503c', marginTop: '4px' }}>
                {shortAddr}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '14px', color: '#5c503c', letterSpacing: '3px' }}>
                TOTAL LEVEL
              </span>
              <span style={{ fontSize: '56px', fontWeight: 'bold', color: '#b8860b' }}>
                {totalLevel}
              </span>
            </div>
          </div>

          {/* Skills (2-column flex) */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px',
          }}>
            {skills.map(s => (
              <div key={s.name} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                width: '48%',
                backgroundColor: '#3e3529',
                padding: '10px 16px',
                border: '2px solid #5c503c',
              }}>
                <span style={{ color: '#c8aa6e', fontSize: '18px' }}>
                  {s.icon} {s.name}
                </span>
                <span style={{
                  color: '#FFFF00', fontSize: '28px', fontWeight: 'bold',
                  textShadow: '1px 1px 0 #000',
                }}>
                  {s.level}
                </span>
              </div>
            ))}
          </div>

          {/* Bottom stats row */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderTop: '3px solid #8b7355', paddingTop: '12px', marginTop: 'auto',
          }}>
            <div style={{ display: 'flex', gap: '40px' }}>
              {pnlRealized !== null && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '14px', color: '#5c503c', letterSpacing: '2px' }}>PnL</span>
                  <span style={{
                    fontSize: '28px', fontWeight: 'bold',
                    color: pnlRealized >= 0 ? '#16a34a' : '#dc2626',
                  }}>
                    {pnlRealized >= 0 ? '+' : ''}${formatCompact(pnlRealized)}
                  </span>
                </div>
              )}
              {winRate !== null && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '14px', color: '#5c503c', letterSpacing: '2px' }}>WIN RATE</span>
                  <span style={{
                    fontSize: '28px', fontWeight: 'bold',
                    color: winRate >= 50 ? '#16a34a' : '#dc2626',
                  }}>
                    {Math.round(winRate)}%
                  </span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '14px', color: '#5c503c', letterSpacing: '2px' }}>COMBAT LEVEL</span>
              <span style={{ fontSize: '40px', fontWeight: 'bold', color: '#b8860b' }}>
                {combatLevel}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center', paddingTop: '12px',
        }}>
          <span style={{ fontSize: '16px', color: '#5c503c', letterSpacing: '4px' }}>
            SAILOR STATS — shipsintheyard.com
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      emoji: 'twemoji',
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    }
  );
}
