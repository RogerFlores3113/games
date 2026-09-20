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

  it("returns only the number hint for a card told red then 3 (D-06 overturned, UAT gap 34)", () => {
    const result = hintDisplayFor(
      facts({
        positiveClues: [
          { type: "color", value: "red" },
          { type: "rank", value: 3 },
        ],
      }),
    );
    expect(result).toEqual({ colorHints: [], numberHints: [3] });
  });

  it("returns only the colour hint for a card told 3 then red (order matters, not type)", () => {
    const result = hintDisplayFor(
      facts({
        positiveClues: [
          { type: "rank", value: 3 },
          { type: "color", value: "red" },
        ],
      }),
    );
    expect(result).toEqual({ colorHints: ["red"], numberHints: [] });
  });

  it("by default never accumulates — only the LAST positive clue is reflected, however many preceded it", () => {
    const result = hintDisplayFor(
      facts({
        positiveClues: [
          { type: "color", value: "red" },
          { type: "rank", value: 3 },
          { type: "color", value: "blue" },
          { type: "rank", value: 1 },
        ],
      }),
    );
    expect(result).toEqual({ colorHints: [], numberHints: [1] });
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

describe("hintDisplayFor with accumulate (keep-hints-visible on)", () => {
  // Owner report 2026-09-19: "with hint retention on - a new hint for a tile
  // overlays the prior hint so information isn't well-retained." Gap 34's
  // latest-only rule still governs the DEFAULT mode above; this mode is the
  // keep-hints toggle's own display.
  it("returns every distinct clue a card has received, colour and rank together", () => {
    const result = hintDisplayFor(
      facts({
        positiveClues: [
          { type: "color", value: "blue" },
          { type: "rank", value: 4 },
        ],
      }),
      { accumulate: true },
    );
    expect(result).toEqual({ colorHints: ["blue"], numberHints: [4] });
  });

  it("keeps both colours of a card touched by two different colour clues (how a rainbow reads as rainbow)", () => {
    const result = hintDisplayFor(
      facts({
        positiveClues: [
          { type: "color", value: "blue" },
          { type: "color", value: "red" },
        ],
      }),
      { accumulate: true },
    );
    expect(result).toEqual({ colorHints: ["blue", "red"], numberHints: [] });
  });

  it("orders hints oldest-first, matching the ring's arc order", () => {
    const result = hintDisplayFor(
      facts({
        positiveClues: [
          { type: "color", value: "green" },
          { type: "color", value: "yellow" },
          { type: "color", value: "red" },
        ],
      }),
      { accumulate: true },
    );
    expect(result.colorHints).toEqual(["green", "yellow", "red"]);
  });

  it("de-duplicates a colour re-clued later — one arc per distinct colour, position kept from first mention", () => {
    const result = hintDisplayFor(
      facts({
        positiveClues: [
          { type: "color", value: "blue" },
          { type: "color", value: "red" },
          { type: "color", value: "blue" },
        ],
      }),
      { accumulate: true },
    );
    expect(result.colorHints).toEqual(["blue", "red"]);
  });

  it("de-duplicates a repeated rank clue", () => {
    const result = hintDisplayFor(
      facts({
        positiveClues: [
          { type: "rank", value: 2 },
          { type: "rank", value: 2 },
        ],
      }),
      { accumulate: true },
    );
    expect(result.numberHints).toEqual([2]);
  });

  it("still returns empty arrays with no positive clues", () => {
    expect(hintDisplayFor(facts(), { accumulate: true })).toEqual({ colorHints: [], numberHints: [] });
  });

  it("ignores negative clues in this mode too (D-07)", () => {
    const result = hintDisplayFor(
      facts({
        positiveClues: [{ type: "color", value: "red" }],
        negativeClues: [{ type: "rank", value: 5 }],
        possibleSuits: ["red", "blue"],
        possibleRanks: [1, 2],
      }),
      { accumulate: true },
    );
    expect(result).toEqual({ colorHints: ["red"], numberHints: [] });
  });

  it("accumulate: false is explicitly identical to the default", () => {
    const input = facts({
      positiveClues: [
        { type: "color", value: "blue" },
        { type: "rank", value: 4 },
      ],
    });
    expect(hintDisplayFor(input, { accumulate: false })).toEqual(hintDisplayFor(input));
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
