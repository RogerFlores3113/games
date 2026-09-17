import { describe, expect, it } from "vitest";
import { liveHistoryEntries } from "./hanabi-live-history";
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

describe("liveHistoryEntries", () => {
  it("returns [] for the first view after mount/refresh/reconnect (prevHistory === null)", () => {
    expect(liveHistoryEntries(null, [playEntry(), discardEntry()])).toEqual([]);
  });

  it("returns the tail slice when next is longer than prev", () => {
    const prev = [playEntry({ turn: 0 })];
    const next = [playEntry({ turn: 0 }), discardEntry({ turn: 1 }), clueEntry({ turn: 2 })];
    expect(liveHistoryEntries(prev, next)).toEqual([discardEntry({ turn: 1 }), clueEntry({ turn: 2 })]);
  });

  it("returns [] when next is shorter than prev (new game)", () => {
    const prev = [playEntry(), discardEntry(), clueEntry()];
    const next = [playEntry()];
    expect(liveHistoryEntries(prev, next)).toEqual([]);
  });

  it("returns [] when next is the same length as prev (no change)", () => {
    const prev = [playEntry(), discardEntry()];
    const next = [playEntry(), discardEntry()];
    expect(liveHistoryEntries(prev, next)).toEqual([]);
  });

  it("returns two live entries (clue then discard) in order", () => {
    const prev = [playEntry({ turn: 0 })];
    const next = [playEntry({ turn: 0 }), clueEntry({ turn: 1 }), discardEntry({ turn: 2 })];
    expect(liveHistoryEntries(prev, next)).toEqual([clueEntry({ turn: 1 }), discardEntry({ turn: 2 })]);
  });
});
