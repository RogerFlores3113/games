import { describe, expect, it } from "vitest";
import {
  applyHanabiAction,
  isClueRequest,
  isDiscardRequest,
  isPlayRequest,
  parseHanabiRequest,
} from "./actions";
import { initialClueFacts } from "./clue-facts";
import { variantConfig } from "./variant";
import type { HanabiCard, HanabiState, StackEntry } from "./state";

function card(id: string, suit: string, rank: number): HanabiCard {
  return { id, suit: suit as HanabiCard["suit"], rank: rank as HanabiCard["rank"] };
}

function emptyStacks(variant: "base" | "rainbow" | "black" = "base"): StackEntry[] {
  return variantConfig(variant).suits.map((suit) => ({ suit, topRank: 0 }));
}

function baseState(overrides: Partial<HanabiState> = {}): HanabiState {
  const config = variantConfig("base");
  const seatIds = ["seat-a", "seat-b", "seat-c"];
  const hands = seatIds.map((seatId) => ({
    seatId,
    slots: [
      { card: card(`${seatId}-1`, "red", 1), facts: initialClueFacts(config) },
      { card: card(`${seatId}-2`, "blue", 2), facts: initialClueFacts(config) },
    ],
  }));
  const deck: HanabiCard[] = [card("deck-1", "green", 3), card("deck-2", "white", 4)];
  return {
    variant: "base",
    seatIds,
    turnIndex: 0,
    hands,
    deck,
    stacks: emptyStacks(),
    discard: [],
    clueTokens: 5,
    fuses: 0,
    finalTurnsRemaining: null,
    history: [],
    ...overrides,
  };
}

