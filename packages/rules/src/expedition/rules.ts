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

/** The base layer of every §6.1 hook. Delegates to the deck/leader/trick
 * modules already proven by Plans 01-02; adds nothing content-specific. The
 * base game has no failure checks (Mutiny/Camouflage are Phase 10). */
export const baseRules: CoreRules = {
  deckFor: baseDeckFor,
  leaderFor,
  isTrump,
  trickWinner,
  legalPlays(state, seatId) {
    const hand = state.hands.find((h) => h.seatId === seatId);
    if (hand === undefined) return [];
    return legalPlaysFor(hand.cards, ledIdentity(state.currentTrick.plays));
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
