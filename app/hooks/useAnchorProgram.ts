"use client";
import { useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { BOARDING_IDL, BOARDING_PROGRAM_ID, DEVNET_RPC } from '../lib/boarding-idl';

const PROGRAM_PUBKEY = new PublicKey(BOARDING_PROGRAM_ID);

/**
 * Boarding lives on devnet — separate connection from the main app's mainnet.
 * Returns the Anchor Program instance and a devnet-specific connection.
 */
export function useBoardingProgram() {
  const wallet = useWallet();

  const connection = useMemo(() => new Connection(DEVNET_RPC, 'confirmed'), []);

  const program = useMemo(() => {
    // AnchorProvider needs a wallet, but we can use a read-only provider
    // when wallet isn't connected (for fetching pool data)
    const provider = new AnchorProvider(
      connection,
      wallet as any,
      { commitment: 'confirmed' }
    );
    return new Program(BOARDING_IDL, provider);
  }, [connection, wallet]);

  return { program, connection, programId: PROGRAM_PUBKEY };
}
