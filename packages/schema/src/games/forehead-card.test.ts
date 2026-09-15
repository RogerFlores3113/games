import { describe, expect, it } from "vitest";
import { FOREHEAD_CARD_GAME_ID, ForeheadCardViewSchema } from "./forehead-card";

const baseValidView = {
  yourCard: { id: "abcdefgh", hidden: true },
  otherCards: [
    { seatId: "seat-2", card: { id: "id2", hidden: false, value: "Sirius" } },
    { seatId: "seat-3", card: { id: "id3", hidden: false, value: "Antares" } },
  ],
  revealed: [{ id: "id9", seatId: "seat-9", value: "Altair", correct: true }],
  deckCount: 12,
  activeSeatId: "seat-1",
  isYourTurn: false,
  score: 1,
};

describe("ForeheadCardViewSchema", () => {
  it("accepts a valid view", () => {
    const result = ForeheadCardViewSchema.safeParse(baseValidView);
    expect(result.success).toBe(true);
  });

  it("accepts the unknown-viewer fallback (yourCard unseated, every otherCards card hidden)", () => {
    const view = {
      ...baseValidView,
      yourCard: { id: "unseated", hidden: true },
      otherCards: [
        { seatId: "seat-2", card: { id: "id2", hidden: true } },
        { seatId: "seat-3", card: { id: "id3", hidden: true } },
      ],
    };
    const result = ForeheadCardViewSchema.safeParse(view);
    expect(result.success).toBe(true);
  });

  it("rejects yourCard carrying a value key", () => {
    const view = { ...baseValidView, yourCard: { id: "abcdefgh", hidden: true, value: "Sirius" } };
    const result = ForeheadCardViewSchema.safeParse(view);
    expect(result.success).toBe(false);
  });

  it("rejects yourCard with value: null", () => {
    const view = { ...baseValidView, yourCard: { id: "abcdefgh", hidden: true, value: null } };
    const result = ForeheadCardViewSchema.safeParse(view);
    expect(result.success).toBe(false);
  });

  it("rejects yourCard with value: undefined (structural, not stringified)", () => {
    const fixture: Record<string, unknown> = { id: "abcdefgh", hidden: true, value: undefined };
    expect("value" in fixture).toBe(true);
    const view = { ...baseValidView, yourCard: fixture };
    const result = ForeheadCardViewSchema.safeParse(view);
    expect(result.success).toBe(false);
  });

  it("rejects a visible card occupying the yourCard slot", () => {
    const view = { ...baseValidView, yourCard: { id: "abcdefgh", hidden: false, value: "Sirius" } };
    const result = ForeheadCardViewSchema.safeParse(view);
    expect(result.success).toBe(false);
  });

  it("rejects an otherCards card with hidden: true and a value key", () => {
    const view = {
      ...baseValidView,
      otherCards: [{ seatId: "seat-2", card: { id: "id2", hidden: true, value: "Sirius" } }],
    };
    const result = ForeheadCardViewSchema.safeParse(view);
    expect(result.success).toBe(false);
  });

  it("rejects an otherCards card with hidden: true and value: undefined", () => {
    const fixture: Record<string, unknown> = { id: "id2", hidden: true, value: undefined };
    expect("value" in fixture).toBe(true);
    const view = { ...baseValidView, otherCards: [{ seatId: "seat-2", card: fixture }] };
    const result = ForeheadCardViewSchema.safeParse(view);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown top-level key", () => {
    const view = { ...baseValidView, deck: [], seed: "x" };
    const result = ForeheadCardViewSchema.safeParse(view);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown key on an otherCards entry", () => {
    const view = {
      ...baseValidView,
      otherCards: [{ seatId: "seat-2", card: { id: "id2", hidden: true }, extra: 1 }],
    };
    const result = ForeheadCardViewSchema.safeParse(view);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown key on a card", () => {
    const view = {
      ...baseValidView,
      otherCards: [{ seatId: "seat-2", card: { id: "id2", hidden: true, rank: 1 } }],
    };
    const result = ForeheadCardViewSchema.safeParse(view);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown key on a revealed entry", () => {
    const view = {
      ...baseValidView,
      revealed: [{ id: "id9", seatId: "seat-9", value: "Altair", correct: true, extra: 1 }],
    };
    const result = ForeheadCardViewSchema.safeParse(view);
    expect(result.success).toBe(false);
  });

  it("rejects a negative deckCount", () => {
    const view = { ...baseValidView, deckCount: -1 };
    const result = ForeheadCardViewSchema.safeParse(view);
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer deckCount", () => {
    const view = { ...baseValidView, deckCount: 1.5 };
    const result = ForeheadCardViewSchema.safeParse(view);
    expect(result.success).toBe(false);
  });

  it("rejects a negative score", () => {
    const view = { ...baseValidView, score: -1 };
    const result = ForeheadCardViewSchema.safeParse(view);
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer score", () => {
    const view = { ...baseValidView, score: 1.5 };
    const result = ForeheadCardViewSchema.safeParse(view);
    expect(result.success).toBe(false);
  });

  it("exposes FOREHEAD_CARD_GAME_ID as 'forehead-card'", () => {
    expect(FOREHEAD_CARD_GAME_ID).toBe("forehead-card");
  });
});
