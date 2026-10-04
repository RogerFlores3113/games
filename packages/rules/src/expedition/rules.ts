// The seam for the rule hooks. The Core calls ONLY through a CoreRules
// value: every Core function that behaves differently under a rule takes
// `rules: CoreRules = baseRules` as its LAST parameter, so the run layer can
// pass a composed rule set (base -> layers, each hook receiving the previous
// layer's answer) without changing any call signature. Core modules must
// never name a source id.
//
// The card-reading hooks identityOf, isTrump and rankOf are folded first, in
// that order, and the base layer is built from them (WR-03), so a layer
// overriding only one of them is honored by follow-suit legality, the trick
// winner and burns without touching this file again.
//
// POLICY A3: a composed hook returning an out-of-domain value (a seat not in
// the camp or trick) is a rules-composition defect, not a player error. The
// Core throws a plain Error, matching createCamp's leaderFor check and
// currentActorSeatId — see actions.ts.

import { baseDeckFor } from "./deck";
import { leaderFor } from "./leader";
import { evaluateObjective } from "./objectives";
import { PRINTED, legalPlaysFor, trickWinner, type CardReading } from "./trick";
import type {
  CampState,
  CardIdentity,
  CompletedTrick,
  ExpeditionCard,
  Goal,
  Hand,
  Objective,
  ObjectiveStatus,
  ObjectiveStatusEntry,
  PlayerCount,
  StandardIdentity,
  TrickPlay,
} from "./state";

export type CoreRules = {
  deckFor(playerCount: PlayerCount): readonly CardIdentity[];
  /** The identities objectives may target, before the shuffle. */
  objectiveDeckFor(deck: readonly CardIdentity[]): readonly StandardIdentity[];
  leaderFor(hands: readonly Hand[]): string;
  /** What a card counts as. Folded first. */
  identityOf(card: ExpeditionCard): CardIdentity;
  isTrump(identity: CardIdentity): boolean;
  /** A card's strength within a trick. */
  rankOf(card: ExpeditionCard): number;
  trickWinner(plays: readonly TrickPlay[], led: CardIdentity): string;
  legalPlays(state: CampState, seatId: string): readonly ExpeditionCard[];
  /** Ids of the plays that leave a full trick before its winner is decided. */
  burns(plays: readonly TrickPlay[], led: CardIdentity, winnerOf: (plays: readonly TrickPlay[]) => string): readonly string[];
  nextLeader(state: CampState, trick: CompletedTrick): string;
  objectiveStatus(state: CampState, objective: Objective): ObjectiveStatus;
  /** Camp-wide conditions beside the objectives, given every objective's
   * composed status. */
  goals(state: CampState, statuses: readonly ObjectiveStatusEntry[]): readonly Goal[];
};

/** Standard identities ranked above the deck's lowest standard rank, so a
 * deck that loses its lowest cards still deals only reachable targets. */
export function baseObjectiveDeckFor(deck: readonly CardIdentity[]): StandardIdentity[] {
  const standard = deck.filter((identity): identity is StandardIdentity => identity.kind === "standard");
  const floor = Math.min(...standard.map((identity) => identity.rank));
  return standard.filter((identity) => identity.rank > floor);
}

/** Builds the base CoreRules over a card reading: legalPlays and
 * trickWinner read every card through it. */
export function baseRulesWith(reading: CardReading = PRINTED): CoreRules {
  return {
    deckFor: baseDeckFor,
    objectiveDeckFor: baseObjectiveDeckFor,
    leaderFor,
    identityOf: reading.identityOf,
    isTrump: reading.isTrump,
    rankOf: reading.rankOf,
    trickWinner(plays, led) {
      return trickWinner(plays, led, reading);
    },
    legalPlays(state, seatId) {
      const hand = state.hands.find((h) => h.seatId === seatId);
      if (hand === undefined) return [];
      const lead = state.currentTrick.plays[0];
      return legalPlaysFor(hand.cards, lead === undefined ? null : reading.identityOf(lead.card), reading);
    },
    burns() {
      return [];
    },
    // "The trick's winner leads the next trick, unless a rule hook says
    // otherwise."
    nextLeader(_state, trick) {
      return trick.winnerSeatId;
    },
    objectiveStatus: evaluateObjective,
    goals() {
      return [];
    },
  };
}

export const baseRules: CoreRules = baseRulesWith();
