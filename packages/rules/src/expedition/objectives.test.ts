// Tests for Expedition objective evaluation (Phase 9, Plan 03). Fixtures are
// hand-built CampState objects via the local makeState helper — createCamp
// does not exist until Plan 04.

import { describe, expect, it } from "vitest";
import { cardLabel } from "./deck";
import { baseRules } from "./rules";
import { resolvedPlay } from "./test-support";
import type {
  CampState,
  CardIdentity,
  CompletedTrick,
  ExactlyNObjective,
  ExpeditionCard,
  NoTricksObjective,
  Objective,
  OrderedObjective,
  OrderMarker,
  StandardIdentity,
  StandardRank,
  Suit,
  WinCardObjective,
} from "./state";
import {
  countTricksWon,
  describeObjective,
  evaluateObjective,
  exactlyNKind,
  isCampFinished,
  nextObjectivePicker,
  noTricksKind,
  objectiveStatuses,
  OBJECTIVE_KINDS,
  orderedKind,
  trickContaining,
  tricksRemaining,
  winCardKind,
} from "./objectives";

function std(suit: Suit, rank: StandardRank): StandardIdentity {
  return { kind: "standard", suit, rank };
}

const CARD_A = std("spades", 14); // A♠
const CARD_B = std("hearts", 10);
const CARD_C = std("diamonds", 7);

function card(identity: CardIdentity, id: string): ExpeditionCard {
  return { id, identity };
}

function trick(
  index: number,
  plays: ReadonlyArray<readonly [string, CardIdentity]>,
  winnerSeatId: string,
): CompletedTrick {
  return {
    index,
    leaderSeatId: plays[0]![0],
    plays: plays.map(([seatId, identity], i) => resolvedPlay(seatId, card(identity, `c${index}-${i}`))),
    winnerSeatId,
  };
}

function makeState(overrides: Partial<CampState> = {}): CampState {
  return {
    seatIds: ["a", "b", "c"],
    playerCount: 3,
    removedCards: [],
    totalTricks: 5,
    hands: [],
    expeditionLeaderSeatId: "a",
    objectives: [],
    objectiveDeck: [],
    completedTricks: [],
    currentTrick: { index: 0, leaderSeatId: "a", plays: [] },
    discards: [], voidedTricks: [],
    ...overrides,
  };
}

function winCardObjective(
  id: string,
  target: CardIdentity,
  ownerSeatId: string | null,
): WinCardObjective {
  return { id, kind: "win-card", target, ownerSeatId };
}

function noTricksObjective(id: string, ownerSeatId: string | null): NoTricksObjective {
  return { id, kind: "no-tricks", ownerSeatId };
}

function exactlyNObjective(id: string, n: number, ownerSeatId: string | null): ExactlyNObjective {
  return { id, kind: "exactly-n", n, ownerSeatId };
}

function orderedObjective(
  id: string,
  target: StandardIdentity,
  order: OrderMarker,
  ownerSeatId: string | null,
): OrderedObjective {
  return { id, kind: "ordered", target, order, ownerSeatId };
}

describe("derivation helpers", () => {
  it("countTricksWon counts completedTricks whose winnerSeatId matches", () => {
    const state = makeState({
      completedTricks: [
        trick(0, [["a", CARD_A]], "a"),
        trick(1, [["b", CARD_B]], "b"),
        trick(2, [["a", CARD_C]], "a"),
      ],
    });
    expect(countTricksWon(state, "a")).toBe(2);
    expect(countTricksWon(state, "b")).toBe(1);
    expect(countTricksWon(state, "c")).toBe(0);
  });

  it("tricksRemaining is totalTricks minus completedTricks.length", () => {
    const state = makeState({ totalTricks: 5, completedTricks: [trick(0, [["a", CARD_A]], "a")] });
    expect(tricksRemaining(state)).toBe(4);
  });

  it("isCampFinished is true when completedTricks equals totalTricks", () => {
    const unfinished = makeState({ totalTricks: 2, completedTricks: [trick(0, [["a", CARD_A]], "a")] });
    expect(isCampFinished(unfinished)).toBe(false);
    const finished = makeState({
      totalTricks: 2,
      completedTricks: [trick(0, [["a", CARD_A]], "a"), trick(1, [["b", CARD_B]], "b")],
    });
    expect(isCampFinished(finished)).toBe(true);
  });

  it("trickContaining finds the completed trick holding a play with that identity", () => {
    const state = makeState({
      completedTricks: [trick(0, [["a", CARD_A]], "a"), trick(1, [["b", CARD_B]], "b")],
    });
    expect(trickContaining(state, CARD_B)?.index).toBe(1);
  });

  it("trickContaining returns undefined for a card only in the in-progress currentTrick", () => {
    const state = makeState({
      currentTrick: { index: 0, leaderSeatId: "a", plays: [{ seatId: "a", card: card(CARD_A, "x") }] },
    });
    expect(trickContaining(state, CARD_A)).toBeUndefined();
  });
});

