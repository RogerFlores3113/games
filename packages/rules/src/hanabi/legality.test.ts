import { describe, expect, it } from "vitest";
import {
  MAX_CLUE_TOKENS,
  MAX_FUSES,
  activeSeatId,
  canClue,
  canDiscard,
  canPlay,
  canReorder,
  cardsTouchedByClue,
  findOwnSlot,
  isActorsTurn,
} from "./legality";
import { dealInitialHands } from "./deck";
import { variantConfig } from "./variant";
import type { Variant } from "../adapter";
import type { HanabiState } from "./state";

const VARIANTS: Variant[] = ["base", "rainbow", "black"];

function buildState(
  variant: Variant,
  seatIds: readonly string[],
  seed: string,
  overrides: Partial<HanabiState> = {},
): HanabiState {
  const config = variantConfig(variant);
  const { hands, deck } = dealInitialHands({ config, seatIds, seed });
  return {
    variant,
    seatIds: [...seatIds],
    turnIndex: 0,
    hands,
    deck,
    stacks: config.suits.map((suit) => ({ suit, topRank: 0 })),
    discard: [],
    discardOrder: [],
    clueTokens: MAX_CLUE_TOKENS,
    fuses: 0,
    finalTurnsRemaining: null,
    history: [],
    ...overrides,
  };
}

