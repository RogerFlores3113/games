import { describe, expect, it } from "vitest";
import { checkHanabiGameEnd, currentScore, scoreBand } from "./endgame";
import { initialClueFacts } from "./clue-facts";
import { variantConfig } from "./variant";
import type { HanabiCard, HanabiState, StackEntry } from "./state";

function card(id: string, suit: string, rank: number): HanabiCard {
  return { id, suit: suit as HanabiCard["suit"], rank: rank as HanabiCard["rank"] };
}

function stacksAt(
  variant: "base" | "rainbow" | "black",
  topRankBySuit: Record<string, number> = {},
): StackEntry[] {
  return variantConfig(variant).suits.map((suit) => ({
    suit,
    topRank: topRankBySuit[suit] ?? 0,
  }));
}

function baseState(overrides: Partial<HanabiState> = {}): HanabiState {
  const config = variantConfig("base");
  const seatIds = ["seat-a", "seat-b", "seat-c"];
  const hands = seatIds.map((seatId) => ({
    seatId,
    slots: [{ card: card(`${seatId}-1`, "red", 1), facts: initialClueFacts(config) }],
  }));
  return {
    variant: "base",
    seatIds,
    turnIndex: 0,
    hands,
    deck: [],
    stacks: stacksAt("base"),
    discard: [],
    discardOrder: [],
    clueTokens: 8,
    fuses: 0,
    finalTurnsRemaining: null,
    history: [],
    ...overrides,
  };
}

function fullStacks(variant: "base" | "rainbow" | "black"): StackEntry[] {
  return variantConfig(variant).suits.map((suit) => ({ suit, topRank: 5 }));
}

describe("endgame", () => {
  it("currentScore sums every stack's topRank; an untouched game scores 0", () => {
    expect(currentScore(baseState())).toBe(0);
    expect(currentScore(baseState({ stacks: stacksAt("base", { red: 3, blue: 5 }) }))).toBe(8);
  });

  it("checkHanabiGameEnd returns null while the game continues", () => {
    expect(checkHanabiGameEnd(baseState())).toBeNull();
  });

  it("returns fuses_exhausted with the score at that moment when fuses === 3", () => {
    const state = baseState({ fuses: 3, stacks: stacksAt("base", { red: 2 }) });
    const result = checkHanabiGameEnd(state);
    expect(result).toMatchObject({ score: 2, reason: "fuses_exhausted" });
  });

  it("returns all_stacks_complete at maxScoreFor(config), including mid-final-round", () => {
    const state = baseState({ stacks: fullStacks("base"), finalTurnsRemaining: 2 });
    const result = checkHanabiGameEnd(state);
    expect(result).toMatchObject({ score: 25, reason: "all_stacks_complete" });
  });

  it("returns final_round_elapsed when finalTurnsRemaining === 0", () => {
    const state = baseState({ finalTurnsRemaining: 0, stacks: stacksAt("base", { red: 4 }) });
    const result = checkHanabiGameEnd(state);
    expect(result).toMatchObject({ score: 4, reason: "final_round_elapsed" });
  });

  it("returns fuses_exhausted (fixed priority) when fuses are exhausted and the final round has also elapsed", () => {
    const state = baseState({ fuses: 3, finalTurnsRemaining: 0 });
    const result = checkHanabiGameEnd(state);
    expect(result).toMatchObject({ reason: "fuses_exhausted" });
  });

  it("every returned GameEndResult carries a band string", () => {
    const result = checkHanabiGameEnd(baseState({ fuses: 3 }));
    expect(result).not.toBeNull();
    expect(typeof result!.band).toBe("string");
  });
});

describe("scoring", () => {
  it("base-game (25-max) band mapping", () => {
    expect(scoreBand(0, 25)).toBe("Oh no!");
    expect(scoreBand(5, 25)).toBe("Horrible");
    expect(scoreBand(6, 25)).toBe("Poor");
    expect(scoreBand(11, 25)).toBe("Decent");
    expect(scoreBand(16, 25)).toBe("Excellent");
    expect(scoreBand(21, 25)).toBe("Extraordinary");
    expect(scoreBand(25, 25)).toBe("Legendary");
  });

  it("scales proportionally for a 30-point variant", () => {
    expect(scoreBand(7, 30)).toBe("Horrible");
    expect(scoreBand(8, 30)).toBe("Poor");
    expect(scoreBand(14, 30)).toBe("Decent");
    expect(scoreBand(20, 30)).toBe("Excellent");
    expect(scoreBand(26, 30)).toBe("Extraordinary");
    expect(scoreBand(30, 30)).toBe("Legendary");
  });
});