describe("win-card", () => {
  it("is pending before its card is in a completed trick", () => {
    const objective = winCardObjective("o1", CARD_A, "a");
    const state = makeState();
    expect(winCardKind.evaluate(state, objective)).toBe("pending");
  });

  it("is done when the trick's winner is the owner", () => {
    const objective = winCardObjective("o1", CARD_A, "a");
    const state = makeState({ completedTricks: [trick(0, [["a", CARD_A], ["b", CARD_B]], "a")] });
    expect(winCardKind.evaluate(state, objective)).toBe("done");
  });

  it("is failed when anyone else won it", () => {
    const objective = winCardObjective("o1", CARD_A, "a");
    const state = makeState({ completedTricks: [trick(0, [["a", CARD_A], ["b", CARD_B]], "b")] });
    expect(winCardKind.evaluate(state, objective)).toBe("failed");
  });

  it("is pending when unowned", () => {
    const objective = winCardObjective("o1", CARD_A, null);
    const state = makeState({ completedTricks: [trick(0, [["a", CARD_A]], "b")] });
    expect(winCardKind.evaluate(state, objective)).toBe("pending");
  });
});

describe("lost and never-played targets", () => {
  /** A trick where `a` leads CARD_A, read as `fate` says, and `b` wins with CARD_B. */
  function trickWith(index: number, fate: { burned?: boolean; countsAs?: CardIdentity }): CompletedTrick {
    return {
      index,
      leaderSeatId: "a",
      plays: [
        { seatId: "a", card: card(CARD_A, `t${index}-a`), countsAs: fate.countsAs ?? null, burned: fate.burned ?? false },
        resolvedPlay("b", card(CARD_B, `t${index}-b`)),
      ],
      winnerSeatId: "b",
    };
  }
  const orderedA = orderedObjective("o1", CARD_A, 1, "a");

  it("a burned target fails its objective at once", () => {
    const state = makeState({ completedTricks: [trickWith(0, { burned: true })] });
    expect(winCardKind.evaluate(state, winCardObjective("o1", CARD_A, "a"))).toBe("failed");
    expect(orderedKind.evaluate(state, orderedA)).toBe("failed");
  });

  it("a target that counted as another identity fails its objective", () => {
    const state = makeState({ completedTricks: [trickWith(0, { countsAs: std("hearts", 14) })] });
    expect(winCardKind.evaluate(state, winCardObjective("o1", CARD_A, "a"))).toBe("failed");
  });

  it("a card counting as the target settles it for whoever won that trick", () => {
    const state = makeState({ completedTricks: [trickWith(0, { countsAs: CARD_C })] });
    expect(winCardKind.evaluate(state, winCardObjective("o1", CARD_C, "b"))).toBe("done");
    expect(winCardKind.evaluate(state, winCardObjective("o2", CARD_C, "a"))).toBe("failed");
  });

  it("a discarded target fails, and stays failed when a card later counts as it", () => {
    const discarded = makeState({ discards: [{ card: card(CARD_A, "gone"), afterTrick: 0 }] });
    expect(winCardKind.evaluate(discarded, winCardObjective("o1", CARD_A, "a"))).toBe("failed");
    const later = { ...discarded, completedTricks: [{ index: 0, leaderSeatId: "a", plays: [{ ...resolvedPlay("a", card(CARD_B, "x")), countsAs: CARD_A }], winnerSeatId: "a" }] };
    expect(winCardKind.evaluate(later, winCardObjective("o1", CARD_A, "a"))).toBe("failed");
  });

  it("a target won before it was lost stays done", () => {
    const won = trick(0, [["a", CARD_C], ["b", CARD_A]], "a");
    const state = makeState({ completedTricks: [won, trickWith(1, { burned: true })] });
    expect(winCardKind.evaluate(state, winCardObjective("o1", CARD_A, "a"))).toBe("done");
  });

  it("a target never played by the final trick fails", () => {
    const finished = makeState({ totalTricks: 1, completedTricks: [trick(0, [["a", CARD_B]], "a")] });
    expect(winCardKind.evaluate(finished, winCardObjective("o1", CARD_A, "a"))).toBe("failed");
    expect(orderedKind.evaluate(finished, orderedA)).toBe("failed");
    expect(winCardKind.evaluate({ ...finished, totalTricks: 2 }, winCardObjective("o1", CARD_A, "a"))).toBe("pending");
  });

  it("a joker target is won like any card", () => {
    const sun: CardIdentity = { kind: "joker", joker: "sun" };
    const state = makeState({ completedTricks: [trick(0, [["a", sun], ["b", CARD_B]], "a")] });
    expect(winCardKind.evaluate(state, winCardObjective("o1", sun, "a"))).toBe("done");
  });
});

