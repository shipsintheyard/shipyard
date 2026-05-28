"use client";
import React, { useMemo, useState, useCallback } from 'react';
import { useCharacterStats, RANK_PROGRESSION } from '../hooks/useCharacter';
import { useWalletOnChain } from '../hooks/useWalletOnChain';
import type { CharacterStats } from '../hooks/useCharacter';
import type { OnChainData } from '../hooks/useWalletOnChain';
import { computeSkills, getRankFromLevel, formatCompact } from '../lib/sailor-xp';
import type { SkillData } from '../lib/sailor-xp';

// ============================================================================
// OSRS palette — corrected colors
// ============================================================================

const O = {
  panelBg:    '#3e3529',
  outer:      '#5c503c',
  deepest:    '#1a1610',
  bevelLight: '#968052',
  bevelDark:  '#332D25',
  gold:       '#FFFF00',     // Pure yellow — faithful OSRS level color
  label:      '#c8aa6e',
  xpGreen:    '#00b036',
  text:       '#d4c4a0',
  dim:        '#5c503c',
  // Parchment scroll colors
  parchment:       '#d5c4a1',
  parchmentDark:   '#c8b68e',
  parchmentBorder: '#8b7355',
  parchmentShadow: '#a89070',
  parchmentText:   '#3b2e1a',
};

const FONT = "'Press Start 2P', monospace";

// ============================================================================
// Sub-components
// ============================================================================

function SkillTile({ skill, delay }: { skill: SkillData; delay: number }) {
  const dots = '.'.repeat(Math.max(1, 16 - skill.name.length));
  return (
    <div className="osrs-bevel" style={{
      background: O.deepest,
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      opacity: 0,
      animation: `fadeUp 0.35s ease-out ${delay}s forwards`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '18px', lineHeight: 1 }}>{skill.icon}</span>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            fontFamily: FONT,
          }}>
            <span style={{ fontSize: '8px', color: O.label, whiteSpace: 'nowrap' }}>
              {skill.name}
            </span>
            <span style={{
              fontSize: '7px',
              color: O.dim,
              overflow: 'hidden',
              flex: 1,
              textAlign: 'center',
              letterSpacing: '1px',
              minWidth: 0,
            }}>{dots}</span>
            <span style={{
              fontFamily: FONT,
              fontWeight: 'bold',
              textShadow: '1px 1px 0 #000',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: '13px', color: O.gold }}>{skill.level}</span>
              <span style={{ fontSize: '7px', color: O.dim }}>/99</span>
            </span>
          </div>
        </div>
      </div>

      {/* XP bar */}
      <div style={{
        height: '6px',
        background: O.deepest,
        border: `1px solid ${O.bevelDark}`,
        borderRadius: 0,
        overflow: 'hidden',
      }}>
        <div className="xp-fill" style={{
          height: '100%',
          width: `${skill.progress * 100}%`,
          background: `linear-gradient(180deg, #2dd147 0%, ${O.xpGreen} 50%, #008a2a 100%)`,
          boxShadow: '0 0 4px rgba(0, 176, 54, 0.4)',
          borderRadius: 0,
        }} />
      </div>

      <div style={{
        fontSize: '7px',
        fontFamily: FONT,
        color: O.dim,
        textAlign: 'right',
      }}>
        XP: {skill.xp.toLocaleString()}
      </div>
    </div>
  );
}

