// Failure-timing properties for exactly-n, no-tricks and ordered objectives
// (Phase 9, Plan 06, XRULE-07). The oracles below independently restate
// spec §5.2 plus objectives.ts's A-TIE/A-LAST/A-END assumptions directly
// from `completedTricks` — they never call `evaluateObjective` or any other
// objectives.ts helper (countTricksWon, tricksRemaining, trickContaining)
// internally, so this is a genuine proof against the engine, not a
// self-confirming rerun of it. `evaluateObjective` is used ONLY on the
// comparison side of assertions, and directly in the camp-stop property
// (which tests camp.ts's checkCampOutcome against objectives.ts's real
// evaluator — both real engine functions, not the independent oracle).

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { identitiesEqual } from "./deck";
import { checkCampOutcome, createCamp } from "./camp";
import { evaluateObjective } from "./objectives";
import { driveCamp } from "./test-support";
import type {
  CampState,
  ExactlyNObjective,
  Objective,
  ObjectiveSlot,
  ObjectiveStatus,
  OrderedObjective,
  OrderMarker,
  PlayerCount,
  StandardIdentity,
} from "./state";

const HAND_SIZE: Record<PlayerCount, number> = { 3: 18, 4: 13, 5: 10 };

function seatIdsFor(playerCount: PlayerCount): string[] {
  return Array.from({ length: playerCount }, (_, i) => `seat-${i}`);
}

// --- Local data helpers (deliberately NOT imported from objectives.ts) ---

function wonTricksBy(state: CampState, seatId: string): number {
  return state.completedTricks.filter((t) => t.winnerSeatId === seatId).length;
}

function remainingTricks(state: CampState): number {
  return state.totalTricks - state.completedTricks.length;
}

function trickResolutionFor(
  state: CampState,
  target: StandardIdentity,
): { index: number; winnerSeatId: string } | undefined {
  for (const trick of state.completedTricks) {
    for (const play of trick.plays) {
      if (identitiesEqual(play.card.identity, target)) {
        return { index: trick.index, winnerSeatId: trick.winnerSeatId };
      }
    }
  }
  return undefined;
}

function markerValue(order: OrderMarker): number {
  return order === "last" ? Number.POSITIVE_INFINITY : order;
}

// --- Independent oracles (spec §5.2 + A-TIE/A-LAST/A-END, restated) ---

function exactlyNOracle(state: CampState, objective: ExactlyNObjective): ObjectiveStatus {
  if (objective.ownerSeatId === null) return "pending";
  const won = wonTricksBy(state, objective.ownerSeatId);
  const remaining = remainingTricks(state);
  if (won > objective.n) return "failed"; // exceeded
  if (won + remaining < objective.n) return "failed"; // unreachable
  if (remaining === 0) return won === objective.n ? "done" : "failed";
  return "pending";
}

function noTricksOracle(state: CampState, objective: { ownerSeatId: string | null }): ObjectiveStatus {
  if (objective.ownerSeatId === null) return "pending";
  const won = wonTricksBy(state, objective.ownerSeatId);
  if (won > 0) return "failed";
  return remainingTricks(state) === 0 ? "done" : "pending";
}

function orderedOracle(
  state: CampState,
  objective: OrderedObjective,
  allOrdered: readonly OrderedObjective[],
): ObjectiveStatus {
  if (objective.ownerSeatId === null) return "pending";

  const mine = trickResolutionFor(state, objective.target);
  if (mine !== undefined && mine.winnerSeatId !== objective.ownerSeatId) return "failed";
  const myIndex = mine?.index;
  const myMarker = markerValue(objective.order);

  for (const other of allOrdered) {
    if (other.id === objective.id) continue;
    const otherMarker = markerValue(other.order);
    const otherResolution = trickResolutionFor(state, other.target);

    if (myIndex !== undefined) {
      if (otherMarker < myMarker) {
        if (otherResolution === undefined || otherResolution.index > myIndex) return "failed";
      }
    } else if (otherMarker > myMarker && otherResolution !== undefined) {
      return "failed";
    }
  }

  if (objective.order === "last" && myIndex !== undefined && myIndex !== state.totalTricks - 1) {
    return "failed";
  }

  return myIndex === undefined ? "pending" : "done";
}

