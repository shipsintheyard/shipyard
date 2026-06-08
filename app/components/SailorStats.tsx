"use client";
import React, { useMemo, useState, useCallback } from 'react';
import { useWalletOnChain } from '../hooks/useWalletOnChain';
import type { OnChainData } from '../hooks/useWalletOnChain';
import { computeDegenScore, formatCompact } from '../lib/sailor-xp';
import type { DegenScore, SkillScore } from '../lib/sailor-xp';

// ============================================================================
// OSRS palette
// ============================================================================

const O = {
  panelBg:    '#3e3529',
  outer:      '#5c503c',
  deepest:    '#1a1610',
  bevelLight: '#968052',
  bevelDark:  '#332D25',
  gold:       '#FFFF00',
  label:      '#c8aa6e',
  xpGreen:    '#00b036',
  text:       '#d4c4a0',
  dim:        '#5c503c',
  parchment:       '#d5c4a1',
  parchmentText:   '#3b2e1a',
};

const FONT = "'Press Start 2P', monospace";

// ============================================================================
// Score ring — total level
// ============================================================================

function ScoreRing({ total, combatLevel, grade, color }: {
  total: number; combatLevel: number; grade: string; color: string;
}) {
  const pct = Math.min(total / 1980, 1);
  const r = 70;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);

  return (
    <div style={{ position: 'relative', width: 180, height: 180, margin: '0 auto' }}>
      <svg width="180" height="180" viewBox="0 0 180 180" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="90" cy="90" r={r} fill="none" stroke={O.deepest} strokeWidth="12" />
        <circle
          cx="90" cy="90" r={r} fill="none"
          stroke={color} strokeWidth="12"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="butt"
          style={{ transition: 'stroke-dashoffset 1.5s ease-out' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          fontFamily: FONT, fontSize: '6px', color: O.dim,
          letterSpacing: '1px', marginBottom: '2px',
        }}>
          TOTAL
        </div>
        <div style={{
          fontFamily: FONT, fontSize: '26px', fontWeight: 'bold',
          color: O.gold, textShadow: '2px 2px 0 #000',
        }}>
          {total}
        </div>
        <div style={{
          fontFamily: FONT, fontSize: '7px', color: O.dim, marginTop: '4px',
        }}>
          ⚔️ {combatLevel}
        </div>
        <div style={{
          fontFamily: FONT, fontSize: '10px', color, marginTop: '2px',
          textShadow: '1px 1px 0 #000',
        }}>
          {grade}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Skill cell — one cell in the 4×5 grid
// ============================================================================

function SkillCell({ skill }: { skill: SkillScore }) {
  const [hover, setHover] = useState(false);
  const levelColor = skill.level >= 99 ? O.gold
    : skill.level >= 70 ? '#7ee787'
    : skill.level >= 30 ? O.text
    : O.dim;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: O.deepest,
        border: `1px solid ${O.bevelDark}`,
        padding: '6px 7px 4px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        position: 'relative',
        cursor: 'default',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: '11px', lineHeight: 1 }}>{skill.icon}</span>
        <span style={{
          fontFamily: FONT,
          fontSize: '10px',
          fontWeight: 'bold',
          color: levelColor,
          textShadow: skill.level >= 99 ? '0 0 6px #ffd70066' : '1px 1px 0 #000',
        }}>
          {skill.level}
        </span>
      </div>
      <div style={{
        fontFamily: FONT,
        fontSize: '5px',
        color: O.dim,
        textAlign: 'center',
        lineHeight: 1,
      }}>
        {skill.name}
      </div>
      {/* Mini XP bar */}
      <div style={{ height: '2px', background: O.panelBg, marginTop: '1px' }}>
        <div style={{
          height: '100%',
          width: `${(skill.level / 99) * 100}%`,
          background: `linear-gradient(90deg, ${skill.color}88, ${skill.color})`,
          transition: 'width 0.8s ease-out',
        }} />
      </div>
      {/* Tooltip */}
      {hover && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '6px', padding: '8px 12px',
          background: '#1a1610', border: `1px solid ${O.gold}44`,
          borderRadius: '4px',
          zIndex: 10, fontFamily: FONT,
          color: O.text, whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.7)',
          display: 'flex', flexDirection: 'column', gap: '3px',
        }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: O.gold }}>{skill.desc}</span>
          {skill.breakdown && (
            <span style={{ fontSize: '10px', color: '#b8a88a' }}>{skill.breakdown}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Stat row
// ============================================================================

function StatRow({ label, value, color, tip }: { label: string; value: string | number; color?: string; tip?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => { if (tip) setShow(v => !v); }}
      style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '4px 0', borderBottom: `1px solid ${O.bevelDark}`,
        fontFamily: FONT, fontSize: '7px',
        position: 'relative',
        cursor: tip ? 'help' : 'default',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ color: O.label, borderBottom: tip ? `1px dotted ${O.dim}` : 'none' }}>{label}</span>
      <span style={{ color: color ?? O.text }}>{value}</span>
      {tip && show && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, right: 0,
          marginBottom: '4px', padding: '5px 8px',
          background: O.panelBg, border: `1px solid ${O.outer}`,
          zIndex: 10, fontFamily: FONT, fontSize: '6px',
          color: O.text, lineHeight: '1.6',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)', whiteSpace: 'normal',
        }}>{tip}</div>
      )}
    </div>
  );
}