describe("no-tricks", () => {
  it("is pending while owner has 0 tricks and camp is unfinished", () => {
    const objective = noTricksObjective("o1", "a");
    const state = makeState({ totalTricks: 3, completedTricks: [trick(0, [["b", CARD_B]], "b")] });
    expect(noTricksKind.evaluate(state, objective)).toBe("pending");
  });

  it("fails as soon as the owner has won 1 trick", () => {
    const objective = noTricksObjective("o1", "a");
    const state = makeState({ totalTricks: 3, completedTricks: [trick(0, [["a", CARD_A]], "a")] });
    expect(noTricksKind.evaluate(state, objective)).toBe("failed");
  });

  it("is done at camp end with 0 tricks won", () => {
    const objective = noTricksObjective("o1", "a");
    const state = makeState({
      totalTricks: 2,
      completedTricks: [trick(0, [["b", CARD_B]], "b"), trick(1, [["c", CARD_C]], "c")],
    });
    expect(noTricksKind.evaluate(state, objective)).toBe("done");
  });

  it("is pending when unowned", () => {
    const objective = noTricksObjective("o1", null);
    const state = makeState({
      totalTricks: 1,
      completedTricks: [trick(0, [["a", CARD_A]], "a")],
    });
    expect(noTricksKind.evaluate(state, objective)).toBe("pending");
  });
});

