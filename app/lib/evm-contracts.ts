import { baseSepolia } from 'wagmi/chains';

// Base Sepolia Boarding contract
export const BASE_BOARDING_ADDRESS = '0x4475bb8D73b2a86238e49f16e94DB83e9755B8BB' as const;
export const BASE_CHAIN = baseSepolia;

// Explorer URLs
export const BASE_EXPLORER = {
  tx: (hash: string) => `https://sepolia.basescan.org/tx/${hash}`,
  account: (addr: string) => `https://sepolia.basescan.org/address/${addr}`,
} as const;