describe("applyAction", () => {
  describe("request guards", () => {
    it("isPlayRequest rejects an extra key asserting resulting state", () => {
      expect(isPlayRequest({ type: "play", cardId: "x", resultingScore: 999 })).toBe(false);
    });

    it("isPlayRequest rejects missing cardId, non-string cardId, null, arrays, primitives", () => {
      expect(isPlayRequest({ type: "play" })).toBe(false);
      expect(isPlayRequest({ type: "play", cardId: 5 })).toBe(false);
      expect(isPlayRequest(null)).toBe(false);
      expect(isPlayRequest(["play", "x"])).toBe(false);
      expect(isPlayRequest("play")).toBe(false);
      expect(isPlayRequest(42)).toBe(false);
      expect(isPlayRequest(undefined)).toBe(false);
    });

    it("isDiscardRequest applies the same exact-key discipline", () => {
      expect(isDiscardRequest({ type: "discard", cardId: "x" })).toBe(true);
      expect(isDiscardRequest({ type: "discard", cardId: "x", resultingScore: 1 })).toBe(false);
    });

    it("isClueRequest rejects a clue sub-object with an extra key", () => {
      expect(
        isClueRequest({
          type: "clue",
          targetSeatId: "seat-b",
          clue: { type: "color", value: "red", extra: true },
        }),
      ).toBe(false);
    });

    it("parseHanabiRequest returns null and applyHanabiAction never throws for a payload no guard accepts", () => {
      expect(parseHanabiRequest({ type: "play", cardId: "x", resultingScore: 999 })).toBeNull();
      const state = baseState();
      let result;
      expect(() => {
        result = applyHanabiAction(state, "seat-a", { type: "play", cardId: "x", resultingScore: 999 });
      }).not.toThrow();
      expect(result).toEqual({ ok: false, error: "invalid_action" });
    });
  });

  describe("play", () => {
    it("a play extending the stack advances topRank and removes the card from the hand", () => {
      const state = baseState();
      const result = applyHanabiAction(state, "seat-a", { type: "play", cardId: "seat-a-1" });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      const redStack = result.state.stacks.find((s) => s.suit === "red")!;
      expect(redStack.topRank).toBe(1);
      const seatAHand = result.state.hands.find((h) => h.seatId === "seat-a")!;
      expect(seatAHand.slots.some((s) => s.card.id === "seat-a-1")).toBe(false);
    });

    it("a play that does not extend its stack costs a fuse and discards the card", () => {
      const state = baseState({ stacks: emptyStacks() }); // red at 0, playing rank 2 fails
      const result = applyHanabiAction(state, "seat-a", { type: "play", cardId: "seat-a-2" }); // blue rank 2
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.state.fuses).toBe(1);
      expect(result.state.discard.some((c) => c.id === "seat-a-2")).toBe(true);
      const blueStack = result.state.stacks.find((s) => s.suit === "blue")!;
      expect(blueStack.topRank).toBe(0);
    });

    it("completing a stack with a 5 refunds a clue token", () => {
      const stacks = emptyStacks().map((s) => (s.suit === "red" ? { suit: s.suit, topRank: 4 } : s));
      const state = baseState({
        stacks,
        clueTokens: 5,
        hands: [
          {
            seatId: "seat-a",
            slots: [{ card: card("seat-a-1", "red", 5), facts: initialClueFacts(variantConfig("base")) }],
          },
          { seatId: "seat-b", slots: [] },
          { seatId: "seat-c", slots: [] },
        ],
      });
      const result = applyHanabiAction(state, "seat-a", { type: "play", cardId: "seat-a-1" });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.state.clueTokens).toBe(6);
    });

    it("the token refund for completing a stack with a 5 is forfeit when already at 8", () => {
      const stacks = emptyStacks().map((s) => (s.suit === "red" ? { suit: s.suit, topRank: 4 } : s));
      const state = baseState({
        stacks,
        clueTokens: 8,
        hands: [
          {
            seatId: "seat-a",
            slots: [{ card: card("seat-a-1", "red", 5), facts: initialClueFacts(variantConfig("base")) }],
          },
          { seatId: "seat-b", slots: [] },
          { seatId: "seat-c", slots: [] },
        ],
      });
      const result = applyHanabiAction(state, "seat-a", { type: "play", cardId: "seat-a-1" });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.state.clueTokens).toBe(8);
    });

    it("rejects a play naming a card not in the actor's own hand", () => {
      const state = baseState();
      const result = applyHanabiAction(state, "seat-a", { type: "play", cardId: "seat-b-1" });
      expect(result).toEqual({ ok: false, error: "card_not_in_hand" });
    });
  });

  describe("discard", () => {
    it("a discard returns one clue token and pushes the card to the discard pile", () => {
      const state = baseState({ clueTokens: 5 });
      const result = applyHanabiAction(state, "seat-a", { type: "discard", cardId: "seat-a-1" });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.state.clueTokens).toBe(6);
      expect(result.state.discard.some((c) => c.id === "seat-a-1")).toBe(true);
    });

    it("rejects a discard at 8 clue tokens with discard_at_max_clues", () => {
      const state = baseState({ clueTokens: 8 });
      const result = applyHanabiAction(state, "seat-a", { type: "discard", cardId: "seat-a-1" });
      expect(result).toEqual({ ok: false, error: "discard_at_max_clues" });
      // Rejected: clue tokens are unchanged.
      expect(state.clueTokens).toBe(8);
    });
  });

  describe("draw and final-round bookkeeping", () => {
    it("after an accepted play/discard the actor draws the deck's next card appended to the end, keeping surviving slots' order", () => {
      const state = baseState();
      const result = applyHanabiAction(state, "seat-a", { type: "discard", cardId: "seat-a-1" });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      const seatAHand = result.state.hands.find((h) => h.seatId === "seat-a")!;
      expect(seatAHand.slots.map((s) => s.card.id)).toEqual(["seat-a-2", "deck-1"]);
      const drawnSlot = seatAHand.slots[1]!;
      expect(drawnSlot.facts).toEqual(initialClueFacts(variantConfig("base")));
    });

    it("no draw occurs when the deck is empty", () => {
      const state = baseState({ deck: [] });
      const result = applyHanabiAction(state, "seat-a", { type: "discard", cardId: "seat-a-1" });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      const seatAHand = result.state.hands.find((h) => h.seatId === "seat-a")!;
      expect(seatAHand.slots.map((s) => s.card.id)).toEqual(["seat-a-2"]);
    });

    it("no draw occurs when finalTurnsRemaining is non-null (RULES-16)", () => {
      const state = baseState({ finalTurnsRemaining: 3 });
      const result = applyHanabiAction(state, "seat-a", { type: "discard", cardId: "seat-a-1" });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      const seatAHand = result.state.hands.find((h) => h.seatId === "seat-a")!;
      expect(seatAHand.slots.map((s) => s.card.id)).toEqual(["seat-a-2"]);
      // Final round decrements rather than being re-derived from deck length.
      expect(result.state.finalTurnsRemaining).toBe(2);
    });

    it("the turn advances by one seat on an accepted action", () => {
      const state = baseState();
      const result = applyHanabiAction(state, "seat-a", { type: "discard", cardId: "seat-a-1" });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.state.turnIndex).toBe(1);
    });

    it("a rejected action never advances the turn and leaves the input state untouched", () => {
      const state = baseState({ clueTokens: 8 });
      const snapshot = structuredClone(state);
      const result = applyHanabiAction(state, "seat-a", { type: "discard", cardId: "seat-a-1" });
      expect(result.ok).toBe(false);
      expect(state).toEqual(snapshot);
    });

    it("sets finalTurnsRemaining to seatIds.length exactly when the deck becomes empty on an accepted turn", () => {
      const state = baseState({ deck: [card("deck-1", "green", 3)] });
      const result = applyHanabiAction(state, "seat-a", { type: "discard", cardId: "seat-a-1" });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.state.deck.length).toBe(0);
      expect(result.state.finalTurnsRemaining).toBe(state.seatIds.length);
    });

    it("decrements finalTurnsRemaining by one on every later accepted turn", () => {
      const state = baseState({ deck: [], finalTurnsRemaining: 3 });
      const result = applyHanabiAction(state, "seat-a", { type: "discard", cardId: "seat-a-1" });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.state.finalTurnsRemaining).toBe(2);
    });
  });

  describe("non-mutation", () => {
    it("applyHanabiAction never mutates its state argument on an accepted action", () => {
      const state = baseState();
      const snapshot = structuredClone(state);
      applyHanabiAction(state, "seat-a", { type: "discard", cardId: "seat-a-1" });
      expect(state).toEqual(snapshot);
    });

    it("applyHanabiAction never mutates its state argument on a rejected action", () => {
      const state = baseState();
      const snapshot = structuredClone(state);
      applyHanabiAction(state, "seat-b", { type: "discard", cardId: "seat-b-1" }); // not seat-b's turn
      expect(state).toEqual(snapshot);
    });
  });

  describe("history", () => {
    it("an accepted play appends a matching history entry and a draw appends its own entry", () => {
      const state = baseState();
      const result = applyHanabiAction(state, "seat-a", { type: "play", cardId: "seat-a-1" });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.state.history).toHaveLength(2);
      expect(result.state.history[0]).toMatchObject({
        type: "play",
        seatId: "seat-a",
        cardId: "seat-a-1",
        success: true,
      });
      expect(result.state.history[1]).toMatchObject({ type: "draw", seatId: "seat-a", cardId: "deck-1" });
    });

    it("an accepted discard appends a matching history entry", () => {
      const state = baseState({ deck: [] });
      const result = applyHanabiAction(state, "seat-a", { type: "discard", cardId: "seat-a-1" });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.state.history).toHaveLength(1);
      expect(result.state.history[0]).toMatchObject({
        type: "discard",
        seatId: "seat-a",
        cardId: "seat-a-1",
      });
    });
  });
});