describe("exactly-n", () => {
  it("fails when the holder exceeds n (exceeded)", () => {
    const objective = exactlyNObjective("o1", 2, "a");
    const state = makeState({
      totalTricks: 10,
      completedTricks: [
        trick(0, [["a", CARD_A]], "a"),
        trick(1, [["a", CARD_B]], "a"),
        trick(2, [["a", CARD_C]], "a"),
        trick(3, [["b", CARD_B]], "b"),
      ],
    });
    expect(exactlyNKind.evaluate(state, objective)).toBe("failed");
  });

  it("fails when n has become mathematically unreachable before exceeding it", () => {
    const objective = exactlyNObjective("o1", 5, "a");
    const state = makeState({
      totalTricks: 10,
      completedTricks: [
        trick(0, [["b", CARD_A]], "b"),
        trick(1, [["b", CARD_B]], "b"),
        trick(2, [["b", CARD_C]], "b"),
        trick(3, [["c", CARD_A]], "c"),
        trick(4, [["c", CARD_B]], "c"),
        trick(5, [["c", CARD_C]], "c"),
      ],
    });
    // 0 won, 4 tricks remain: 0 + 4 < 5 -> unreachable
    expect(exactlyNKind.evaluate(state, objective)).toBe("failed");
  });

  it("is pending (not yet unreachable) when 0 won with 5 remaining and n=5", () => {
    const objective = exactlyNObjective("o1", 5, "a");
    const state = makeState({
      totalTricks: 10,
      completedTricks: [
        trick(0, [["b", CARD_A]], "b"),
        trick(1, [["b", CARD_B]], "b"),
        trick(2, [["b", CARD_C]], "b"),
        trick(3, [["c", CARD_A]], "c"),
        trick(4, [["c", CARD_B]], "c"),
      ],
    });
    // 0 won, 5 tricks remain: 0 + 5 = 5 -> reachable, still pending
    expect(exactlyNKind.evaluate(state, objective)).toBe("pending");
  });

  it("is done at camp end with exactly n tricks won", () => {
    const objective = exactlyNObjective("o1", 2, "a");
    const state = makeState({
      totalTricks: 2,
      completedTricks: [trick(0, [["a", CARD_A]], "a"), trick(1, [["a", CARD_B]], "a")],
    });
    expect(exactlyNKind.evaluate(state, objective)).toBe("done");
  });

  it("is failed at camp end with fewer than n tricks won", () => {
    const objective = exactlyNObjective("o1", 2, "a");
    const state = makeState({
      totalTricks: 2,
      completedTricks: [trick(0, [["a", CARD_A]], "a"), trick(1, [["b", CARD_B]], "b")],
    });
    expect(exactlyNKind.evaluate(state, objective)).toBe("failed");
  });

  it("is pending mid-camp with exactly n tricks won so far (A-END)", () => {
    const objective = exactlyNObjective("o1", 2, "a");
    const state = makeState({
      totalTricks: 5,
      completedTricks: [trick(0, [["a", CARD_A]], "a"), trick(1, [["a", CARD_B]], "a")],
    });
    expect(exactlyNKind.evaluate(state, objective)).toBe("pending");
  });

  it("n=0 behaves like no-tricks", () => {
    const objective = exactlyNObjective("o1", 0, "a");
    const failing = makeState({
      totalTricks: 5,
      completedTricks: [trick(0, [["a", CARD_A]], "a")],
    });
    expect(exactlyNKind.evaluate(failing, objective)).toBe("failed");

    const doneState = makeState({
      totalTricks: 1,
      completedTricks: [trick(0, [["b", CARD_B]], "b")],
    });
    expect(exactlyNKind.evaluate(doneState, objective)).toBe("done");
  });

  it("is pending when unowned", () => {
    const objective = exactlyNObjective("o1", 2, null);
    const state = makeState({ totalTricks: 2 });
    expect(exactlyNKind.evaluate(state, objective)).toBe("pending");
  });
});

