// ============================================================================
// Degen Score — types & calculation
// ============================================================================

export interface ScoreBreakdown {
  totalScore: number;     // 0-100
  holdTime: number;       // estimated days
  walletAge: number;      // estimated days
  riskTolerance: number;  // 0-100
  frequency: number;      // activity score 0-100
}
