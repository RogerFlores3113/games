import { describe, expect, it } from "vitest";
import {
  FOREHEAD_CARD_VALUES,
  foreheadCardGame,
  type ForeheadCardView,
  type HiddenCardView,
} from "./forehead-card";

const seatIds = ["seat-a", "seat-b", "seat-c"] as const;

function initial(seed = "0123456789abcdef0123456789abcdef") {
  return foreheadCardGame.createInitialState({
    seatIds: [...seatIds],
    variant: "base",
    seed,
  });
}

describe("foreheadCardGame.createInitialState", () => {
  it("deals one card per seat in seatIds order and leaves the rest in the deck", () => {
    const state = initial();
    expect(state.hands).toHaveLength(3);
    expect(state.hands.map((h) => h.seatId)).toEqual([...seatIds]);
    expect(state.deck).toHaveLength(13);
    expect(state.revealed).toEqual([]);
    expect(state.score).toBe(0);
    expect(state.turnIndex).toBe(0);
  });

  it("the multiset of hand values plus deck equals FOREHEAD_CARD_VALUES exactly", () => {
    const state = initial();
    const all = [...state.hands.map((h) => h.card.value), ...state.deck].sort();
    expect(all).toEqual([...FOREHEAD_CARD_VALUES].sort());
  });

  it("is deterministic for the same input", () => {
    const a = initial();
    const b = initial();
    expect(a).toEqual(b);
  });

  it("differs in deck order for at least one of 10 seed pairs", () => {
    let sawDifference = false;
    for (let i = 0; i < 10; i++) {
      const seedA = `seed-a-${i}`;
      const seedB = `seed-b-${i}`;
      const a = initial(seedA);
      const b = initial(seedB);
      if (JSON.stringify(a.deck) !== JSON.stringify(b.deck)) sawDifference = true;
    }
    expect(sawDifference).toBe(true);
  });

  it("every hand card id matches /^[a-z]{8}$/ and ids are unique; deck entries are bare strings", () => {
    const state = initial();
    const ids = state.hands.map((h) => h.card.id);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z]{8}$/);
    }
    expect(new Set(ids).size).toBe(ids.length);
    for (const value of state.deck) {
      expect(typeof value).toBe("string");
    }
  });
});

