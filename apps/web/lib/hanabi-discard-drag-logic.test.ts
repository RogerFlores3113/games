import { describe, expect, it } from "vitest";
import {
  applyPendingOrder,
  discardDropIndex,
  groupedBySuitOrder,
  reorderedDiscardIds,
  requestForDiscardDrop,
} from "./hanabi-discard-drag-logic";
import type { Rect } from "./hanabi-discard-drag-logic";
import type { Suit } from "@games/rules";

describe("reorderedDiscardIds", () => {
  it('(["a","b","c","d"], "a", 2) -> ["b","c","a","d"]', () => {
    expect(reorderedDiscardIds(["a", "b", "c", "d"], "a", 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("clamps an out-of-range target index to the ends", () => {
    expect(reorderedDiscardIds(["a", "b", "c"], "a", 99)).toEqual(["b", "c", "a"]);
    expect(reorderedDiscardIds(["a", "b", "c"], "c", -5)).toEqual(["c", "a", "b"]);
  });

  it("returns the input order unchanged when the dragged id is not present", () => {
    expect(reorderedDiscardIds(["a", "b", "c"], "z", 1)).toEqual(["a", "b", "c"]);
  });
});

describe("discardDropIndex", () => {
  const tiles: ReadonlyArray<{ cardId: string; rect: Rect }> = [
    { cardId: "d1", rect: { left: 0, top: 0, right: 40, bottom: 54 } },
    { cardId: "d2", rect: { left: 50, top: 0, right: 90, bottom: 54 } },
    { cardId: "d3", rect: { left: 100, top: 0, right: 140, bottom: 54 } },
  ];

  it("maps a point left of the first tile's midpoint to index 0", () => {
    expect(discardDropIndex({ x: 5, y: 10 }, tiles)).toBe(0);
  });

  it("maps a point between two tiles' midpoints to the index between them", () => {
    expect(discardDropIndex({ x: 45, y: 10 }, tiles)).toBe(1);
  });

  it("maps a point past the last tile's midpoint to tiles.length", () => {
    expect(discardDropIndex({ x: 500, y: 10 }, tiles)).toBe(3);
  });

  it("returns 0 for an empty tile array", () => {
    expect(discardDropIndex({ x: 5, y: 10 }, [])).toBe(0);
  });
});

describe("requestForDiscardDrop", () => {
  it("returns null when the resulting order equals the current order (no-op drop)", () => {
    expect(requestForDiscardDrop(0, "a", ["a", "b", "c"])).toBeNull();
  });

  it("returns { type: 'reorderDiscard', cardIds } with the full new order otherwise", () => {
    expect(requestForDiscardDrop(2, "a", ["a", "b", "c", "d"])).toEqual({
      type: "reorderDiscard",
      cardIds: ["b", "c", "a", "d"],
    });
  });
});

describe("applyPendingOrder (re-exported, not redefined)", () => {
  it("reorders cards into the pending id order", () => {
    const cards = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(applyPendingOrder(cards, ["c", "a", "b"]).map((c) => c.id)).toEqual(["c", "a", "b"]);
  });
});

describe("groupedBySuitOrder", () => {
  const suitOrder: readonly Suit[] = ["red", "yellow", "green", "blue", "white"];

  it("sorts by suit position in suitOrder, then rank ascending, then existing index", () => {
    const discard = [
      { id: "d1", suit: "blue" as Suit, rank: 2 },
      { id: "d2", suit: "red" as Suit, rank: 3 },
      { id: "d3", suit: "red" as Suit, rank: 1 },
      { id: "d4", suit: "blue" as Suit, rank: 1 },
    ];
    expect(groupedBySuitOrder(discard, suitOrder)).toEqual(["d3", "d2", "d4", "d1"]);
  });

  it("is always an exact permutation of the input ids (same length, same set, no duplicates)", () => {
    const discard = [
      { id: "a", suit: "white" as Suit, rank: 5 },
      { id: "b", suit: "red" as Suit, rank: 1 },
      { id: "c", suit: "green" as Suit, rank: 4 },
      { id: "d", suit: "blue" as Suit, rank: 2 },
      { id: "e", suit: "yellow" as Suit, rank: 3 },
      { id: "f", suit: "red" as Suit, rank: 2 },
    ];
    const result = groupedBySuitOrder(discard, suitOrder);
    expect(result).toHaveLength(discard.length);
    expect(new Set(result)).toEqual(new Set(discard.map((c) => c.id)));
    expect(new Set(result).size).toBe(result.length);
  });

  it("is idempotent — calling it twice on an already-grouped sequence returns the same order", () => {
    const discard = [
      { id: "a", suit: "white" as Suit, rank: 5 },
      { id: "b", suit: "red" as Suit, rank: 1 },
      { id: "c", suit: "green" as Suit, rank: 4 },
    ];
    const once = groupedBySuitOrder(discard, suitOrder);
    const regrouped = once.map((id) => discard.find((c) => c.id === id)!);
    const twice = groupedBySuitOrder(regrouped, suitOrder);
    expect(twice).toEqual(once);
  });

  it("sorts a card whose suit is absent from suitOrder last, rather than throwing", () => {
    const discard = [
      { id: "a", suit: "black" as Suit, rank: 1 },
      { id: "b", suit: "red" as Suit, rank: 1 },
    ];
    expect(() => groupedBySuitOrder(discard, suitOrder)).not.toThrow();
    expect(groupedBySuitOrder(discard, suitOrder)).toEqual(["b", "a"]);
  });

  it("returns an empty array for an empty pile", () => {
    expect(groupedBySuitOrder([], suitOrder)).toEqual([]);
  });

  it("never mutates the input array", () => {
    const discard = [
      { id: "a", suit: "blue" as Suit, rank: 2 },
      { id: "b", suit: "red" as Suit, rank: 1 },
    ];
    const copy = [...discard];
    groupedBySuitOrder(discard, suitOrder);
    expect(discard).toEqual(copy);
  });
});