function BadgeIcon({ badge }: { badge: { id: string; name: string; icon: string; description: string; earned: boolean } }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', cursor: 'default' }}
    >
      <div style={{
        width: '36px',
        height: '36px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px',
        borderRadius: 0,
        border: `1px solid ${badge.earned ? O.gold : O.bevelDark}`,
        background: badge.earned ? 'rgba(255, 255, 0, 0.1)' : 'rgba(0,0,0,0.3)',
        filter: badge.earned ? 'none' : 'grayscale(1) opacity(0.35)',
        transition: 'filter 0.2s, border-color 0.2s',
      }}>
        {badge.icon}
      </div>
      {hovered && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '6px',
          padding: '6px 10px',
          background: O.panelBg,
          border: `1px solid ${O.outer}`,
          borderRadius: 0,
          whiteSpace: 'nowrap',
          zIndex: 10,
          fontFamily: FONT,
          fontSize: '7px',
          color: badge.earned ? O.gold : O.dim,
          textAlign: 'center',
          lineHeight: '1.6',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>{badge.name}</div>
          <div style={{ color: O.label, fontSize: '6px' }}>{badge.description}</div>
          {!badge.earned && <div style={{ color: '#8b0000', marginTop: '2px' }}>LOCKED</div>}
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value, color, tip }: { label: string; value: string | number; color?: string; tip?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => { if (tip) setShow(v => !v); }}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '4px 0',
        borderBottom: `1px solid ${O.bevelDark}`,
        fontFamily: FONT,
        fontSize: '7px',
        position: 'relative',
        cursor: tip ? 'help' : 'default',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ color: O.label, borderBottom: tip ? `1px dotted ${O.dim}` : 'none' }}>{label}</span>
      <span style={{ color: color ?? O.text }}>{value}</span>
      {tip && show && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          right: 0,
          marginBottom: '4px',
          padding: '5px 8px',
          background: O.panelBg,
          border: `1px solid ${O.outer}`,
          borderRadius: 0,
          zIndex: 10,
          fontFamily: FONT,
          fontSize: '6px',
          color: O.text,
          lineHeight: '1.6',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          whiteSpace: 'normal',
        }}>
          {tip}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Skeleton loading state
// ============================================================================