describe("foreheadCardGame.applyAction", () => {
  it("a correct guess by the active seat reveals the card, scores, and deals a replacement", () => {
    const state = initial();
    const active = state.seatIds[state.turnIndex]!;
    const ownHand = state.hands.find((h) => h.seatId === active)!;
    const snapshot = structuredClone(state);

    const result = foreheadCardGame.applyAction(state, active, {
      type: "guess",
      value: ownHand.card.value,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.revealed).toHaveLength(1);
    expect(result.state.revealed[0]).toEqual({
      id: ownHand.card.id,
      seatId: active,
      value: ownHand.card.value,
      correct: true,
    });
    expect(result.state.score).toBe(1);
    const newHand = result.state.hands.find((h) => h.seatId === active)!;
    expect(newHand.card.id).not.toBe(ownHand.card.id);
    expect(newHand.card.value).toBe(state.deck[0]);
    expect(result.state.deck).toHaveLength(state.deck.length - 1);
    expect(result.state.turnIndex).toBe((state.turnIndex + 1) % seatIds.length);
    // input state untouched
    expect(state).toEqual(snapshot);
  });

  it("a wrong guess reveals the card without scoring", () => {
    const state = initial();
    const active = state.seatIds[state.turnIndex]!;
    const ownHand = state.hands.find((h) => h.seatId === active)!;
    const wrongValue = FOREHEAD_CARD_VALUES.find((v) => v !== ownHand.card.value)!;

    const result = foreheadCardGame.applyAction(state, active, {
      type: "guess",
      value: wrongValue,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.revealed[0]!.correct).toBe(false);
    expect(result.state.score).toBe(0);
  });

  it("rejects an out-of-turn guess", () => {
    const state = initial();
    const inactive = state.seatIds[(state.turnIndex + 1) % seatIds.length]!;
    const result = foreheadCardGame.applyAction(state, inactive, {
      type: "guess",
      value: FOREHEAD_CARD_VALUES[0],
    });
    expect(result).toEqual({ ok: false, error: "not_your_turn" });
  });

  it.each([
    "guess",
    null,
    { type: "guess" },
    { type: "guess", value: "Pluto" },
    { type: "guess", value: "Altair", score: 99 },
    { type: "increment" },
  ])("rejects invalid payload %j", (payload) => {
    const state = initial();
    const active = state.seatIds[state.turnIndex]!;
    const result = foreheadCardGame.applyAction(state, active, payload as unknown);
    expect(result).toEqual({ ok: false, error: "invalid_action" });
  });

  it("rejects any guess once the deck is empty", () => {
    let state = initial();
    while (state.deck.length > 0) {
      const active = state.seatIds[state.turnIndex]!;
      const hand = state.hands.find((h) => h.seatId === active)!;
      const result = foreheadCardGame.applyAction(state, active, {
        type: "guess",
        value: hand.card.value,
      });
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state;
    }
    const active = state.seatIds[state.turnIndex]!;
    const result = foreheadCardGame.applyAction(state, active, {
      type: "guess",
      value: FOREHEAD_CARD_VALUES[0],
    });
    expect(result).toEqual({ ok: false, error: "game_over" });
  });

  it("never mutates input state on accepted or rejected calls", () => {
    const state = initial();
    const snapshot = structuredClone(state);
    const active = state.seatIds[state.turnIndex]!;
    const ownHand = state.hands.find((h) => h.seatId === active)!;
    foreheadCardGame.applyAction(state, active, { type: "guess", value: ownHand.card.value });
    expect(state).toEqual(snapshot);

    const snapshot2 = structuredClone(state);
    foreheadCardGame.applyAction(state, "not-a-seat", { type: "guess", value: "x" });
    expect(state).toEqual(snapshot2);
  });
});

describe("foreheadCardGame.checkGameEnd", () => {
  it("is null while the deck is non-empty", () => {
    const state = initial();
    expect(foreheadCardGame.checkGameEnd(state)).toBeNull();
  });

  it("returns { score, reason: 'deck_exhausted' } once the deck is empty; 2 seats end after 14 accepted guesses", () => {
    let state = foreheadCardGame.createInitialState({
      seatIds: ["seat-a", "seat-b"],
      variant: "base",
      seed: "two-seat-seed",
    });
    let guesses = 0;
    while (foreheadCardGame.checkGameEnd(state) === null) {
      const active = state.seatIds[state.turnIndex]!;
      const hand = state.hands.find((h) => h.seatId === active)!;
      const result = foreheadCardGame.applyAction(state, active, {
        type: "guess",
        value: hand.card.value,
      });
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state;
      guesses++;
    }
    expect(guesses).toBe(14);
    const end = foreheadCardGame.checkGameEnd(state);
    expect(end).toEqual({ score: state.score, reason: "deck_exhausted" });
  });
});

describe("foreheadCardGame.toPlayerView", () => {
  it("yourCard has exactly keys ['hidden','id'] and hidden === true", () => {
    const state = initial();
    const view = foreheadCardGame.toPlayerView(state, "seat-a") as ForeheadCardView;
    expect(Object.keys(view.yourCard).sort()).toEqual(["hidden", "id"]);
    expect(view.yourCard.hidden).toBe(true);
  });

  it("otherCards lists every other seat in seat order with the true value", () => {
    const state = initial();
    const view = foreheadCardGame.toPlayerView(state, "seat-a") as ForeheadCardView;
    expect(view.otherCards.map((c) => c.seatId)).toEqual(["seat-b", "seat-c"]);
    for (const other of view.otherCards) {
      expect(other.card.hidden).toBe(false);
      const hand = state.hands.find((h) => h.seatId === other.seatId)!;
      expect((other.card as { value: string }).value).toBe(hand.card.value);
    }
  });

  it("the result has exactly the expected top-level keys", () => {
    const state = initial();
    const view = foreheadCardGame.toPlayerView(state, "seat-a") as ForeheadCardView;
    expect(Object.keys(view).sort()).toEqual([
      "activeSeatId",
      "deckCount",
      "isYourTurn",
      "otherCards",
      "revealed",
      "score",
      "yourCard",
    ]);
  });

  it("isYourTurn is true for exactly one seat", () => {
    const state = initial();
    const trueCount = seatIds.filter(
      (seatId) => (foreheadCardGame.toPlayerView(state, seatId) as ForeheadCardView).isYourTurn,
    ).length;
    expect(trueCount).toBe(1);
  });

  it("redaction is unchanged once the game has ended", () => {
    let state = foreheadCardGame.createInitialState({
      seatIds: ["seat-a", "seat-b"],
      variant: "base",
      seed: "end-seed",
    });
    while (foreheadCardGame.checkGameEnd(state) === null) {
      const active = state.seatIds[state.turnIndex]!;
      const hand = state.hands.find((h) => h.seatId === active)!;
      const result = foreheadCardGame.applyAction(state, active, {
        type: "guess",
        value: hand.card.value,
      });
      if (result.ok) state = result.state;
    }
    const view = foreheadCardGame.toPlayerView(state, "seat-a") as ForeheadCardView;
    expect(Object.keys(view.yourCard).sort()).toEqual(["hidden", "id"]);
    expect(view.yourCard.hidden).toBe(true);
  });

  it("fails closed for an unseated viewer: yourCard is a placeholder and every hand is hidden", () => {
    const state = initial();
    const view = foreheadCardGame.toPlayerView(state, "seat-unknown") as ForeheadCardView;
    expect(view.yourCard).toEqual<HiddenCardView>({ id: "unseated", hidden: true });
    for (const other of view.otherCards) {
      expect(other.card.hidden).toBe(true);
    }
  });

  it("no FOREHEAD_CARD_VALUES entry is a substring of another, of any view key, and has length >= 6", () => {
    const viewKeys = [
      "yourCard",
      "otherCards",
      "revealed",
      "deckCount",
      "activeSeatId",
      "isYourTurn",
      "score",
      "hidden",
      "value",
      "seatId",
      "id",
      "correct",
    ];
    for (const value of FOREHEAD_CARD_VALUES) {
      expect(value.length).toBeGreaterThanOrEqual(6);
      for (const other of FOREHEAD_CARD_VALUES) {
        if (other === value) continue;
        expect(other.includes(value)).toBe(false);
      }
      for (const key of viewKeys) {
        expect(key.includes(value)).toBe(false);
      }
    }
  });
});
