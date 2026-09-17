// D-20 property tests: token conservation (clueTokens 0..8, fuses 0..3) and
// card conservation (every minted card is in exactly one place — deck, a
// hand, the discard pile, or a played stack). Games are driven by legal
// action sequences enumerated from the engine's OWN exported predicates
// (test-support.ts), never a private copy of the rules, per T-03-24.
//
// fast-check conventions mirror forehead-card.property.test.ts: seeds via
// fc.stringMatching(/^[0-9a-f]{32}$/) (the installed fast-check 4.9.0 has no
// dedicated hex-string generator), fc.assert(fc.property(...), { numRuns: 200 }),
// and the invariant is asserted after the initial state AND after every
// step, including steps where the chosen action was rejected.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { hanabiGame } from "./adapter";
import { buildDeck } from "./deck";
import { checkHanabiGameEnd } from "./endgame";
import { canClue, canDiscard, canPlay, MAX_CLUE_TOKENS, MAX_FUSES } from "./legality";
import { variantConfig } from "./variant";
import {
  currentActorSeatId,
  enumerateLegalActions,
  enumerateReorderActions,
  locateAllCards,
} from "./test-support";
import type { HanabiState } from "./state";

const VARIANTS = ["base", "rainbow", "black"] as const;

function assertTokenConservation(state: HanabiState): void {
  expect(state.clueTokens).toBeGreaterThanOrEqual(0);
  expect(state.clueTokens).toBeLessThanOrEqual(MAX_CLUE_TOKENS);
  expect(state.fuses).toBeGreaterThanOrEqual(0);
  expect(state.fuses).toBeLessThanOrEqual(MAX_FUSES);
}

function assertCardConservation(state: HanabiState, expectedDeckSize: number): void {
  const locations = locateAllCards(state);
  expect(locations.size).toBe(expectedDeckSize);
  for (const location of locations.values()) {
    // A "+"-joined value means the same card id was recorded in more than
    // one place — a conservation bug, not a valid state.
    expect(location.includes("+")).toBe(false);
  }
}

