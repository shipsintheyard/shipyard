import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const BOTTLES_KEY = 'bottles:all';
const WHITELIST_KEY = 'bottles:whitelist';
const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

type BottleRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

interface Bottle {
  id: string;
  message: string;
  imageUrl?: string;
  sender: string;
  recipient?: string;
  signature: string;
  timestamp: number;
  rarity: BottleRarity;
  hearts: number;
  heartedBy: string[]; // wallet addresses that hearted this bottle
  x: number;
  y: number;
  rotation: number;
  animationDelay: number;
  animationDuration: number;
}

interface WhitelistEntry {
  wallet: string;
  bottlesSent: number;
  firstBottle: number;
  lastBottle: number;
}

// Rarity chances: common 60%, uncommon 25%, rare 10%, epic 4%, legendary 1%
function rollRarity(): BottleRarity {
  const roll = Math.random() * 100;
  if (roll < 1) return 'legendary';
  if (roll < 5) return 'epic';
  if (roll < 15) return 'rare';
  if (roll < 40) return 'uncommon';
  return 'common';
}

// Basic profanity filter - catches common slurs and offensive terms
// This is a minimal list - expand as needed
const BLOCKED_WORDS = [
  // Racial slurs
  'nigger', 'nigga', 'n1gger', 'n1gga', 'nig', 'coon', 'spic', 'spick', 'wetback', 'beaner', 'chink', 'gook', 'kike', 'heeb',
  // Homophobic slurs
  'faggot', 'fag', 'f4ggot', 'f4g', 'dyke',
  // Other slurs
  'retard', 'retarded', 'r3tard',
  // Extreme content
  'kill yourself', 'kys',
];

function containsProfanity(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[0-9@$!%*?&]/g, (c) => {
    // Common leetspeak substitutions
    const subs: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '@': 'a', '$': 's', '!': 'i' };
    return subs[c] || c;
  });

  return BLOCKED_WORDS.some(word => {
    // Check for word boundaries to avoid false positives
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(normalized) || normalized.includes(word);
  });
}

// GET - Fetch all bottles
export async function GET(request: NextRequest) {
  try {
    const bottles = await redis.get<Bottle[]>(BOTTLES_KEY) || [];

    // Check for reroll query param (one-time use to fix rarities)
    const { searchParams } = new URL(request.url);
    const reroll = searchParams.get('reroll');

    if (reroll === 'true') {
      // Force re-roll all rarities
      const rerolledBottles = bottles.map(bottle => ({
        ...bottle,
        rarity: rollRarity(),
      }));
      await redis.set(BOTTLES_KEY, rerolledBottles);
      return NextResponse.json({ bottles: rerolledBottles, rerolled: true });
    }

    // Migrate bottles without rarity (one-time migration)
    let needsSave = false;
    const migratedBottles = bottles.map(bottle => {
      if (!bottle.rarity) {
        needsSave = true;
        return { ...bottle, rarity: rollRarity() };
      }
      return bottle;
    });

    // Save migrated bottles back to Redis
    if (needsSave) {
      await redis.set(BOTTLES_KEY, migratedBottles);
    }

    return NextResponse.json({ bottles: migratedBottles });
  } catch (error) {
    console.error('Failed to fetch bottles:', error);
    return NextResponse.json({ bottles: [] });
  }
}