describe("ordered", () => {
  it("is pending when unowned", () => {
    const objective = orderedObjective("o1", CARD_A, 1, null);
    const state = makeState({ objectives: [objective] });
    expect(orderedKind.evaluate(state, objective)).toBe("pending");
  });

  it("① card won by the wrong player fails (win-card failure applies to ordered too)", () => {
    const first = orderedObjective("first", CARD_A, 1, "a");
    const state = makeState({
      objectives: [first],
      completedTricks: [trick(0, [["a", CARD_A], ["b", CARD_B]], "b")],
    });
    expect(orderedKind.evaluate(state, first)).toBe("failed");
  });

  it("② won by its owner while ①'s card is not yet in any completed trick fails both", () => {
    const first = orderedObjective("first", CARD_A, 1, "a");
    const second = orderedObjective("second", CARD_B, 2, "b");
    const state = makeState({
      objectives: [first, second],
      totalTricks: 5,
      completedTricks: [trick(0, [["b", CARD_B], ["c", CARD_C]], "b")],
    });
    expect(orderedKind.evaluate(state, second)).toBe("failed");
    expect(orderedKind.evaluate(state, first)).toBe("failed");
  });

  it("X won in trick 1, Y won in trick 3 -> both done", () => {
    const first = orderedObjective("first", CARD_A, 1, "a");
    const second = orderedObjective("second", CARD_B, 2, "b");
    const state = makeState({
      objectives: [first, second],
      totalTricks: 5,
      completedTricks: [
        trick(0, [["a", CARD_A]], "a"),
        trick(1, [["c", CARD_C]], "c"),
        trick(2, [["b", CARD_B]], "b"),
      ],
    });
    expect(orderedKind.evaluate(state, first)).toBe("done");
    expect(orderedKind.evaluate(state, second)).toBe("done");
  });

  it("X and Y won in the same trick (A-TIE) -> both done", () => {
    // Both objectives owned by the same seat, which is recorded as the
    // trick's winner; the trick contains both target cards at the same
    // trick index, so neither objective is STRICTLY out of order.
    const first = orderedObjective("first", CARD_A, 1, "a");
    const second = orderedObjective("second", CARD_B, 2, "a");
    const state = makeState({
      objectives: [first, second],
      totalTricks: 5,
      completedTricks: [trick(0, [["a", CARD_A], ["b", CARD_B]], "a")],
    });
    expect(orderedKind.evaluate(state, first)).toBe("done");
    expect(orderedKind.evaluate(state, second)).toBe("done");
  });

  it("WR-01: ① stays failed after ② was won strictly earlier, even once ① is won by its owner (failed is absorbing)", () => {
    const first = orderedObjective("first", CARD_A, 1, "a");
    const second = orderedObjective("second", CARD_B, 2, "b");
    const s1 = makeState({
      objectives: [first, second],
      totalTricks: 5,
      completedTricks: [trick(0, [["b", CARD_B], ["c", CARD_C]], "b")],
    });
    expect(orderedKind.evaluate(s1, first)).toBe("failed");
    expect(orderedKind.evaluate(s1, second)).toBe("failed");

    const s2 = makeState({
      objectives: [first, second],
      totalTricks: 5,
      completedTricks: [
        trick(0, [["b", CARD_B], ["c", CARD_C]], "b"),
        trick(1, [["a", CARD_A], ["c", std("clubs", 3)]], "a"),
      ],
    });
    // Before the fix this read "done" once ① was won by its owner — but ②
    // (a higher marker) resolved strictly earlier, so ① must stay failed.
    expect(orderedKind.evaluate(s2, first)).toBe("failed");
    expect(orderedKind.evaluate(s2, second)).toBe("failed");
  });

  it("WR-01 (other order): a higher marker won strictly earlier, then the lower marker won by its own owner, still fails the lower marker", () => {
    const first = orderedObjective("first", CARD_A, 1, "a");
    const second = orderedObjective("second", CARD_B, 2, "b");
    const state = makeState({
      objectives: [first, second],
      totalTricks: 5,
      completedTricks: [
        trick(0, [["b", CARD_B]], "b"),
        trick(1, [["c", CARD_C]], "c"),
        trick(2, [["a", CARD_A]], "a"),
      ],
    });
    expect(orderedKind.evaluate(state, first)).toBe("failed");
  });

  it("'last' won by owner in the final trick (index totalTricks - 1) is done", () => {
    const last = orderedObjective("last-obj", CARD_A, "last", "a");
    const state = makeState({
      objectives: [last],
      totalTricks: 2,
      completedTricks: [trick(0, [["b", CARD_B]], "b"), trick(1, [["a", CARD_A]], "a")],
    });
    expect(orderedKind.evaluate(state, last)).toBe("done");
  });

  it("'last' won by owner in an earlier trick fails", () => {
    const last = orderedObjective("last-obj", CARD_A, "last", "a");
    const state = makeState({
      objectives: [last],
      totalTricks: 3,
      completedTricks: [trick(0, [["a", CARD_A]], "a")],
    });
    expect(orderedKind.evaluate(state, last)).toBe("failed");
  });

  it("'last' not yet won is pending", () => {
    const last = orderedObjective("last-obj", CARD_A, "last", "a");
    const state = makeState({ objectives: [last], totalTricks: 3 });
    expect(orderedKind.evaluate(state, last)).toBe("pending");
  });

  it("a numbered card still unwon when the 'last' card is won fails the numbered one", () => {
    const numbered = orderedObjective("numbered", CARD_B, 1, "b");
    const last = orderedObjective("last-obj", CARD_A, "last", "a");
    const state = makeState({
      objectives: [numbered, last],
      totalTricks: 3,
      completedTricks: [trick(0, [["c", CARD_C]], "c"), trick(1, [["a", CARD_A]], "a")],
    });
    expect(orderedKind.evaluate(state, numbered)).toBe("failed");
  });
});

