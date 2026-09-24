// Expedition objective evaluation (Phase 9, Plan 03). Every evaluator is a
// pure function recomputed from CampState on every call, never reading or
// writing a stored status field on the objective itself (mirrors
// hanabi/endgame.ts's fixed-order, statelessly-recomputed discipline).
// Failure is reported at the EARLIEST trick the spec's rule text makes it
// impossible (spec §3: "fails the moment"), never retroactively at camp end
// (except where the spec itself only resolves at camp end — see A-END).
//
// Labeled assumptions (owner review; each resolves a RESEARCH.md open
// question flagged in 09-03-PLAN.md's <objective> block):
//
// A-TIE: two ordered objectives whose cards are won in the SAME completed
// trick satisfy their relative order (non-strict) — neither card was won
// STRICTLY after the other, so treating it as a tie is the more permissive
// reading; a one-comparator edit reverses this later if the owner disagrees.
//
// A-LAST: an ordered objective marked "last" is done only if its card is won
// by its holder in the camp's actual final trick (index totalTricks - 1);
// won in any earlier trick, it fails immediately (literal reading of "or not
// in the last trick").
//
// A-END: no-tricks and exactly-n objectives resolve to "done" only once
// every trick of the camp has been played (RESEARCH.md A4) — a holder could
// still win more tricks before the camp ends, so an early "reached N"/"still
// zero" state is reported "pending", not "done", until the camp is over.

import { cardLabel, identitiesEqual } from "./deck";
import type {
  CampState,
  CompletedTrick,
  ExactlyNObjective,
  NoTricksObjective,
  Objective,
  ObjectiveKind,
  ObjectiveStatus,
  StandardIdentity,
  WinCardObjective,
} from "./state";

export type ObjectiveKindDef<O extends Objective> = {
  readonly id: O["kind"];
  describe(objective: O): string;
  evaluate(state: CampState, objective: O): ObjectiveStatus;
};

/** Tricks won by seatId, counted fresh from state.completedTricks every
 * call — never cached (see file header, and CampState's own header comment
 * on why per-seat counts are always derived, not stored). A Phase 10 holder
 * swap (Trail Map) recomputes correctly with no field to keep in sync. */
export function countTricksWon(state: CampState, seatId: string): number {
  return state.completedTricks.filter((trick) => trick.winnerSeatId === seatId).length;
}

export function tricksRemaining(state: CampState): number {
  return state.totalTricks - state.completedTricks.length;
}

export function isCampFinished(state: CampState): boolean {
  return state.completedTricks.length === state.totalTricks;
}

/** The completed trick holding a play with this identity, else undefined. A
 * card only in the in-progress currentTrick is NOT yet won — this function
 * only searches completedTricks. */
export function trickContaining(
  state: CampState,
  target: StandardIdentity,
): CompletedTrick | undefined {
  return state.completedTricks.find((trick) =>
    trick.plays.some((play) => identitiesEqual(play.card.identity, target)),
  );
}

export const winCardKind: ObjectiveKindDef<WinCardObjective> = {
  id: "win-card",
  describe(objective) {
    return `Win the trick containing ${cardLabel(objective.target)}`;
  },
  evaluate(state, objective) {
    if (objective.ownerSeatId === null) return "pending";
    const trick = trickContaining(state, objective.target);
    if (trick === undefined) return "pending";
    return trick.winnerSeatId === objective.ownerSeatId ? "done" : "failed";
  },
};

export const noTricksKind: ObjectiveKindDef<NoTricksObjective> = {
  id: "no-tricks",
  describe() {
    return "Win no tricks";
  },
  evaluate(state, objective) {
    if (objective.ownerSeatId === null) return "pending";
    const won = countTricksWon(state, objective.ownerSeatId);
    if (won > 0) return "failed";
    return isCampFinished(state) ? "done" : "pending";
  },
};

export const exactlyNKind: ObjectiveKindDef<ExactlyNObjective> = {
  id: "exactly-n",
  describe(objective) {
    return `Win exactly ${objective.n} trick(s)`;
  },
  evaluate(state, objective) {
    if (objective.ownerSeatId === null) return "pending";
    const won = countTricksWon(state, objective.ownerSeatId);
    if (won > objective.n) return "failed"; // exceeded
    if (won + tricksRemaining(state) < objective.n) return "failed"; // unreachable (A-END window)
    if (isCampFinished(state)) return won === objective.n ? "done" : "failed";
    return "pending";
  },
};

// Registry dispatch (OBJECTIVE_KINDS) and the ordered evaluator are added in
// Task 2 (evaluateObjective, objectiveStatuses, describeObjective,
// nextObjectivePicker), which needs all four kinds to exist first.
export type { ObjectiveKind };
