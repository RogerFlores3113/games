import { describe, expect, it } from "vitest";
import type { HanabiView } from "@games/rules";
import { MAX_FUSES } from "@games/rules";
import {
  bandForView,
  clueTouchCountForTarget,
  clueTouchIdsForTarget,
  cluableColorsForView,
  fusesRemainingForView,
  isDiscardDisabled,
  isGiveClueDisabled,
  isPlayDisabled,
  isSeatConnected,
  turnIndicatorText,
} from "./hanabi-board-logic";

function baseView(overrides: Partial<HanabiView> = {}): HanabiView {
  return {
    variant: "base",
    yourSeatId: "seat-a",
    yourHand: [
      { id: "a1", hidden: true, facts: { possibleSuits: [], possibleRanks: [], positiveClues: [], negativeClues: [] } },
    ],
    otherHands: [
      {
        seatId: "seat-b",
        cards: [
          {
            id: "b1",
            hidden: false,
            suit: "red",
            rank: 3,
            facts: { possibleSuits: [], possibleRanks: [], positiveClues: [], negativeClues: [] },
          },
        ],
      },
    ],
    stacks: [],
    discard: [],
    clueTokens: 8,
    fuses: 0,
    deckCount: 30,
    finalTurnsRemaining: null,
    activeSeatId: "seat-a",
    isYourTurn: true,
    score: 0,
    history: [],
    ...overrides,
  };
}

describe("clueTouchCountForTarget", () => {
  it("counts a rank clue naming a rank present in the target's hand as at least 1", () => {
    const view = baseView();
    expect(clueTouchCountForTarget(view, "seat-b", { type: "rank", value: 3 })).toBeGreaterThanOrEqual(1);
  });

  it("counts a rank clue naming a rank absent from the hand as 0", () => {
    const view = baseView();
    expect(clueTouchCountForTarget(view, "seat-b", { type: "rank", value: 5 })).toBe(0);
  });

  it("counts a matching color clue", () => {
    const view = baseView();
    expect(clueTouchCountForTarget(view, "seat-b", { type: "color", value: "red" })).toBe(1);
  });

  it("counts a non-matching color clue as 0", () => {
    const view = baseView();
    expect(clueTouchCountForTarget(view, "seat-b", { type: "color", value: "blue" })).toBe(0);
  });

  it("in the rainbow variant, a colour clue touches rainbow cards as well as the named colour", () => {
    const view = baseView({
      variant: "rainbow",
      otherHands: [
        {
          seatId: "seat-b",
          cards: [
            {
              id: "b1",
              hidden: false,
              suit: "rainbow",
              rank: 2,
              facts: { possibleSuits: [], possibleRanks: [], positiveClues: [], negativeClues: [] },
            },
          ],
        },
      ],
    });
    expect(clueTouchCountForTarget(view, "seat-b", { type: "color", value: "blue" })).toBe(1);
  });

  it("does not count hidden cards", () => {
    const view = baseView({
      otherHands: [
        {
          seatId: "seat-b",
          cards: [{ id: "b1", hidden: true, facts: { possibleSuits: [], possibleRanks: [], positiveClues: [], negativeClues: [] } }],
        },
      ],
    });
    expect(clueTouchCountForTarget(view, "seat-b", { type: "color", value: "red" })).toBe(0);
  });
});

describe("clueTouchIdsForTarget", () => {
  const twoCardView = () =>
    baseView({
      otherHands: [
        {
          seatId: "seat-b",
          cards: [
            {
              id: "b1",
              hidden: false,
              suit: "red",
              rank: 3,
              facts: { possibleSuits: [], possibleRanks: [], positiveClues: [], negativeClues: [] },
            },
            {
              id: "b2",
              hidden: false,
              suit: "blue",
              rank: 3,
              facts: { possibleSuits: [], possibleRanks: [], positiveClues: [], negativeClues: [] },
            },
          ],
        },
      ],
    });

  it("returns exactly the ids of visible cards a rank clue touches", () => {
    const view = twoCardView();
    expect(clueTouchIdsForTarget(view, "seat-b", { type: "rank", value: 3 })).toEqual(["b1", "b2"]);
  });

  it("returns exactly the ids of visible cards a color clue touches", () => {
    const view = twoCardView();
    expect(clueTouchIdsForTarget(view, "seat-b", { type: "color", value: "red" })).toEqual(["b1"]);
  });

  it("returns [] for an unknown seat", () => {
    const view = twoCardView();
    expect(clueTouchIdsForTarget(view, "seat-z", { type: "color", value: "red" })).toEqual([]);
  });

  it("in the rainbow variant, a color clue touches rainbow cards", () => {
    const view = baseView({
      variant: "rainbow",
      otherHands: [
        {
          seatId: "seat-b",
          cards: [
            {
              id: "b1",
              hidden: false,
              suit: "rainbow",
              rank: 2,
              facts: { possibleSuits: [], possibleRanks: [], positiveClues: [], negativeClues: [] },
            },
          ],
        },
      ],
    });
    expect(clueTouchIdsForTarget(view, "seat-b", { type: "color", value: "blue" })).toEqual(["b1"]);
  });

  it("never includes hidden cards", () => {
    const view = baseView({
      otherHands: [
        {
          seatId: "seat-b",
          cards: [{ id: "b1", hidden: true, facts: { possibleSuits: [], possibleRanks: [], positiveClues: [], negativeClues: [] } }],
        },
      ],
    });
    expect(clueTouchIdsForTarget(view, "seat-b", { type: "color", value: "red" })).toEqual([]);
  });

  it("agrees with clueTouchCountForTarget's count for the same fixtures", () => {
    const view = twoCardView();
    const clue = { type: "rank" as const, value: 3 as const };
    expect(clueTouchCountForTarget(view, "seat-b", clue)).toBe(
      clueTouchIdsForTarget(view, "seat-b", clue).length,
    );
  });
});

