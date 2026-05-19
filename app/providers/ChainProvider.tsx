"use client";
import { createContext, useContext, useState, type ReactNode } from 'react';

export type Chain = 'sol' | 'base';

interface ChainContextValue {
  chain: Chain;
  setChain: (chain: Chain) => void;
}

const ChainContext = createContext<ChainContextValue>({
  chain: 'sol',
  setChain: () => {},
});

export function useChain() {
  return useContext(ChainContext);
}

export default function ChainProvider({ children }: { children: ReactNode }) {
  const [chain, setChain] = useState<Chain>('sol');

  return (
    <ChainContext.Provider value={{ chain, setChain }}>
      {children}
    </ChainContext.Provider>
  );
}
