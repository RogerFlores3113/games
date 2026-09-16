import { describe, expect, it } from "vitest";
import { HANABI_GAME_ID, HanabiViewSchema } from "./hanabi";

const ownCardFacts = {
  possibleSuits: ["red", "yellow"],
  possibleRanks: [1, 2, 3, 4, 5],
  positiveClues: [{ type: "color", value: "red" }],
  negativeClues: [{ type: "rank", value: 5 }],
};

const ownHiddenCard = { id: "card-1", hidden: true, facts: ownCardFacts };

const otherVisibleCard = {
  id: "card-2",
  hidden: false,
  suit: "blue",
  rank: 3,
  facts: {
    possibleSuits: ["blue"],
    possibleRanks: [3],
    positiveClues: [],
    negativeClues: [],
  },
};

const historyPlayEntry = {
  turn: 1,
  type: "play",
  seatId: "seat-1",
  cardId: "card-4",
  suit: "red",
  rank: 1,
  success: true,
};

const historyDiscardEntry = {
  turn: 2,
  type: "discard",
  seatId: "seat-2",
  cardId: "card-5",
  suit: "white",
  rank: 1,
};

const historyClueEntry = {
  turn: 3,
  type: "clue",
  seatId: "seat-1",
  targetSeatId: "seat-2",
  clue: { type: "color", value: "blue" },
  touchedCardIds: ["card-2"],
};

const historyDrawEntry = {
  turn: 4,
  type: "draw",
  seatId: "seat-1",
  cardId: "card-6",
};

const baseValidView = {
  variant: "base",
  yourSeatId: "seat-1",
  yourHand: [ownHiddenCard],
  otherHands: [
    {
      seatId: "seat-2",
      cards: [otherVisibleCard],
    },
  ],
  stacks: [{ suit: "red", topRank: 2 }],
  discard: [{ id: "card-3", suit: "white", rank: 1 }],
  clueTokens: 7,
  fuses: 3,
  deckCount: 30,
  finalTurnsRemaining: null,
  activeSeatId: "seat-1",
  isYourTurn: true,
  score: 2,
  history: [historyPlayEntry, historyDiscardEntry, historyClueEntry, historyDrawEntry],
};

describe("HanabiViewSchema", () => {
  it("accepts a complete, realistic view", () => {
    const result = HanabiViewSchema.safeParse(baseValidView);
    expect(result.success).toBe(true);
  });

  it("rejects a hidden own-hand card carrying suit", () => {
    const view = {
      ...baseValidView,
      yourHand: [{ id: "card-1", hidden: true, suit: "red", facts: ownCardFacts }],
    };
    expect(HanabiViewSchema.safeParse(view).success).toBe(false);
  });

  it("rejects a hidden own-hand card carrying rank", () => {
    const view = {
      ...baseValidView,
      yourHand: [{ id: "card-1", hidden: true, rank: 1, facts: ownCardFacts }],
    };
    expect(HanabiViewSchema.safeParse(view).success).toBe(false);
  });

  it("rejects a hidden own-hand card carrying suit: undefined (structural, not stringified)", () => {
    const fixture: Record<string, unknown> = {
      id: "card-1",
      hidden: true,
      suit: undefined,
      facts: ownCardFacts,
    };
    expect("suit" in fixture).toBe(true);
    const view = { ...baseValidView, yourHand: [fixture] };
    expect(HanabiViewSchema.safeParse(view).success).toBe(false);
  });

  it("rejects an unknown key at the top level", () => {
    const view = { ...baseValidView, extra: 1 };
    expect(HanabiViewSchema.safeParse(view).success).toBe(false);
  });

  it("rejects an unknown key on a nested otherHands[].cards[] entry", () => {
    const view = {
      ...baseValidView,
      otherHands: [
        {
          seatId: "seat-2",
          cards: [{ ...otherVisibleCard, extra: 1 }],
        },
      ],
    };
    expect(HanabiViewSchema.safeParse(view).success).toBe(false);
  });

  it("rejects an unknown key on a nested facts object", () => {
    const view = {
      ...baseValidView,
      yourHand: [{ ...ownHiddenCard, facts: { ...ownCardFacts, extra: 1 } }],
    };
    expect(HanabiViewSchema.safeParse(view).success).toBe(false);
  });

  it("rejects an unknown key on a nested history entry", () => {
    const view = {
      ...baseValidView,
      history: [{ ...historyPlayEntry, extra: 1 }],
    };
    expect(HanabiViewSchema.safeParse(view).success).toBe(false);
  });

  it("rejects clueTokens: 9 (out of engine range)", () => {
    const view = { ...baseValidView, clueTokens: 9 };
    expect(HanabiViewSchema.safeParse(view).success).toBe(false);
  });

  it("rejects fuses: 4 (out of engine range)", () => {
    const view = { ...baseValidView, fuses: 4 };
    expect(HanabiViewSchema.safeParse(view).success).toBe(false);
  });

  it("rejects an unknown suit string", () => {
    const view = { ...baseValidView, stacks: [{ suit: "purple", topRank: 1 }] };
    expect(HanabiViewSchema.safeParse(view).success).toBe(false);
  });

  it("rejects a rank of 6", () => {
    const view = { ...baseValidView, discard: [{ id: "card-3", suit: "white", rank: 6 }] };
    expect(HanabiViewSchema.safeParse(view).success).toBe(false);
  });

  it("exposes HANABI_GAME_ID as 'hanabi'", () => {
    expect(HANABI_GAME_ID).toBe("hanabi");
  });
});
