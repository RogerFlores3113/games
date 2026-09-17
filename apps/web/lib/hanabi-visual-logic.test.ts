import { describe, expect, it } from "vitest";
import type { HanabiView } from "@games/rules";
import {
  luminosityStepFor,
  candidateDisplayFor,
  touchedCardIdsFromLatestClue,
  newlyCompletedStacks,
} from "./hanabi-visual-logic";
import type { CardFacts, HistoryEntry } from "./hanabi-visual-logic";

// Copied verbatim from hanabi-board-logic.test.ts's baseView fixture shape
// (do not import across test files).
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

function factsFor(partial: Partial<CardFacts> = {}): CardFacts {
  return {
    possibleSuits: [],
    possibleRanks: [],
    positiveClues: [],
    negativeClues: [],
    ...partial,
  };
}

const FIVE_SUITS = ["red", "yellow", "green", "blue", "white"] as const;
const FIVE_RANKS = [1, 2, 3, 4, 5] as const;

describe("luminosityStepFor", () => {
  it("is unclued with full candidates and no clues", () => {
    const facts = factsFor({ possibleSuits: [...FIVE_SUITS], possibleRanks: [...FIVE_RANKS] });
    expect(luminosityStepFor(facts)).toBe("unclued");
  });

  it("is unclued (anti-goal) when negative clues narrowed candidates but there are zero positive clues", () => {
    const facts = factsFor({
      possibleSuits: ["red", "blue"],
      possibleRanks: [...FIVE_RANKS],
      negativeClues: [{ type: "color", value: "green" }],
    });
    expect(luminosityStepFor(facts)).toBe("unclued");
  });

  it("is touched with one positive color clue and possibleSuits narrowed to one suit but ranks unnarrowed", () => {
    const facts = factsFor({
      possibleSuits: ["red"],
      possibleRanks: [...FIVE_RANKS],
      positiveClues: [{ type: "color", value: "red" }],
    });
    expect(luminosityStepFor(facts)).toBe("touched");
  });

  it("is known when possibleSuits and possibleRanks both have length 1, even with empty positiveClues", () => {
    const facts = factsFor({ possibleSuits: ["red"], possibleRanks: [3] });
    expect(luminosityStepFor(facts)).toBe("known");
  });
});

