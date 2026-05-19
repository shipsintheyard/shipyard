"use client";
import { type ReactNode } from 'react';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { mainnet, baseSepolia } from 'wagmi/chains';
import { injected, coinbaseWallet } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const wagmiConfig = createConfig({
  chains: [mainnet, baseSepolia],
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'The Shipyard' }),
  ],
  transports: {
    [mainnet.id]: http(),
    [baseSepolia.id]: http(),
  },
});

const queryClient = new QueryClient();

export { wagmiConfig };

export default function EVMProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