// POST - Add a new bottle (after on-chain verification)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, imageUrl, sender, recipient, signature } = body;

    // Validate required fields
    if (!message || !sender || !signature) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check for profanity/slurs
    if (containsProfanity(message)) {
      return NextResponse.json({ error: 'Message contains inappropriate content' }, { status: 400 });
    }

    // Verify the transaction exists on-chain
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );

    try {
      const tx = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        return NextResponse.json({ error: 'Transaction not found on-chain' }, { status: 400 });
      }

      // Verify it's a memo transaction
      const accountKeys = tx.transaction.message.staticAccountKeys ||
                          (tx.transaction.message as any).accountKeys;
      const memoIndex = accountKeys?.findIndex(
        (key: PublicKey) => key.toBase58() === MEMO_PROGRAM_ID
      );

      if (memoIndex === -1) {
        return NextResponse.json({ error: 'Not a memo transaction' }, { status: 400 });
      }

      // Verify sender signed the transaction
      const signers = accountKeys?.slice(0, tx.transaction.message.header?.numRequiredSignatures || 1);
      const senderSigned = signers?.some((key: PublicKey) => key.toBase58() === sender);

      if (!senderSigned) {
        return NextResponse.json({ error: 'Sender did not sign transaction' }, { status: 400 });
      }
    } catch (verifyError) {
      console.error('Transaction verification failed:', verifyError);
      // Continue anyway - transaction might be too new
    }

    // Generate random position and rarity for the bottle
    const rarity = rollRarity();
    const newBottle: Bottle = {
      id: signature.slice(0, 8),
      message: message.slice(0, 280), // Enforce max length
      imageUrl: imageUrl || undefined,
      sender,
      recipient: recipient || undefined,
      signature,
      timestamp: Date.now(),
      rarity,
      hearts: 0,
      heartedBy: [],
      x: 10 + Math.random() * 80,
      y: 20 + Math.random() * 60,
      rotation: -20 + Math.random() * 40,
      animationDelay: Math.random() * 5,
      animationDuration: 4 + Math.random() * 4,
    };

    // Add sender to whitelist
    const whitelist = await redis.get<WhitelistEntry[]>(WHITELIST_KEY) || [];
    const existingEntry = whitelist.find(w => w.wallet === sender);
    if (existingEntry) {
      existingEntry.bottlesSent++;
      existingEntry.lastBottle = Date.now();
    } else {
      whitelist.push({
        wallet: sender,
        bottlesSent: 1,
        firstBottle: Date.now(),
        lastBottle: Date.now(),
      });
    }
    await redis.set(WHITELIST_KEY, whitelist);

    // Get existing bottles and add new one
    const existingBottles = await redis.get<Bottle[]>(BOTTLES_KEY) || [];

    // Check for duplicate signature
    if (existingBottles.some(b => b.signature === signature)) {
      return NextResponse.json({ error: 'Bottle already exists' }, { status: 400 });
    }

    // Add new bottle at the beginning, keep max 200
    const updatedBottles = [newBottle, ...existingBottles].slice(0, 200);
    await redis.set(BOTTLES_KEY, updatedBottles);

    return NextResponse.json({ success: true, bottle: newBottle });
  } catch (error) {
    console.error('Failed to add bottle:', error);
    return NextResponse.json({ error: 'Failed to add bottle' }, { status: 500 });
  }
}

// PATCH - Heart/unheart a bottle
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { bottleId, wallet } = body;

    if (!bottleId || !wallet) {
      return NextResponse.json({ error: 'Missing bottleId or wallet' }, { status: 400 });
    }

    const bottles = await redis.get<Bottle[]>(BOTTLES_KEY) || [];
    const bottleIndex = bottles.findIndex(b => b.id === bottleId);

    if (bottleIndex === -1) {
      return NextResponse.json({ error: 'Bottle not found' }, { status: 404 });
    }

    const bottle = bottles[bottleIndex];

    // Initialize hearts fields if missing (migration for old bottles)
    if (typeof bottle.hearts !== 'number') bottle.hearts = 0;
    if (!Array.isArray(bottle.heartedBy)) bottle.heartedBy = [];

    // Toggle heart
    const alreadyHearted = bottle.heartedBy.includes(wallet);
    if (alreadyHearted) {
      // Remove heart
      bottle.heartedBy = bottle.heartedBy.filter(w => w !== wallet);
      bottle.hearts = Math.max(0, bottle.hearts - 1);
    } else {
      // Add heart
      bottle.heartedBy.push(wallet);
      bottle.hearts++;
    }

    bottles[bottleIndex] = bottle;
    await redis.set(BOTTLES_KEY, bottles);

    return NextResponse.json({
      success: true,
      hearted: !alreadyHearted,
      hearts: bottle.hearts
    });
  } catch (error) {
    console.error('Failed to heart bottle:', error);
    return NextResponse.json({ error: 'Failed to heart bottle' }, { status: 500 });
  }
}