describe("legality", () => {
  it("canPlay/canDiscard/canClue return not_your_turn when the actor is not the active seat", () => {
    const state = buildState("base", ["a", "b", "c"], "seed-1");
    const cardId = state.hands[0]!.slots[0]!.card.id;

    expect(canPlay(state, "b", cardId)).toEqual({ legal: false, reason: "not_your_turn" });
    expect(canDiscard(state, "b", cardId)).toEqual({ legal: false, reason: "not_your_turn" });
    expect(canClue(state, "b", "c", { type: "rank", value: 1 })).toEqual({
      legal: false,
      reason: "not_your_turn",
    });
  });

  it("all three return game_over when fuses are exhausted", () => {
    const state = buildState("base", ["a", "b", "c"], "seed-2", { fuses: MAX_FUSES });
    const cardId = state.hands[0]!.slots[0]!.card.id;

    expect(canPlay(state, "a", cardId)).toEqual({ legal: false, reason: "game_over" });
    expect(canDiscard(state, "a", cardId)).toEqual({ legal: false, reason: "game_over" });
    expect(canClue(state, "a", "b", { type: "rank", value: 1 })).toEqual({
      legal: false,
      reason: "game_over",
    });
  });

  it("all three return game_over when finalTurnsRemaining is 0", () => {
    const state = buildState("base", ["a", "b", "c"], "seed-3", { finalTurnsRemaining: 0 });
    const cardId = state.hands[0]!.slots[0]!.card.id;

    expect(canPlay(state, "a", cardId)).toEqual({ legal: false, reason: "game_over" });
    expect(canDiscard(state, "a", cardId)).toEqual({ legal: false, reason: "game_over" });
    expect(canClue(state, "a", "b", { type: "rank", value: 1 })).toEqual({
      legal: false,
      reason: "game_over",
    });
  });

  it("canPlay/canDiscard return card_not_in_hand for a card held by another seat, and for an unknown id", () => {
    const state = buildState("base", ["a", "b", "c"], "seed-4");
    const othersCard = state.hands[1]!.slots[0]!.card.id;

    expect(canPlay(state, "a", othersCard)).toEqual({ legal: false, reason: "card_not_in_hand" });
    expect(canDiscard(state, "a", othersCard)).toEqual({
      legal: false,
      reason: "card_not_in_hand",
    });
    expect(canPlay(state, "a", "not-a-real-id")).toEqual({
      legal: false,
      reason: "card_not_in_hand",
    });
    expect(canDiscard(state, "a", "not-a-real-id")).toEqual({
      legal: false,
      reason: "card_not_in_hand",
    });
  });

  it("canDiscard returns discard_at_max_clues at 8 tokens, and legal at 7", () => {
    const state8 = buildState("base", ["a", "b", "c"], "seed-5", { clueTokens: 8 });
    const cardId8 = state8.hands[0]!.slots[0]!.card.id;
    expect(canDiscard(state8, "a", cardId8)).toEqual({
      legal: false,
      reason: "discard_at_max_clues",
    });

    const state7 = buildState("base", ["a", "b", "c"], "seed-5", { clueTokens: 7 });
    const cardId7 = state7.hands[0]!.slots[0]!.card.id;
    expect(canDiscard(state7, "a", cardId7)).toEqual({ legal: true });
  });

  it("canClue returns no_clue_tokens at 0 tokens", () => {
    const state = buildState("base", ["a", "b", "c"], "seed-6", { clueTokens: 0 });
    expect(canClue(state, "a", "b", { type: "rank", value: 1 })).toEqual({
      legal: false,
      reason: "no_clue_tokens",
    });
  });

  it("canClue returns clue_target_invalid when targetSeatId equals the actor or is not a seat in the game", () => {
    const state = buildState("base", ["a", "b", "c"], "seed-7");

    expect(canClue(state, "a", "a", { type: "rank", value: 1 })).toEqual({
      legal: false,
      reason: "clue_target_invalid",
    });
    expect(canClue(state, "a", "not-a-seat", { type: "rank", value: 1 })).toEqual({
      legal: false,
      reason: "clue_target_invalid",
    });
  });

  it("canClue returns clue_touches_nothing for a color clue and separately for a rank clue matching nothing", () => {
    // Craft a hand deterministically: all cards in target's hand are red,
    // rank 1, so a "yellow" color clue and a rank-5 clue both touch zero.
    const config = variantConfig("base");
    const state = buildState("base", ["a", "b"], "seed-8");
    const targetHandIndex = state.hands.findIndex((h) => h.seatId === "b");
    const craftedSlots = state.hands[targetHandIndex]!.slots.map((slot) => ({
      ...slot,
      card: { ...slot.card, suit: "red" as const, rank: 1 as const },
    }));
    const craftedState: HanabiState = {
      ...state,
      hands: state.hands.map((h, i) =>
        i === targetHandIndex ? { seatId: h.seatId, slots: craftedSlots } : h,
      ),
    };
    void config;

    expect(canClue(craftedState, "a", "b", { type: "color", value: "yellow" })).toEqual({
      legal: false,
      reason: "clue_touches_nothing",
    });
    expect(canClue(craftedState, "a", "b", { type: "rank", value: 5 })).toEqual({
      legal: false,
      reason: "clue_touches_nothing",
    });
  });

  it("cardsTouchedByClue returns exactly the ids of matching slots, in slot order, for all three variants", () => {
    let ranOnce = false;
    for (const variant of VARIANTS) {
      const config = variantConfig(variant);
      const slots = [
        { card: { id: "s1", suit: "red" as const, rank: 1 as const }, facts: undefined as never },
        { card: { id: "s2", suit: "yellow" as const, rank: 1 as const }, facts: undefined as never },
        { card: { id: "s3", suit: "red" as const, rank: 2 as const }, facts: undefined as never },
      ];
      const touched = cardsTouchedByClue(config, slots, { type: "color", value: "red" });
      expect(touched).toEqual(["s1", "s3"]);
      ranOnce = true;
    }
    expect(ranOnce).toBe(true);
  });

  it("rainbow variant: a color clue of any cluable color touches a rainbow card", () => {
    const config = variantConfig("rainbow");
    const slots = [
      { card: { id: "r1", suit: "rainbow" as const, rank: 1 as const }, facts: undefined as never },
    ];
    expect(cardsTouchedByClue(config, slots, { type: "color", value: "red" })).toEqual(["r1"]);
    expect(cardsTouchedByClue(config, slots, { type: "color", value: "blue" })).toEqual(["r1"]);
  });

  describe("canReorder", () => {
    it("is legal for an exact permutation of the actor's hand ids, including identity order, when it is NOT the actor's turn", () => {
      const state = buildState("base", ["a", "b", "c"], "seed-10");
      // "b" is not the active seat (turnIndex 0 -> "a").
      const bIds = state.hands.find((h) => h.seatId === "b")!.slots.map((s) => s.card.id);
      expect(canReorder(state, "b", bIds)).toEqual({ legal: true });
      expect(canReorder(state, "b", [...bIds].reverse())).toEqual({ legal: true });
    });

    it("rejects wrong length, a duplicate id, an id from another seat, an unknown id, or an unknown actor seat with card_not_in_hand", () => {
      const state = buildState("base", ["a", "b", "c"], "seed-11");
      const aIds = state.hands.find((h) => h.seatId === "a")!.slots.map((s) => s.card.id);
      const bIds = state.hands.find((h) => h.seatId === "b")!.slots.map((s) => s.card.id);

      expect(canReorder(state, "a", aIds.slice(1))).toEqual({
        legal: false,
        reason: "card_not_in_hand",
      });
      expect(canReorder(state, "a", [aIds[0]!, aIds[0]!])).toEqual({
        legal: false,
        reason: "card_not_in_hand",
      });
      expect(canReorder(state, "a", [aIds[0]!, bIds[0]!])).toEqual({
        legal: false,
        reason: "card_not_in_hand",
      });
      expect(canReorder(state, "a", ["not-a-real-id", aIds[1]!])).toEqual({
        legal: false,
        reason: "card_not_in_hand",
      });
      expect(canReorder(state, "not-a-seat", ["x"])).toEqual({
        legal: false,
        reason: "card_not_in_hand",
      });
    });

    it("rejects with game_over when fuses >= MAX_FUSES or finalTurnsRemaining === 0", () => {
      const stateFuses = buildState("base", ["a", "b"], "seed-12", { fuses: MAX_FUSES });
      const aIds = stateFuses.hands.find((h) => h.seatId === "a")!.slots.map((s) => s.card.id);
      expect(canReorder(stateFuses, "a", aIds)).toEqual({ legal: false, reason: "game_over" });

      const stateFinal = buildState("base", ["a", "b"], "seed-13", { finalTurnsRemaining: 0 });
      const aIds2 = stateFinal.hands.find((h) => h.seatId === "a")!.slots.map((s) => s.card.id);
      expect(canReorder(stateFinal, "a", aIds2)).toEqual({ legal: false, reason: "game_over" });
    });
  });

  it("every predicate is callable on any state without side effects", () => {
    const state = buildState("base", ["a", "b", "c"], "seed-9");
    const snapshot: HanabiState = JSON.parse(JSON.stringify(state));
    const cardId = state.hands[0]!.slots[0]!.card.id;

    canPlay(state, "a", cardId);
    canDiscard(state, "a", cardId);
    canClue(state, "a", "b", { type: "rank", value: 1 });
    activeSeatId(state);
    isActorsTurn(state, "a");
    findOwnSlot(state, "a", cardId);

    expect(state).toEqual(snapshot);
  });
});
