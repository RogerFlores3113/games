// A6: an objective a seat cannot finish beside one it already owns. The pick
// passes along the pick order while some seat has a clean choice left.

import { describe, expect, it } from "vitest";
import { applyCampAction } from "./actions";
import { currentActorSeatId } from "./camp";
import { botMove } from "./dev/autoplay";
import { canPickObjective } from "./legality";
import { mustTakeNoTricks, objectivesConflict } from "./objectives";
import { baseRules, type CoreRules } from "./rules";
import { attemptOf, withAttempt } from "./run/attempt";
import { CATALOG } from "./run/catalog";
import { advanceTo, setupRun } from "./run/run-test-support";
import { applyRunAction } from "./run/stages/registry";
import type { CampState, Objective } from "./state";

const SEATS = ["a", "b", "c"] as const;

const winCard = (id: string, ownerSeatId: string | null = null): Objective => ({ id, kind: "win-card", target: { kind: "standard", suit: "hearts", rank: 9 }, ownerSeatId });
const noTricks = (id: string, ownerSeatId: string | null = null): Objective => ({ id, kind: "no-tricks", ownerSeatId });
const exactly = (id: string, ownerSeatId: string | null = null): Objective => ({ id, kind: "exactly-n", n: 2, ownerSeatId });
const ordered = (id: string, ownerSeatId: string | null = null): Objective => ({ id, kind: "ordered", target: { kind: "standard", suit: "hearts", rank: 6 }, order: 1, ownerSeatId });

/** A camp at objective-pick whose pick order starts at `a`. */
function pickCamp(objectives: Objective[]): CampState {
  return {
    seatIds: [...SEATS],
    expeditionLeaderSeatId: "a",
    objectives,
    hands: SEATS.map((seatId) => ({ seatId, cards: [] })),
    completedTricks: [],
    voidedTricks: [],
    discards: [],
    removedCards: [],
    totalTricks: 3,
    playerCount: 3,
    currentTrick: { index: 0, leaderSeatId: "a", plays: [] },
  } as unknown as CampState;
}

describe("objectivesConflict", () => {
  it("makes no-tricks conflict with a card, an ordered card and an exact count, and nothing else", () => {
    expect(objectivesConflict(noTricks("n"), winCard("w"))).toBe(true);
    expect(objectivesConflict(ordered("o"), noTricks("n"))).toBe(true);
    expect(objectivesConflict(noTricks("n"), exactly("e"))).toBe(true);
    expect(objectivesConflict(noTricks("n"), noTricks("m"))).toBe(false);
    expect(objectivesConflict(winCard("w"), ordered("o"))).toBe(false);
    expect(objectivesConflict(winCard("w"), exactly("e"))).toBe(false);
  });
});