// ============================================================================
// Loading skeleton
// ============================================================================

function LoadingSkeleton() {
  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 16px 60px' }}>
      <div className="osrs-scroll" style={{ padding: '24px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <div className="osrs-skeleton" style={{ width: 180, height: 180, borderRadius: '50%' }} />
        </div>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div className="osrs-skeleton" style={{ width: 120, height: 14, margin: '0 auto 8px' }} />
          <div className="osrs-skeleton" style={{ width: 200, height: 8, margin: '0 auto' }} />
        </div>
        {/* Skill grid skeleton */}
        <div className="osrs-panel" style={{ padding: '14px 16px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
            {[...Array(20)].map((_, i) => (
              <div key={i} className="osrs-skeleton" style={{ height: 38 }} />
            ))}
          </div>
        </div>
        <div className="osrs-panel" style={{ padding: '14px 16px' }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="osrs-skeleton" style={{ height: 7, width: `${60 + Math.random() * 30}%`, marginBottom: 10 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function SailorStats({ address }: { address: string }) {
  const { data: chain, loading, error } = useWalletOnChain(address);
  const [copied, setCopied] = useState(false);

  const chainType = chain?.chain ?? 'solana';
  const isEvm = chainType === 'evm';

  const score: DegenScore | null = useMemo(() => {
    if (!chain) return null;
    return computeDegenScore(chain, chainType);
  }, [chain, chainType]);

  const shortenAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

  const handleCopy = useCallback(() => {
    if (!score) return;
    const text = `${score.tier.icon} Total Level: ${score.total} — ${score.tier.title} | ${score.grade}\nshipyardtools.xyz/sailor/${address}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [score, address]);

  const handleShareX = useCallback(() => {
    if (!score) return;
    const text = encodeURIComponent(`${score.tier.icon} Total Level: ${score.total} — ${score.tier.title}\n\n${score.tier.roast}`);
    const url = encodeURIComponent(`https://shipyardtools.xyz/sailor/${address}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'noopener');
  }, [score, address]);

  if (loading) return <LoadingSkeleton />;

  if (error || !chain || !score) {
    return (
      <div style={{
        maxWidth: '640px', margin: '60px auto', padding: '40px 24px',
        textAlign: 'center', fontFamily: FONT, fontSize: '10px',
        color: '#6e7b8b', lineHeight: '2.2',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🪸</div>
        <div style={{ color: O.label, fontSize: '11px', marginBottom: '8px' }}>Barnacle</div>
        <div>{error || 'No on-chain activity found'}</div>
      </div>
    );
  }

  // Find highest skill for highlight
  const maxSkill = [...score.skills].sort((a, b) => b.level - a.level)[0];
  const skills99 = score.skills.filter(s => s.level >= 99).length;

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 16px 60px' }}>
      <div className="osrs-scroll" style={{ padding: '24px 20px' }}>

        {/* 1. Score Ring + Tier */}
        <div style={{ marginBottom: '20px' }}>
          <ScoreRing
            total={score.total}
            combatLevel={score.combatLevel}
            grade={score.grade}
            color={score.tier.color}
          />

          <div style={{ textAlign: 'center', marginTop: '12px' }}>
            <div style={{
              fontFamily: FONT, fontSize: '14px', fontWeight: 'bold',
              color: score.tier.color, textShadow: '1px 1px 0 #000',
            }}>
              {score.tier.icon} {score.tier.title}
            </div>
            <div style={{
              fontFamily: FONT, fontSize: '7px', color: O.dim, marginTop: '6px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}>
              <span style={{
                fontSize: '6px', padding: '2px 5px',
                background: isEvm ? 'rgba(98, 126, 234, 0.15)' : 'rgba(153, 69, 255, 0.15)',
                border: `1px solid ${isEvm ? '#627eea44' : '#9945ff44'}`,
                color: isEvm ? '#627eea' : '#9945ff',
                letterSpacing: '1px',
              }}>
                {isEvm ? 'EVM' : 'SOL'}
              </span>
              {chain.evmDisplay?.ensName ?? shortenAddr(address)}
            </div>
          </div>
        </div>

        {/* Roast */}
        <div className="osrs-bevel" style={{
          background: O.deepest, padding: '12px 16px',
          marginBottom: '16px', textAlign: 'center',
        }}>
          <div style={{
            fontFamily: FONT, fontSize: '7px', color: O.text,
            lineHeight: '1.8', fontStyle: 'italic',
          }}>
            &ldquo;{score.tier.roast}&rdquo;
          </div>
        </div>

        {/* 2. OSRS Skill Grid — 4 columns × 5 rows */}
        <div className="osrs-panel" style={{
          padding: '14px 12px', marginBottom: '16px',
        }}>
          <div style={{
            fontFamily: FONT, fontSize: '7px', color: O.dim,
            marginBottom: '10px', letterSpacing: '2px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          }}>
            <span>SKILLS</span>
            <span style={{ fontSize: '6px', color: O.label }}>
              {skills99 > 0 ? `${skills99} MAXED` : `BEST: ${maxSkill.icon} ${maxSkill.level}`}
            </span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '3px',
          }}>
            {score.skills.map(s => (
              <SkillCell key={s.id} skill={s} />
            ))}
          </div>
        </div>

        {/* 3. Wallet Story */}
        {score.stories.length > 0 && (
          <div className="osrs-panel" style={{
            padding: '14px 16px', marginBottom: '16px',
          }}>
            <div style={{
              fontFamily: FONT, fontSize: '7px', color: O.dim,
              marginBottom: '10px', letterSpacing: '2px',
            }}>
              YOUR STORY
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {score.stories.map((s, i) => (
                <div key={i} style={{
                  fontFamily: FONT, fontSize: '7px', color: O.text,
                  padding: '4px 0',
                  borderBottom: i < score.stories.length - 1 ? `1px solid ${O.bevelDark}` : 'none',
                }}>
                  <span style={{ color: O.gold, marginRight: '8px' }}>▸</span>
                  {s}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. PnL Panel */}
        {(chain.pnlRealized !== null || chain.pnlTotal !== null) && (() => {
          // Detect PnL source: if no Zerion spot PnL but HL exists, it's from Hyperliquid
          const hasSpotPnl = isEvm && chain.evmDisplay?.spotPnl && chain.evmDisplay.spotPnl.realized !== 0;
          const pnlSource = isEvm
            ? (hasSpotPnl ? 'Spot' : chain.evmDisplay?.hyperliquidPnl !== null ? 'Hyperliquid Perps' : null)
            : null;
          return (
          <div className="osrs-panel" style={{ padding: '14px 16px', marginBottom: '16px' }}>
            <div style={{
              fontFamily: FONT, fontSize: '7px', color: O.dim,
              marginBottom: '10px', letterSpacing: '2px',
            }}>
              PROFIT & LOSS
            </div>

            {/* Big PnL number */}
            <div style={{
              textAlign: 'center', padding: '8px 0 12px',
              borderBottom: `1px solid ${O.bevelDark}`, marginBottom: '10px',
            }}>
              <div style={{
                fontFamily: FONT, fontSize: '7px', color: O.dim, marginBottom: '4px',
              }}>
                REALIZED PnL
              </div>
              <div style={{
                fontFamily: FONT, fontSize: isEvm ? '14px' : '18px', fontWeight: 'bold',
                textShadow: '1px 1px 0 #000',
                color: (chain.pnlRealized ?? 0) >= 0 ? '#7ee787' : '#f85149',
              }}>
                {(chain.pnlRealized ?? 0) >= 0 ? '+' : ''}{formatCompact(chain.pnlRealized ?? 0)} USD
              </div>
              {pnlSource && (
                <div style={{
                  fontFamily: FONT, fontSize: '6px', color: O.dim, marginTop: '4px',
                }}>
                  via {pnlSource}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <div>
                <StatRow label="Realized" value={
                  chain.pnlRealized !== null ? `$${formatCompact(chain.pnlRealized)}` : '—'
                } color={(chain.pnlRealized ?? 0) >= 0 ? '#7ee787' : '#f85149'} tip="Profit/loss from closed positions" />
                <StatRow label="Unrealized" value={
                  chain.pnlUnrealized !== null ? `$${formatCompact(chain.pnlUnrealized)}` : '—'
                } color={(chain.pnlUnrealized ?? 0) >= 0 ? '#7ee787' : '#f85149'} tip="Paper gains/losses on current holdings" />
                <StatRow label="Invested" value={
                  chain.pnlTotalInvested !== null ? `$${formatCompact(chain.pnlTotalInvested)}` : '—'
                } color={O.gold} tip="Total USD invested across all tokens" />
              </div>
              <div>
                <StatRow label="Win Rate" value={
                  chain.pnlWinRate !== null ? `${Math.round(chain.pnlWinRate)}%` : '—'
                } color={(chain.pnlWinRate ?? 0) >= 50 ? '#7ee787' : '#f85149'} tip={`${chain.pnlWins}W / ${chain.pnlLosses}L`} />
                <StatRow label="Best Trade" value={
                  chain.pnlBestTrade
                    ? `${chain.pnlBestTrade.symbol || '???'} +$${formatCompact(chain.pnlBestTrade.pnl)}`
                    : '—'
                } color="#7ee787" tip="Highest profit on a single token" />
                <StatRow label="Worst Trade" value={
                  chain.pnlWorstTrade
                    ? `${chain.pnlWorstTrade.symbol || '???'} -$${formatCompact(Math.abs(chain.pnlWorstTrade.pnl))}`
                    : '—'
                } color="#f85149" tip="Biggest loss on a single token" />
              </div>
            </div>

            <StatRow label="Tokens Traded" value={chain.pnlTokensTraded} tip="Total unique tokens bought/sold" />

            {/* Top wins */}
            {chain.pnlTopTokens && chain.pnlTopTokens.length > 0 && (
              <div style={{ marginTop: '10px', borderTop: `1px solid ${O.bevelDark}`, paddingTop: '10px' }}>
                <div style={{
                  fontFamily: FONT, fontSize: '6px', color: O.dim,
                  marginBottom: '8px', letterSpacing: '1px',
                }}>
                  TOP WINS
                </div>
                {chain.pnlTopTokens.map((t, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '5px 0',
                    borderBottom: i < chain.pnlTopTokens.length - 1 ? `1px solid ${O.deepest}` : 'none',
                  }}>
                    {t.image && (
                      <img src={t.image} alt={t.symbol || ''} style={{ width: 20, height: 20, border: `1px solid ${O.bevelDark}` }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: FONT, fontSize: '8px', color: O.label }}>
                        {t.symbol || t.address.slice(0, 8) + '...'}
                      </div>
                      {t.name && t.name !== t.symbol && (
                        <div style={{ fontFamily: FONT, fontSize: '6px', color: O.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.name}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: FONT, fontSize: '8px', fontWeight: 'bold', color: t.pnl >= 0 ? '#7ee787' : '#f85149' }}>
                        {t.pnl >= 0 ? '+' : ''}${formatCompact(t.pnl)}
                      </div>
                      {t.roi !== 0 && (
                        <div style={{ fontFamily: FONT, fontSize: '6px', color: t.roi >= 0 ? '#7ee787' : '#f85149' }}>
                          {t.roi >= 0 ? '+' : ''}{Math.round(t.roi)}% ROI
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Biggest losses */}
            {chain.pnlBottomTokens && chain.pnlBottomTokens.length > 0 && (
              <div style={{ marginTop: '10px', borderTop: `1px solid ${O.bevelDark}`, paddingTop: '10px' }}>
                <div style={{
                  fontFamily: FONT, fontSize: '6px', color: '#f85149',
                  marginBottom: '8px', letterSpacing: '1px',
                }}>
                  BIGGEST LOSSES
                </div>
                {chain.pnlBottomTokens.map((t, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '5px 0',
                    borderBottom: i < chain.pnlBottomTokens.length - 1 ? `1px solid ${O.deepest}` : 'none',
                  }}>
                    {t.image && (
                      <img src={t.image} alt={t.symbol || ''} style={{ width: 20, height: 20, border: `1px solid ${O.bevelDark}` }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: FONT, fontSize: '8px', color: O.label }}>
                        {t.symbol || t.address.slice(0, 8) + '...'}
                      </div>
                      {t.name && t.name !== t.symbol && (
                        <div style={{ fontFamily: FONT, fontSize: '6px', color: O.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.name}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: FONT, fontSize: '8px', fontWeight: 'bold', color: '#f85149' }}>
                        -${formatCompact(Math.abs(t.pnl))}
                      </div>
                      {t.roi !== 0 && (
                        <div style={{ fontFamily: FONT, fontSize: '6px', color: '#f85149' }}>
                          {Math.round(t.roi)}% ROI
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          );
        })()}

        {/* 5. On-Chain Stats */}
        <div className="osrs-panel" style={{ padding: '14px 16px', marginBottom: '16px' }}>
          <div style={{
            fontFamily: FONT, fontSize: '7px', color: O.dim,
            marginBottom: '10px', letterSpacing: '2px',
          }}>
            ON-CHAIN
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            <div>
              <StatRow label="Transactions" tip="Total on-chain transactions" value={
                `${chain.txnCount.toLocaleString()}${chain.txnCountCapped ? '+' : ''}`
              } />
              <StatRow label="Since" tip="Earliest transaction found" value={
                chain.firstSeenDate
                  ? new Date(chain.firstSeenDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
                  : '—'
              } />
              <StatRow label="Last Active" value={
                chain.lastActivityDays === 0 ? 'Today' : `${chain.lastActivityDays}d ago`
              } />
              <StatRow label="Active Days" value={chain.uniqueActiveDays || 0} color={(chain.uniqueActiveDays || 0) > 30 ? '#7ee787' : undefined} />
              <StatRow label={isEvm ? 'ETH' : 'SOL'} value={chain.solBalance.toFixed(isEvm ? 4 : 2)} color={O.gold} />
              <StatRow label="Staked" value={chain.stakedSol > 0 ? chain.stakedSol.toFixed(isEvm ? 4 : 2) : '—'} color={chain.stakedSol > 0 ? '#7ee787' : undefined} />
              <StatRow label="Tokens" value={chain.tokenCount} />
            </div>
            <div>
              <StatRow label="Volume" value={
                chain.solVolume > 0
                  ? isEvm
                    ? `$${formatCompact(chain.evmDisplay?.tradeVolumeUsd || chain.solVolume * 2500)} USD`
                    : `${formatCompact(chain.solVolume)} SOL`
                  : '—'
              } color={chain.solVolume > 0 ? O.gold : undefined} />
              <StatRow label="Biggest Trade" value={
                chain.biggestTrade > 0 ? `${formatCompact(chain.biggestTrade)} ${isEvm ? 'USD' : 'SOL'}` : '—'
              } color={chain.biggestTrade > 1 ? '#f97316' : undefined} />
              <StatRow label="Fav Token" value={
                chain.favToken ? `${chain.favToken} (${chain.favTokenBuys})` : '—'
              } color={chain.favToken ? '#a78bfa' : undefined} />
              <StatRow label="DEXes" value={
                chain.dexProtocols && chain.dexProtocols.length > 0
                  ? chain.dexProtocols.slice(0, 3).map((d: { project: string }) => d.project).join(', ')
                  : '—'
              } color={(chain.dexCount || 0) > 0 ? '#88c0ff' : undefined} />
              <StatRow label="Dapps" value={
                (chain.uniqueDapps || 0) > 0
                  ? `${chain.uniqueDapps} — ${(chain.uniqueDappsList || []).slice(0, 3).join(', ')}`
                  : '—'
              } color={(chain.uniqueDapps || 0) > 3 ? '#7ee787' : undefined} />
              <StatRow label="Memecoins" value={chain.memecoins} color={chain.memecoins > 0 ? '#a78bfa' : undefined} />
              <StatRow label="Dead Tokens" value={chain.deadTokens ?? 0} color={(chain.deadTokens ?? 0) > 0 ? '#f97316' : undefined} />
            </div>
          </div>
          {/* EVM-only: gas + contracts row */}
          {isEvm && chain.evmDisplay && (chain.evmDisplay.gasBurnedEth > 0 || chain.evmDisplay.uniqueContracts > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px', marginTop: '2px' }}>
              <div>
                <StatRow label="Gas Burned" value={`${chain.evmDisplay.gasBurnedEth.toFixed(4)} ETH`} color="#f85149" tip="Total ETH spent on gas fees (Ethereum mainnet)" />
                <StatRow label="Active Months" value={chain.evmDisplay.activeMonths || '—'} color={chain.evmDisplay.activeMonths >= 6 ? '#7ee787' : undefined} tip="Unique months with on-chain activity" />
              </div>
              <div>
                <StatRow label="Contracts" value={chain.evmDisplay.uniqueContracts.toLocaleString()} color={chain.evmDisplay.uniqueContracts >= 50 ? '#a78bfa' : undefined} tip="Unique smart contracts interacted with" />
                {chain.evmDisplay.etherscanTxnCount > 0 && (
                  <StatRow label="ETH Txns" value={`${chain.evmDisplay.etherscanTxnCount.toLocaleString()}${chain.evmDisplay.etherscanTxnCapped ? '+' : ''}`} tip="Ethereum mainnet transactions" />
                )}
              </div>
            </div>
          )}
          {/* EVM-only: NFT quality metrics */}
          {isEvm && chain.evmDisplay && (chain.evmDisplay.nftCollections > 0 || chain.evmDisplay.nftVolumeEth > 0) && (
            <div style={{ marginTop: '2px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                <div>
                  <StatRow label="NFT Volume" value={chain.evmDisplay.nftVolumeEth > 0 ? `${chain.evmDisplay.nftVolumeEth.toFixed(2)} ETH` : '—'} color={chain.evmDisplay.nftVolumeEth > 1 ? '#a78bfa' : undefined} tip="ETH spent on NFT marketplaces (OpenSea, Blur, etc.)" />
                  <StatRow label="Collections" value={chain.evmDisplay.nftCollections} color={chain.evmDisplay.nftCollections >= 10 ? '#88c0ff' : undefined} tip="Unique NFT collections interacted with" />
                </div>
                <div>
                  <StatRow label="NFT Trades" value={chain.evmDisplay.nftTotalTransfers} tip="Total ERC-721 transfers (buys, sells, mints)" />
                  {chain.evmDisplay.nftBlueChips.length > 0 && (
                    <StatRow label="Blue Chips" value={chain.evmDisplay.nftBlueChips.slice(0, 3).join(', ')} color="#ffd700" tip={`Held/traded: ${chain.evmDisplay.nftBlueChips.join(', ')}`} />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 6a. EVM Portfolio Panel */}
        {isEvm && chain.evmDisplay && (
          <div className="osrs-panel" style={{ padding: '14px 16px', marginBottom: '16px' }}>
            <div style={{
              fontFamily: FONT, fontSize: '7px', color: O.dim,
              marginBottom: '10px', letterSpacing: '2px',
            }}>
              PORTFOLIO
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <div>
                <StatRow label="Total Value" value={`$${formatCompact(chain.evmDisplay.totalPortfolioUsd)}`} color={O.gold} />
                <StatRow label="ETH Balance" value={chain.evmDisplay.ethBalance.toFixed(4)} color={O.gold} />
                <StatRow label="DeFi Protocols" value={chain.evmDisplay.defiProtocols.length || '—'} color={chain.evmDisplay.defiProtocols.length > 0 ? '#88c0ff' : undefined} />
              </div>
              <div>
                {Object.entries(chain.evmDisplay.chainDistribution).length > 0 && (
                  <>
                    {Object.entries(chain.evmDisplay.chainDistribution)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 3)
                      .map(([chainName, pct]) => (
                        <StatRow
                          key={chainName}
                          label={chainName.charAt(0).toUpperCase() + chainName.slice(1)}
                          value={`${Math.round(pct * 100)}%`}
                          color="#a78bfa"
                        />
                      ))}
                  </>
                )}
              </div>
            </div>

            {/* Top positions */}
            {chain.evmDisplay.topPositions.length > 0 && (
              <div style={{ marginTop: '10px', borderTop: `1px solid ${O.bevelDark}`, paddingTop: '10px' }}>
                <div style={{ fontFamily: FONT, fontSize: '6px', color: O.dim, marginBottom: '6px', letterSpacing: '1px' }}>
                  TOP POSITIONS
                </div>
                {chain.evmDisplay.topPositions.map((pos, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '3px 0',
                    borderBottom: i < chain.evmDisplay!.topPositions.length - 1 ? `1px solid ${O.deepest}` : 'none',
                    fontFamily: FONT, fontSize: '7px',
                  }}>
                    <span style={{ color: O.label }}>{pos.symbol}</span>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <span style={{ color: O.text, fontSize: '6px' }}>${formatCompact(pos.value)}</span>
                      {pos.protocol && <span style={{ color: O.dim, fontSize: '6px' }}>{pos.protocol}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 6b. EVM Perps Panel (Hyperliquid) */}
        {isEvm && chain.evmDisplay && (chain.evmDisplay.hyperliquidPnl !== null || chain.evmDisplay.hyperliquidVolume !== null) && (
          <div className="osrs-panel" style={{ padding: '14px 16px', marginBottom: '16px' }}>
            <div style={{
              fontFamily: FONT, fontSize: '7px', color: O.dim,
              marginBottom: '10px', letterSpacing: '2px',
            }}>
              PERPS — HYPERLIQUID
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <div>
                {chain.evmDisplay.hyperliquidPnl !== null && (
                  <StatRow label="Perp PnL" value={`$${formatCompact(chain.evmDisplay.hyperliquidPnl)}`}
                    color={chain.evmDisplay.hyperliquidPnl >= 0 ? '#7ee787' : '#f85149'} />
                )}
              </div>
              <div>
                {chain.evmDisplay.hyperliquidVolume !== null && (
                  <StatRow label="Perp Volume" value={`$${formatCompact(chain.evmDisplay.hyperliquidVolume)}`} color={O.gold} />
                )}
              </div>
            </div>
          </div>
        )}

        {/* 6c. Governance Panel (EVM — Snapshot) */}
        {isEvm && chain.evmDisplay && chain.evmDisplay.governanceVotes > 0 && (
          <div className="osrs-panel" style={{ padding: '14px 16px', marginBottom: '16px' }}>
            <div style={{
              fontFamily: FONT, fontSize: '7px', color: O.dim,
              marginBottom: '10px', letterSpacing: '2px',
            }}>
              GOVERNANCE
            </div>
            <StatRow label="Votes Cast" value={chain.evmDisplay.governanceVotes} color="#a78bfa" tip="Total votes on Snapshot governance proposals" />
            <StatRow label="DAOs" value={chain.evmDisplay.governanceSpaces.length} color={chain.evmDisplay.governanceSpaces.length >= 3 ? '#7ee787' : undefined} tip="Unique DAOs voted in" />
            {chain.evmDisplay.governanceSpaces.length > 0 && (
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {chain.evmDisplay.governanceSpaces.slice(0, 8).map((space, i) => (
                  <div key={i} style={{
                    padding: '3px 7px',
                    background: 'rgba(167, 139, 250, 0.1)',
                    border: `1px solid ${O.bevelDark}`,
                    fontFamily: FONT, fontSize: '6px', color: '#a78bfa',
                  }}>
                    {space}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 6d. Airdrops Panel (EVM) */}
        {isEvm && chain.evmDisplay && chain.evmDisplay.airdrops && chain.evmDisplay.airdrops.length > 0 && (
          <div className="osrs-panel" style={{ padding: '14px 16px', marginBottom: '16px' }}>
            <div style={{
              fontFamily: FONT, fontSize: '7px', color: O.dim,
              marginBottom: '10px', letterSpacing: '2px',
            }}>
              AIRDROPS RECEIVED
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {chain.evmDisplay.airdrops.map((drop, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '4px 0',
                  borderBottom: i < chain.evmDisplay!.airdrops.length - 1 ? `1px solid ${O.deepest}` : 'none',
                  fontFamily: FONT, fontSize: '7px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#7ee787' }}>+</span>
                    <span style={{ color: O.label }}>{drop.name}</span>
                    <span style={{ color: O.dim, fontSize: '6px' }}>{drop.symbol}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span style={{ color: O.text, fontSize: '6px' }}>
                      {drop.amount >= 1 ? formatCompact(drop.amount) : drop.amount.toFixed(2)} {drop.symbol}
                    </span>
                    {drop.date && (
                      <span style={{ color: O.dim, fontSize: '5px' }}>{drop.date}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6e. Pump.fun Stats (Solana only) */}
        {!isEvm && (chain.pfCoinsCreated > 0 || chain.pfHoldingsCount > 0 || (chain.pfCommunities && chain.pfCommunities.length > 0)) && (
          <div className="osrs-panel" style={{ padding: '14px 16px', marginBottom: '16px' }}>
            <div style={{
              fontFamily: FONT, fontSize: '7px', color: O.dim,
              marginBottom: '10px', letterSpacing: '2px',
            }}>
              PUMP.FUN
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <div>
                {chain.pfCoinsCreated > 0 ? (
                  <>
                    <StatRow label="Coins Created" value={chain.pfCoinsCreated} color={O.gold} />
                    <StatRow label="Graduated" value={`${chain.pfCoinsGraduated} (${chain.pfGradRate}%)`} color={chain.pfCoinsGraduated > 0 ? '#7ee787' : undefined} />
                    <StatRow label="KOTH" value={chain.pfKothCount} color={chain.pfKothCount > 0 ? '#f97316' : undefined} />
                  </>
                ) : (
                  <StatRow label="Creator" value="—" />
                )}
              </div>
              <div>
                <StatRow label="PF Holdings" value={chain.pfHoldingsCount} />
                <StatRow label="Holdings Value" value={chain.pfHoldingsValueSol > 0 ? `${chain.pfHoldingsValueSol} SOL` : '—'} color={chain.pfHoldingsValueSol > 0 ? O.gold : undefined} />
                {chain.pfBestCoin && chain.pfBestCoin.athUsd > 0 && (
                  <StatRow label="Best Coin" value={`${chain.pfBestCoin.symbol} ($${formatCompact(chain.pfBestCoin.athUsd)})`} color="#a78bfa" />
                )}
              </div>
            </div>

            {/* Created coins */}
            {chain.pfCoins && chain.pfCoins.length > 0 && (
              <div style={{ marginTop: '12px', borderTop: `1px solid ${O.bevelDark}`, paddingTop: '10px' }}>
                <div style={{ fontFamily: FONT, fontSize: '6px', color: O.dim, marginBottom: '6px', letterSpacing: '1px' }}>
                  CREATED COINS
                </div>
                {chain.pfCoins.map((coin, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '3px 0',
                    borderBottom: i < chain.pfCoins.length - 1 ? `1px solid ${O.deepest}` : 'none',
                    fontFamily: FONT, fontSize: '7px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <span style={{ color: coin.complete ? '#7ee787' : coin.koth ? '#f97316' : O.dim }}>
                        {coin.complete ? '✓' : coin.koth ? '♛' : '·'}
                      </span>
                      <span style={{ color: O.label, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {coin.symbol}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexShrink: 0 }}>
                      <span style={{ color: O.dim, fontSize: '6px' }}>
                        {coin.marketCapSol > 0 ? `${formatCompact(coin.marketCapSol)} SOL` : 'dead'}
                      </span>
                      {coin.athUsd > 0 && (
                        <span style={{ color: O.text, fontSize: '6px' }}>
                          ATH ${formatCompact(coin.athUsd)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Top communities */}
            {chain.pfCommunities && chain.pfCommunities.length > 0 && (
              <div style={{ marginTop: '12px', borderTop: `1px solid ${O.bevelDark}`, paddingTop: '10px' }}>
                <div style={{ fontFamily: FONT, fontSize: '6px', color: O.dim, marginBottom: '8px', letterSpacing: '1px' }}>
                  TOP COMMUNITIES
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {chain.pfCommunities.map((c, i) => (
                    <div key={i} style={{
                      padding: '4px 8px',
                      background: 'rgba(255, 255, 0, 0.08)',
                      border: `1px solid ${O.bevelDark}`,
                      fontFamily: FONT, fontSize: '7px', color: O.gold,
                      display: 'flex', alignItems: 'center', gap: '4px',
                    }}>
                      <span>{c.symbol}</span>
                      <span style={{ color: O.dim, fontSize: '6px' }}>${formatCompact(c.usdMarketCap)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
      {/* end scroll */}

      {/* Share Buttons */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
        <button className="osrs-button" onClick={handleCopy} style={{
          flex: 1, padding: '12px', fontFamily: FONT, fontSize: '8px',
          color: copied ? '#7ee787' : O.label, letterSpacing: '1px',
        }}>
          {copied ? '✓ COPIED' : '📋 COPY'}
        </button>
        <button className="osrs-button" onClick={handleShareX} style={{
          flex: 1, padding: '12px', fontFamily: FONT, fontSize: '8px',
          color: O.label, letterSpacing: '1px',
        }}>
          𝕏 SHARE
        </button>
      </div>
    </div>
  );
}
