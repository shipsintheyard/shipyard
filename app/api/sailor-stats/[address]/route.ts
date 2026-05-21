import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(address);
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid Solana address' },
      { status: 400 }
    );
  }

  try {
    const connection = new Connection(RPC, 'confirmed');

    // 3 RPC calls in parallel
    const [signatures, tokenAccounts, balance] = await Promise.all([
      connection.getSignaturesForAddress(pubkey, { limit: 1000 }),
      connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
      connection.getBalance(pubkey),
    ]);

    // --- Signatures ---
    const txnCount = signatures.length;
    const successfulTxns = signatures.filter(s => !s.err).length;
    const blockTimes = signatures
      .map(s => s.blockTime)
      .filter((t): t is number => t !== null);

    const now = Date.now() / 1000;
    const walletAgeDays = blockTimes.length > 0
      ? Math.floor((now - Math.min(...blockTimes)) / 86400)
      : 0;
    const lastActivityDays = blockTimes.length > 0
      ? Math.floor((now - Math.max(...blockTimes)) / 86400)
      : 999;

    // --- Token accounts ---
    const nonZeroTokens = tokenAccounts.value.filter(ta => {
      const parsed = ta.account.data as { parsed?: { info?: { tokenAmount?: { uiAmount?: number } } } };
      const amount = parsed?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
      return amount > 0;
    });
    const tokenCount = nonZeroTokens.length;

    // --- SOL balance ---
    const solBalance = balance / 1e9;

    return NextResponse.json({
      success: true,
      data: {
        txnCount,
        successfulTxns,
        walletAgeDays,
        lastActivityDays,
        tokenCount,
        totalTokenAccounts: tokenAccounts.value.length,
        solBalance,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'RPC error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
