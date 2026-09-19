// D-15/RESEARCH.md Pitfall 4 (fixed evaluation order, resolved Open Question
// 2): checkHanabiGameEnd checks all three end conditions INDEPENDENTLY on
// every call, in a fixed order — fuses exhausted, then all stacks complete,
// then final round elapsed. This is never an else-if chain gated on whether
// a final round has started: a completed final stack ends the game
// IMMEDIATELY at the perfect score, even mid-final-round, which is exactly
// the race an else-if chain keyed off `finalTurnsRemaining` would miss. The
// three conditions are mutually exclusive in practice (a single play cannot
// both misplay and complete the last stack in the same action), so this
// fixed order does not resolve a real tie — it exists purely for
// determinism and readability, not because the conditions can collide.
//
// D-17: the engine returns the numeric score AND its descriptive band — the
// UI computes neither. Band thresholds are derived from the score/maxScore
// RATIO (not hardcoded score cutoffs), so Rainbow's 30 / Black's 35-point
// maximum scales proportionally from the published 25-point base-game table
// (RESEARCH.md Assumption A2 — no canonical source defines bands above 25).

import type { GameEndResult } from "../adapter";
import type { HanabiState } from "./state";
import { MAX_FUSES } from "./legality";
import { maxScoreFor, variantConfig } from "./variant";

export type EndReason = "fuses_exhausted" | "all_stacks_complete" | "final_round_elapsed";

/** Sum of tiles played onto every stack. An untouched game (every stack
 * empty) scores 0. Direction-agnostic: a descending Black stack scores the
 * same way an ascending stack does, by tile count, not by rank value. */
export function currentScore(state: HanabiState): number {
  return state.stacks.reduce((total, stack) => total + stack.playedRanks.length, 0);
}

/** Descriptive band for `score` out of `maxScore`, matching the standard
 * published 25-point base-game bands and scaling proportionally by ratio for
 * 30-point variants (see file header, Assumption A2). */
export function scoreBand(score: number, maxScore: number): string {
  if (score === 0) return "Oh no!";
  if (score === maxScore) return "Legendary";
  const ratio = score / maxScore;
  if (ratio < 0.24) return "Horrible";
  if (ratio < 0.44) return "Poor";
  if (ratio < 0.64) return "Decent";
  if (ratio < 0.84) return "Excellent";
  return "Extraordinary";
}

/** `null` while the game continues. See file header for the fixed
 * evaluation order and why all three checks are independent, not chained. */
export function checkHanabiGameEnd(state: HanabiState): GameEndResult | null {
  const config = variantConfig(state.variant);
  const maxScore = maxScoreFor(config);
  const score = currentScore(state);
  const band = scoreBand(score, maxScore);

  if (state.fuses >= MAX_FUSES) {
    const reason: EndReason = "fuses_exhausted";
    return { score, reason, band };
  }

  if (score === maxScore) {
    const reason: EndReason = "all_stacks_complete";
    return { score, reason, band };
  }

  if (state.finalTurnsRemaining === 0) {
    const reason: EndReason = "final_round_elapsed";
    return { score, reason, band };
  }

  return null;
}
