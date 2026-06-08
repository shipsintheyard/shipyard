// ============================================================================
// Degen Score — 20 OSRS-style Skills
// Each skill: Level 1-99 | Total Level: 20-1980
// ============================================================================

// Clamp a value into min..max range
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(v, max));
}

// Log scale helper — maps 0..cap to 0..1 on a log curve
function logScale(value: number, cap: number): number {
  if (value <= 0) return 0;
  return Math.min(Math.log2(value + 1) / Math.log2(cap + 1), 1);
}

// Convert a 0..1 ratio to a level 1..99
function toLevel(ratio: number): number {
  return clamp(Math.floor(ratio * 98) + 1, 1, 99);
}

// ============================================================================
// Data interface — matches what the API returns
// ============================================================================

export interface SailorChainData {
  txnCount: number;
  tokenCount: number;
  memecoins: number;
  deadTokens: number;
  favTokenBuys: number;
  pfCoinsCreated: number;
  pfCoinsGraduated: number;
  pfKothCount: number;
  solBalance: number;
  stakedSol: number;
  solVolume: number;
  pnlRealized: number | null;
  pnlWinRate: number | null;
  pnlWins: number;
  pnlLosses: number;
  pnlTotalInvested: number | null;
  pnlTokensTraded: number;
  dexCount: number;
  uniqueDapps: number;
  defiCategories: string[];
  walletAgeDays: number;
  uniqueActiveDays: number;
  nftCount: number;
  totalTrades: number;
  // Optional — new skills
  gasBurned?: number;       // ETH gas burned (EVM) or SOL fees paid (Solana)
  airdropCount?: number;    // number of major airdrops received
  nftVolumeEth?: number;    // ETH spent on NFT marketplaces
  nftCollections?: number;  // unique NFT collections interacted with
  nftBlueChips?: number;    // blue chip collections held/traded
  chainsActiveOn?: number;  // number of chains with activity (EVM multichain)
}

// ============================================================================
// Skill score — one per skill
// ============================================================================

export interface SkillScore {
  id: string;
  name: string;
  icon: string;
  level: number;    // 1-99
  color: string;
  desc: string;     // what this skill measures
  breakdown?: string; // hover detail — raw value + context
}

export interface DegenScore {
  total: number;         // total level (20-1980)
  combatLevel: number;   // average of combat skills (1-99)
  grade: string;
  skills: SkillScore[];
  tier: TierInfo;
  stories: string[];
}

export interface TierInfo {
  title: string;
  icon: string;
  color: string;
  roast: string;
}

// ============================================================================
// 20 Skill Definitions — ordered for display (4 cols × 5 rows)
// ============================================================================

// Row 1: Core Combat
// Row 2: Support Combat
// Row 3: Gathering
// Row 4: Artisan
// Row 5: Support

const COMBAT_SKILL_IDS = ['attack', 'strength', 'defence', 'hitpoints', 'ranged', 'magic', 'prayer'];

