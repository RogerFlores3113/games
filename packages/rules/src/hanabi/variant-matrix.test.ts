// D-10 variant sweep: every variant-sensitive rule (deck composition, clue
// touching, scoring ceiling) exercised across base, Rainbow and Black in one
// place, so Phase 7 only has to prove this end to end, not discover
// restructuring work. The full-game case uses a fixed seed and a
// deterministic action-choice rule (always the first legal action) rather
// than randomness — the random case is already covered by plan 05's
// properties.

import { describe, expect, it } from "vitest";
import { hanabiGame } from "./adapter";
import { buildDeck } from "./deck";
import { checkHanabiGameEnd } from "./endgame";
import { maxScoreFor, variantConfig } from "./variant";
import type { Variant } from "../adapter";
import { currentActorSeatId, enumerateLegalActions } from "./test-support";

const VARIANTS = ["base", "rainbow", "black"] as const satisfies readonly Variant[];

const EXPECTED_SUIT_COUNT: Readonly<Record<Variant, number>> = {
  base: 5,
  rainbow: 6,
  black: 6,
};

const EXPECTED_DECK_SIZE: Readonly<Record<Variant, number>> = {
  base: 50,
  rainbow: 60,
  black: 55,
};

const EXPECTED_MAX_SCORE: Readonly<Record<Variant, number>> = {
  base: 25,
  rainbow: 30,
  black: 30,
};

const VALID_BANDS = [
  "Oh no!",
  "Horrible",
  "Poor",
  "Decent",
  "Excellent",
  "Extraordinary",
  "Legendary",
];

describe("variant matrix", () => {
  it("every variant-sensitive rule holds for base, rainbow and black", () => {
    let variantsSwept = 0;

    for (const variant of VARIANTS) {
      variantsSwept++;
      const config = variantConfig(variant);

      // Deck composition, suit count, scoring ceiling.
      expect(config.suits.length).toBe(EXPECTED_SUIT_COUNT[variant]);
      expect(buildDeck(config).length).toBe(EXPECTED_DECK_SIZE[variant]);
      expect(maxScoreFor(config)).toBe(EXPECTED_MAX_SCORE[variant]);

      // A full seeded game played to completion with a deterministic
      // action-choice rule (always the first legal action), reproducible
      // across runs.
      const seatIds = ["seat-0", "seat-1", "seat-2"];
      const seed = "5".repeat(32);
      let state = hanabiGame.createInitialState({ seatIds, variant, seed });
      let turns = 0;
      const HARD_BOUND = 2000;
      while (checkHanabiGameEnd(state) === null && turns < HARD_BOUND) {
        const legal = enumerateLegalActions(state);
        if (legal.length === 0) break;
        const action = legal[0]!;
        const actorSeatId = currentActorSeatId(state);
        const result = hanabiGame.applyAction(state, actorSeatId, action);
        if (result.ok) state = result.state;
        turns++;
      }
      const endResult = checkHanabiGameEnd(state);
      expect(endResult).not.toBeNull();
      if (endResult !== null) {
        expect(endResult.score).toBeGreaterThanOrEqual(0);
        expect(endResult.score).toBeLessThanOrEqual(EXPECTED_MAX_SCORE[variant]);
        expect(typeof endResult.band).toBe("string");
        expect(VALID_BANDS).toContain(endResult.band);
      }

      if (variant === "rainbow") {
        // Rainbow: a color clue touches the rainbow card in addition to the
        // named color's cards, and "rainbow" is never offered as a cluable
        // color.
        expect(config.cluableColors.includes("rainbow")).toBe(false);
        expect(config.colorClueTouches("rainbow", "red")).toBe(true);
        expect(config.colorClueTouches("red", "red")).toBe(true);
        expect(config.colorClueTouches("blue", "red")).toBe(false);
      }

      if (variant === "black") {
        // Black: "black" IS offered as a cluable color, and a black color
        // clue touches only black cards.
        expect(config.cluableColors.includes("black")).toBe(true);
        expect(config.colorClueTouches("black", "black")).toBe(true);
        expect(config.colorClueTouches("red", "black")).toBe(false);

        // Each black rank exists exactly once in the deck, so discarding a
        // black card makes that rank's stack unachievable — a deck
        // composition consequence, not a new rule.
        const deck = buildDeck(config);
        const blackCards = deck.filter((c) => c.suit === "black");
        expect(blackCards.length).toBe(5);
        expect(blackCards.map((c) => c.rank).sort()).toEqual([1, 2, 3, 4, 5]);
      }
    }

    // D-22 non-vacuousness: the sweep ran once per variant, not zero times
    // and not a partial subset.
    expect(variantsSwept).toBe(3);
  });
});
