// The only state transition function in Phase 9 (spec §6.6): pick-objective
// and play-card. Every accepted action is validated through legality.ts's
// exported predicates first — this file never re-derives a check locally.
// Returns new objects, never mutates state.hands/objectives/currentTrick/
// completedTricks. There is deliberately no undo action and no queued/
// auto-play action (XRULE-08): one explicit play-card moves exactly one
// card out of exactly one hand, and trick completion never plays a card on
// anyone's behalf. Outcome is never computed or stored here — callers
// derive it fresh via camp.ts's checkCampOutcome.
//
// Phase 10, Plan 01 (WR-04/WR-05/WR-06, POLICY A3): composed hook results
// (trickWinner, nextLeader) are validated. A violation THROWS a plain
// Error, because it is a rules-composition defect no player can fix — the
// same policy createCamp's leaderFor check and currentActorSeatId already
// follow. This reverses 09-08's soft ok:false-with-an-error-code return;
// nextLeader is skipped entirely after the final trick (WR-06,
// IN-01): the post-final currentTrick is always { index: totalTricks,
// leaderSeatId: <final winner>, plays: [] }, so a composed nextLeader
// cannot block a camp's end no matter what it returns. Phase 11's
// adapter/actor boundary must catch this throw.

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
  if (!plays.some((p) => p.seatId === winnerSeatId)) {
    // WR-05: a composed trickWinner hook named a seat that did not even
    // play in this trick — a rules-composition defect (POLICY A3).
    throw new Error(
      `applyCampAction: trickWinner returned ${winnerSeatId}, which did not play in trick ${state.currentTrick.index}`,
    );
  }
  const completed: CompletedTrick = {
    index: state.currentTrick.index,
    leaderSeatId: state.currentTrick.leaderSeatId,
    plays,
    winnerSeatId,
  };
  const completedTricks = [...state.completedTricks, completed];
  const intermediate: CampState = { ...state, hands, completedTricks };

  if (completedTricks.length === state.totalTricks) {
    // WR-06 / IN-01: the final trick just completed. nextLeader is never
    // called after the final trick, so a composed hook cannot block the
    // camp's end with a sentinel leader. The post-final currentTrick names
    // the final winner as a nominal leader with no plays.
    const currentTrick: CurrentTrick = {
      index: completed.index + 1,
      leaderSeatId: completed.winnerSeatId,
      plays: [],
    };
    return { ok: true, state: { ...intermediate, currentTrick } };
  }

  const nextLeaderSeatId = rules.nextLeader(intermediate, completed);
  if (!state.seatIds.includes(nextLeaderSeatId)) {
    // WR-06 (POLICY A3): a composed nextLeader hook returned a seat outside
    // the camp's domain. Nothing built from `intermediate` is returned, so
    // the caller's state is untouched by the throw.
    throw new Error(`applyCampAction: nextLeader returned unknown seat ${nextLeaderSeatId}`);
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