function computeSkills(d: SailorChainData, chain: 'solana' | 'evm' = 'solana'): SkillScore[] {
  // Pre-compute ROI — use totalInvested, fallback to solVolume as proxy for capital deployed
  const invested = d.pnlTotalInvested ?? 0;
  const realized = d.pnlRealized ?? 0;
  const isEvm = chain === 'evm';
  // EVM volume is in ETH-equiv, PnL is in USD — multiply by ~2500 to match units
  const volumeUsd = (d.solVolume ?? 0) * (isEvm ? 2500 : 1);
  const capitalBase = invested > 0 ? invested : (volumeUsd > 0 ? volumeUsd : 0);
  const roi = capitalBase > 0 && realized > 0 ? (realized / capitalBase) * 100 : 0;

  // Pre-compute trade count for defence
  const tradeCount = d.pnlWins + d.pnlLosses;

  // EVM wallets have much larger numbers (full Etherscan history vs Solana API windows)
  // so caps need to be higher to keep 99 meaningful
  const evm = chain === 'evm';

  const fc = formatCompact;
  const unit = evm ? 'ETH' : 'SOL';
  const ageDays = d.walletAgeDays;
  const ageStr = ageDays >= 365 ? `${(ageDays / 365).toFixed(1)}y` : `${ageDays}d`;

  return [
    // ═══ Row 1: Core Combat ═══
    { id: 'attack', name: 'Attack', icon: '⚔️', color: '#c75011', desc: 'Trade Volume',
      level: toLevel(logScale(d.solVolume, evm ? 5000 : 1000)),
      breakdown: `${fc(d.solVolume)} ${unit} volume · cap ${evm ? '5K' : '1K'}` },

    { id: 'strength', name: 'Strength', icon: '💪', color: '#047857', desc: 'Realized PnL',
      level: (() => {
        const pnl = d.pnlRealized ?? 0;
        if (pnl <= 0) return 1;
        return toLevel(logScale(pnl, evm ? 500000 : 100000));
      })(),
      breakdown: `${d.pnlRealized !== null ? (d.pnlRealized >= 0 ? '+' : '') + '$' + fc(d.pnlRealized) : 'no data'} · cap $${evm ? '500K' : '100K'}` },

    { id: 'defence', name: 'Defence', icon: '🛡️', color: '#6b9bd2', desc: 'Win Rate',
      level: (() => {
        if (tradeCount < 10) return clamp(tradeCount, 1, 10);
        return toLevel((d.pnlWinRate ?? 0) / 100);
      })(),
      breakdown: `${d.pnlWinRate?.toFixed(1) ?? '0'}% wins · ${d.pnlWins}W/${d.pnlLosses}L (${tradeCount} trades)` },

    { id: 'hitpoints', name: 'Hitpoints', icon: '❤️', color: '#b91c1c', desc: 'Wallet Age',
      level: toLevel(logScale(d.walletAgeDays, evm ? 3650 : 1825)),
      breakdown: `${ageStr} old · cap ${evm ? '10y' : '5y'}` },

    // ═══ Row 2: Support Combat ═══
    { id: 'ranged', name: 'Ranged', icon: '🏹', color: '#4d7c0f', desc: 'Tokens Sniped',
      level: toLevel(logScale(d.pnlTokensTraded, evm ? 2000 : 500)),
      breakdown: `${fc(d.pnlTokensTraded)} tokens traded · cap ${evm ? '2K' : '500'}` },

    { id: 'magic', name: 'Magic', icon: '🔮', color: '#6d28d9', desc: 'DeFi Mastery',
      level: toLevel(Math.min(d.defiCategories.length, evm ? 7 : 5) / (evm ? 7 : 5)),
      breakdown: `${d.defiCategories.length}/${evm ? 7 : 5} categories · ${d.defiCategories.join(', ') || 'none'}` },

    { id: 'prayer', name: 'Prayer', icon: '✨', color: '#ca8a04', desc: 'Diamond Hands',
      level: toLevel(logScale(d.stakedSol, evm ? 500 : 100)),
      breakdown: `${fc(d.stakedSol)} ${unit} staked · cap ${evm ? '500' : '100'}` },

    { id: 'agility', name: 'Agility', icon: '🏃', color: '#3730a3', desc: 'DEX Diversity',
      level: toLevel(logScale(d.dexCount, evm ? 30 : 10)),
      breakdown: `${d.dexCount} DEXes used · cap ${evm ? '30' : '10'}` },

    // ═══ Row 3: Gathering ═══
    { id: 'woodcutting', name: 'Woodcutting', icon: '🪓', color: '#78350f', desc: 'Transactions',
      level: toLevel(logScale(d.txnCount, evm ? 50000 : 10000)),
      breakdown: `${fc(d.txnCount)} txns · cap ${evm ? '50K' : '10K'}` },

    { id: 'mining', name: 'Mining', icon: '⛏️', color: '#57534e', desc: 'Daily Grind',
      level: toLevel(logScale(d.uniqueActiveDays, evm ? 1500 : 365)),
      breakdown: `${fc(d.uniqueActiveDays)} active days · cap ${evm ? '1.5K' : '365'}` },

    { id: 'fishing', name: 'Fishing', icon: '🎣', color: '#0369a1', desc: evm ? 'NFT Trader' : 'NFT Collector',
      level: evm
        ? (() => {
            const volScore = logScale(d.nftVolumeEth ?? 0, 1000);
            const colScore = logScale(d.nftCollections ?? 0, 100);
            const chipBonus = Math.min((d.nftBlueChips ?? 0) * 0.08, 0.3);
            return toLevel(Math.min(volScore * 0.5 + colScore * 0.3 + chipBonus, 1));
          })()
        : toLevel(logScale(d.nftCount, 50)),
      breakdown: evm
        ? `${fc(d.nftVolumeEth ?? 0)} ETH vol · ${d.nftCollections ?? 0} collections · ${d.nftBlueChips ?? 0} blue chips`
        : `${d.nftCount} NFTs · cap 50` },

    { id: 'farming', name: 'Farming', icon: '🌱', color: '#166534', desc: 'Bag Holder',
      level: toLevel(logScale(d.tokenCount, evm ? 300 : 50)),
      breakdown: `${d.tokenCount} tokens held · cap ${evm ? '300' : '50'}` },

    // ═══ Row 4: Artisan ═══
    { id: 'cooking', name: 'Cooking', icon: '🍳', color: '#92400e',
      desc: evm ? 'Chain Hopper' : 'Token Chef',
      level: evm
        ? toLevel(logScale(d.chainsActiveOn ?? 1, 25))
        : toLevel(logScale(d.pfCoinsCreated, 10)),
      breakdown: evm
        ? `${d.chainsActiveOn ?? 1} chains · cap 25`
        : `${d.pfCoinsCreated} tokens created · cap 10` },

    { id: 'firemaking', name: 'Firemaking', icon: '🔥', color: '#d97706', desc: 'Gas Burned',
      level: toLevel(logScale(d.gasBurned ?? 0, evm ? 50 : 5)),
      breakdown: `${fc(d.gasBurned ?? 0)} ${unit} burned · cap ${evm ? '50' : '5'}` },

    { id: 'herblore', name: 'Herblore', icon: '🧪', color: '#15803d', desc: 'Memecoins Held',
      level: toLevel(logScale(d.memecoins, evm ? 150 : 30)),
      breakdown: `${d.memecoins} memecoins · cap ${evm ? '150' : '30'}` },

    { id: 'crafting', name: 'Crafting', icon: '🔨', color: '#854d0e', desc: 'Airdrop Farmer',
      level: toLevel(logScale(d.airdropCount ?? 0, evm ? 8 : 5)),
      breakdown: `${d.airdropCount ?? 0} airdrops claimed · cap ${evm ? '8' : '5'}` },

    // ═══ Row 5: Support ═══
    { id: 'fletching', name: 'Fletching', icon: '🪶', color: '#0f766e', desc: 'Swap Speed',
      level: toLevel(logScale(d.totalTrades, evm ? 5000 : 500)),
      breakdown: `${fc(d.totalTrades)} total swaps · cap ${evm ? '5K' : '500'}` },

    { id: 'slayer', name: 'Slayer', icon: '💀', color: '#475569', desc: 'Kill Count',
      level: toLevel(logScale(tradeCount, evm ? 1000 : 200)),
      breakdown: `${tradeCount} closed positions · ${d.pnlWins}W ${d.pnlLosses}L` },

    { id: 'thieving', name: 'Thieving', icon: '🗡️', color: '#5b21b6', desc: 'Alpha',
      level: toLevel(logScale(Math.max(0, roi), evm ? 1000 : 500)),
      breakdown: `${roi > 0 ? roi.toFixed(0) + '%' : 'no'} ROI · $${fc(capitalBase)} invested` },

    { id: 'hunter', name: 'Hunter', icon: '🦊', color: '#c2410c', desc: 'Protocol Hunter',
      level: toLevel(logScale(d.uniqueDapps, evm ? 200 : 20)),
      breakdown: `${d.uniqueDapps} protocols · cap ${evm ? '200' : '20'}` },
  ];
}

