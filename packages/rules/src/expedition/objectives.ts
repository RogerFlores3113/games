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
//
// A-LOST: a card objective's target is lost when its printed card burned,
// counted as another identity, or was discarded from a hand. A lost target
// fails its objective at once, and a target never played by the final trick
// fails too, so a camp can never stick in progress. Whichever came first, a
// win of the target or its loss, decides; later tricks cannot reorder them.
//
// Monotonicity (WR-01): for a fixed ownership assignment, "failed" is
// absorbing for all four objective kinds as completedTricks grows — at ANY
// CampState, not only up to the first failure (contrast with base play,
// which stops at the first failure and so never actually reaches a
// post-failure state on its own). win-card and no-tricks failures depend on
// facts (a wrong-seat trick win, a nonzero trick count) that never un-happen
// once true. exactly-n's `won` never decreases and `won + tricksRemaining`
// never increases, so once either failure condition holds it holds forever.
// orderedKind.evaluate's resolved branch below is symmetric for the same
// reason (see its own doc comment). This is proven by
// objectives.property.test.ts's raw-trick-sequence prefix property, which
// builds CampStates directly rather than via driveCamp/applyCampAction
// (those halt at the first failure).

import { cardLabel, identitiesEqual } from "./deck";
import type { CoreRules } from "./rules";
import type {
  CampState,
  CardIdentity,
  CompletedTrick,
  ExactlyNObjective,
  NoTricksObjective,
  Objective,
  ObjectiveKind,
  OrderedObjective,
  OrderMarker,
  ObjectiveStatus,
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

/** The completed trick holding an unburned play that counts as `target`,
 * else undefined. A card only in the in-progress currentTrick is NOT yet won
 * — this function only searches completedTricks. */
export function trickContaining(state: CampState, target: CardIdentity): CompletedTrick | undefined {
  return state.completedTricks.find((trick) =>
    trick.plays.some((play) => !play.burned && identitiesEqual(play.countsAs ?? play.card.identity, target)),
  );
}

/** When the printed `target` card was lost, on the trick timeline: the
 * trick it burned in or counted as another identity in, or just before the
 * trick after which it was discarded. Undefined while it is not lost. */
function lostAt(state: CampState, target: CardIdentity): number | undefined {
  const inTrick = state.completedTricks.find((trick) =>
    trick.plays.some((play) => identitiesEqual(play.card.identity, target) && (play.burned || play.countsAs !== null)),
  );
  if (inTrick !== undefined) return inTrick.index;
  const discard = state.discards.find((d) => identitiesEqual(d.card.identity, target));
  return discard === undefined ? undefined : discard.afterTrick - 0.5;
}

type TargetFate = { readonly kind: "won"; readonly trick: CompletedTrick } | { readonly kind: "lost" } | { readonly kind: "open" };

/** A-LOST: whichever came first, the target's win or its loss. */
function targetFate(state: CampState, target: CardIdentity): TargetFate {
  const trick = trickContaining(state, target);
  const lost = lostAt(state, target);
  if (trick !== undefined && (lost === undefined || trick.index <= lost)) return { kind: "won", trick };
  if (lost !== undefined) return { kind: "lost" };
  return { kind: "open" };
}

export const winCardKind: ObjectiveKindDef<WinCardObjective> = {
  id: "win-card",
  describe(objective) {
    return `Win the trick containing ${cardLabel(objective.target)}`;
  },
  evaluate(state, objective) {
    if (objective.ownerSeatId === null) return "pending";
    const fate = targetFate(state, objective.target);
    if (fate.kind === "won") return fate.trick.winnerSeatId === objective.ownerSeatId ? "done" : "failed";
    if (fate.kind === "lost" || isCampFinished(state)) return "failed";
    return "pending";
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

/** "last" outranks every numbered marker for relative-order comparisons
 * (spec §5.2's "last" row resolves after every numbered objective). */
function markerValue(order: OrderMarker): number {
  return order === "last" ? Number.POSITIVE_INFINITY : order;
}

const CIRCLED_NUMERALS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];

function orderedPrefix(order: OrderMarker): string {
  if (order === "last") return "Last:";
  if (order >= 1 && order <= 9) return CIRCLED_NUMERALS[order - 1]!;
  return `#${order}`;
}

/** Ordered evaluation order (spec §5.2 "ordered" row, RESEARCH.md Pitfall 4):
 * (1) unowned -> pending; (2) base win-card check on its own target (won by
 * someone else, or lost -> failed); (3) relative-order checks against every OTHER
 * ordered objective in state.objectives, comparing the completed-trick
 * index each one's card was won at ("last" compares as +Infinity, A-LAST).
 * The check is SYMMETRIC (WR-01): this objective fails if EITHER a
 * lower-marker objective is unresolved or resolves later than this one, OR
 * a higher-marker objective resolved strictly earlier than this one or
 * while this one is still unresolved — checked incrementally at every
 * state, never only at camp end, so a failure recorded once can never flip
 * back to done as more tricks complete; same-trick-index counts as in order
 * (A-TIE); (4) the "last" marker additionally fails if its card is won at
 * any trick index other than totalTricks - 1 (A-LAST); (5) otherwise done
 * once won, failed if never won by the final trick, else pending. */
export const orderedKind: ObjectiveKindDef<OrderedObjective> = {
  id: "ordered",
  describe(objective) {
    return `${orderedPrefix(objective.order)} Win the trick containing ${cardLabel(objective.target)}`;
  },
  evaluate(state, objective) {
    if (objective.ownerSeatId === null) return "pending";

    const mine = targetFate(state, objective.target);
    if (mine.kind === "lost") return "failed";
    if (mine.kind === "won" && mine.trick.winnerSeatId !== objective.ownerSeatId) return "failed";
    const myTrickIndex = mine.kind === "won" ? mine.trick.index : undefined;
    const myMarker = markerValue(objective.order);

    for (const other of state.objectives) {
      if (other.kind !== "ordered" || other.id === objective.id) continue;
      const otherMarker = markerValue(other.order);
      const theirs = targetFate(state, other.target);
      const otherTrickIndex = theirs.kind === "won" ? theirs.trick.index : undefined;

      if (myTrickIndex !== undefined) {
        // My card has resolved: every lower-marker objective must have
        // resolved at or before my trick index.
        if (otherMarker < myMarker) {
          if (otherTrickIndex === undefined || otherTrickIndex > myTrickIndex) return "failed";
        }
        // WR-01: symmetric check — a higher-marker objective that resolved
        // STRICTLY earlier than mine means mine resolved out of order, even
        // though it eventually resolved. Equal indices stay in order
        // (A-TIE); this is why the comparison below is strict (<), matching
        // the lower-marker branch's own strict-> comparison above.
        if (otherMarker > myMarker && otherTrickIndex !== undefined && otherTrickIndex < myTrickIndex) {
          return "failed";
        }
      } else if (otherMarker > myMarker && otherTrickIndex !== undefined) {
        // My card is unresolved, but a higher-marker objective already
        // resolved — I can now only complete out of order.
        return "failed";
      }
    }

    if (objective.order === "last" && myTrickIndex !== undefined && myTrickIndex !== state.totalTricks - 1) {
      return "failed";
    }

    if (myTrickIndex !== undefined) return "done";
    return isCampFinished(state) ? "failed" : "pending";
  },
};

/** Every ObjectiveKind maps to a def; a missing kind here is a compile
 * error, per spec §1's extensibility requirement (Phase 10 wraps this into
 * the full content catalogue — adding a kind then is one def plus one
 * registry line). */
type KindRegistry = {
  readonly [K in ObjectiveKind]: ObjectiveKindDef<Extract<Objective, { kind: K }>>;
};

export const OBJECTIVE_KINDS: KindRegistry = {
  "win-card": winCardKind,
  ordered: orderedKind,
  "no-tricks": noTricksKind,
  "exactly-n": exactlyNKind,
};

export function evaluateObjective(state: CampState, objective: Objective): ObjectiveStatus {
  // One narrowing cast: OBJECTIVE_KINDS is keyed by kind so this dispatch is
  // exhaustive, but TS can't narrow the mapped-type lookup back to the
  // specific member type from a runtime `objective.kind` read.
  const def = OBJECTIVE_KINDS[objective.kind] as ObjectiveKindDef<Objective>;
  return def.evaluate(state, objective);
}

export function objectiveStatuses(state: CampState, rules: Pick<CoreRules, "objectiveStatus">): Array<{ objectiveId: string; status: ObjectiveStatus }> {
  return state.objectives.map((objective) => ({
    objectiveId: objective.id,
    status: rules.objectiveStatus(state, objective),
  }));
}

export function describeObjective(objective: Objective): string {
  const def = OBJECTIVE_KINDS[objective.kind] as ObjectiveKindDef<Objective>;
  return def.describe(objective);
}

/** Clockwise pick order starting at the leader: seatIds[(indexOf(leader) +
 * pickedCount) % seatIds.length], wrapping until the objective pool is
 * exhausted (spec §3, A-MULTI). Throws if leaderSeatId is not in seatIds. */
export function nextObjectivePicker(
  seatIds: readonly string[],
  leaderSeatId: string,
  pickedCount: number,
): string {
  const leaderIndex = seatIds.indexOf(leaderSeatId);
  if (leaderIndex === -1) {
    throw new Error(`nextObjectivePicker: leaderSeatId "${leaderSeatId}" is not in seatIds`);
  }
  return seatIds[(leaderIndex + pickedCount) % seatIds.length]!;
}

export type { ObjectiveKind };