describe("picking with a conflict", () => {
  it("refuses a conflicting pick while another open objective does not conflict", () => {
    const state = pickCamp([noTricks("n1", "c"), winCard("w2", "b"), winCard("w"), noTricks("n2")]);
    expect(currentActorSeatId(state)).toBe("c");
    expect(canPickObjective(state, "c", "w")).toEqual({ legal: false, reason: "objective_conflict" });
    expect(applyCampAction(state, "c", { type: "pick-objective", objectiveId: "w" })).toEqual({ ok: false, error: "objective_conflict" });
    expect(canPickObjective(state, "c", "n2")).toEqual({ legal: true });
  });

  it("passes the pick to the next seat when every open objective conflicts for the picker", () => {
    const state = pickCamp([noTricks("n1", "c"), winCard("w0", "a"), winCard("w"), ordered("o")]);
    expect(currentActorSeatId(state)).toBe("a");
    expect(canPickObjective(state, "c", "w")).toEqual({ legal: false, reason: "not_your_turn" });
    expect(canPickObjective(state, "a", "w")).toEqual({ legal: true });
  });

  it("skips every seat that has no clean choice, in pick order", () => {
    const state = pickCamp([noTricks("n1", "c"), noTricks("n2", "a"), winCard("w"), ordered("o")]);
    // Scheduled: c. Both open objectives conflict for c and for a; b holds nothing.
    expect(currentActorSeatId(state)).toBe("b");
  });

  it("lets the scheduled picker pick as before when no seat has a clean choice", () => {
    const state = pickCamp([noTricks("n1", "a"), noTricks("n2", "b"), noTricks("n3", "c"), winCard("w1")]);
    expect(currentActorSeatId(state)).toBe("a");
    expect(canPickObjective(state, "a", "w1")).toEqual({ legal: true });
  });

  it("follows the composed pick order, so a first-pick hook still comes first and the passes follow the same order", () => {
    const firstC: CoreRules = { ...baseRules, objectivePicker: (state, picked) => (picked === 0 ? "c" : baseRules.objectivePicker(state, picked - 1)) };
    const fresh = pickCamp([winCard("w1"), winCard("w2"), noTricks("n1")]);
    expect(currentActorSeatId(fresh, firstC)).toBe("c");
    // Two picked: the schedule reaches b (who holds a no-tricks), then c (also one), then a, who holds nothing.
    const taken = pickCamp([noTricks("n1", "c"), noTricks("n2", "b"), winCard("w1"), winCard("w2")]);
    expect(currentActorSeatId(taken, firstC)).toBe("a");
    expect(canPickObjective(taken, "a", "w1", firstC)).toEqual({ legal: true });
    expect(canPickObjective(taken, "b", "w1", firstC)).toEqual({ legal: false, reason: "not_your_turn" });
  });
});

describe("a bot's pick", () => {
  it("takes an objective that does not conflict, not simply the first open one", () => {
    const run = advanceTo(setupRun({ seatIds: [...SEATS], seed: "conflict-bot", catalog: CATALOG }), "objective-pick", CATALOG);
    const attempt = attemptOf(run)!;
    const camp = attempt.camp;
    const scheduled = camp.seatIds[(camp.seatIds.indexOf(camp.expeditionLeaderSeatId) + 1) % camp.seatIds.length]!;
    const objectives: Objective[] = [noTricks("held", scheduled), winCard("w"), noTricks("n2")];
    const forced = withAttempt(run, { ...attempt, camp: { ...camp, objectives } });
    expect(currentActorSeatId(attemptOf(forced)!.camp)).toBe(scheduled);
    const move = botMove(forced, [scheduled], CATALOG);
    expect(move).toEqual({ seatId: scheduled, request: { type: "pick-objective", objectiveId: "n2" } });
    expect(applyRunAction(forced, scheduled, move!.request, CATALOG).ok).toBe(true);
  });
});

describe("the last seats without an objective take the no-tricks one", () => {
  it("makes the last seat with no objective take an open no-tricks objective", () => {
    // a and b hold cards; c holds nothing, and one no-tricks objective is open.
    const state = pickCamp([winCard("w1", "a"), winCard("w2", "b"), winCard("w3"), noTricks("n")]);
    expect(currentActorSeatId(state)).toBe("c");
    expect(mustTakeNoTricks(state, "c")).toBe(true);
    expect(canPickObjective(state, "c", "w3")).toEqual({ legal: false, reason: "objective_reserved" });
    expect(canPickObjective(state, "c", "n")).toEqual({ legal: true });
  });

  it("leaves the choice free while more seats without an objective remain", () => {
    const state = pickCamp([winCard("w1"), winCard("w2"), noTricks("n")]);
    expect(mustTakeNoTricks(state, "a")).toBe(false);
    expect(canPickObjective(state, "a", "w1")).toEqual({ legal: true });
  });

  it("never binds a seat that already holds an objective", () => {
    const state = pickCamp([winCard("w1", "a"), winCard("w2", "b"), winCard("w3", "c"), winCard("w4"), noTricks("n")]);
    expect(mustTakeNoTricks(state, "a")).toBe(false);
  });
});
