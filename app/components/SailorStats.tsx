"use client";
import React, { useMemo, useState, useCallback } from 'react';
import { useCharacterStats, RANK_PROGRESSION } from '../hooks/useCharacter';
import { useWalletOnChain } from '../hooks/useWalletOnChain';
import type { CharacterStats } from '../hooks/useCharacter';
import type { OnChainData } from '../hooks/useWalletOnChain';

// ============================================================================
// XP / Level system (OSRS-inspired curve)
// ============================================================================

function xpForLevel(level: number): number {
  return Math.floor(level * level * 0.5 + level * 10);
}

function levelFromXp(xp: number): number {
  for (let l = 99; l >= 1; l--) {
    if (xp >= xpForLevel(l)) return l;
  }
  return 1;
}

function progressToNext(xp: number): number {
  const level = levelFromXp(xp);
  if (level >= 99) return 1;
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return (xp - cur) / (next - cur);
}

// ============================================================================
// Skill mapping — now powered by real on-chain data
// ============================================================================

interface SkillData {
  name: string;
  icon: string;
  xp: number;
  level: number;
  progress: number;
}

function computeSkills(chain: OnChainData, shipyard: CharacterStats | null): SkillData[] {
  const successRate = chain.txnCount > 0
    ? chain.successfulTxns / chain.txnCount
    : 0;

  const raw = [
    {
      name: 'Sailing',
      icon: '⛵',
      // Transaction volume — capped at 5k
      xp: Math.min(chain.txnCount, 5000) * 5,
    },
    {
      name: 'Degenning',
      icon: '💎',
      // Token diversity + pump.fun coin bonus
      xp: chain.tokenCount * 100 + chain.pumpfunCoins * 300,
    },
    {
      name: 'Plundering',
      icon: '🏴‍☠️',
      // SOL balance + staked SOL (liquid staking tokens)
      xp: (chain.solBalance + chain.stakedSol) * 30,
    },
    {
      name: 'Navigation',
      icon: '🧭',
      // Success rate * volume + DeFi diversity bonus
      xp: successRate * chain.txnCount * 2 + chain.defiCategories.length * 200,
    },
    {
      name: 'Anchoring',
      icon: '⚓',
      // Wallet age + staking bonus (committed to the network)
      xp: chain.walletAgeDays * 6 + (chain.stakedSol > 0 ? 500 : 0),
    },
    {
      name: 'Shipbuilding',
      icon: '🔨',
      // Shipyard-specific activity
      xp: shipyard
        ? shipyard.poolsCreated * 100 + shipyard.poolsLaunched * 200
        : 0,
    },
  ];

  return raw.map(s => {
    const xp = Math.round(s.xp);
    return {
      ...s,
      xp,
      level: levelFromXp(xp),
      progress: progressToNext(xp),
    };
  });
}

// Rank based on total level (not Shipyard pools)
function getRankFromLevel(totalLevel: number) {
  if (totalLevel >= 551) return { title: 'Shipwright', icon: '🔨', color: '#ec4899' };
  if (totalLevel >= 451) return { title: 'Admiral',    icon: '⭐', color: '#f97316' };
  if (totalLevel >= 351) return { title: 'Captain',    icon: '🎖️', color: '#fbbf24' };
  if (totalLevel >= 251) return { title: 'Navigator',  icon: '🧭', color: '#a78bfa' };
  if (totalLevel >= 176) return { title: 'Boatswain',  icon: '🪢', color: '#7ee787' };
  if (totalLevel >= 101) return { title: 'Sailor',     icon: '⛵', color: '#88c0ff' };
  if (totalLevel >= 51)  return { title: 'Deckhand',   icon: '🧹', color: '#c9d1d9' };
  return { title: 'Stowaway', icon: '🐀', color: '#6e7b8b' };
}

// ============================================================================
// OSRS palette
// ============================================================================

