// The Phase 9 seam for spec §6.1's rule hooks (Plan 04). The Core calls ONLY
// through a CoreRules value — every Core function that behaves differently
// under a twist/gear takes `rules: CoreRules = baseRules` as its LAST
// parameter, so Phase 10 can pass a composed rule set (base -> boss twist ->
// gear, each hook receiving the previous layer's answer) without changing
// any call signature.
//
// Hook seam scope (spec §6.1): this plan defines CoreRules with only the
// hooks the Core layer itself calls — deckFor, leaderFor, isTrump,
// trickWinner, legalPlays, nextLeader, failureChecks — and a baseRules
// implementation. The layering/composition mechanism and the
// whisper/objectiveAssignment/capacity/failureCost hooks are Phase 10, added
// additively by extending this type. Core modules must never name a boss or
// gear id.
//
// WR-03 (Phase 10, Plan 01): composition (Plan 10-03) first folds isTrump
// across the boss/gear layers, then builds the base rules from
// baseRulesWith(composedIsTrump), so a layer overriding only isTrump is
// honored by trick ranking and follow-suit legality without touching this
// file again.
//
// POLICY A3 (Phase 10, Plan 01): a composed hook returning an out-of-domain
// value (a seat not in the camp or trick) is a rules-composition defect,
// not a player error. The Core throws a plain Error, matching createCamp's
// leaderFor check and currentActorSeatId — see actions.ts.

import { baseDeckFor } from "./deck";
import { leaderFor } from "./leader";
import { isTrump, ledIdentity, legalPlaysFor, trickWinner } from "./trick";
import type { CampState, CardIdentity, CompletedTrick, ExpeditionCard, Hand, PlayerCount, TrickPlay } from "./state";

export type CoreRules = {
  deckFor(playerCount: PlayerCount): readonly CardIdentity[];
  leaderFor(hands: readonly Hand[]): string;
  isTrump(identity: CardIdentity): boolean;
  trickWinner(plays: readonly TrickPlay[]): string;
  legalPlays(state: CampState, seatId: string): readonly ExpeditionCard[];
  nextLeader(state: CampState, trick: CompletedTrick): string;
  /** ids of failure checks that have FIRED; empty = none. */
  failureChecks(state: CampState): readonly string[];
};

/** Builds a CoreRules layer whose isTrump, trickWinner and legalPlays all
 * consult the same `isTrumpFn` (WR-03). This is the base layer's factory:
 * every other hook is the Phase 9 baseRules body, unchanged. */
export function baseRulesWith(isTrumpFn: (identity: CardIdentity) => boolean): CoreRules {
  return {
    deckFor: baseDeckFor,
    leaderFor,
    isTrump: isTrumpFn,
    trickWinner(plays) {
      return trickWinner(plays, isTrumpFn);
    },
    legalPlays(state, seatId) {
      const hand = state.hands.find((h) => h.seatId === seatId);
      if (hand === undefined) return [];
      return legalPlaysFor(hand.cards, ledIdentity(state.currentTrick.plays), isTrumpFn);
    },
    // spec §3: "The trick's winner leads the next trick, unless a rule hook
    // says otherwise."
    nextLeader(_state, trick) {
      return trick.winnerSeatId;
    },
    failureChecks() {
      return [];
    },
  };
}

/** The base layer of every §6.1 hook, using the default Sun/Moon trump
 * predicate. Behaviorally identical to Phase 9's baseRules. */
export const baseRules: CoreRules = baseRulesWith(isTrump);
