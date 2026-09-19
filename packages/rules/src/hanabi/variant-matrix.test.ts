// D-10 variant sweep: every variant-sensitive rule (deck composition, clue
// touching, scoring ceiling) exercised across base, Rainbow and Black in one
// place, so Phase 7 only has to prove this end to end, not discover
// restructuring work. The full-game case uses a fixed seed and a
// deterministic action-choice rule (always the first legal action) rather
// than randomness — the random case is already covered by plan 05's
// properties.

import { describe, expect, it } from "vitest";
import { hanabiGame } from "./adapter";
import { buildDeck, dealInitialHands } from "./deck";
import { checkHanabiGameEnd, currentScore, scoreBand } from "./endgame";
import { MAX_CLUE_TOKENS, MAX_FUSES } from "./legality";
import { maxScoreFor, variantConfig } from "./variant";
import type { Variant } from "../adapter";
import { currentActorSeatId, enumerateLegalActions } from "./test-support";
import type { HanabiCard, HanabiState } from "./state";

const VARIANTS = ["base", "rainbow", "black"] as const satisfies readonly Variant[];

const EXPECTED_SUIT_COUNT: Readonly<Record<Variant, number>> = {
  base: 5,
  rainbow: 6,
  black: 7,
};

const EXPECTED_DECK_SIZE: Readonly<Record<Variant, number>> = {
  base: 50,
  rainbow: 60,
  black: 65,
};

const EXPECTED_MAX_SCORE: Readonly<Record<Variant, number>> = {
  base: 25,
  rainbow: 30,
  black: 35,
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
        // Black (owner gap closure, 2026-09-18): "black" is NEVER offered as
        // a cluable color, "rainbow" is not either, and no colour clue ever
        // touches a black card — only rank clues touch black.
        expect(config.cluableColors.includes("black")).toBe(false);
        expect(config.cluableColors.includes("rainbow")).toBe(false);
        expect(config.colorClueTouches("black", "black")).toBe(false);
        expect(config.colorClueTouches("black", "red")).toBe(false);
        expect(config.colorClueTouches("red", "black")).toBe(false);
        expect(config.colorClueTouches("rainbow", "black")).toBe(false);

        // Each black rank exists exactly once in the deck, so discarding a
        // black card makes that rank's stack unachievable — a deck
        // composition consequence, not a new rule.
        const deck = buildDeck(config);
        const blackCards = deck.filter((c) => c.suit === "black");
        expect(blackCards.length).toBe(5);
        expect(blackCards.map((c) => c.rank).sort()).toEqual([1, 2, 3, 4, 5]);

        // Rainbow inside Black keeps its full unchanged 10-card
        // distribution ("do not adjust number of rainbow tiles").
        const rainbowCards = deck.filter((c) => c.suit === "rainbow");
        expect(rainbowCards.length).toBe(10);
      }
    }

    // D-22 non-vacuousness: the sweep ran once per variant, not zero times
    // and not a partial subset.
    expect(variantsSwept).toBe(3);
  });
});

