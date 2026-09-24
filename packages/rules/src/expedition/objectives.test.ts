// Tests for Expedition objective evaluation (Phase 9, Plan 03). Fixtures are
// hand-built CampState objects via the local makeState helper — createCamp
// does not exist until Plan 04.

import { describe, expect, it } from "vitest";
import type {
  CampState,
  CardIdentity,
  CompletedTrick,
  ExactlyNObjective,
  ExpeditionCard,
  NoTricksObjective,
  StandardIdentity,
  StandardRank,
  Suit,
  WinCardObjective,
} from "./state";
import {
  countTricksWon,
  exactlyNKind,
  isCampFinished,
  noTricksKind,
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
    plays: plays.map(([seatId, identity], i) => ({
      seatId,
      card: card(identity, `c${index}-${i}`),
    })),
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
    ...overrides,
  };
}

function winCardObjective(
  id: string,
  target: StandardIdentity,
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
