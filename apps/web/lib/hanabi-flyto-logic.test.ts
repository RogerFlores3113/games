import { describe, expect, it } from "vitest";
import { flyToEventsForTransition } from "./hanabi-flyto-logic";
import type { HistoryEntry } from "./hanabi-visual-logic";

function playEntry(overrides: Partial<Extract<HistoryEntry, { type: "play" }>> = {}): HistoryEntry {
  return {
    turn: 0,
    type: "play",
    seatId: "seat-a",
    cardId: "c1",
    suit: "red",
    rank: 1,
    success: true,
    ...overrides,
  };
}

function discardEntry(overrides: Partial<Extract<HistoryEntry, { type: "discard" }>> = {}): HistoryEntry {
  return {
    turn: 0,
    type: "discard",
    seatId: "seat-a",
    cardId: "c2",
    suit: "blue",
    rank: 2,
    ...overrides,
  };
}

function clueEntry(overrides: Partial<Extract<HistoryEntry, { type: "clue" }>> = {}): HistoryEntry {
  return {
    turn: 0,
    type: "clue",
    seatId: "seat-a",
    targetSeatId: "seat-b",
    clue: { type: "color", value: "red" },
    touchedCardIds: ["c1"],
    ...overrides,
  };
}

function drawEntry(overrides: Partial<Extract<HistoryEntry, { type: "draw" }>> = {}): HistoryEntry {
  return {
    turn: 0,
    type: "draw",
    seatId: "seat-a",
    cardId: "c3",
    ...overrides,
  };
}

describe("flyToEventsForTransition", () => {
  it("returns [] for the first view after mount/refresh/reconnect (prevHistory === null)", () => {
    expect(flyToEventsForTransition(null, [playEntry()], new Set())).toEqual([]);
  });

  it("a live successful play entry flies to the stack", () => {
    const prev: HistoryEntry[] = [];
    const next = [playEntry({ turn: 0 })];
    expect(flyToEventsForTransition(prev, next, new Set())).toEqual([
      { cardId: "c1", seatId: "seat-a", suit: "red", rank: 1, destination: "stack" },
    ]);
  });

  it("a live misplay (success false) flies to the discard pile", () => {
    const prev: HistoryEntry[] = [];
    const next = [playEntry({ turn: 0, success: false })];
    expect(flyToEventsForTransition(prev, next, new Set())).toEqual([
      { cardId: "c1", seatId: "seat-a", suit: "red", rank: 1, destination: "discard" },
    ]);
  });

  it("a live discard entry flies to the discard pile", () => {
    const prev: HistoryEntry[] = [];
    const next = [discardEntry({ turn: 0 })];
    expect(flyToEventsForTransition(prev, next, new Set())).toEqual([
      { cardId: "c2", seatId: "seat-a", suit: "blue", rank: 2, destination: "discard" },
    ]);
  });

  it("clue and draw entries produce no events", () => {
    const prev: HistoryEntry[] = [];
    const next = [clueEntry({ turn: 0 }), drawEntry({ turn: 1 })];
    expect(flyToEventsForTransition(prev, next, new Set())).toEqual([]);
  });

  it("an entry whose cardId is in suppressedCardIds produces no event (dragging player's own drop)", () => {
    const prev: HistoryEntry[] = [];
    const next = [playEntry({ turn: 0, cardId: "c1" })];
    expect(flyToEventsForTransition(prev, next, new Set(["c1"]))).toEqual([]);
  });

  it("two live entries produce two events in history order", () => {
    const prev = [playEntry({ turn: 0, cardId: "c1" })];
    const next = [
      playEntry({ turn: 0, cardId: "c1" }),
      discardEntry({ turn: 1, cardId: "c2" }),
      playEntry({ turn: 2, cardId: "c9", success: false }),
    ];
    expect(flyToEventsForTransition(prev, next, new Set())).toEqual([
      { cardId: "c2", seatId: "seat-a", suit: "blue", rank: 2, destination: "discard" },
      { cardId: "c9", seatId: "seat-a", suit: "red", rank: 1, destination: "discard" },
    ]);
  });
});