// D-16/D-14: every variant reaches every end condition (fuse-out, a perfect
// score, and the final round after deck exhaustion) with score, maxScoreFor
// and scoreBand agreeing, and no early "unwinnable" end exists anywhere.
// States are constructed with the buildState + override technique
// (legality.test.ts) rather than a new production helper (D-13: no
// variant-specific criticality or end-detection code is added by this
// plan — only existing engine exports are exercised).
describe("variant matrix: every end condition per variant (D-16)", () => {
  it("each variant reaches fuses_exhausted, all_stacks_complete and final_round_elapsed with score/maxScoreFor/band always agreeing, and no early unwinnable end (D-14)", () => {
    let variantsSwept = 0;
    const seatIds = ["seat-0", "seat-1", "seat-2"];

    for (const variant of VARIANTS) {
      const config = variantConfig(variant);
      const maxScore = maxScoreFor(config);

      // (a) fuses_exhausted: fuses one below the cap, then a misplay from
      // the active seat tips it over the edge.
      {
        const seed = `end-fuses-${variant}`;
        const { hands, deck } = dealInitialHands({ config, seatIds, seed });
        const active = seatIds[0]!;
        const activeHandIndex = hands.findIndex((h) => h.seatId === active);
        const originalCardId = hands[activeHandIndex]!.slots[0]!.card.id;
        // A rank-5 card while the first suit's stack sits at 0 can never be
        // a legal play (topRank + 1 === 1, not 5) — guaranteed misplay.
        const unplayableCard = { id: originalCardId, suit: config.suits[0]!, rank: 5 as const };
        const craftedHands = hands.map((h, i) =>
          i === activeHandIndex
            ? {
                seatId: h.seatId,
                slots: h.slots.map((s, j) => (j === 0 ? { ...s, card: unplayableCard } : s)),
              }
            : h,
        );
        let state: HanabiState = {
          variant,
          seatIds: [...seatIds],
          turnIndex: 0,
          hands: craftedHands,
          deck,
          stacks: config.suits.map((suit) => ({ suit, topRank: 0 })),
          discard: [],
          discardOrder: [],
          clueTokens: MAX_CLUE_TOKENS,
          fuses: MAX_FUSES - 1,
          finalTurnsRemaining: null,
          history: [],
        };

        const result = hanabiGame.applyAction(state, active, {
          type: "play",
          cardId: unplayableCard.id,
        });
        expect(result.ok).toBe(true);
        if (result.ok) state = result.state;

        const endResult = checkHanabiGameEnd(state);
        expect(endResult).not.toBeNull();
        expect(endResult?.reason).toBe("fuses_exhausted");
        expect(endResult?.score).toBe(currentScore(state));
        expect(endResult?.band).toBe(scoreBand(endResult!.score, maxScoreFor(config)));
      }

      // (b) all_stacks_complete: every stack full except the last suit
      // (the variant's sixth, box-specific suit in Rainbow/Black), and the
      // active seat plays the completing card.
      {
        const seed = `end-complete-${variant}`;
        const { hands, deck } = dealInitialHands({ config, seatIds, seed });
        const active = seatIds[0]!;
        const activeHandIndex = hands.findIndex((h) => h.seatId === active);
        const originalCardId = hands[activeHandIndex]!.slots[0]!.card.id;
        const lastSuit = config.suits[config.suits.length - 1]!;
        const completingCard = { id: originalCardId, suit: lastSuit, rank: 5 as const };
        const craftedHands = hands.map((h, i) =>
          i === activeHandIndex
            ? {
                seatId: h.seatId,
                slots: h.slots.map((s, j) => (j === 0 ? { ...s, card: completingCard } : s)),
              }
            : h,
        );
        let state: HanabiState = {
          variant,
          seatIds: [...seatIds],
          turnIndex: 0,
          hands: craftedHands,
          deck,
          stacks: config.suits.map((suit) => ({ suit, topRank: suit === lastSuit ? 4 : 5 })),
          discard: [],
          discardOrder: [],
          clueTokens: MAX_CLUE_TOKENS,
          fuses: 0,
          finalTurnsRemaining: null,
          history: [],
        };

        const result = hanabiGame.applyAction(state, active, {
          type: "play",
          cardId: completingCard.id,
        });
        expect(result.ok).toBe(true);
        if (result.ok) state = result.state;

        const endResult = checkHanabiGameEnd(state);
        expect(endResult).not.toBeNull();
        expect(endResult?.reason).toBe("all_stacks_complete");
        expect(endResult?.score).toBe(EXPECTED_MAX_SCORE[variant]);
        expect(endResult?.score).toBe(maxScore);
        expect(endResult?.band).toBe("Legendary");
      }

      // (c) final_round_elapsed: a single-card deck, driven with
      // enumerateLegalActions/currentActorSeatId preferring discard then
      // clue (the same deterministic fallback termination.property.test.ts's
      // deck-exhaustion case uses), never a play, until the game ends.
      {
        const seed = `end-final-${variant}`;
        const { hands, deck } = dealInitialHands({ config, seatIds, seed });
        let state: HanabiState = {
          variant,
          seatIds: [...seatIds],
          turnIndex: 0,
          hands,
          deck: deck.slice(0, 1),
          stacks: config.suits.map((suit) => ({ suit, topRank: 0 })),
          discard: [],
          discardOrder: [],
          clueTokens: 4,
          fuses: 0,
          finalTurnsRemaining: null,
          history: [],
        };

        let turns = 0;
        let finalRoundStartedAtTurn: number | null = null;
        const HARD_BOUND = 200;
        while (checkHanabiGameEnd(state) === null && turns < HARD_BOUND) {
          const actorSeatId = currentActorSeatId(state);
          const legal = enumerateLegalActions(state);
          const action =
            legal.find((a) => a.type === "discard") ?? legal.find((a) => a.type === "clue") ?? legal[0];
          if (action === undefined) break;
          const result = hanabiGame.applyAction(state, actorSeatId, action);
          if (result.ok) state = result.state;
          turns++;
          if (finalRoundStartedAtTurn === null && state.finalTurnsRemaining !== null) {
            finalRoundStartedAtTurn = turns;
          }
        }

        const endResult = checkHanabiGameEnd(state);
        expect(endResult).not.toBeNull();
        expect(endResult?.reason).toBe("final_round_elapsed");
        expect(finalRoundStartedAtTurn).not.toBeNull();
        if (finalRoundStartedAtTurn !== null) {
          expect(turns - finalRoundStartedAtTurn).toBe(seatIds.length);
        }
        expect(endResult?.score).toBe(currentScore(state));
        expect(endResult?.band).toBe(scoreBand(endResult!.score, maxScoreFor(config)));
      }

      // (d) D-14: no early "unwinnable" end. Every copy of the last suit's
      // rank-1 card sits in the discard with its stack still at 0 — the
      // count comes from rankCountsFor, not a literal, so this same body
      // proves the Black single-copy case too — yet the game has not ended,
      // because no real end condition (fuses/score/final-round) has fired.
      {
        const lastSuit = config.suits[config.suits.length - 1]!;
        const copies = config.rankCountsFor(lastSuit)[1];
        const discard: HanabiCard[] = Array.from({ length: copies }, (_, i) => ({
          id: `end-unwinnable-${variant}-${i}`,
          suit: lastSuit,
          rank: 1 as const,
        }));
        const state: HanabiState = {
          variant,
          seatIds: [...seatIds],
          turnIndex: 0,
          hands: seatIds.map((seatId) => ({ seatId, slots: [] })),
          deck: [{ id: `end-unwinnable-deck-${variant}`, suit: config.suits[0]!, rank: 1 as const }],
          stacks: config.suits.map((suit) => ({ suit, topRank: 0 })),
          discard,
          discardOrder: discard.map((c) => c.id),
          clueTokens: MAX_CLUE_TOKENS,
          fuses: 0,
          finalTurnsRemaining: null,
          history: [],
        };

        expect(checkHanabiGameEnd(state)).toBeNull();
      }

      variantsSwept++;
    }

    // D-22 non-vacuousness, same convention as the sweep above.
    expect(variantsSwept).toBe(3);
  });
});