describe("registry dispatch", () => {
  it("OBJECTIVE_KINDS has a def for all four kinds", () => {
    expect(OBJECTIVE_KINDS["win-card"]).toBe(winCardKind);
    expect(OBJECTIVE_KINDS["ordered"]).toBe(orderedKind);
    expect(OBJECTIVE_KINDS["no-tricks"]).toBe(noTricksKind);
    expect(OBJECTIVE_KINDS["exactly-n"]).toBe(exactlyNKind);
  });

  it("evaluateObjective dispatches through OBJECTIVE_KINDS by objective.kind", () => {
    const objective: Objective = winCardObjective("o1", CARD_A, "a");
    const state = makeState({ completedTricks: [trick(0, [["a", CARD_A]], "a")] });
    expect(evaluateObjective(state, objective)).toBe("done");
  });
});

describe("objectiveStatuses", () => {
  it("lists every objective's status in state.objectives order", () => {
    const o1 = winCardObjective("o1", CARD_A, "a");
    const o2 = noTricksObjective("o2", "b");
    const state = makeState({ objectives: [o1, o2] });
    expect(objectiveStatuses(state, baseRules)).toEqual([
      { objectiveId: "o1", status: "pending" },
      { objectiveId: "o2", status: "pending" },
    ]);
  });

  it("all pending on a state with no completed tricks", () => {
    const o1 = winCardObjective("o1", CARD_A, "a");
    const o2 = exactlyNObjective("o2", 2, "b");
    const state = makeState({ objectives: [o1, o2], totalTricks: 5 });
    expect(objectiveStatuses(state, baseRules).every((s) => s.status === "pending")).toBe(true);
  });
});

describe("nextObjectivePicker", () => {
  it("starts at the leader, goes clockwise, and wraps", () => {
    const seatIds = ["a", "b", "c", "d"];
    const picks = [0, 1, 2, 3, 4, 5].map((count) => nextObjectivePicker(seatIds, "c", count));
    expect(picks).toEqual(["c", "d", "a", "b", "c", "d"]);
  });

  it("throws when the leader is not in seatIds", () => {
    expect(() => nextObjectivePicker(["a", "b"], "z", 0)).toThrow();
  });
});

describe("describeObjective", () => {
  it("prefixes ordered objectives with a circled numeral", () => {
    const objective = orderedObjective("o1", CARD_A, 1, "a");
    expect(describeObjective(objective)).toContain("①");
  });

  it("prefixes ordered objectives above 9 with #N style", () => {
    const objective = orderedObjective("o1", CARD_A, 10, "a");
    expect(describeObjective(objective)).toContain("#10");
  });

  it("prefixes 'last' ordered objectives with Last:", () => {
    const objective = orderedObjective("o1", CARD_A, "last", "a");
    expect(describeObjective(objective)).toContain("Last:");
  });

  it("describes win-card, no-tricks, and exactly-n objectives", () => {
    expect(describeObjective(winCardObjective("o1", CARD_A, "a"))).toContain(cardLabel(CARD_A));
    expect(describeObjective(noTricksObjective("o2", "a"))).toBe("Win no tricks");
    expect(describeObjective(exactlyNObjective("o3", 3, "a"))).toBe("Win exactly 3 trick(s)");
  });
});
