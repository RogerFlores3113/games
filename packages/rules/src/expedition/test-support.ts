// Test-only simulation helpers for Expedition's property tests (Phase 9,
// Plan 06). Mirrors hanabi/test-support.ts's T-03-24 discipline exactly:
//
// CONSTRAINT (T-03-24, restated for Expedition): enumerateLegalActions
// builds CANDIDATE actions and filters them through legality.ts's exported
// canPickObjective/canPlayCard predicates ONLY. It never re-derives
// Expedition's rules locally (no follow-suit comparison, no trick-winner
// logic). A private re-implementation here would make every property test
// that drives camps through this helper self-confirming — it would prove
// the test's own copy of the rules is internally consistent, not that the
// real engine is correct. If a legality predicate is wrong, this helper
// must reproduce that same wrongness, not silently correct it.

import { currentActorSeatId as campCurrentActorSeatId } from "./camp";
import { canPickObjective, canPlayCard } from "./legality";
import { applyCampAction } from "./actions";
import { baseRules, type CoreRules } from "./rules";
import type { CampAction, CampEvent, CampState, ExpeditionCard, ResolvedPlay } from "./state";

/** A completed-trick play that kept its printed identity and did not burn. */
export function resolvedPlay(seatId: string, card: ExpeditionCard): ResolvedPlay {
  return { seatId, card, countsAs: null, burned: false };
}

/** The seat whose turn it currently is — a thin re-export of camp.ts's
 * currentActorSeatId so property tests need only import from this module. */
export function currentActor(state: CampState, rules: CoreRules = baseRules): string | null {
  return campCurrentActorSeatId(state, rules);
}

/** Every action currently legal for the active seat, derived from the
 * exported legality predicates. Returns `[]` once the camp is decided (actor
 * is null) or, during objective-pick, once every objective is owned; during
 * playing, once the actor's hand is empty. Order: objectives order, then
 * hand order — this order has no rules significance, it only needs to be
 * stable so `choices[step % choices.length] % legal.length` is deterministic
 * for a given seed. */
export function enumerateLegalActions(state: CampState, rules: CoreRules = baseRules): CampAction[] {
  const actorSeatId = currentActor(state, rules);
  if (actorSeatId === null) return [];

  const actions: CampAction[] = [];

  for (const objective of state.objectives) {
    if (objective.ownerSeatId !== null) continue;
    if (canPickObjective(state, actorSeatId, objective.id, rules).legal) {
      actions.push({ type: "pick-objective", objectiveId: objective.id });
    }
  }

  const ownHand = state.hands.find((h) => h.seatId === actorSeatId);
  if (ownHand !== undefined) {
    for (const card of ownHand.cards) {
      if (canPlayCard(state, actorSeatId, card.id, rules).legal) {
        actions.push({ type: "play-card", cardId: card.id });
      }
    }
  }

  return actions;
}

/** Every card dealt into this camp, located exactly once: "hand" | "trick"
 * (a completed trick's play) | "current-trick" (an in-progress trick's
 * play) | "discard". A REAL card id seen in more than one location is recorded as the
 * "+"-joined list of every location it was seen in (Hanabi's collision
 * convention), rather than throwing, so a caller can detect the collision
 * without this helper aborting mid-walk. */
export function locateAllCards(state: CampState): Map<string, string> {
  const locations = new Map<string, string>();
  const record = (id: string, location: string): void => {
    const existing = locations.get(id);
    locations.set(id, existing === undefined ? location : `${existing}+${location}`);
  };

  for (const hand of state.hands) {
    for (const card of hand.cards) record(card.id, "hand");
  }
  for (const trick of state.completedTricks) {
    for (const play of trick.plays) record(play.card.id, "trick");
  }
  for (const play of state.currentTrick.plays) record(play.card.id, "current-trick");
  for (const discard of state.discards) record(discard.card.id, "discard");

  return locations;
}

/** Fails the property LOUDLY rather than hanging CI if a rules bug makes the
 * engine never reach a decided outcome (mirrors termination.property.test.ts's
 * MAX_SIMULATED_TURNS rationale). Derived from the camp's own dimensions:
 * one step per objective pick, plus one step per (trick x seat) play. */
function maxStepsFor(initial: CampState): number {
  return initial.objectives.length + initial.totalTricks * initial.seatIds.length + 1;
}

/** Drives `initial` forward by repeatedly enumerating legal actions for the
 * current actor and applying `choices[step % choices.length] % legal.length`
 * of them (0 when `choices` is empty, though callers should always pass a
 * non-empty array) through the real `applyCampAction` transition, until no
 * legal action remains (the camp is decided) or the hard step bound is
 * exceeded. Throws if the transition ever rejects an action this module's
 * own enumerator reported as legal — the enumerator and the transition
 * disagreeing is a bug in one of them, and hiding it would defeat the point
 * of driving the engine through its own predicates. */
export function driveCamp(
  initial: CampState,
  choices: readonly number[],
  rules: CoreRules = baseRules,
): { states: CampState[]; actions: Array<{ seatId: string; action: CampAction }>; events: CampEvent[] } {
  const states: CampState[] = [initial];
  const actions: Array<{ seatId: string; action: CampAction }> = [];
  const events: CampEvent[] = [];

  let state = initial;
  let step = 0;
  const maxSteps = maxStepsFor(initial);

  for (;;) {
    const legal = enumerateLegalActions(state, rules);
    if (legal.length === 0) break;

    if (step >= maxSteps) {
      throw new Error("driveCamp exceeded step bound");
    }

    const seatId = currentActor(state, rules)!;
    const choice = choices.length === 0 ? 0 : choices[step % choices.length]!;
    const action = legal[choice % legal.length]!;

    const result = applyCampAction(state, seatId, action, rules);
    if (!result.ok) {
      throw new Error(
        `driveCamp: enumerated action rejected by applyCampAction (${JSON.stringify(action)}): ${result.error}`,
      );
    }

    state = result.state;
    states.push(state);
    actions.push({ seatId, action });
    events.push(...result.events);
    step++;
  }

  return { states, actions, events };
}
