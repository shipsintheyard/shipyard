"use client";
import { useState, useEffect } from 'react';
import type { ScoreBreakdown } from '../lib/degen-score';
import type { CharacterStats } from './useCharacter';

// ============================================================================
// Degen Score — derived from on-chain character stats
// In the future this could hit an external API for richer data
// ============================================================================

export function useDegenScore(stats: CharacterStats | null) {
  const [score, setScore] = useState<ScoreBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!stats) {
      setScore(null);
      setLoading(false);
      return;
    }

    const totalPools = stats.poolsJoined + stats.poolsCreated;
    const riskTolerance = Math.min(100, stats.totalCommitted * 10);
    const frequency = Math.min(100, totalPools * 5);

    // Estimate hold time & wallet age from activity level
    const holdTime = Math.min(365, totalPools * 7);
    const walletAge = Math.min(730, totalPools * 14);

    const totalScore = Math.min(100, Math.round(
      (stats.successRate * 0.25) +
      (riskTolerance * 0.25) +
      (frequency * 0.25) +
      (Math.min(100, holdTime / 3.65) * 0.25)
    ));

    setScore({ totalScore, holdTime, walletAge, riskTolerance, frequency });
    setLoading(false);
  }, [stats]);

  return { score, loading };
}