// ============================================================================
// Tiers + roasts — thresholds based on total level (20-1980)
// ============================================================================

const TIERS: { min: number; title: string; icon: string; color: string; roast: string }[] = [
  { min: 1400, title: 'Pirate King',   icon: '👑', color: '#ffd700', roast: 'The ocean bends to your will. Wallets tremble when you connect.' },
  { min: 1150, title: 'Fleet Admiral', icon: '⚔️', color: '#ec4899', roast: 'Battle-tested and profitable. Your portfolio has seen things.' },
  { min: 950,  title: 'Captain',       icon: '🎖️', color: '#f97316', roast: 'You actually know what you\'re doing. Rare in DeFi.' },
  { min: 750,  title: 'First Mate',    icon: '🧭', color: '#fbbf24', roast: 'Solid sailor. You\'ve survived enough rugs to earn respect.' },
  { min: 550,  title: 'Deckhand',      icon: '⛵', color: '#a78bfa', roast: 'Getting your sea legs. Still buying tops sometimes.' },
  { min: 400,  title: 'Cabin Boy',     icon: '🪣', color: '#88c0ff', roast: 'Learning the ropes. Your worst trades are still ahead of you.' },
  { min: 250,  title: 'Stowaway',      icon: '🐀', color: '#7ee787', roast: 'Snuck aboard somehow. Mostly watching from the shadows.' },
  { min: 0,    title: 'Barnacle',      icon: '🪸', color: '#6e7b8b', roast: 'Attached to the hull doing nothing. Touch some grass... or a DEX.' },
];

