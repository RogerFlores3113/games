import { describe, expect, it } from "vitest";
import type { HanabiView } from "@games/rules";
import {
  luminosityStepFor,
  touchedCardIdsFromLatestClue,
  newlyCompletedStacks,
  disabledReasonFor,
  endReasonForView,
  END_REASON_COPY,
  deckCountText,
  teammatesInTurnOrder,
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
    discardOrder: [],
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
});

describe("disabledReasonFor", () => {
  it("returns null when the action is allowed (play, your turn, card selected)", () => {
    const view = baseView({ isYourTurn: true });
    expect(
      disabledReasonFor(view, { kind: "play", selectedCardId: "a1" }, { reconnecting: false, ended: false }),
    ).toBeNull();
  });

  it("returns the ended reason first, for every kind", () => {
    const view = baseView({ isYourTurn: true });
    const ctx = { reconnecting: false, ended: true };
    expect(disabledReasonFor(view, { kind: "play", selectedCardId: "a1" }, ctx)).toBe("The game has ended");
    expect(disabledReasonFor(view, { kind: "discard", selectedCardId: "a1" }, ctx)).toBe("The game has ended");
    expect(
      disabledReasonFor(view, { kind: "clue", targetSeatId: "seat-b", clue: { type: "color", value: "red" } }, ctx),
    ).toBe("The game has ended");
  });

  it("returns the reconnecting reason second, even when ended is false", () => {
    const view = baseView({ isYourTurn: true });
    const ctx = { reconnecting: true, ended: false };
    expect(disabledReasonFor(view, { kind: "play", selectedCardId: "a1" }, ctx)).toBe(
      "Reconnecting — actions paused",
    );
  });

  it("returns 'Not your turn' for play, discard, and clue when isYourTurn is false", () => {
    const view = baseView({ isYourTurn: false });
    const ctx = { reconnecting: false, ended: false };
    expect(disabledReasonFor(view, { kind: "play", selectedCardId: "a1" }, ctx)).toBe("Not your turn");
    expect(disabledReasonFor(view, { kind: "discard", selectedCardId: "a1" }, ctx)).toBe("Not your turn");
    expect(
      disabledReasonFor(view, { kind: "clue", targetSeatId: "seat-b", clue: { type: "color", value: "red" } }, ctx),
    ).toBe("Not your turn");
  });

  it("returns 'Select a card in your hand first' for play with no selectedCardId", () => {
    const view = baseView({ isYourTurn: true });
    expect(
      disabledReasonFor(view, { kind: "play", selectedCardId: null }, { reconnecting: false, ended: false }),
    ).toBe("Select a card in your hand first");
  });

  it("returns the full-tokens discard reason before the selection check", () => {
    const view = baseView({ isYourTurn: true, clueTokens: 8 });
    expect(
      disabledReasonFor(view, { kind: "discard", selectedCardId: null }, { reconnecting: false, ended: false }),
    ).toBe("Clue tokens are full — you can't discard");
  });

  it("returns 'No clue tokens left' for clue with zero clue tokens", () => {
    const view = baseView({ isYourTurn: true, clueTokens: 0 });
    expect(
      disabledReasonFor(
        view,
        { kind: "clue", targetSeatId: "seat-b", clue: { type: "color", value: "red" } },
        { reconnecting: false, ended: false },
      ),
    ).toBe("No clue tokens left");
  });

  it("returns 'Choose a teammate to clue' when targetSeatId is null", () => {
    const view = baseView({ isYourTurn: true, clueTokens: 8 });
    expect(
      disabledReasonFor(
        view,
        { kind: "clue", targetSeatId: null, clue: { type: "color", value: "red" } },
        { reconnecting: false, ended: false },
      ),
    ).toBe("Choose a teammate to clue");
  });

  it("returns 'Choose a color or rank' when clue is null", () => {
    const view = baseView({ isYourTurn: true, clueTokens: 8 });
    expect(
      disabledReasonFor(
        view,
        { kind: "clue", targetSeatId: "seat-b", clue: null },
        { reconnecting: false, ended: false },
      ),
    ).toBe("Choose a color or rank");
  });

  it("returns the touch-nothing caption using ctx.labelFor when the clue touches zero cards", () => {
    const view = baseView({ isYourTurn: true, clueTokens: 8 });
    expect(
      disabledReasonFor(
        view,
        { kind: "clue", targetSeatId: "seat-b", clue: { type: "color", value: "blue" } },
        { reconnecting: false, ended: false, labelFor: () => "Bianca" },
      ),
    ).toBe("That clue wouldn't touch any of Bianca's cards");
  });
});

