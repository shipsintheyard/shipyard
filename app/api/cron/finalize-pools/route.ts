/**
 * Cron: Auto-finalize expired boarding pools.
 *
 * Runs every 5 minutes via Vercel Cron. Checks all active pools and
 * calls finalize_success or finalize_failure on any that passed their deadline.
 *
 * Requires env var: FINALIZE_KEYPAIR — JSON array of the cranker's secret key bytes.
 * The cranker just needs enough SOL for tx fees (~0.01 SOL on devnet).
 */
import { NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';

const PROGRAM_ID = new PublicKey('BPWbd4qq5nwn6zoAC5dcLjdK7whuvJMdnAjY74F63YSq');
const DEVNET_RPC = 'https://api.devnet.solana.com';

// Import IDL at build time
import idlJson from '../../../lib/boarding.json';

function getCrankerKeypair(): Keypair | null {
  const raw = process.env.FINALIZE_KEYPAIR;
  if (!raw) return null;
  try {
    const bytes = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  // Verify cron secret (Vercel sets this header)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cranker = getCrankerKeypair();
  if (!cranker) {
    return NextResponse.json({ error: 'FINALIZE_KEYPAIR not configured' }, { status: 500 });
  }

  const connection = new Connection(DEVNET_RPC, 'confirmed');
  const wallet = new Wallet(cranker);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new Program(idlJson as any, provider);

  try {
    // Fetch all pools
    const pools = await (program.account as any).boardingPool.all();
    const now = Math.floor(Date.now() / 1000);

    let finalized = 0;
    const results: { pool: string; ticker: string; action: string }[] = [];

    for (const item of pools) {
      const acc = item.account;

      // Only process active pools past their deadline
      if (!acc.status.active) continue;
      if (acc.deadline.toNumber() > now) continue;

      const poolPubkey = item.publicKey;
      const hardCap = acc.hardCap.toNumber();
      const totalDeposited = acc.totalDeposited.toNumber();

      // Determine success or failure
      const succeeded = totalDeposited >= hardCap;
      const method = succeeded ? 'finalizeSuccess' : 'finalizeFailure';

      try {
        const tx = await (program.methods as any)[method]()
          .accounts({
            pool: poolPubkey,
            cranker: cranker.publicKey,
          })
          .transaction();

        tx.feePayer = cranker.publicKey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        tx.sign(cranker);

        const sig = await connection.sendRawTransaction(tx.serialize());
        await connection.confirmTransaction(sig, 'confirmed');

        results.push({
          pool: poolPubkey.toString().slice(0, 8),
          ticker: '?',
          action: succeeded ? 'finalize_success' : 'finalize_failure',
        });
        finalized++;
      } catch (err: any) {
        console.error(`[cron] Failed to finalize ${poolPubkey.toString().slice(0, 8)}:`, err.message);
        results.push({
          pool: poolPubkey.toString().slice(0, 8),
          ticker: '?',
          action: `error: ${err.message?.slice(0, 60)}`,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      checked: pools.length,
      finalized,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[cron] finalize-pools error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
