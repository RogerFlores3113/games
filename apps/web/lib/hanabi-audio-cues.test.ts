import { describe, expect, it } from "vitest";
import type { HanabiView, Suit } from "@games/rules";
import { cueForEntry, cuesForTransition } from "./hanabi-audio-cues";
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

function stacks(topRank: number, suit: Suit = "red"): HanabiView["stacks"] {
  return [{ suit, topRank }];
}

describe("cueForEntry", () => {
  it("misplay -> fuse", () => {
    expect(cueForEntry(playEntry({ success: false }), [])).toBe("fuse");
  });

  it("successful rank-5 play completing its suit -> stack-complete", () => {
    expect(cueForEntry(playEntry({ success: true, rank: 5, suit: "red" }), ["red"])).toBe("stack-complete");
  });

  it("successful play otherwise -> play", () => {
    expect(cueForEntry(playEntry({ success: true, rank: 3, suit: "red" }), [])).toBe("play");
    // rank-5 success but suit not newly completed this transition -> plain play
    expect(cueForEntry(playEntry({ success: true, rank: 5, suit: "red" }), [])).toBe("play");
  });

  it("discard -> discard", () => {
    expect(cueForEntry(discardEntry(), [])).toBe("discard");
  });

  it("clue -> clue", () => {
    expect(cueForEntry(clueEntry(), [])).toBe("clue");
  });

  it("draw -> null", () => {
    expect(cueForEntry(drawEntry(), [])).toBeNull();
  });
});

describe("cuesForTransition", () => {
  it("returns [] for the first view ever (prev === null)", () => {
    expect(cuesForTransition(null, { history: [playEntry()], stacks: stacks(1) })).toEqual([]);
  });

  it("one successful red-5 play completing red -> exactly ['stack-complete'], never also 'play'", () => {
    const prev = { history: [] as HistoryEntry[], stacks: stacks(4) };
    const next = {
      history: [playEntry({ success: true, rank: 5, suit: "red" })],
      stacks: stacks(5),
    };
    expect(cuesForTransition(prev, next)).toEqual(["stack-complete"]);
  });

  it("misplay transition -> exactly ['fuse'], never also 'play' or 'discard'", () => {
    const prev = { history: [] as HistoryEntry[], stacks: stacks(2) };
    const next = { history: [playEntry({ success: false })], stacks: stacks(2) };
    expect(cuesForTransition(prev, next)).toEqual(["fuse"]);
  });

  it("discard followed by its draw entry -> exactly ['discard']", () => {
    const prev = { history: [] as HistoryEntry[], stacks: stacks(0) };
    const next = {
      history: [discardEntry({ turn: 0 }), drawEntry({ turn: 1 })],
      stacks: stacks(0),
    };
    expect(cuesForTransition(prev, next)).toEqual(["discard"]);
  });

  it("two live entries (clue then discard) -> ['clue', 'discard'] in order", () => {
    const prev = { history: [playEntry({ turn: 0 })], stacks: stacks(1) };
    const next = {
      history: [playEntry({ turn: 0 }), clueEntry({ turn: 1 }), discardEntry({ turn: 2 })],
      stacks: stacks(1),
    };
    expect(cuesForTransition(prev, next)).toEqual(["clue", "discard"]);
  });
});