// --- Generators ---

const playerCountArb = fc.constantFrom(3, 4, 5) as fc.Arbitrary<PlayerCount>;
const seedArb = fc.stringMatching(/^[0-9a-f]{32}$/);
const choicesArb = fc.array(fc.nat({ max: 40 }), { minLength: 1, maxLength: 80 });

/** Biased toward the hard exactly-n case: n drawn from the upper range so
 * unreachability (won + remaining < n) happens mid-camp, not only at the
 * very end. An exactly-n slot is present in EVERY generated run. */
const exactlyNCampArb = fc
  .tuple(
    playerCountArb,
    seedArb,
    choicesArb,
    fc.integer({ min: 3, max: 18 }),
    fc.array(fc.constantFrom<"win-card" | "ordered">("win-card", "ordered"), { minLength: 0, maxLength: 2 }),
  )
  .map(([playerCount, seed, choices, nRaw, extraKinds]) => {
    let orderCounter = 0;
    const extraSlots: ObjectiveSlot[] = extraKinds.map((kind) => {
      if (kind === "win-card") return { kind: "win-card" };
      orderCounter++;
      return { kind: "ordered", order: orderCounter };
    });
    const n = Math.min(nRaw, HAND_SIZE[playerCount]);
    const objectiveSlots: ObjectiveSlot[] = [...extraSlots, { kind: "exactly-n", n }];
    return { playerCount, seed, choices, objectiveSlots };
  });

const noTricksCampArb = fc
  .tuple(playerCountArb, seedArb, choicesArb)
  .map(([playerCount, seed, choices]) => ({
    playerCount,
    seed,
    choices,
    objectiveSlots: [{ kind: "no-tricks" as const }],
  }));

/** At least two ordered slots (markers 1 and 2), optionally a third marked
 * "last", present in EVERY generated run. */
const orderedCampArb = fc
  .tuple(playerCountArb, seedArb, choicesArb, fc.boolean())
  .map(([playerCount, seed, choices, includeLast]) => {
    const objectiveSlots: ObjectiveSlot[] = [
      { kind: "ordered", order: 1 },
      { kind: "ordered", order: 2 },
    ];
    if (includeLast) objectiveSlots.push({ kind: "ordered", order: "last" });
    return { playerCount, seed, choices, objectiveSlots };
  });

/** A general mix of every kind, for the camp-stop property (not biased
 * toward any single kind's hard case). */
const generalCampArb = fc
  .tuple(
    playerCountArb,
    seedArb,
    choicesArb,
    fc.array(fc.constantFrom<"win-card" | "ordered">("win-card", "ordered"), { minLength: 1, maxLength: 4 }),
    fc.boolean(),
    fc.option(
      fc.oneof(
        fc.constant<{ kind: "no-tricks" }>({ kind: "no-tricks" }),
        fc.nat({ max: 18 }).map((nRaw) => ({ kind: "exactly-n" as const, nRaw })),
      ),
      { nil: undefined },
    ),
  )
  .map(([playerCount, seed, choices, cardBearingKinds, includeLast, trickCount]) => {
    let orderCounter = 0;
    const slots: ObjectiveSlot[] = cardBearingKinds.map((kind) => {
      if (kind === "win-card") return { kind: "win-card" };
      orderCounter++;
      return { kind: "ordered", order: orderCounter };
    });
    if (includeLast) {
      const lastOrderedIndex = slots.reduce((found, slot, i) => (slot.kind === "ordered" ? i : found), -1);
      if (lastOrderedIndex >= 0) slots[lastOrderedIndex] = { kind: "ordered", order: "last" };
    }
    if (trickCount !== undefined) {
      if (trickCount.kind === "no-tricks") {
        slots.push({ kind: "no-tricks" });
      } else {
        slots.push({ kind: "exactly-n", n: Math.min(trickCount.nRaw, HAND_SIZE[playerCount]) });
      }
    }
    return { playerCount, seed, choices, objectiveSlots: slots };
  });

