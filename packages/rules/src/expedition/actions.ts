// The only state transition function in Phase 9 (spec §6.6): pick-objective
// and play-card. Every accepted action is validated through legality.ts's
// exported predicates first — this file never re-derives a check locally.
// Returns new objects, never mutates state.hands/objectives/currentTrick/
// completedTricks. There is deliberately no undo action and no queued/
// auto-play action (XRULE-08): one explicit play-card moves exactly one
// card out of exactly one hand, and trick completion never plays a card on
// anyone's behalf. Outcome is never computed or stored here — callers
// derive it fresh via camp.ts's checkCampOutcome. A composed rules.nextLeader
// hook's result is validated against state.seatIds before it is stored; a
// seat outside that set returns invalid_rule_hook instead of silently
// soft-locking the camp (WR-04).

import type { AdapterResult } from "../adapter";
import { canPickObjective, canPlayCard, findOwnCard } from "./legality";
import { baseRules, type CoreRules } from "./rules";
import type { CampAction, CampError, CampState, CompletedTrick, CurrentTrick } from "./state";

function applyPickObjective(
  state: CampState,
  actorSeatId: string,
  objectiveId: string,
  rules: CoreRules,
): AdapterResult<CampState, CampError> {
  const legality = canPickObjective(state, actorSeatId, objectiveId, rules);
  if (!legality.legal) return { ok: false, error: legality.reason };

  const objectives = state.objectives.map((o) =>
    o.id === objectiveId ? { ...o, ownerSeatId: actorSeatId } : o,
  );

  return { ok: true, state: { ...state, objectives } };
}

function applyPlayCard(
  state: CampState,
  actorSeatId: string,
  cardId: string,
  rules: CoreRules,
): AdapterResult<CampState, CampError> {
  const legality = canPlayCard(state, actorSeatId, cardId, rules);
  if (!legality.legal) return { ok: false, error: legality.reason };

  const card = findOwnCard(state, actorSeatId, cardId)!;

  const hands = state.hands.map((h) =>
    h.seatId === actorSeatId
      ? { seatId: h.seatId, cards: h.cards.filter((c) => c.id !== cardId) }
      : h,
  );

  const plays = [...state.currentTrick.plays, { seatId: actorSeatId, card }];

  if (plays.length < state.seatIds.length) {
    const currentTrick: CurrentTrick = { ...state.currentTrick, plays };
    return { ok: true, state: { ...state, hands, currentTrick } };
  }

  // The last seat's play completes the trick — resolve the winner and open
  // the next trick, never playing a card for anyone (XRULE-08).
  const winnerSeatId = rules.trickWinner(plays);
  const completed: CompletedTrick = {
    index: state.currentTrick.index,
    leaderSeatId: state.currentTrick.leaderSeatId,
    plays,
    winnerSeatId,
  };
  const completedTricks = [...state.completedTricks, completed];
  const intermediate: CampState = { ...state, hands, completedTricks };
  const nextLeaderSeatId = rules.nextLeader(intermediate, completed);
  if (!state.seatIds.includes(nextLeaderSeatId)) {
    // A composed hook returned a seat outside the camp's domain (WR-04).
    // Nothing built from `intermediate` is returned, so the caller's state
    // is untouched.
    return { ok: false, error: "invalid_rule_hook" };
  }
  const currentTrick: CurrentTrick = {
    index: completed.index + 1,
    leaderSeatId: nextLeaderSeatId,
    plays: [],
  };

  return { ok: true, state: { ...intermediate, currentTrick } };
}

/** Dispatches on action.type; anything other than "pick-objective" or
 * "play-card" — including a hand-forged request cast through unknown, since
 * there is no third action type to route to (XRULE-08), and including a
 * null or non-object value (IN-06) — is rejected invalid_action. Never
 * mutates `state`. */
export function applyCampAction(
  state: CampState,
  actorSeatId: string,
  action: CampAction,
  rules: CoreRules = baseRules,
): AdapterResult<CampState, CampError> {
  if (typeof action !== "object" || action === null) {
    return { ok: false, error: "invalid_action" };
  }
  if (action.type === "pick-objective") {
    return applyPickObjective(state, actorSeatId, action.objectiveId, rules);
  }
  if (action.type === "play-card") {
    return applyPlayCard(state, actorSeatId, action.cardId, rules);
  }
  return { ok: false, error: "invalid_action" };
}