export function getTier(score: number): TierInfo {
  for (const t of TIERS) {
    if (score >= t.min) return t;
  }
  return TIERS[TIERS.length - 1];
}

function getGrade(total: number): string {
  if (total >= 1700) return 'A+';
  if (total >= 1500) return 'A';
  if (total >= 1350) return 'A-';
  if (total >= 1200) return 'B+';
  if (total >= 1050) return 'B';
  if (total >= 900)  return 'B-';
  if (total >= 750)  return 'C+';
  if (total >= 600)  return 'C';
  if (total >= 500)  return 'C-';
  if (total >= 400)  return 'D+';
  if (total >= 280)  return 'D';
  if (total >= 200)  return 'D-';
  if (total >= 100)  return 'F+';
  return 'F';
}

// ============================================================================
// Wallet story — auto-generated one-liners from data
// ============================================================================

function generateStories(d: SailorChainData, chain: 'solana' | 'evm' = 'solana'): string[] {
  const stories: string[] = [];

  // Age
  if (d.walletAgeDays > 365) {
    const years = Math.floor(d.walletAgeDays / 365);
    stories.push(`${years}+ year${years > 1 ? 's' : ''} on-chain`);
  } else if (d.walletAgeDays > 30) {
    stories.push(`${Math.floor(d.walletAgeDays / 30)} months on-chain`);
  }

  // Txn count
  if (d.txnCount >= 10000) stories.push(`${Math.floor(d.txnCount / 1000)}K+ transactions deep`);
  else if (d.txnCount >= 1000) stories.push(`${Math.floor(d.txnCount / 1000)}K transactions`);

  // Dead tokens (rug survival)
  if (d.deadTokens >= 50) stories.push(`Survived ${d.deadTokens} rugs`);
  else if (d.deadTokens >= 10) stories.push(`${d.deadTokens} dead tokens in the graveyard`);

  // Win rate
  const totalPnlTrades = d.pnlWins + d.pnlLosses;
  if (totalPnlTrades >= 10 && d.pnlWinRate !== null) {
    if (d.pnlWinRate >= 60) stories.push(`${Math.round(d.pnlWinRate)}% win rate — knows what they're doing`);
    else if (d.pnlWinRate >= 45) stories.push(`${Math.round(d.pnlWinRate)}% win rate — holds their own`);
    else stories.push(`${Math.round(d.pnlWinRate)}% win rate — taking hits`);
  }

  // PnL
  if (d.pnlRealized !== null) {
    if (d.pnlRealized >= 100000) stories.push(`$${formatCompact(d.pnlRealized)} realized — serious player`);
    else if (d.pnlRealized >= 10000) stories.push(`$${formatCompact(d.pnlRealized)} realized profit`);
    else if (d.pnlRealized < -10000) stories.push(`Down $${formatCompact(Math.abs(d.pnlRealized))} — battle scars`);
  }

  if (chain === 'solana') {
    if (d.pfCoinsGraduated >= 3) stories.push(`Graduated ${d.pfCoinsGraduated} coins — serial launcher`);
    else if (d.pfCoinsGraduated >= 1) stories.push(`Graduated a coin on Pump.fun`);
    else if (d.pfCoinsCreated >= 5) stories.push(`${d.pfCoinsCreated} coins launched, none graduated yet`);

    if (d.pfKothCount >= 1) stories.push(`Hit King of the Hill ${d.pfKothCount}x`);

    if (d.stakedSol > 100) stories.push(`${Math.round(d.stakedSol)} SOL staked — long-term thinker`);
    else if (d.stakedSol > 0) stories.push(`Staking SOL`);

    if (d.solVolume >= 1000) stories.push(`${formatCompact(d.solVolume)} SOL in trade volume`);
  } else {
    if ((d.gasBurned ?? 0) >= 10) stories.push(`Burned ${(d.gasBurned ?? 0).toFixed(1)} ETH in gas`);
    else if ((d.gasBurned ?? 0) >= 1) stories.push(`${(d.gasBurned ?? 0).toFixed(2)} ETH in gas fees`);
    if ((d.airdropCount ?? 0) >= 3) stories.push(`Claimed ${d.airdropCount} major airdrops`);
    else if ((d.airdropCount ?? 0) >= 1) stories.push(`Got ${d.airdropCount} airdrop${(d.airdropCount ?? 0) > 1 ? 's' : ''}`);
    if (d.defiCategories.includes('governance')) stories.push('Participates in DAO governance');
    if (d.defiCategories.length >= 3) stories.push(`Active across ${d.defiCategories.length} DeFi categories`);
    if (d.stakedSol > 0) stories.push('Staking ETH — long-term thinker');
    if (d.pnlWins + d.pnlLosses > 0) stories.push('Trading perps on Hyperliquid');
    if (d.pfCoinsCreated > 0) stories.push(`Deployed ${d.pfCoinsCreated} contract${d.pfCoinsCreated > 1 ? 's' : ''}`);
  }

  if (d.dexCount >= 5) stories.push(`Trades on ${d.dexCount} different DEXes`);
  if (d.uniqueDapps >= 8) stories.push(`Active across ${d.uniqueDapps} protocols`);
  if (d.uniqueActiveDays >= 200) stories.push(`Active ${d.uniqueActiveDays} unique days`);
  else if (d.uniqueActiveDays >= 60) stories.push(`${d.uniqueActiveDays} days of on-chain activity`);

  return stories.slice(0, 5);
}

// ============================================================================
// Main score computation
// ============================================================================

export function computeDegenScore(d: SailorChainData, chain: 'solana' | 'evm' = 'solana'): DegenScore {
  const skills = computeSkills(d, chain);
  const total = skills.reduce((sum, s) => sum + s.level, 0);

  // Combat level = average of combat skills
  const combatSkills = skills.filter(s => COMBAT_SKILL_IDS.includes(s.id));
  const combatLevel = Math.round(combatSkills.reduce((sum, s) => sum + s.level, 0) / combatSkills.length);

  return {
    total,
    combatLevel,
    grade: getGrade(total),
    skills,
    tier: getTier(total),
    stories: generateStories(d, chain),
  };
}

// ============================================================================
// Utility
// ============================================================================

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
