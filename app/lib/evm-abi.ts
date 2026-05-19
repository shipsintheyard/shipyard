// ABI for the Boarding contract on Base Sepolia (0x4475bb8D73b2a86238e49f16e94DB83e9755B8BB)
// Only the functions needed for boarding pools
export const BOARDING_ABI = [
  {
    type: 'function',
    name: 'poolCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPool',
    inputs: [{ name: 'poolId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'creator', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'hardCap', type: 'uint256' },
        { name: 'perWalletCap', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
        { name: 'status', type: 'uint8' },
        { name: 'totalDeposited', type: 'uint256' },
        { name: 'participantCount', type: 'uint256' },
        { name: 'tokenSupply', type: 'uint256' },
        { name: 'ticker', type: 'string' },
      ],
    }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDeposit',
    inputs: [
      { name: 'poolId', type: 'uint256' },
      { name: 'user', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'createPool',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'hardCap', type: 'uint256' },
      { name: 'perWalletCap', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
      { name: 'tokenSupply', type: 'uint256' },
      { name: 'ticker', type: 'string' },
    ],
    outputs: [{ name: 'poolId', type: 'uint256' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'deposit',
    inputs: [{ name: 'poolId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'claimRefund',
    inputs: [{ name: 'poolId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimTokens',
    inputs: [{ name: 'poolId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;
