"use client";
import React, { useMemo, useState, useCallback } from 'react';
import { useCharacterStats, RANK_PROGRESSION } from '../hooks/useCharacter';
import { useDegenScore } from '../hooks/useDegenScore';
import type { CharacterStats } from '../hooks/useCharacter';

// ============================================================================
// XP / Level system (OSRS-inspired curve, compressed for our data ranges)
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
// Skill definitions & mapping
// ============================================================================

interface SkillData {
  name: string;
  icon: string;
  xp: number;
  level: number;
  progress: number;
}

function computeSkills(
  stats: CharacterStats,
  degenScore: number,
  holdTime: number,
  walletAge: number,
): SkillData[] {
  const raw = [
    { name: 'Sailing',      icon: '⛵', xp: (stats.poolsJoined + stats.poolsCreated) * 50 },
    { name: 'Degenning',    icon: '💎', xp: degenScore * 50 },
    { name: 'Plundering',   icon: '🏴‍☠️', xp: stats.totalCommitted * 100 },
    { name: 'Navigation',   icon: '🧭', xp: stats.successRate * 50 },
    { name: 'Anchoring',    icon: '⚓', xp: (holdTime + walletAge) * 80 },
    { name: 'Shipbuilding', icon: '🔨', xp: stats.poolsCreated * 100 + stats.poolsLaunched * 200 },
  ];
  return raw.map(s => ({
    ...s,
    xp: Math.round(s.xp),
    level: levelFromXp(Math.round(s.xp)),
    progress: progressToNext(Math.round(s.xp)),
  }));
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
  pageBg:     '#1a1610',
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
      {/* Icon + Name + Level */}
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

      {/* XP text */}
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
  const { stats, badges, loading } = useCharacterStats(address);
  const { score, loading: degenLoading } = useDegenScore(stats);
  const [copied, setCopied] = useState(false);

  const skills = useMemo(() => {
    if (!stats) return [];
    return computeSkills(
      stats,
      score?.totalScore ?? 0,
      score?.holdTime ?? 0,
      score?.walletAge ?? 0,
    );
  }, [stats, score]);

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

  const rankInfo = useMemo(() => {
    if (!stats) return RANK_PROGRESSION[0];
    return RANK_PROGRESSION.find(r => r.rank === stats.rank) ?? RANK_PROGRESSION[0];
  }, [stats]);

  const shortenAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

  const handleShare = useCallback(() => {
    const text = `⚔️ Sailor Stats | Total: ${totalLevel} | Rank: ${stats?.title ?? 'Stowaway'} ${rankInfo.icon}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [totalLevel, stats, rankInfo]);

  // Loading state
  if (loading || degenLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 20px',
        fontFamily: FONT,
        fontSize: '10px',
        color: O.dim,
      }}>
        Loading sailor stats...
      </div>
    );
  }

  // No data
  if (!stats) {
    return (
      <div style={{
        maxWidth: '640px',
        margin: '60px auto',
        padding: '40px 24px',
        textAlign: 'center',
        fontFamily: FONT,
        fontSize: '10px',
        color: O.dim,
        lineHeight: '2.2',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🐀</div>
        <div style={{ color: O.label, fontSize: '11px', marginBottom: '8px' }}>Stowaway</div>
        <div>No on-chain activity found</div>
        <div>for this wallet.</div>
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
          1. Header — Rank + Address + Total Level
          ============================================================ */}
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
              {stats.title}
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

      {/* ============================================================
          2. Skill Grid — 3x2
          ============================================================ */}
      <div className="sailor-skill-grid" style={{ marginBottom: '16px' }}>
        {skills.map((skill, i) => (
          <SkillTile key={skill.name} skill={skill} delay={0.05 + i * 0.08} />
        ))}
      </div>

      {/* ============================================================
          3. Combat Level
          ============================================================ */}
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

      {/* ============================================================
          4. Badges
          ============================================================ */}
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
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
        }}>
          {badges.map(b => <BadgeIcon key={b.id} badge={b} />)}
        </div>
      </div>

      {/* ============================================================
          5. Stats Panel
          ============================================================ */}
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
          STATS
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0 20px',
        }}>
          <div>
            <StatRow label="Pools Joined" value={stats.poolsJoined} />
            <StatRow label="Pools Created" value={stats.poolsCreated} />
            <StatRow label="Launched" value={stats.poolsLaunched} color="#7ee787" />
            <StatRow label="Sunk" value={stats.poolsFailed} color="#f97316" />
          </div>
          <div>
            <StatRow label="SOL Committed" value={`${stats.totalCommitted.toFixed(2)}`} />
            <StatRow label="SOL Refunded" value={`${stats.totalRefunded.toFixed(2)}`} />
            <StatRow label="Earnings" value={`${stats.creatorEarnings.toFixed(2)}`} color="#7ee787" />
            <StatRow label="Total XP" value={totalXp.toLocaleString()} color={O.gold} />
          </div>
        </div>
      </div>

      {/* ============================================================
          6. Share Button
          ============================================================ */}
      <button
        onClick={handleShare}
        style={{
          width: '100%',
          padding: '14px',
          background: O.panelBg,
          border: '2px solid',
          borderColor: `${O.bevelLight} ${O.bevelDark} ${O.bevelDark} ${O.bevelLight}`,
          fontFamily: FONT,
          fontSize: '9px',
          color: copied ? '#7ee787' : O.gold,
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
