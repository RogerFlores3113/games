import { describe, expect, it } from "vitest";
import type { HanabiView } from "@games/rules";
import {
  DRAG_THRESHOLD_PX,
  applyPendingOrder,
  dropZoneStatus,
  exceedsDragThreshold,
  reorderedCardIds,
  requestForDrop,
  resolveDropTarget,
} from "./hanabi-drag-logic";
import type { DropZones } from "./hanabi-drag-logic";
import { disabledReasonFor } from "./hanabi-visual-logic";
import type { ActionContext } from "./hanabi-visual-logic";

// Copied verbatim from hanabi-visual-logic.test.ts's baseView fixture shape
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

function ctxFor(overrides: Partial<ActionContext> = {}): ActionContext {
  return { reconnecting: false, ended: false, ...overrides };
}

describe("exceedsDragThreshold", () => {
  it(`is false below ${DRAG_THRESHOLD_PX}px (distance 5)`, () => {
    expect(exceedsDragThreshold({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(false);
  });

  it(`is true at/above ${DRAG_THRESHOLD_PX}px`, () => {
    expect(exceedsDragThreshold({ x: 0, y: 0 }, { x: 6, y: 0 })).toBe(true);
  });
});

describe("resolveDropTarget", () => {
  const zones: DropZones = {
    slots: [
      { cardId: "c1", rect: { left: 0, top: 0, right: 10, bottom: 10 } },
      { cardId: "c2", rect: { left: 20, top: 0, right: 30, bottom: 10 } },
    ],
    play: { left: 100, top: 0, right: 110, bottom: 10 },
    discard: { left: 200, top: 0, right: 210, bottom: 10 },
  };

  it("returns a reorder target for a point inside a slot rect", () => {
    expect(resolveDropTarget({ x: 5, y: 5 }, zones)).toEqual({ kind: "reorder", targetIndex: 0 });
    expect(resolveDropTarget({ x: 25, y: 5 }, zones)).toEqual({ kind: "reorder", targetIndex: 1 });
  });

  it("checks slot rects before play/discard", () => {
    const overlapping: DropZones = {
      slots: [{ cardId: "c1", rect: { left: 0, top: 0, right: 110, bottom: 10 } }],
      play: { left: 100, top: 0, right: 120, bottom: 10 },
      discard: null,
    };
    expect(resolveDropTarget({ x: 105, y: 5 }, overlapping)).toEqual({ kind: "reorder", targetIndex: 0 });
  });

  it("returns play for a point inside the play rect", () => {
    expect(resolveDropTarget({ x: 105, y: 5 }, zones)).toEqual({ kind: "play" });
  });

  it("returns discard for a point inside the discard rect", () => {
    expect(resolveDropTarget({ x: 205, y: 5 }, zones)).toEqual({ kind: "discard" });
  });

  it("returns none outside all zones", () => {
    expect(resolveDropTarget({ x: 500, y: 500 }, zones)).toEqual({ kind: "none" });
  });

  it("returns none when play/discard zones are null", () => {
    const noZones: DropZones = { slots: [], play: null, discard: null };
    expect(resolveDropTarget({ x: 5, y: 5 }, noZones)).toEqual({ kind: "none" });
  });
});

describe("reorderedCardIds", () => {
  it('(["a","b","c","d"], "a", 2) -> ["b","c","a","d"]', () => {
    expect(reorderedCardIds(["a", "b", "c", "d"], "a", 2)).toEqual(["b", "c", "a", "d"]);
  });

  it('(["a","b","c","d"], "d", 0) -> ["d","a","b","c"]', () => {
    expect(reorderedCardIds(["a", "b", "c", "d"], "d", 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("returns the input order unchanged for an unknown id", () => {
    expect(reorderedCardIds(["a", "b", "c"], "z", 1)).toEqual(["a", "b", "c"]);
  });
});

describe("dropZoneStatus", () => {
  it("returns disabled with the exact disabledReasonFor string when not your turn", () => {
    const view = baseView({ isYourTurn: false });
    const ctx = ctxFor();
    const status = dropZoneStatus(view, "play", "a1", ctx);
    expect(status.enabled).toBe(false);
    expect(status.reason).toBe(disabledReasonFor(view, { kind: "play", selectedCardId: "a1" }, ctx));
  });

  it("returns disabled with the discard-at-8-tokens reason when clueTokens is 8", () => {
    const view = baseView({ isYourTurn: true, clueTokens: 8 });
    const ctx = ctxFor();
    const status = dropZoneStatus(view, "discard", "a1", ctx);
    expect(status.enabled).toBe(false);
    expect(status.reason).toBe("Clue tokens are full — you can't discard");
  });

  it("is enabled with reason null on own turn", () => {
    const view = baseView({ isYourTurn: true, clueTokens: 4 });
    const status = dropZoneStatus(view, "discard", "a1", ctxFor());
    expect(status).toEqual({ enabled: true, reason: null });
  });
});

describe("applyPendingOrder", () => {
  const cards = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("reorders cards into the pending id order, returning the same objects", () => {
    const result = applyPendingOrder(cards, ["c", "a", "b"]);
    expect(result.map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(result[0]).toBe(cards[2]);
    expect(result[1]).toBe(cards[0]);
    expect(result[2]).toBe(cards[1]);
  });

  it("returns cards unchanged when pendingIds is null", () => {
    expect(applyPendingOrder(cards, null)).toBe(cards);
  });

  it("returns cards unchanged when pendingIds has a different length", () => {
    expect(applyPendingOrder(cards, ["a", "b"])).toBe(cards);
  });

  it("returns cards unchanged when pendingIds contains an unknown id", () => {
    expect(applyPendingOrder(cards, ["a", "b", "z"])).toBe(cards);
  });
});

describe("requestForDrop", () => {
  it("reorder target producing a changed order returns a reorder request, even off-turn", () => {
    const view = baseView({ isYourTurn: false });
    const result = requestForDrop(
      { kind: "reorder", targetIndex: 2 },
      "a",
      ["a", "b", "c", "d"],
      view,
      ctxFor(),
    );
    expect(result).toEqual({ type: "reorder", cardIds: ["b", "c", "a", "d"] });
  });

  it("unchanged order returns null", () => {
    const view = baseView();
    const result = requestForDrop(
      { kind: "reorder", targetIndex: 0 },
      "a",
      ["a", "b", "c"],
      view,
      ctxFor(),
    );
    expect(result).toBeNull();
  });

  it("returns null for a reorder target when reconnecting", () => {
    const view = baseView();
    const result = requestForDrop(
      { kind: "reorder", targetIndex: 2 },
      "a",
      ["a", "b", "c"],
      view,
      ctxFor({ reconnecting: true }),
    );
    expect(result).toBeNull();
  });

  it("returns null for a reorder target when ended", () => {
    const view = baseView();
    const result = requestForDrop(
      { kind: "reorder", targetIndex: 2 },
      "a",
      ["a", "b", "c"],
      view,
      ctxFor({ ended: true }),
    );
    expect(result).toBeNull();
  });

  it("returns a play request only when dropZoneStatus is enabled", () => {
    const view = baseView({ isYourTurn: true });
    expect(requestForDrop({ kind: "play" }, "a1", ["a1"], view, ctxFor())).toEqual({
      type: "play",
      cardId: "a1",
    });
    const disabledView = baseView({ isYourTurn: false });
    expect(requestForDrop({ kind: "play" }, "a1", ["a1"], disabledView, ctxFor())).toBeNull();
  });

  it("returns a discard request only when dropZoneStatus is enabled", () => {
    const view = baseView({ isYourTurn: true, clueTokens: 3 });
    expect(requestForDrop({ kind: "discard" }, "a1", ["a1"], view, ctxFor())).toEqual({
      type: "discard",
      cardId: "a1",
    });
    const maxedView = baseView({ isYourTurn: true, clueTokens: 8 });
    expect(requestForDrop({ kind: "discard" }, "a1", ["a1"], maxedView, ctxFor())).toBeNull();
  });

  it('"none" returns null', () => {
    const view = baseView();
    expect(requestForDrop({ kind: "none" }, "a1", ["a1"], view, ctxFor())).toBeNull();
  });
});