describe("candidateDisplayFor", () => {
  it("has 5 suit entries in variantConfig('base').suits order for base variant", () => {
    const facts = factsFor({ possibleSuits: [...FIVE_SUITS], possibleRanks: [...FIVE_RANKS] });
    const display = candidateDisplayFor(facts, "base");
    expect(display.suits.map((s) => s.suit)).toEqual(["red", "yellow", "green", "blue", "white"]);
  });

  it("includes rainbow for the rainbow variant", () => {
    const facts = factsFor({ possibleSuits: ["rainbow"], possibleRanks: [...FIVE_RANKS] });
    const display = candidateDisplayFor(facts, "rainbow");
    expect(display.suits.map((s) => s.suit)).toContain("rainbow");
  });

  it("includes black for the black variant", () => {
    const facts = factsFor({ possibleSuits: ["black"], possibleRanks: [...FIVE_RANKS] });
    const display = candidateDisplayFor(facts, "black");
    expect(display.suits.map((s) => s.suit)).toContain("black");
  });

  it("flags a suit absent from possibleSuits as not possible", () => {
    const facts = factsFor({ possibleSuits: ["red"], possibleRanks: [...FIVE_RANKS] });
    const display = candidateDisplayFor(facts, "base");
    const blue = display.suits.find((s) => s.suit === "blue");
    expect(blue?.possible).toBe(false);
    const red = display.suits.find((s) => s.suit === "red");
    expect(red?.possible).toBe(true);
  });

  it("always lists ranks 1..5 in order with possible flags", () => {
    const facts = factsFor({ possibleSuits: [...FIVE_SUITS], possibleRanks: [1, 3] });
    const display = candidateDisplayFor(facts, "base");
    expect(display.ranks.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(display.ranks.find((r) => r.rank === 1)?.possible).toBe(true);
    expect(display.ranks.find((r) => r.rank === 2)?.possible).toBe(false);
  });

  it("confirmedSuit is the suit only when possibleSuits.length === 1, else null", () => {
    const narrowed = candidateDisplayFor(factsFor({ possibleSuits: ["red"], possibleRanks: [...FIVE_RANKS] }), "base");
    expect(narrowed.confirmedSuit).toBe("red");
    const notNarrowed = candidateDisplayFor(
      factsFor({ possibleSuits: ["red", "blue"], possibleRanks: [...FIVE_RANKS] }),
      "base",
    );
    expect(notNarrowed.confirmedSuit).toBeNull();
  });

  it("confirmedRank is the rank only when possibleRanks.length === 1, else null", () => {
    const narrowed = candidateDisplayFor(factsFor({ possibleSuits: [...FIVE_SUITS], possibleRanks: [3] }), "base");
    expect(narrowed.confirmedRank).toBe(3);
    const notNarrowed = candidateDisplayFor(
      factsFor({ possibleSuits: [...FIVE_SUITS], possibleRanks: [3, 4] }),
      "base",
    );
    expect(notNarrowed.confirmedRank).toBeNull();
  });

  it("positiveMarks maps each positive clue to a mark, deduplicated, in first-seen order", () => {
    const facts = factsFor({
      possibleSuits: ["red"],
      possibleRanks: [...FIVE_RANKS],
      positiveClues: [
        { type: "color", value: "red" },
        { type: "rank", value: 3 },
        { type: "color", value: "red" },
      ],
    });
    const display = candidateDisplayFor(facts, "base");
    expect(display.positiveMarks).toEqual([
      { type: "color", suit: "red" },
      { type: "rank", rank: 3 },
    ]);
  });
});

describe("touchedCardIdsFromLatestClue", () => {
  const clueEntry: HistoryEntry = {
    turn: 0,
    type: "clue",
    seatId: "seat-a",
    targetSeatId: "seat-b",
    clue: { type: "color", value: "red" },
    touchedCardIds: ["b1", "b2"],
  };
  const playEntry: HistoryEntry = {
    turn: 1,
    type: "play",
    seatId: "seat-b",
    cardId: "b1",
    suit: "red",
    rank: 3,
    success: true,
  };
  const drawEntry: HistoryEntry = {
    turn: 1,
    type: "draw",
    seatId: "seat-b",
    cardId: "b3",
  };

  it("returns the last clue entry's touchedCardIds", () => {
    expect(touchedCardIdsFromLatestClue([clueEntry])).toEqual(["b1", "b2"]);
  });

  it("returns that clue's ids even with a trailing play+draw after it, using sinceIndex 0", () => {
    expect(touchedCardIdsFromLatestClue([clueEntry, playEntry, drawEntry], 0)).toEqual(["b1", "b2"]);
  });

  it("returns [] when sinceIndex is greater than the clue's index", () => {
    expect(touchedCardIdsFromLatestClue([clueEntry, playEntry, drawEntry], 3)).toEqual([]);
  });

  it("returns [] for empty history", () => {
    expect(touchedCardIdsFromLatestClue([])).toEqual([]);
  });
});

describe("newlyCompletedStacks", () => {
  it("returns suits whose topRank went from <5 to 5", () => {
    expect(
      newlyCompletedStacks([{ suit: "red", topRank: 4 }], [{ suit: "red", topRank: 5 }]),
    ).toEqual(["red"]);
  });

  it("returns [] when a stack stays at 5 -> 5", () => {
    expect(
      newlyCompletedStacks([{ suit: "red", topRank: 5 }], [{ suit: "red", topRank: 5 }]),
    ).toEqual([]);
  });
});

describe("identity tripwire (D-15)", () => {
  const ALLOWED_KEYS = new Set(["possibleSuits", "possibleRanks", "positiveClues", "negativeClues"]);

  function tripwireFacts(realFacts: CardFacts): CardFacts {
    const recordedKeys = new Set<string>();
    return new Proxy(realFacts, {
      get(target, prop, receiver) {
        if (typeof prop === "string") {
          recordedKeys.add(prop);
          if (!ALLOWED_KEYS.has(prop)) {
            throw new Error(`Identity leak: accessed disallowed key "${prop}"`);
          }
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as CardFacts & { __recordedKeys?: Set<string> };
  }

  it("luminosityStepFor never reads a key outside the four allowed CardFacts keys", () => {
    const realFacts: CardFacts = factsFor({ possibleSuits: ["red"], possibleRanks: [3] });
    const proxied = tripwireFacts(realFacts);
    expect(() => luminosityStepFor(proxied)).not.toThrow();
  });

  it("candidateDisplayFor never reads a key outside the four allowed CardFacts keys", () => {
    const realFacts: CardFacts = factsFor({ possibleSuits: ["red"], possibleRanks: [...FIVE_RANKS] });
    const proxied = tripwireFacts(realFacts);
    expect(() => candidateDisplayFor(proxied, "base")).not.toThrow();
  });
});
