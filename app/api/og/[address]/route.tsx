import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { computeDegenScore, formatCompact } from '../../../lib/sailor-xp';
import type { SailorChainData } from '../../../lib/sailor-xp';

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`;

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

  // Fallback card
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
              DEGEN SCORE
            </span>
            <span style={{ fontSize: '18px', color: '#5c503c', marginTop: '12px' }}>
              {shortAddr}
            </span>
            <span style={{ fontSize: '16px', color: '#8b7355', marginTop: '8px' }}>
              shipyardtools.xyz
            </span>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  const chainType = (data as Record<string, unknown>).chain === 'evm' ? 'evm' : 'solana' as const;
  const score = computeDegenScore(data, chainType);
  const pnlRealized = typeof data.pnlRealized === 'number' ? data.pnlRealized : null;
  const chainLabel = chainType === 'evm' ? 'EVM' : 'SOL';

  // Top 8 skills by level for display
  const topSkills = [...score.skills].sort((a, b) => b.level - a.level).slice(0, 8);

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
          padding: '24px 40px',
        }}>
          {/* Header: Total Level + Tier */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '20px', borderBottom: '3px solid #8b7355', paddingBottom: '16px',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '18px', color: '#5c503c', letterSpacing: '4px', marginBottom: '4px' }}>
                TOTAL LEVEL
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
                <span style={{ fontSize: '72px', fontWeight: 'bold', color: '#b8860b' }}>
                  {score.total}
                </span>
                <span style={{ fontSize: '22px', color: '#5c503c' }}>
                  ⚔️ Combat {score.combatLevel}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '40px', fontWeight: 'bold', color: score.tier.color }}>
                {score.tier.icon} {score.tier.title}
              </span>
              <span style={{ fontSize: '24px', color: '#5c503c', marginTop: '4px' }}>
                Grade: {score.grade}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <span style={{
                  fontSize: '12px', padding: '2px 8px',
                  backgroundColor: chainType === 'evm' ? '#627eea22' : '#9945ff22',
                  color: chainType === 'evm' ? '#627eea' : '#9945ff',
                  border: `1px solid ${chainType === 'evm' ? '#627eea44' : '#9945ff44'}`,
                }}>
                  {chainLabel}
                </span>
                <span style={{ fontSize: '16px', color: '#8b7355' }}>
                  {shortAddr}
                </span>
              </div>
            </div>
          </div>

          {/* Top 8 Skills Grid — 4×2 */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px',
          }}>
            {topSkills.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                backgroundColor: '#3e3529', border: '2px solid #5c503c',
                padding: '10px 16px', flex: '1 1 23%', minWidth: '200px',
              }}>
                <span style={{ fontSize: '24px' }}>{s.icon}</span>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <span style={{ color: '#c8aa6e', fontSize: '14px' }}>{s.name}</span>
                  <span style={{ color: '#5c503c', fontSize: '11px' }}>{s.desc}</span>
                </div>
                <span style={{
                  fontSize: '28px', fontWeight: 'bold',
                  color: s.level >= 99 ? '#ffd700' : s.level >= 70 ? '#7ee787' : '#d4c4a0',
                }}>
                  {s.level}
                </span>
              </div>
            ))}
          </div>

          {/* Bottom: PnL + roast */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
            borderTop: '3px solid #8b7355', paddingTop: '14px', marginTop: 'auto',
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
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '14px', color: '#5c503c', letterSpacing: '2px' }}>20 SKILLS</span>
                <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#b8860b' }}>
                  {score.skills.filter(s => s.level >= 50).length} above 50
                </span>
              </div>
            </div>
            <div style={{
              maxWidth: '400px', textAlign: 'right',
              fontSize: '14px', color: '#5c503c', fontStyle: 'italic',
            }}>
              &ldquo;{score.tier.roast}&rdquo;
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'center', paddingTop: '12px',
        }}>
          <span style={{ fontSize: '16px', color: '#5c503c', letterSpacing: '4px' }}>
            DEGEN SCORE — shipyardtools.xyz
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