function SkeletonTile() {
  return (
    <div className="osrs-bevel" style={{ background: O.deepest, padding: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div className="osrs-skeleton" style={{ width: 18, height: 18 }} />
        <div style={{ flex: 1 }}>
          <div className="osrs-skeleton" style={{ height: 8, width: '60%', marginBottom: 8 }} />
          <div className="osrs-skeleton" style={{ height: 6, width: '100%' }} />
        </div>
      </div>
      <div className="osrs-skeleton" style={{ height: 7, width: '40%', marginTop: 8, marginLeft: 'auto' }} />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 16px 60px' }}>
      <div className="osrs-scroll" style={{ padding: '24px 20px' }}>
        {/* Header skeleton */}
        <div className="osrs-panel" style={{ padding: '16px 20px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="osrs-skeleton" style={{ width: 24, height: 24 }} />
            <div>
              <div className="osrs-skeleton" style={{ width: 80, height: 11, marginBottom: 6 }} />
              <div className="osrs-skeleton" style={{ width: 100, height: 7 }} />
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="osrs-skeleton" style={{ width: 60, height: 7, marginBottom: 6, marginLeft: 'auto' }} />
            <div className="osrs-skeleton" style={{ width: 40, height: 18, marginLeft: 'auto' }} />
          </div>
        </div>
        {/* Skill grid skeleton */}
        <div className="sailor-skill-grid" style={{ marginBottom: '16px' }}>
          {[...Array(5)].map((_, i) => <SkeletonTile key={i} />)}
        </div>
        {/* Combat level skeleton */}
        <div className="osrs-bevel" style={{ background: O.deepest, padding: '12px', marginBottom: '16px', textAlign: 'center' }}>
          <div className="osrs-skeleton" style={{ width: 80, height: 7, margin: '0 auto 8px' }} />
          <div className="osrs-skeleton" style={{ width: 50, height: 22, margin: '0 auto' }} />
        </div>
        {/* Stats panel skeleton */}
        <div className="osrs-panel" style={{ padding: '14px 16px', marginBottom: '16px' }}>
          <div className="osrs-skeleton" style={{ width: 70, height: 7, marginBottom: 12 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            <div>
              {[...Array(5)].map((_, i) => <div key={i} className="osrs-skeleton" style={{ height: 7, marginBottom: 10, width: `${70 + Math.random() * 30}%` }} />)}
            </div>
            <div>
              {[...Array(5)].map((_, i) => <div key={i} className="osrs-skeleton" style={{ height: 7, marginBottom: 10, width: `${70 + Math.random() * 30}%` }} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function SailorStats({ address }: { address: string }) {
  const { stats, badges, loading: shipyardLoading } = useCharacterStats(address);
  const { data: chain, loading: chainLoading, error: chainError } = useWalletOnChain(address);
  const [copied, setCopied] = useState(false);

  const isLoading = shipyardLoading || chainLoading;

  const skills = useMemo(() => {
    if (!chain) return [];
    return computeSkills(chain);
  }, [chain, stats]);

  const totalLevel = useMemo(() => skills.reduce((s, sk) => s + sk.level, 0), [skills]);
  const totalXp = useMemo(() => skills.reduce((s, sk) => s + sk.xp, 0), [skills]);

  const combatLevel = useMemo(() => {
    if (skills.length < 5) return 0;
    const [sailing, degenning, plundering, navigation] = skills;
    return Math.floor(
      (sailing.level + degenning.level + plundering.level) / 3 +
      navigation.level * 0.2
    );
  }, [skills]);

  const rankInfo = useMemo(() => getRankFromLevel(totalLevel), [totalLevel]);

  // Quest badges from on-chain data (merged with Shipyard badges)
  const questBadges = useMemo(() => {
    if (!chain) return [];
    return [
      {
        id: 'coin_minter',
        name: 'Coin Minter',
        icon: '🪙',
        description: 'Created a coin on Pump.fun',
        earned: (chain.pfCoinsCreated || 0) >= 1,
      },
      {
        id: 'graduated',
        name: 'Graduated',
        icon: '🎓',
        description: 'Graduated a coin past the bonding curve',
        earned: (chain.pfCoinsGraduated || 0) >= 1,
      },
      {
        id: 'king_of_hill',
        name: 'King of the Hill',
        icon: '♛',
        description: 'Had a coin reach KOTH on Pump.fun',
        earned: (chain.pfKothCount || 0) >= 1,
      },
      {
        id: 'serial_launcher',
        name: 'Serial Launcher',
        icon: '🚀',
        description: 'Graduated 3+ coins',
        earned: (chain.pfCoinsGraduated || 0) >= 3,
      },
      {
        id: 'dapp_explorer',
        name: 'Explorer',
        icon: '🗺️',
        description: 'Interacted with 5+ unique dapps',
        earned: (chain.uniqueDapps || 0) >= 5,
      },
      {
        id: 'diamond_hands',
        name: 'Diamond Hands',
        icon: '💎',
        description: 'Wallet older than 1 year',
        earned: chain.walletAgeDays >= 365,
      },
      {
        id: 'dex_hopper',
        name: 'DEX Hopper',
        icon: '🔄',
        description: 'Traded on 3+ different DEXes',
        earned: (chain.dexCount || 0) >= 3,
      },
    ];
  }, [chain]);

  const shortenAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

  const handleCopy = useCallback(() => {
    const text = `⚔️ Sailor Stats | Total: ${totalLevel} | Rank: ${rankInfo.title} ${rankInfo.icon}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [totalLevel, rankInfo]);

  const handleShareX = useCallback(() => {
    const text = encodeURIComponent(`⚔️ Sailor Stats | Total: ${totalLevel} | Rank: ${rankInfo.title} ${rankInfo.icon}`);
    const url = encodeURIComponent(`https://shipsintheyard.com/sailor/${address}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'noopener');
  }, [totalLevel, rankInfo, address]);

  // Loading — show skeleton cards
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  // Error or no data
  if (chainError || !chain) {
    return (
      <div style={{
        maxWidth: '640px',
        margin: '60px auto',
        padding: '40px 24px',
        textAlign: 'center',
        fontFamily: FONT,
        fontSize: '10px',
        color: '#6e7b8b',
        lineHeight: '2.2',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🐀</div>
        <div style={{ color: O.label, fontSize: '11px', marginBottom: '8px' }}>Stowaway</div>
        <div>{chainError || 'No on-chain activity found'}</div>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '640px',
      margin: '0 auto',
      padding: '24px 16px 60px',
    }}>
      {/* ============================================================
          Parchment Scroll wrapper
          ============================================================ */}
      <div className="osrs-scroll" style={{ padding: '24px 20px' }}>

        {/* 1. Header */}
        <div className="osrs-panel" style={{
          padding: '16px 20px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>{rankInfo.icon}</span>
            <div>
              <div style={{
                fontFamily: FONT,
                fontSize: '11px',
                color: rankInfo.color,
                fontWeight: 'bold',
                marginBottom: '4px',
              }}>
                {rankInfo.title}
              </div>
              <div style={{
                fontFamily: FONT,
                fontSize: '7px',
                color: O.dim,
              }}>
                {shortenAddr(address)}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontFamily: FONT,
              fontSize: '7px',
              color: O.dim,
              marginBottom: '4px',
            }}>
              TOTAL LEVEL
            </div>
            <div style={{
              fontFamily: FONT,
              fontSize: '18px',
              color: O.gold,
              fontWeight: 'bold',
              textShadow: '1px 1px 0 #000',
            }}>
              {totalLevel}
            </div>
          </div>
        </div>

        {/* 2. Skill Grid */}
        <div className="sailor-skill-grid" style={{ marginBottom: '16px' }}>
          {skills.map((skill, i) => (
            <SkillTile key={skill.name} skill={skill} delay={0.05 + i * 0.08} />
          ))}
        </div>

        {/* 3. Combat Level */}
        <div className="osrs-bevel" style={{
          background: O.deepest,
          padding: '12px',
          marginBottom: '16px',
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: FONT,
            fontSize: '7px',
            color: O.dim,
            marginBottom: '6px',
            letterSpacing: '2px',
          }}>
            COMBAT LEVEL
          </div>
          <div style={{
            fontFamily: FONT,
            fontSize: '22px',
            color: O.gold,
            fontWeight: 'bold',
            textShadow: '1px 1px 0 #000',
          }}>
            ⚔️ {combatLevel}
          </div>
        </div>

        {/* 4. Badges */}
        <div className="osrs-panel" style={{
          padding: '14px 16px',
          marginBottom: '16px',
        }}>
          <div style={{
            fontFamily: FONT,
            fontSize: '7px',
            color: O.dim,
            marginBottom: '10px',
            letterSpacing: '2px',
          }}>
            BADGES
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {questBadges.map(b => <BadgeIcon key={b.id} badge={b} />)}
            {badges.map(b => <BadgeIcon key={b.id} badge={b} />)}
          </div>
        </div>

        {/* 5. PnL Panel */}
        {chain.pnlRealized !== null && (
          <div className="osrs-panel" style={{
            padding: '14px 16px',
            marginBottom: '16px',
          }}>
            <div style={{
              fontFamily: FONT,
              fontSize: '7px',
              color: O.dim,
              marginBottom: '10px',
              letterSpacing: '2px',
            }}>
              PROFIT & LOSS
            </div>

            {/* Big PnL number */}
            <div style={{
              textAlign: 'center',
              padding: '8px 0 12px',
              borderBottom: `1px solid ${O.bevelDark}`,
              marginBottom: '10px',
            }}>
              <div style={{
                fontFamily: FONT,
                fontSize: '7px',
                color: O.dim,
                marginBottom: '4px',
              }}>
                REALIZED PnL
              </div>
              <div style={{
                fontFamily: FONT,
                fontSize: '18px',
                fontWeight: 'bold',
                textShadow: '1px 1px 0 #000',
                color: (chain.pnlRealized ?? 0) >= 0 ? '#7ee787' : '#f85149',
              }}>
                {(chain.pnlRealized ?? 0) >= 0 ? '+' : ''}{formatCompact(chain.pnlRealized ?? 0)} USD
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0 20px',
            }}>
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

            {/* Top 3 tokens by PnL */}
            {chain.pnlTopTokens && chain.pnlTopTokens.length > 0 && (
              <div style={{ marginTop: '10px', borderTop: `1px solid ${O.bevelDark}`, paddingTop: '10px' }}>
                <div style={{
                  fontFamily: FONT,
                  fontSize: '6px',
                  color: O.dim,
                  marginBottom: '8px',
                  letterSpacing: '1px',
                }}>
                  TOP WINS
                </div>
                {chain.pnlTopTokens.map((t, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '5px 0',
                    borderBottom: i < chain.pnlTopTokens.length - 1 ? `1px solid ${O.deepest}` : 'none',
                  }}>
                    {t.image && (
                      <img
                        src={t.image}
                        alt={t.symbol || ''}
                        style={{ width: 20, height: 20, borderRadius: 0, border: `1px solid ${O.bevelDark}` }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
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
                      <div style={{
                        fontFamily: FONT,
                        fontSize: '8px',
                        fontWeight: 'bold',
                        color: t.pnl >= 0 ? '#7ee787' : '#f85149',
                      }}>
                        {t.pnl >= 0 ? '+' : ''}${formatCompact(t.pnl)}
                      </div>
                      {t.roi !== 0 && (
                        <div style={{
                          fontFamily: FONT,
                          fontSize: '6px',
                          color: t.roi >= 0 ? '#7ee787' : '#f85149',
                        }}>
                          {t.roi >= 0 ? '+' : ''}{Math.round(t.roi)}% ROI
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Bottom 3 tokens by PnL — biggest losses */}
            {chain.pnlBottomTokens && chain.pnlBottomTokens.length > 0 && (
              <div style={{ marginTop: '10px', borderTop: `1px solid ${O.bevelDark}`, paddingTop: '10px' }}>
                <div style={{
                  fontFamily: FONT,
                  fontSize: '6px',
                  color: '#f85149',
                  marginBottom: '8px',
                  letterSpacing: '1px',
                }}>
                  BIGGEST LOSSES
                </div>
                {chain.pnlBottomTokens.map((t, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '5px 0',
                    borderBottom: i < chain.pnlBottomTokens.length - 1 ? `1px solid ${O.deepest}` : 'none',
                  }}>
                    {t.image && (
                      <img
                        src={t.image}
                        alt={t.symbol || ''}
                        style={{ width: 20, height: 20, borderRadius: 0, border: `1px solid ${O.bevelDark}` }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
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
                      <div style={{
                        fontFamily: FONT,
                        fontSize: '8px',
                        fontWeight: 'bold',
                        color: '#f85149',
                      }}>
                        -${formatCompact(Math.abs(t.pnl))}
                      </div>
                      {t.roi !== 0 && (
                        <div style={{
                          fontFamily: FONT,
                          fontSize: '6px',
                          color: '#f85149',
                        }}>
                          {Math.round(t.roi)}% ROI
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 6. Stats Panel */}
        <div className="osrs-panel" style={{
          padding: '14px 16px',
          marginBottom: '16px',
        }}>
          <div style={{
            fontFamily: FONT,
            fontSize: '7px',
            color: O.dim,
            marginBottom: '10px',
            letterSpacing: '2px',
          }}>
            ON-CHAIN
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0 20px',
          }}>
            <div>
              <StatRow label="Transactions" tip="Total on-chain transactions (up to 5000 scanned)" value={
                `${chain.txnCount.toLocaleString()}${chain.txnCountCapped ? '+' : ''}`
              } />
              <StatRow label="Since" tip="Earliest transaction found" value={
                chain.firstSeenDate
                  ? new Date(chain.firstSeenDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
                  : '—'
              } />
              <StatRow label="Last Active" tip="Time since most recent transaction" value={
                chain.lastActivityDays === 0 ? 'Today' : `${chain.lastActivityDays}d ago`
              } />
              <StatRow label="Active Days" tip="Unique calendar days with at least 1 transaction" value={chain.uniqueActiveDays || 0} color={(chain.uniqueActiveDays || 0) > 30 ? '#7ee787' : undefined} />
              <StatRow label="SOL" tip="Native SOL balance" value={chain.solBalance.toFixed(2)} color={O.gold} />
              <StatRow label="Staked" tip="SOL in liquid staking (mSOL, jitoSOL, etc.)" value={chain.stakedSol > 0 ? chain.stakedSol.toFixed(2) : '—'} color={chain.stakedSol > 0 ? '#7ee787' : undefined} />
              <StatRow label="Tokens" tip="SPL tokens with non-zero balance" value={chain.tokenCount} />
            </div>
            <div>
              <StatRow label="Volume" tip="Approximate SOL trading volume (last 100 swaps)" value={
                chain.solVolume > 0 ? `${formatCompact(chain.solVolume)} SOL` : '—'
              } color={chain.solVolume > 0 ? O.gold : undefined} />
              <StatRow label="Biggest Trade" tip="Largest single swap in SOL" value={
                chain.biggestTrade > 0 ? `${formatCompact(chain.biggestTrade)} SOL` : '—'
              } color={chain.biggestTrade > 1 ? '#f97316' : undefined} />
              <StatRow label="Fav Token" tip="Most-bought token (excluding SOL & stables)" value={
                chain.favToken ? `${chain.favToken} (${chain.favTokenBuys})` : '—'
              } color={chain.favToken ? '#a78bfa' : undefined} />
              <StatRow label="DEXes" tip="DEX protocols traded on (last 100 swaps)" value={
                chain.dexProtocols && chain.dexProtocols.length > 0
                  ? chain.dexProtocols.slice(0, 3).map((d: { project: string }) => d.project).join(', ')
                  : '—'
              } color={(chain.dexCount || 0) > 0 ? '#88c0ff' : undefined} />
              <StatRow label="Dapps" tip="Unique protocols interacted with (last 100 txns)" value={
                (chain.uniqueDapps || 0) > 0
                  ? `${chain.uniqueDapps} — ${(chain.uniqueDappsList || []).slice(0, 3).join(', ')}`
                  : '—'
              } color={(chain.uniqueDapps || 0) > 3 ? '#7ee787' : undefined} />
              <StatRow label="Memecoins" tip="Tokens that aren't DeFi, stablecoins, or NFTs" value={chain.memecoins} color={chain.memecoins > 0 ? '#a78bfa' : undefined} />
              <StatRow label="Dead Tokens" tip="Zero-balance token accounts — sold or rugged" value={chain.deadTokens ?? 0} color={(chain.deadTokens ?? 0) > 0 ? '#f97316' : undefined} />
            </div>
          </div>
        </div>

        {/* 6. Pump.fun Stats */}
        {(chain.pfCoinsCreated > 0 || chain.pfHoldingsCount > 0 || (chain.pfCommunities && chain.pfCommunities.length > 0)) && (
          <div className="osrs-panel" style={{
            padding: '14px 16px',
            marginBottom: '16px',
          }}>
            <div style={{
              fontFamily: FONT,
              fontSize: '7px',
              color: O.dim,
              marginBottom: '10px',
              letterSpacing: '2px',
            }}>
              PUMP.FUN
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0 20px',
            }}>
              <div>
                {chain.pfCoinsCreated > 0 && (
                  <>
                    <StatRow label="Coins Created" value={chain.pfCoinsCreated} color={O.gold} tip="Total coins launched on Pump.fun" />
                    <StatRow label="Graduated" value={`${chain.pfCoinsGraduated} (${chain.pfGradRate}%)`} color={chain.pfCoinsGraduated > 0 ? '#7ee787' : undefined} tip="Coins that filled the bonding curve and migrated to DEX" />
                    <StatRow label="KOTH" value={chain.pfKothCount} color={chain.pfKothCount > 0 ? '#f97316' : undefined} tip="Coins that reached King of the Hill" />
                  </>
                )}
                {chain.pfCoinsCreated === 0 && (
                  <StatRow label="Creator" value="—" tip="No coins created on Pump.fun" />
                )}
              </div>
              <div>
                <StatRow label="PF Holdings" value={chain.pfHoldingsCount} tip="Pump.fun tokens currently held" />
                <StatRow label="Holdings Value" value={chain.pfHoldingsValueSol > 0 ? `${chain.pfHoldingsValueSol} SOL` : '—'} color={chain.pfHoldingsValueSol > 0 ? O.gold : undefined} tip="Total value of Pump.fun token holdings" />
                {chain.pfBestCoin && chain.pfBestCoin.athUsd > 0 && (
                  <StatRow label="Best Coin" value={`${chain.pfBestCoin.symbol} ($${formatCompact(chain.pfBestCoin.athUsd)})`} color="#a78bfa" tip={`${chain.pfBestCoin.name} — highest ATH market cap`} />
                )}
              </div>
            </div>

            {/* Created coins list */}
            {chain.pfCoins && chain.pfCoins.length > 0 && (
              <div style={{ marginTop: '12px', borderTop: `1px solid ${O.bevelDark}`, paddingTop: '10px' }}>
                <div style={{
                  fontFamily: FONT,
                  fontSize: '6px',
                  color: O.dim,
                  marginBottom: '6px',
                  letterSpacing: '1px',
                }}>
                  CREATED COINS
                </div>
                {chain.pfCoins.map((coin, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '3px 0',
                    borderBottom: i < chain.pfCoins.length - 1 ? `1px solid ${O.deepest}` : 'none',
                    fontFamily: FONT,
                    fontSize: '7px',
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

            {/* PF top holdings removed — balances endpoint returns stale data */}

            {/* Top PF communities */}
            {chain.pfCommunities && chain.pfCommunities.length > 0 && (
              <div style={{ marginTop: '12px', borderTop: `1px solid ${O.bevelDark}`, paddingTop: '10px' }}>
                <div style={{
                  fontFamily: FONT,
                  fontSize: '6px',
                  color: O.dim,
                  marginBottom: '8px',
                  letterSpacing: '1px',
                }}>
                  TOP COMMUNITIES
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {chain.pfCommunities.map((c, i) => (
                    <div key={i} style={{
                      padding: '4px 8px',
                      background: 'rgba(255, 255, 0, 0.08)',
                      border: `1px solid ${O.bevelDark}`,
                      fontFamily: FONT,
                      fontSize: '7px',
                      color: O.gold,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
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

        {/* Shipyard-specific stats (if any) */}
        {stats && (stats.poolsCreated > 0 || stats.poolsJoined > 0) && (
          <div className="osrs-panel" style={{
            padding: '14px 16px',
            marginBottom: '16px',
          }}>
            <div style={{
              fontFamily: FONT,
              fontSize: '7px',
              color: O.dim,
              marginBottom: '10px',
              letterSpacing: '2px',
            }}>
              SHIPYARD
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0 20px',
            }}>
              <div>
                <StatRow label="Pools Joined" value={stats.poolsJoined} />
                <StatRow label="Pools Created" value={stats.poolsCreated} />
              </div>
              <div>
                <StatRow label="Launched" value={stats.poolsLaunched} color="#7ee787" />
                <StatRow label="Sunk" value={stats.poolsFailed} color="#f97316" />
              </div>
            </div>
          </div>
        )}

      </div>
      {/* end scroll */}

      {/* 6. Share Buttons (outside scroll) */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginTop: '16px',
      }}>
        <button
          className="osrs-button"
          onClick={handleCopy}
          style={{
            flex: 1,
            padding: '12px',
            fontFamily: FONT,
            fontSize: '8px',
            color: copied ? '#7ee787' : O.label,
            letterSpacing: '1px',
          }}
        >
          {copied ? '✓ COPIED' : '📋 COPY STATS'}
        </button>
        <button
          className="osrs-button"
          onClick={handleShareX}
          style={{
            flex: 1,
            padding: '12px',
            fontFamily: FONT,
            fontSize: '8px',
            color: O.label,
            letterSpacing: '1px',
          }}
        >
          𝕏 SHARE TO X
        </button>
      </div>
    </div>
  );
}