describe("endReasonForView", () => {
  it("returns fuses_exhausted when fuses used reaches MAX_FUSES, even if score is max", () => {
    const view = baseView({ variant: "base", fuses: 3, score: 25 });
    expect(endReasonForView(view)).toBe("fuses_exhausted");
  });

  it("returns all_stacks_complete at base score 25", () => {
    const view = baseView({ variant: "base", fuses: 0, score: 25, finalTurnsRemaining: null });
    expect(endReasonForView(view)).toBe("all_stacks_complete");
  });

  it("returns final_round_elapsed when finalTurnsRemaining is 0", () => {
    const view = baseView({ variant: "base", fuses: 0, score: 10, finalTurnsRemaining: 0 });
    expect(endReasonForView(view)).toBe("final_round_elapsed");
  });

  it("returns null when the game continues", () => {
    const view = baseView({ variant: "base", fuses: 0, score: 10, finalTurnsRemaining: null });
    expect(endReasonForView(view)).toBeNull();
  });

  it("uses 30 as the black variant's max score for all_stacks_complete", () => {
    const view = baseView({ variant: "black", fuses: 0, score: 30, finalTurnsRemaining: null });
    expect(endReasonForView(view)).toBe("all_stacks_complete");
  });

  it("END_REASON_COPY maps the three reasons to their exact strings", () => {
    expect(END_REASON_COPY.fuses_exhausted).toBe("Three fuses were lost.");
    expect(END_REASON_COPY.all_stacks_complete).toBe("Every stack was completed!");
    expect(END_REASON_COPY.final_round_elapsed).toBe("The deck ran out and the final round elapsed.");
  });
});

describe("deckCountText", () => {
  it("returns the plain deck-count copy when finalTurnsRemaining is null", () => {
    expect(deckCountText({ deckCount: 12, finalTurnsRemaining: null })).toBe("12 cards left in deck");
  });

  it("returns the final-round copy when finalTurnsRemaining is not null", () => {
    expect(deckCountText({ deckCount: 0, finalTurnsRemaining: 2 })).toBe("Final round — 2 turns left");
  });
});

describe("teammatesInTurnOrder", () => {
  const seatOrder = ["a", "b", "c", "d"];

  it("orders otherHands starting with the seat after the viewer in room seat order", () => {
    const otherHands = [{ seatId: "a" }, { seatId: "c" }, { seatId: "d" }];
    expect(teammatesInTurnOrder(otherHands, seatOrder, "b").map((h) => h.seatId)).toEqual(["c", "d", "a"]);
  });

  it("leaves otherHands unchanged when yourSeatId is null", () => {
    const otherHands = [{ seatId: "a" }, { seatId: "c" }];
    expect(teammatesInTurnOrder(otherHands, seatOrder, null)).toEqual(otherHands);
  });

  it("leaves otherHands unchanged when yourSeatId is absent from seatOrder", () => {
    const otherHands = [{ seatId: "a" }, { seatId: "c" }];
    expect(teammatesInTurnOrder(otherHands, seatOrder, "zzz")).toEqual(otherHands);
  });

  it("appends a hand whose seatId is missing from seatOrder at the end, in original order", () => {
    const otherHands = [{ seatId: "c" }, { seatId: "unknown" }, { seatId: "d" }];
    expect(teammatesInTurnOrder(otherHands, seatOrder, "b").map((h) => h.seatId)).toEqual([
      "c",
      "d",
      "unknown",
    ]);
  });
});