describe("property: objective failure timing", () => {
  it("exactly-n objectives are failed/done/pending exactly per the spec at every state, including unreachable-before-exceeded", () => {
    let unreachableWhileFeasibleRuns = 0;

    fc.assert(
      fc.property(exactlyNCampArb, ({ playerCount, seed, choices, objectiveSlots }) => {
        const initial = createCamp({ seatIds: seatIdsFor(playerCount), seed, objectiveSlots });
        const targetId = initial.objectives.find((o) => o.kind === "exactly-n")!.id;
        const { states } = driveCamp(initial, choices);

        let sawUnreachableWhileFeasible = false;

        for (const state of states) {
          const live = state.objectives.find((o) => o.id === targetId)! as ExactlyNObjective;
          expect(evaluateObjective(state, live)).toBe(exactlyNOracle(state, live));

          if (live.ownerSeatId !== null) {
            const won = wonTricksBy(state, live.ownerSeatId);
            const remaining = remainingTricks(state);
            if (won <= live.n && remaining > 0 && won + remaining < live.n) {
              sawUnreachableWhileFeasible = true;
            }
          }
        }

        if (sawUnreachableWhileFeasible) unreachableWhileFeasibleRuns++;
      }),
      { numRuns: 200 },
    );

    expect(unreachableWhileFeasibleRuns).toBeGreaterThan(0);
  });

  it("no-tricks objectives are failed/done/pending exactly per the spec at every state", () => {
    fc.assert(
      fc.property(noTricksCampArb, ({ playerCount, seed, choices, objectiveSlots }) => {
        const initial = createCamp({ seatIds: seatIdsFor(playerCount), seed, objectiveSlots });
        const targetId = initial.objectives.find((o) => o.kind === "no-tricks")!.id;
        const { states } = driveCamp(initial, choices);

        for (const state of states) {
          const live = state.objectives.find((o) => o.id === targetId)!;
          expect(evaluateObjective(state, live)).toBe(noTricksOracle(state, live));
        }
      }),
      { numRuns: 200 },
    );
  });

  it("ordered objectives are failed/done/pending exactly per the spec's relative-order/last text at every state, including out-of-order failures", () => {
    let orderFailureRuns = 0;

    fc.assert(
      fc.property(orderedCampArb, ({ playerCount, seed, choices, objectiveSlots }) => {
        const initial = createCamp({ seatIds: seatIdsFor(playerCount), seed, objectiveSlots });
        const targetIds = initial.objectives.filter((o) => o.kind === "ordered").map((o) => o.id);
        const { states } = driveCamp(initial, choices);

        let sawOrderFailure = false;

        for (const state of states) {
          const liveOrdered = state.objectives.filter(
            (o): o is OrderedObjective => o.kind === "ordered" && targetIds.includes(o.id),
          );
          for (const objective of liveOrdered) {
            const expected = orderedOracle(state, objective, liveOrdered);
            expect(evaluateObjective(state, objective)).toBe(expected);

            if (expected === "failed") {
              const mine = trickResolutionFor(state, objective.target);
              const wrongWinner = mine !== undefined && mine.winnerSeatId !== objective.ownerSeatId;
              if (!wrongWinner) sawOrderFailure = true;
            }
          }
        }

        if (sawOrderFailure) orderFailureRuns++;
      }),
      { numRuns: 200 },
    );

    expect(orderFailureRuns).toBeGreaterThan(0);
  });

  it("the camp stops at exactly the first state any objective evaluates failed, matching checkCampOutcome's first failed state", () => {
    fc.assert(
      fc.property(generalCampArb, ({ playerCount, seed, choices, objectiveSlots }) => {
        const initial = createCamp({ seatIds: seatIdsFor(playerCount), seed, objectiveSlots });
        const { states } = driveCamp(initial, choices);

        const firstAnyObjectiveFailedIndex = states.findIndex((state) =>
          state.objectives.some((o: Objective) => evaluateObjective(state, o) === "failed"),
        );
        const firstOutcomeFailedIndex = states.findIndex(
          (state) => checkCampOutcome(state).status === "failed",
        );

        expect(firstOutcomeFailedIndex).toBe(firstAnyObjectiveFailedIndex);
        if (firstOutcomeFailedIndex !== -1) {
          // No states after it in driveCamp's output — play stops once the
          // outcome is decided (XRULE-07/08).
          expect(firstOutcomeFailedIndex).toBe(states.length - 1);
        }
      }),
      { numRuns: 200 },
    );
  });
});
