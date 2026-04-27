import idlJson from './boarding.json';

export const BOARDING_IDL = idlJson as any;
export const BOARDING_PROGRAM_ID = 'BPWbd4qq5nwn6zoAC5dcLjdK7whuvJMdnAjY74F63YSq';

// Platform treasury — receives creation fees + 5% SOL on launch
// TODO: set this to a real multisig before mainnet
export const PLATFORM_TREASURY = 'AZ18McqpdcYkrseq2cpkb7iy22VPUeSXFZW5zWWZtZie';

export const DEVNET_RPC = 'https://api.devnet.solana.com';

// V1 fixed params
export const V1_HARD_CAP_SOL = 80;
export const V1_PER_WALLET_SOL = 2;
export const V1_MIN_WALLETS = 40;
export const CREATION_FEE_SOL = 0.5;

export const MODE_DURATIONS = {
  blitz: 30 * 60,       // 30 min in seconds
  flash: 4 * 3600,      // 4 hours
  voyage: 72 * 3600,    // 72 hours
} as const;