describe("isPlayDisabled", () => {
  it("is true when it is not your turn", () => {
    expect(isPlayDisabled(baseView({ isYourTurn: false }))).toBe(true);
  });

  it("is false when it is your turn", () => {
    expect(isPlayDisabled(baseView({ isYourTurn: true }))).toBe(false);
  });
});

describe("isDiscardDisabled", () => {
  it("is true when it is not your turn", () => {
    expect(isDiscardDisabled(baseView({ isYourTurn: false, clueTokens: 3 }))).toBe(true);
  });

  it("is true when clue tokens are at the max of 8", () => {
    expect(isDiscardDisabled(baseView({ isYourTurn: true, clueTokens: 8 }))).toBe(true);
  });

  it("is false when it is your turn and clue tokens are below 8", () => {
    expect(isDiscardDisabled(baseView({ isYourTurn: true, clueTokens: 7 }))).toBe(false);
  });
});

describe("isGiveClueDisabled", () => {
  it("is true when it is not your turn", () => {
    const view = baseView({ isYourTurn: false });
    expect(isGiveClueDisabled(view, "seat-b", { type: "color", value: "red" })).toBe(true);
  });

  it("is true when there are zero clue tokens", () => {
    const view = baseView({ clueTokens: 0 });
    expect(isGiveClueDisabled(view, "seat-b", { type: "color", value: "red" })).toBe(true);
  });

  it("is true when the selected target+clue touches zero visible cards", () => {
    const view = baseView();
    expect(isGiveClueDisabled(view, "seat-b", { type: "color", value: "blue" })).toBe(true);
  });

  it("is false when it is your turn, tokens remain, and the clue touches at least one card", () => {
    const view = baseView();
    expect(isGiveClueDisabled(view, "seat-b", { type: "color", value: "red" })).toBe(false);
  });
});

describe("bandForView", () => {
  it("returns the engine's band string for the score and variant max score", () => {
    const view = baseView({ score: 0 });
    expect(bandForView(view)).toBe("Oh no!");
  });

  it("returns Legendary for a perfect base-game score", () => {
    const view = baseView({ score: 25 });
    expect(bandForView(view)).toBe("Legendary");
  });
});

describe("fusesRemainingForView", () => {
  it("is 3 for a fresh game (fuses used 0)", () => {
    expect(fusesRemainingForView(baseView({ fuses: 0 }))).toBe(3);
  });

  it("is 2 after one misplay", () => {
    expect(fusesRemainingForView(baseView({ fuses: 1 }))).toBe(2);
  });

  it("is 0 at game over from fuses", () => {
    expect(fusesRemainingForView(baseView({ fuses: 3 }))).toBe(0);
  });

  it("is 0 when fuses used equals MAX_FUSES imported from @games/rules", () => {
    expect(fusesRemainingForView(baseView({ fuses: MAX_FUSES }))).toBe(0);
  });
});

describe("D-07: seat connection + turn text", () => {
  it("isSeatConnected reads the seat's connected flag", () => {
    expect(isSeatConnected([{ seatId: "a", connected: true }], "a")).toBe(true);
    expect(isSeatConnected([{ seatId: "a", connected: false }], "a")).toBe(false);
  });

  it("isSeatConnected treats an unknown seat as connected (no false disconnected alarm)", () => {
    expect(isSeatConnected([{ seatId: "a", connected: false }], "missing")).toBe(true);
  });

  it("turnIndicatorText returns 'Your turn' when it is the viewer's turn", () => {
    const seats = [{ seatId: "a", connected: false }];
    expect(
      turnIndicatorText({ isYourTurn: true, activeSeatId: "a" }, seats, () => "Anyone"),
    ).toBe("Your turn");
  });

  it("turnIndicatorText returns 'Waiting for {name}' when the active seat is connected", () => {
    const seats = [{ seatId: "b", connected: true }];
    expect(
      turnIndicatorText({ isYourTurn: false, activeSeatId: "b" }, seats, (id) =>
        id === "b" ? "Bianca" : "…",
      ),
    ).toBe("Waiting for Bianca");
  });

  it("turnIndicatorText appends the em-dash disconnected suffix when the active seat is disconnected", () => {
    const seats = [{ seatId: "b", connected: false }];
    expect(
      turnIndicatorText({ isYourTurn: false, activeSeatId: "b" }, seats, (id) =>
        id === "b" ? "Bianca" : "…",
      ),
    ).toBe("Waiting for Bianca — disconnected");
  });

  it("turnIndicatorText says 'Game over' once the game has ended, even if the engine advanced the turn to the viewer", () => {
    const seats = [{ seatId: "a", connected: true }, { seatId: "b", connected: true }];
    expect(
      turnIndicatorText({ isYourTurn: true, activeSeatId: "a" }, seats, () => "Anyone", true),
    ).toBe("Game over");
    expect(
      turnIndicatorText({ isYourTurn: false, activeSeatId: "b" }, seats, () => "Bianca", true),
    ).toBe("Game over");
  });
});

describe("cluableColorsForView", () => {
  it("excludes rainbow for the rainbow variant", () => {
    const view = baseView({ variant: "rainbow" });
    expect(cluableColorsForView(view)).not.toContain("rainbow");
  });

  it("includes black for the black variant", () => {
    const view = baseView({ variant: "black" });
    expect(cluableColorsForView(view)).toContain("black");
  });
});
