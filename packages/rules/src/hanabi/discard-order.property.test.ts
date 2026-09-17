// D-23/D-25/D-28 property test: the shared discard arrangement stays an
// exact permutation of the discard pile after every step, and every seat's
// projected view carries the identical order, over 200 random games per
// variant. Mirrors redaction.property.test.ts's structure verbatim: same
// fc.assert(fc.property(...)) shape, same variant/seat-count/seed/action-index
// generators, `{ numRuns: 200 }`. This invariant matters more for
// reorderDiscard than for reorder because reorderDiscard has no per-seat
// hand-ownership guard (D-25: any seated player, off-turn included) — the
// permutation check is the only thing keeping a stale or malformed
// submission from desyncing the pile.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { hanabiGame } from "./adapter";
import { checkHanabiGameEnd } from "./endgame";
import { toHanabiPlayerView } from "./projection";
import { currentActorSeatId, enumerateLegalActions } from "./test-support";
import type { HanabiAction, HanabiState } from "./state";

const VARIANTS = ["base", "rainbow", "black"] as const;

/** Deterministically shuffles `ids` by rotating them by `step` positions —
 * cheap, seed-independent "some other order," sufficient to drive a
 * reorderDiscard submission that differs from the current arrangement
 * whenever the pile has 2+ cards. */
function rotate(ids: readonly string[], step: number): string[] {
  if (ids.length < 2) return [...ids];
  const offset = step % ids.length;
  return [...ids.slice(offset), ...ids.slice(0, offset)];
}

function assertDiscardOrderIsPermutation(state: HanabiState): void {
  const discardIds = state.discard.map((c) => c.id);
  expect(state.discardOrder.length).toBe(discardIds.length);
  expect(new Set(state.discardOrder).size).toBe(state.discardOrder.length);
  expect(new Set(state.discardOrder)).toEqual(new Set(discardIds));
}

describe("property: discard order", () => {
  it("discardOrder stays an exact permutation of the discard pile, and every seat's projected order is identical, over 200 random games per variant", () => {
    let totalSteps = 0;
    let reorderDiscardSteps = 0;

    fc.assert(
      fc.property(
        fc.constantFrom(...VARIANTS),
        fc.integer({ min: 2, max: 5 }),
        fc.stringMatching(/^[0-9a-f]{32}$/),
        fc.array(fc.nat({ max: 40 }), { minLength: 1, maxLength: 60 }),
        (variant, seatCount, seed, actionIndexes) => {
          const seatIds = Array.from({ length: seatCount }, (_, i) => `seat-${i}`);
          let state = hanabiGame.createInitialState({ seatIds, variant, seed });
          assertDiscardOrderIsPermutation(state);

          for (const index of actionIndexes) {
            if (checkHanabiGameEnd(state) !== null) break;

            // Every third step, drive a reorderDiscard from an index-selected
            // seat (frequently off-turn, per D-25) whenever the pile has 2+
            // cards to actually reorder.
            if (index % 3 === 0 && state.discard.length >= 2) {
              const reorderSeatId = state.seatIds[index % state.seatIds.length]!;
              const currentIds = state.discard.map((c) => c.id);
              const submittedIds = rotate(currentIds, index + 1);
              const action: HanabiAction = { type: "reorderDiscard", cardIds: submittedIds };
              const result = hanabiGame.applyAction(state, reorderSeatId, action);
              if (result.ok) {
                state = result.state;
                reorderDiscardSteps++;
                assertDiscardOrderIsPermutation(state);

                for (const observerSeatId of state.seatIds) {
                  const view = toHanabiPlayerView(state, observerSeatId);
                  expect(view.discardOrder).toEqual(submittedIds);
                }
              }
            }

            const legal = enumerateLegalActions(state);
            if (legal.length === 0) break;
            const legalAction = legal[index % legal.length]!;
            const actorSeatId = currentActorSeatId(state);
            const result = hanabiGame.applyAction(state, actorSeatId, legalAction);
            if (result.ok) {
              state = result.state;
              totalSteps++;
            }
            // Asserted even when the driving action was rejected — a
            // rejected request must not have mutated discardOrder either.
            assertDiscardOrderIsPermutation(state);
          }
        },
      ),
      { numRuns: 200 },
    );

    expect(totalSteps).toBeGreaterThan(0);
    expect(reorderDiscardSteps).toBeGreaterThan(0);
  });

  it("a card newly discarded after a reorder appears LAST in discardOrder while the earlier arrangement is unchanged", () => {
    const seatIds = ["seat-0", "seat-1", "seat-2"];
    let state = hanabiGame.createInitialState({ seatIds, variant: "base", seed: "1".repeat(32) });

    // Discarding requires clueTokens < 8; a discard itself refunds a token,
    // so tokens return to MAX after every single discard from a fresh clue.
    // Clue once immediately before each discard to keep it legal.
    function discardOneCard(): void {
      const actorSeatId = currentActorSeatId(state);
      if (state.clueTokens >= 8) {
        const targetSeatId = state.seatIds.find((id) => id !== actorSeatId)!;
        const targetCard = state.hands.find((h) => h.seatId === targetSeatId)!.slots[0]!.card;
        const clueResult = hanabiGame.applyAction(state, actorSeatId, {
          type: "clue",
          targetSeatId,
          clue: { type: "rank", value: targetCard.rank },
        });
        expect(clueResult.ok).toBe(true);
        if (!clueResult.ok) throw new Error("expected success");
        state = clueResult.state;
      }
      const nextActorSeatId = currentActorSeatId(state);
      const hand = state.hands.find((h) => h.seatId === nextActorSeatId)!;
      const cardId = hand.slots[0]!.card.id;
      const result = hanabiGame.applyAction(state, nextActorSeatId, {
        type: "discard",
        cardId,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      state = result.state;
    }

    // Drive discards until the pile has at least 2 cards, so there is a real
    // arrangement to reorder.
    while (state.discard.length < 2) {
      discardOneCard();
    }

    const currentIds = state.discard.map((c) => c.id);
    const reversedIds = [...currentIds].reverse();
    const reorderSeatId = state.seatIds[0]!;
    const reorderResult = hanabiGame.applyAction(state, reorderSeatId, {
      type: "reorderDiscard",
      cardIds: reversedIds,
    });
    expect(reorderResult.ok).toBe(true);
    if (!reorderResult.ok) throw new Error("expected success");
    state = reorderResult.state;
    expect(state.discardOrder).toEqual(reversedIds);

    // Discard one more card and confirm it lands LAST, with the earlier
    // (reversed) arrangement preserved ahead of it.
    const beforeDiscardCount = state.discard.length;
    discardOneCard();
    const newDiscardId = state.discard.map((c) => c.id).find((id) => !reversedIds.includes(id))!;
    expect(state.discard.length).toBe(beforeDiscardCount + 1);
    expect(state.discardOrder).toEqual([...reversedIds, newDiscardId]);
  });
});
