// ============================================================================
// Degen Credit Score — 0 to 850
// 4 factors: Trading, Conviction, Survival, Reputation
// Each factor scores 0-212.5 → total 0-850
// ============================================================================

const FACTOR_MAX = 212.5;

// Clamp a value into 0..max range
function clamp(v: number, max: number = FACTOR_MAX): number {
  return Math.max(0, Math.min(v, max));
}

// Log scale helper — maps 0..cap to 0..1 on a log curve
function logScale(value: number, cap: number): number {
  if (value <= 0) return 0;
  return Math.min(Math.log2(value + 1) / Math.log2(cap + 1), 1);
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
}

// ============================================================================
// Factor computation
// ============================================================================

export interface FactorScore {
  name: string;
  icon: string;
  score: number;     // 0-212.5
  pct: number;       // 0-100
  color: string;
}

export interface DegenScore {
  total: number;         // 0-850
  grade: string;         // A+ to F
  factors: FactorScore[];
  tier: TierInfo;
  stories: string[];     // auto-generated wallet story one-liners
}

export interface TierInfo {
  title: string;
  icon: string;
  color: string;
  roast: string;
}

function computeTrading(d: SailorChainData): number {
  // Txn volume — log scale, 10K txns = full marks on this sub
  const txnScore = logScale(d.txnCount, 10000) * 60;
  // Trade count from Helius swaps
  const tradeScore = logScale(d.totalTrades, 200) * 40;
  // SOL volume — log scale, 1000 SOL = full
  const volScore = logScale(d.solVolume, 1000) * 50;
  // DEX diversity — each DEX = 8 pts, max 5
  const dexScore = Math.min(d.dexCount, 5) * 8;
  // Tokens traded (PnL data) — log scale
  const tokenScore = logScale(d.pnlTokensTraded, 500) * 22.5;

  return clamp(txnScore + tradeScore + volScore + dexScore + tokenScore);
}

function computeConviction(d: SailorChainData): number {
  // Wallet age — log scale, 2 years = full
  const ageScore = logScale(d.walletAgeDays, 730) * 60;
  // Active days — log scale, 200 unique days = full
  const activityScore = logScale(d.uniqueActiveDays, 200) * 50;
  // Staking — binary bonus + amount
  const stakeScore = d.stakedSol > 0
    ? 20 + logScale(d.stakedSol, 100) * 20
    : 0;
  // NFT holdings — has skin in the game
  const nftScore = logScale(d.nftCount, 20) * 22.5;
  // DeFi categories — governance, perps, staking
  const defiScore = Math.min(d.defiCategories.length, 3) * 10;

  return clamp(ageScore + activityScore + stakeScore + nftScore + defiScore);
}

function computeSurvival(d: SailorChainData): number {
  // Win rate — center around 50%, reward above
  const wr = d.pnlWinRate ?? 0;
  const totalTrades = d.pnlWins + d.pnlLosses;
  // Need at least 10 trades for win rate to matter
  const winScore = totalTrades >= 10
    ? (wr / 100) * 80
    : logScale(totalTrades, 10) * 30;

  // Realized PnL — log scale, positive is good
  const realized = d.pnlRealized ?? 0;
  let pnlScore = 0;
  if (realized > 0) {
    pnlScore = logScale(realized, 100000) * 70;
  } else if (realized < 0) {
    // Negative PnL still gets some survival credit for staying in the game
    pnlScore = Math.max(0, 20 - logScale(Math.abs(realized), 50000) * 20);
  } else {
    pnlScore = 10; // neutral
  }

  // ROI efficiency — how much they made vs invested
  const invested = d.pnlTotalInvested ?? 0;
  let roiScore = 0;
  if (invested > 0 && realized > 0) {
    const roi = realized / invested;
    roiScore = logScale(roi * 100, 500) * 42.5;
  }

  // Dead token ratio — survived rugs (having dead tokens but still positive = battle-tested)
  const deadRatio = d.tokenCount > 0 ? d.deadTokens / (d.tokenCount + d.deadTokens) : 0;
  const rugScore = deadRatio > 0 && realized > 0
    ? Math.min(deadRatio * 40, 20)
    : 0;

  return clamp(winScore + pnlScore + roiScore + rugScore);
}

function computeReputation(d: SailorChainData): number {
  // PF coins created — shows builder intent
  const createScore = logScale(d.pfCoinsCreated, 10) * 40;
  // Graduated coins — actual success
  const gradScore = Math.min(d.pfCoinsGraduated, 5) * 25;
  // KOTH — viral moment
  const kothScore = Math.min(d.pfKothCount, 3) * 15;
  // Dapp diversity — protocol citizen
  const dappScore = logScale(d.uniqueDapps, 10) * 40;
  // Community tokens held (memecoins)
  const communityScore = logScale(d.memecoins, 30) * 22.5;

  return clamp(createScore + gradScore + kothScore + dappScore + communityScore);
}

// ============================================================================
// Tiers + roasts
// ============================================================================

