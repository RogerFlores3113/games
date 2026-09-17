import { describe, expect, it } from "vitest";
import {
  applyPendingOrder,
  discardDropIndex,
  reorderedDiscardIds,
  requestForDiscardDrop,
} from "./hanabi-discard-drag-logic";
import type { Rect } from "./hanabi-discard-drag-logic";

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
