import { describe, expect, it } from "vitest";
import { hintDisplayFor, hintsVisibleForCard } from "./hanabi-hint-logic";
import type { CardFacts, HistoryEntry } from "./hanabi-visual-logic";

function facts(overrides: Partial<CardFacts> = {}): CardFacts {
  return {
    possibleSuits: [],
    possibleRanks: [],
    positiveClues: [],
    negativeClues: [],
    ...overrides,
  };
}

describe("hintDisplayFor", () => {
  it("returns two empty arrays when there are no positive clues", () => {
    expect(hintDisplayFor(facts())).toEqual({ colorHints: [], numberHints: [] });
  });

  it("returns one colour hint and one number hint for a card told red then 3", () => {
    const result = hintDisplayFor(
      facts({
        positiveClues: [
          { type: "color", value: "red" },
          { type: "rank", value: 3 },
        ],
      }),
    );
    expect(result).toEqual({ colorHints: ["red"], numberHints: [3] });
  });

  it("de-duplicates repeated clues, keeping first-told order", () => {
    const result = hintDisplayFor(
      facts({
        positiveClues: [
          { type: "color", value: "red" },
          { type: "rank", value: 3 },
          { type: "color", value: "red" },
          { type: "rank", value: 1 },
        ],
      }),
    );
    expect(result).toEqual({ colorHints: ["red"], numberHints: [3, 1] });
  });

  it("ignores negativeClues, possibleSuits and possibleRanks entirely (D-07)", () => {
    const result = hintDisplayFor(
      facts({
        possibleSuits: ["blue"],
        possibleRanks: [5],
        negativeClues: [{ type: "color", value: "blue" }, { type: "rank", value: 5 }],
      }),
    );
    expect(result).toEqual({ colorHints: [], numberHints: [] });
  });

  it("is pure: calling twice with the same facts returns equal results", () => {
    const input = facts({ positiveClues: [{ type: "color", value: "green" }] });
    expect(hintDisplayFor(input)).toEqual(hintDisplayFor(input));
  });
});

describe("hintsVisibleForCard", () => {
  function clueEntry(overrides: Partial<Extract<HistoryEntry, { type: "clue" }>>): HistoryEntry {
    return {
      turn: 0,
      type: "clue",
      seatId: "seat-a",
      targetSeatId: "seat-b",
      clue: { type: "color", value: "red" },
      touchedCardIds: [],
      ...overrides,
    };
  }

  function playEntry(overrides: Partial<Extract<HistoryEntry, { type: "play" }>> = {}): HistoryEntry {
    return {
      turn: 0,
      type: "play",
      seatId: "seat-b",
      cardId: "unrelated",
      suit: "red",
      rank: 1,
      success: true,
      ...overrides,
    };
  }

  function discardEntry(
    overrides: Partial<Extract<HistoryEntry, { type: "discard" }>> = {},
  ): HistoryEntry {
    return {
      turn: 0,
      type: "discard",
      seatId: "seat-b",
      cardId: "unrelated",
      suit: "red",
      rank: 1,
      ...overrides,
    };
  }

  function drawEntry(overrides: Partial<Extract<HistoryEntry, { type: "draw" }>> = {}): HistoryEntry {
    return {
      turn: 0,
      type: "draw",
      seatId: "seat-b",
      cardId: "unrelated",
      ...overrides,
    };
  }

  it("keepVisible: true is true whenever the card was ever touched by a clue", () => {
    const history = [
      clueEntry({ touchedCardIds: ["b1"] }),
      playEntry({ cardId: "other" }),
      discardEntry({ cardId: "other-2" }),
    ];
    expect(hintsVisibleForCard(history, "b1", { keepVisible: true })).toBe(true);
  });

  it("keepVisible: true is false when the card was never touched", () => {
    const history = [clueEntry({ touchedCardIds: ["b1"] })];
    expect(hintsVisibleForCard(history, "never-touched", { keepVisible: true })).toBe(false);
  });

  it("keepVisible: false is true when the most recent non-draw entry is a clue that touched the card", () => {
    const history = [clueEntry({ touchedCardIds: ["b1"] })];
    expect(hintsVisibleForCard(history, "b1", { keepVisible: false })).toBe(true);
  });

  it("keepVisible: false is false once a later play entry follows the clue", () => {
    const history = [clueEntry({ touchedCardIds: ["b1"] }), playEntry()];
    expect(hintsVisibleForCard(history, "b1", { keepVisible: false })).toBe(false);
  });

  it("keepVisible: false is false once a later discard entry follows the clue", () => {
    const history = [clueEntry({ touchedCardIds: ["b1"] }), discardEntry()];
    expect(hintsVisibleForCard(history, "b1", { keepVisible: false })).toBe(false);
  });

  it("keepVisible: false is false once a later clue entry follows the original clue", () => {
    const history = [
      clueEntry({ touchedCardIds: ["b1"] }),
      clueEntry({ touchedCardIds: ["c1"] }),
    ];
    expect(hintsVisibleForCard(history, "b1", { keepVisible: false })).toBe(false);
  });

  it("keepVisible: false — trailing draw entries after a clue do not clear the hint", () => {
    const history = [clueEntry({ touchedCardIds: ["b1"] }), drawEntry(), drawEntry()];
    expect(hintsVisibleForCard(history, "b1", { keepVisible: false })).toBe(true);
  });

  it("keepVisible: false is false with empty history", () => {
    expect(hintsVisibleForCard([], "b1", { keepVisible: false })).toBe(false);
  });

  it("is pure: calling twice with the same inputs returns equal results", () => {
    const history = [clueEntry({ touchedCardIds: ["b1"] }), drawEntry()];
    const first = hintsVisibleForCard(history, "b1", { keepVisible: false });
    const second = hintsVisibleForCard(history, "b1", { keepVisible: false });
    expect(first).toBe(second);
  });
});
