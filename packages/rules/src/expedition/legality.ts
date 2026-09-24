// Typed legality predicates for the Expedition camp state machine (Phase 9,
// Plan 05). Mirrors packages/rules/src/hanabi/legality.ts: these predicates
// exist so a future UI/adapter can ask "is this action legal?" without
// calling applyCampAction, and applyCampAction (this plan's actions.ts) MUST
// call these same functions rather than re-implementing the checks, so the
// two can never drift apart.
//
// Guard order is camp_over -> wrong_phase -> not_your_turn -> action-specific.
// This deliberately differs from hanabi/legality.ts's turn-first order:
// currentActorSeatId(state) is null once the camp is decided (camp.ts), so
// camp_over must be checked before any turn/phase-dependent lookup would
// even make sense to run — once the outcome is decided, "whose turn is it"
// has no answer at all.
//
// Follow-suit legality is decided ONLY by rules.legalPlays (which delegates
// to trick.ts's legalPlaysFor) — there is deliberately no second copy of the
// follow-suit rule here (T-09-13).

import { campPhase, checkCampOutcome, currentActorSeatId } from "./camp";
import { baseRules, type CoreRules } from "./rules";
import type { CampError, CampState, ExpeditionCard } from "./state";

export type Legality = { legal: true } | { legal: false; reason: CampError };

/** Finds `cardId` inside `seatId`'s OWN hand only — never searches other
 * seats' hands (T-09-11). A miss (unknown id, or the card is held by a
 * different seat) returns null; callers turn that into card_not_in_hand. */
export function findOwnCard(
  state: CampState,
  seatId: string,
  cardId: string,
): ExpeditionCard | null {
  const hand = state.hands.find((h) => h.seatId === seatId);
  if (hand === undefined) return null;
  const card = hand.cards.find((c) => c.id === cardId);
  return card ?? null;
}

/** Legal only for the seat currentActorSeatId names during objective-pick,
 * and only when the named objective is still face-up (ownerSeatId === null).
 * camp_over (T-09-12) and wrong_phase are checked before any turn/objective
 * lookup. */
export function canPickObjective(
  state: CampState,
  actorSeatId: string,
  objectiveId: string,
  rules: CoreRules = baseRules,
): Legality {
  if (checkCampOutcome(state, rules).status !== "in_progress") {
    return { legal: false, reason: "camp_over" };
  }
  if (campPhase(state, rules) !== "objective-pick") {
    return { legal: false, reason: "wrong_phase" };
  }
  if (currentActorSeatId(state, rules) !== actorSeatId) {
    return { legal: false, reason: "not_your_turn" };
  }
  const objective = state.objectives.find((o) => o.id === objectiveId);
  if (objective === undefined || objective.ownerSeatId !== null) {
    return { legal: false, reason: "objective_not_available" };
  }
  return { legal: true };
}

/** Legal only for the seat currentActorSeatId names during playing, naming a
 * card in that seat's own hand that appears in rules.legalPlays (the shared
 * follow-suit resolver — T-09-13). camp_over and wrong_phase are checked
 * before any turn/hand lookup. */
export function canPlayCard(
  state: CampState,
  actorSeatId: string,
  cardId: string,
  rules: CoreRules = baseRules,
): Legality {
  if (checkCampOutcome(state, rules).status !== "in_progress") {
    return { legal: false, reason: "camp_over" };
  }
  if (campPhase(state, rules) !== "playing") {
    return { legal: false, reason: "wrong_phase" };
  }
  if (currentActorSeatId(state, rules) !== actorSeatId) {
    return { legal: false, reason: "not_your_turn" };
  }
  const card = findOwnCard(state, actorSeatId, cardId);
  if (card === null) {
    return { legal: false, reason: "card_not_in_hand" };
  }
  const legalPlays = rules.legalPlays(state, actorSeatId);
  if (!legalPlays.some((c) => c.id === cardId)) {
    return { legal: false, reason: "must_follow_suit" };
  }
  return { legal: true };
}