const O = {
  panelBg:    '#3e3529',
  outer:      '#5c503c',
  deepest:    '#1a1610',
  bevelLight: '#7a6e5a',
  bevelDark:  '#2b2418',
  gold:       '#ff981f',
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
        <div style={{ flex: 1, minWidth: 0 }}>
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
            }}>{dots}</span>
            <span style={{
              fontSize: '14px',
              color: O.gold,
              fontFamily: FONT,
              fontWeight: 'bold',
              textShadow: '0 1px 3px rgba(0,0,0,0.6)',
            }}>
              {skill.level}
            </span>
          </div>
        </div>
      </div>

      {/* XP bar */}
      <div style={{
        height: '6px',
        background: O.deepest,
        border: `1px solid ${O.bevelDark}`,
        borderRadius: '1px',
        overflow: 'hidden',
      }}>
        <div className="xp-fill" style={{
          height: '100%',
          width: `${skill.progress * 100}%`,
          background: `linear-gradient(180deg, #2dd147 0%, ${O.xpGreen} 50%, #008a2a 100%)`,
          boxShadow: '0 0 4px rgba(0, 176, 54, 0.4)',
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
        borderRadius: '4px',
        border: `1px solid ${badge.earned ? O.gold : O.bevelDark}`,
        background: badge.earned ? 'rgba(255, 152, 31, 0.1)' : 'rgba(0,0,0,0.3)',
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

function StatRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '4px 0',
      borderBottom: `1px solid ${O.bevelDark}`,
      fontFamily: FONT,
      fontSize: '7px',
    }}>
      <span style={{ color: O.label }}>{label}</span>
      <span style={{ color: color ?? O.text }}>{value}</span>
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
    return computeSkills(chain, stats);
  }, [chain, stats]);

  const totalLevel = useMemo(() => skills.reduce((s, sk) => s + sk.level, 0), [skills]);
  const totalXp = useMemo(() => skills.reduce((s, sk) => s + sk.xp, 0), [skills]);

  const combatLevel = useMemo(() => {
    if (skills.length < 6) return 0;
    const [sailing, degenning, plundering, navigation] = skills;
    return Math.floor(
      (sailing.level + degenning.level + plundering.level) / 3 +
      navigation.level * 0.2
    );
  }, [skills]);

  const rankInfo = useMemo(() => getRankFromLevel(totalLevel), [totalLevel]);

  const shortenAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

  const handleShare = useCallback(() => {
    const text = `⚔️ Sailor Stats | Total: ${totalLevel} | Rank: ${rankInfo.title} ${rankInfo.icon}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [totalLevel, rankInfo]);

  // Loading
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 20px',
        fontFamily: FONT,
        fontSize: '10px',
        color: '#6e7b8b',
      }}>
        Loading sailor stats...
      </div>
    );
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
              textShadow: '0 2px 6px rgba(255, 152, 31, 0.3)',
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
            textShadow: '0 2px 8px rgba(255, 152, 31, 0.3)',
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
            {badges.map(b => <BadgeIcon key={b.id} badge={b} />)}
          </div>
        </div>

        {/* 5. Stats Panel */}
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
              <StatRow label="Transactions" value={chain.txnCount.toLocaleString()} />
              <StatRow label="Success Rate" value={
                chain.txnCount > 0
                  ? `${Math.round((chain.successfulTxns / chain.txnCount) * 100)}%`
                  : '—'
              } color="#7ee787" />
              <StatRow label="Wallet Age" value={`${chain.walletAgeDays}d`} />
              <StatRow label="Last Active" value={
                chain.lastActivityDays === 0 ? 'Today' : `${chain.lastActivityDays}d ago`
              } />
              <StatRow label="Total XP" value={totalXp.toLocaleString()} color={O.gold} />
            </div>
            <div>
              <StatRow label="SOL Balance" value={chain.solBalance.toFixed(2)} color={O.gold} />
              <StatRow label="Staked SOL" value={chain.stakedSol > 0 ? chain.stakedSol.toFixed(2) : '—'} color={chain.stakedSol > 0 ? '#7ee787' : undefined} />
              <StatRow label="Tokens Held" value={chain.tokenCount} />
              <StatRow label="PF Coins" value={chain.pumpfunCoins} color={chain.pumpfunCoins > 0 ? '#a78bfa' : undefined} />
              <StatRow label="DeFi" value={chain.defiTokens.length > 0 ? chain.defiTokens.join(', ') : '—'} color={chain.defiTokens.length > 0 ? '#88c0ff' : undefined} />
            </div>
          </div>
        </div>

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

      {/* 6. Share Button (outside scroll) */}
      <button
        onClick={handleShare}
        style={{
          width: '100%',
          marginTop: '16px',
          padding: '14px',
          background: 'rgba(136, 192, 255, 0.08)',
          border: '1px solid rgba(136, 192, 255, 0.2)',
          borderRadius: '8px',
          fontFamily: FONT,
          fontSize: '9px',
          color: copied ? '#7ee787' : '#88c0ff',
          cursor: 'pointer',
          letterSpacing: '1px',
          transition: 'color 0.2s',
        }}
      >
        {copied ? 'COPIED!' : '⚔️ SHARE SAILOR STATS'}
      </button>
    </div>
  );
}