describe("property: conservation", () => {
  it("token and card conservation hold over 200 random games in every variant", () => {
    let totalSteps = 0;
    let reorderSteps = 0;

    fc.assert(
      fc.property(
        fc.constantFrom(...VARIANTS),
        fc.integer({ min: 2, max: 5 }),
        fc.stringMatching(/^[0-9a-f]{32}$/),
        fc.array(fc.nat({ max: 40 }), { minLength: 1, maxLength: 60 }),
        (variant, seatCount, seed, actionIndexes) => {
          const seatIds = Array.from({ length: seatCount }, (_, i) => `seat-${i}`);
          let state = hanabiGame.createInitialState({ seatIds, variant, seed });
          const config = variantConfig(variant);
          const deckTotal = buildDeck(config).length;

          assertTokenConservation(state);
          assertCardConservation(state, deckTotal);

          for (const index of actionIndexes) {
            if (checkHanabiGameEnd(state) !== null) break;

            // D-23: every third step, drive an off-turn-or-on-turn reorder
            // (index picks the seat, frequently NOT the active seat) and
            // reassert conservation immediately after it lands.
            if (index % 3 === 0) {
              const reorderSeatId = state.seatIds[index % state.seatIds.length]!;
              const reorderCandidates = enumerateReorderActions(state, reorderSeatId);
              if (reorderCandidates.length > 0) {
                const reorderAction = reorderCandidates[index % reorderCandidates.length]!;
                const reorderResult = hanabiGame.applyAction(state, reorderSeatId, reorderAction);
                if (reorderResult.ok) {
                  state = reorderResult.state;
                  reorderSteps++;
                  assertTokenConservation(state);
                  assertCardConservation(state, deckTotal);
                }
              }
            }

            const legal = enumerateLegalActions(state);
            if (legal.length === 0) break;
            const action = legal[index % legal.length]!;
            const actorSeatId = currentActorSeatId(state);
            const preActionState = state;
            const result = hanabiGame.applyAction(state, actorSeatId, action);
            if (result.ok) {
              state = result.state;
              totalSteps++;

              // D-23: if this play/discard drew a replacement (history
              // gained a trailing "draw" entry), the actor's hand index that
              // held the played/discarded card must now hold the drawn
              // card's id — slot-preserving, not append-at-end.
              const lastEntry = state.history[state.history.length - 1];
              if (
                (action.type === "play" || action.type === "discard") &&
                lastEntry !== undefined &&
                lastEntry.type === "draw"
              ) {
                const preHand = preActionState.hands.find((h) => h.seatId === actorSeatId)!;
                const vacatedIndex = preHand.slots.findIndex(
                  (s) => s.card.id === action.cardId,
                );
                const postHand = state.hands.find((h) => h.seatId === actorSeatId)!;
                expect(postHand.slots[vacatedIndex]?.card.id).toBe(lastEntry.cardId);
              }
            }
            assertTokenConservation(state);
            assertCardConservation(state, deckTotal);
          }
        },
      ),
      { numRuns: 200 },
    );

    // D-22/WR-02: prove the generator actually drove steps, so a generator
    // regression that always produces an empty action list cannot pass this
    // property vacuously.
    expect(totalSteps).toBeGreaterThan(0);
    expect(reorderSteps).toBeGreaterThan(0);
  });

  describe("test-support helpers", () => {
    it("enumerateLegalActions returns only actions whose matching predicate is legal", () => {
      const seatIds = ["seat-0", "seat-1", "seat-2"];
      const state = hanabiGame.createInitialState({
        seatIds,
        variant: "base",
        seed: "0".repeat(32),
      });
      const actorSeatId = currentActorSeatId(state);
      const actions = enumerateLegalActions(state);
      expect(actions.length).toBeGreaterThan(0);

      for (const action of actions) {
        if (action.type === "play") {
          expect(canPlay(state, actorSeatId, action.cardId).legal).toBe(true);
        } else if (action.type === "discard") {
          expect(canDiscard(state, actorSeatId, action.cardId).legal).toBe(true);
        } else if (action.type === "clue") {
          expect(canClue(state, actorSeatId, action.targetSeatId, action.clue).legal).toBe(true);
        }
        // enumerateLegalActions never generates "reorder" (test-support.ts
        // unchanged this plan), so no branch is needed for it here.
      }
    });

    it("enumerateLegalActions covers all three action types once a clue token is available", () => {
      const seatIds = ["seat-0", "seat-1", "seat-2"];
      const initialState = hanabiGame.createInitialState({
        seatIds,
        variant: "base",
        seed: "1".repeat(32),
      });
      // At the initial state clueTokens is at MAX_CLUE_TOKENS, so discard is
      // not yet legal (canDiscard rejects at the cap) — spend one clue token
      // first so all three action types are simultaneously legal.
      const firstClue = enumerateLegalActions(initialState).find((a) => a.type === "clue")!;
      const afterClue = hanabiGame.applyAction(
        initialState,
        currentActorSeatId(initialState),
        firstClue,
      );
      expect(afterClue.ok).toBe(true);
      if (!afterClue.ok) return;

      const types = new Set(enumerateLegalActions(afterClue.state).map((a) => a.type));
      expect(types.has("play")).toBe(true);
      expect(types.has("discard")).toBe(true);
      expect(types.has("clue")).toBe(true);
    });

    it("enumerateLegalActions returns an empty array once the game has ended", () => {
      const seatIds = ["seat-0", "seat-1", "seat-2"];
      const state = hanabiGame.createInitialState({
        seatIds,
        variant: "base",
        seed: "2".repeat(32),
      });
      const endedState: HanabiState = {
        variant: state.variant,
        seatIds: state.seatIds,
        turnIndex: state.turnIndex,
        hands: state.hands,
        deck: state.deck,
        stacks: state.stacks,
        discard: state.discard,
        discardOrder: state.discardOrder,
        clueTokens: state.clueTokens,
        fuses: MAX_FUSES,
        finalTurnsRemaining: state.finalTurnsRemaining,
        history: state.history,
      };
      expect(checkHanabiGameEnd(endedState)).not.toBeNull();
      expect(enumerateLegalActions(endedState)).toEqual([]);
    });

    it("locateAllCards places every card from the initial deal in exactly one location", () => {
      const seatIds = ["seat-0", "seat-1", "seat-2"];
      const config = variantConfig("black");
      const state = hanabiGame.createInitialState({
        seatIds,
        variant: "black",
        seed: "3".repeat(32),
      });
      assertCardConservation(state, buildDeck(config).length);
    });
  });
});