const TIERS: { min: number; title: string; icon: string; color: string; roast: string }[] = [
  { min: 750, title: 'Pirate King',    icon: '👑', color: '#ffd700', roast: 'The ocean bends to your will. Wallets tremble when you connect.' },
  { min: 650, title: 'Fleet Admiral',  icon: '⚔️', color: '#ec4899', roast: 'Battle-tested and profitable. Your portfolio has seen things.' },
  { min: 550, title: 'Captain',        icon: '🎖️', color: '#f97316', roast: 'You actually know what you\'re doing. Rare on Solana.' },
  { min: 450, title: 'First Mate',     icon: '🧭', color: '#fbbf24', roast: 'Solid sailor. You\'ve survived enough rugs to earn respect.' },
  { min: 350, title: 'Deckhand',       icon: '⛵', color: '#a78bfa', roast: 'Getting your sea legs. Still buying tops sometimes.' },
  { min: 250, title: 'Cabin Boy',      icon: '🪣', color: '#88c0ff', roast: 'Learning the ropes. Your worst trades are still ahead of you.' },
  { min: 150, title: 'Stowaway',       icon: '🐀', color: '#7ee787', roast: 'Snuck aboard somehow. Mostly watching from the shadows.' },
  { min: 0,   title: 'Barnacle',       icon: '🪸', color: '#6e7b8b', roast: 'Attached to the hull doing nothing. Touch some grass... or a DEX.' },
];

export function getTier(score: number): TierInfo {
  for (const t of TIERS) {
    if (score >= t.min) return t;
  }
  return TIERS[TIERS.length - 1];
}

function getGrade(score: number): string {
  if (score >= 800) return 'A+';
  if (score >= 750) return 'A';
  if (score >= 700) return 'A-';
  if (score >= 650) return 'B+';
  if (score >= 600) return 'B';
  if (score >= 550) return 'B-';
  if (score >= 500) return 'C+';
  if (score >= 450) return 'C';
  if (score >= 400) return 'C-';
  if (score >= 350) return 'D+';
  if (score >= 300) return 'D';
  if (score >= 250) return 'D-';
  if (score >= 150) return 'F+';
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
    // Solana-specific: Pump.fun stories
    if (d.pfCoinsGraduated >= 3) stories.push(`Graduated ${d.pfCoinsGraduated} coins — serial launcher`);
    else if (d.pfCoinsGraduated >= 1) stories.push(`Graduated a coin on Pump.fun`);
    else if (d.pfCoinsCreated >= 5) stories.push(`${d.pfCoinsCreated} coins launched, none graduated yet`);

    if (d.pfKothCount >= 1) stories.push(`Hit King of the Hill ${d.pfKothCount}x`);

    // Staking (SOL)
    if (d.stakedSol > 100) stories.push(`${Math.round(d.stakedSol)} SOL staked — long-term thinker`);
    else if (d.stakedSol > 0) stories.push(`Staking SOL`);

    // Volume (SOL)
    if (d.solVolume >= 1000) stories.push(`${formatCompact(d.solVolume)} SOL in trade volume`);
  } else {
    // EVM-specific stories
    if (d.defiCategories.includes('governance')) stories.push('Participates in DAO governance');

    if (d.defiCategories.length >= 3) stories.push(`Active across ${d.defiCategories.length} DeFi categories`);

    if (d.stakedSol > 0) stories.push('Staking ETH — long-term thinker');

    if (d.pnlWins + d.pnlLosses > 0) stories.push('Trading perps on Hyperliquid');

    if (d.pfCoinsCreated > 0) stories.push(`Deployed ${d.pfCoinsCreated} contract${d.pfCoinsCreated > 1 ? 's' : ''}`);
  }

  // DEX diversity
  if (d.dexCount >= 5) stories.push(`Trades on ${d.dexCount} different DEXes`);

  // Dapp diversity
  if (d.uniqueDapps >= 8) stories.push(`Active across ${d.uniqueDapps} protocols`);

  // Active days
  if (d.uniqueActiveDays >= 200) stories.push(`Active ${d.uniqueActiveDays} unique days`);
  else if (d.uniqueActiveDays >= 60) stories.push(`${d.uniqueActiveDays} days of on-chain activity`);

  // Cap at 5 most interesting
  return stories.slice(0, 5);
}

// ============================================================================
// Main score computation
// ============================================================================

export function computeDegenScore(d: SailorChainData, chain: 'solana' | 'evm' = 'solana'): DegenScore {
  const trading = computeTrading(d);
  const conviction = computeConviction(d);
  const survival = computeSurvival(d);
  const reputation = computeReputation(d);

  const total = Math.round(trading + conviction + survival + reputation);

  const factors: FactorScore[] = [
    { name: 'Trading',    icon: '📊', score: Math.round(trading),    pct: Math.round((trading / FACTOR_MAX) * 100),    color: '#f97316' },
    { name: 'Conviction', icon: '💎', score: Math.round(conviction), pct: Math.round((conviction / FACTOR_MAX) * 100), color: '#a78bfa' },
    { name: 'Survival',   icon: '🛡️', score: Math.round(survival),   pct: Math.round((survival / FACTOR_MAX) * 100),   color: '#7ee787' },
    { name: 'Reputation', icon: '⭐', score: Math.round(reputation), pct: Math.round((reputation / FACTOR_MAX) * 100), color: '#fbbf24' },
  ];

  return {
    total,
    grade: getGrade(total),
    factors,
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
