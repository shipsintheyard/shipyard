// ============================================================================
// Shared XP / Level / Rank logic — used by SailorStats + OG image generator
// OSRS exponential curve: XP doubles every 7 levels. Level 92 = halfway to 99.
// ============================================================================

const OSRS_XP_TABLE: number[] = [0];
let _xpAccum = 0;
for (let l = 1; l < 99; l++) {
  _xpAccum += Math.floor(l + 300 * Math.pow(2, l / 7));
  OSRS_XP_TABLE.push(Math.floor(_xpAccum / 4));
}

export function xpForLevel(level: number): number {
  return OSRS_XP_TABLE[Math.max(0, Math.min(level - 1, 98))];
}

export function levelFromXp(xp: number): number {
  for (let l = 98; l >= 0; l--) {
    if (xp >= OSRS_XP_TABLE[l]) return l + 1;
  }
  return 1;
}

export function progressToNext(xp: number): number {
  const level = levelFromXp(xp);
  if (level >= 99) return 1;
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return next > cur ? (xp - cur) / (next - cur) : 0;
}

export interface SkillData {
  name: string;
  icon: string;
  xp: number;
  level: number;
  progress: number;
}

// Minimal chain data needed for skill computation
export interface SailorChainData {
  txnCount: number;
  tokenCount: number;
  memecoins: number;
  deadTokens: number;
  favTokenBuys: number;
  pfCoinsGraduated: number;
  solBalance: number;
  stakedSol: number;
  solVolume: number;
  pnlRealized: number | null;
  dexCount: number;
  uniqueDapps: number;
  defiCategories: string[];
  walletAgeDays: number;
  uniqueActiveDays: number;
  nftCount: number;
}

export function computeSkills(chain: SailorChainData): SkillData[] {
  const raw = [
    {
      name: 'Sailing', icon: '\u26F5',
      xp: Math.min(chain.txnCount, 50000) * 20,
    },
    {
      name: 'Degenning', icon: '\uD83D\uDC8E',
      xp: Math.log2((chain.tokenCount || 0) + 1) * 15000
        + (chain.memecoins || 0) * 8000
        + (chain.deadTokens || 0) * 3000
        + Math.min(chain.favTokenBuys || 0, 500) * 200
        + (chain.pfCoinsGraduated || 0) * 80000,
    },
    {
      name: 'Plundering', icon: '\uD83C\uDFF4\u200D\u2620\uFE0F',
      xp: Math.log2((chain.solBalance + chain.stakedSol) + 1) * 50000
        + Math.log2((chain.solVolume || 0) + 1) * 15000
        + Math.log2(Math.max(chain.pnlRealized ?? 0, 0) + 1) * 20000,
    },
    {
      name: 'Navigation', icon: '\uD83E\uDDED',
      xp: (chain.dexCount || 0) * 60000
        + (chain.uniqueDapps || 0) * 40000
        + chain.defiCategories.length * 80000,
    },
    {
      name: 'Anchoring', icon: '\u2693',
      xp: Math.min(chain.walletAgeDays, 1000) * 1500
        + Math.min(chain.uniqueActiveDays || 0, 365) * 2000
        + (chain.stakedSol > 0 ? 200000 : 0)
        + (chain.nftCount || 0) * 10000,
    },
  ];

  return raw.map(s => {
    const xp = Math.round(s.xp);
    return { ...s, xp, level: levelFromXp(xp), progress: progressToNext(xp) };
  });
}

// Rank thresholds (5 skills, max total = 495)
export function getRankFromLevel(totalLevel: number) {
  if (totalLevel >= 460) return { title: 'Shipwright', icon: '\uD83D\uDD28', color: '#ec4899' };
  if (totalLevel >= 375) return { title: 'Admiral',    icon: '\u2B50',       color: '#f97316' };
  if (totalLevel >= 300) return { title: 'Captain',    icon: '\uD83C\uDF96\uFE0F', color: '#fbbf24' };
  if (totalLevel >= 225) return { title: 'Navigator',  icon: '\uD83E\uDDED', color: '#a78bfa' };
  if (totalLevel >= 150) return { title: 'Boatswain',  icon: '\uD83E\uDE22', color: '#7ee787' };
  if (totalLevel >= 80)  return { title: 'Sailor',     icon: '\u26F5',       color: '#88c0ff' };
  if (totalLevel >= 30)  return { title: 'Deckhand',   icon: '\uD83E\uDDF9', color: '#c9d1d9' };
  return { title: 'Stowaway', icon: '\uD83D\uDC00', color: '#6e7b8b' };
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
