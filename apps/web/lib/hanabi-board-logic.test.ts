import { describe, expect, it } from "vitest";
import type { HanabiView } from "@games/rules";
import {
  bandForView,
  clueTouchCountForTarget,
  cluableColorsForView,
  isDiscardDisabled,
  isGiveClueDisabled,
  isPlayDisabled,
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
