// D-11 layer 1: adapter property test. From any seeded initial state advanced
// by random legal action sequences, for every seat, toPlayerView never
// carries that seat's own card identity — checked both on the in-memory
// view object and on its serialized wire string, via the SAME leak checker
// apps/worker's wire property test (layer 2) and wrangler-dev integration
// test (layer 3) reuse.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { FOREHEAD_CARD_VALUES, foreheadCardGame, type ForeheadCardState } from "./forehead-card";
import { checkSeatViewForLeaks, secretsForSeat } from "./forehead-card-leak-check";

function assertNoLeaksForEveryState(state: ForeheadCardState, seed: string) {
  for (const seatId of state.seatIds) {
    const view = foreheadCardGame.toPlayerView(state, seatId);
    const secrets = secretsForSeat(state, seatId, seed);
    const reasons = checkSeatViewForLeaks({ view, serialized: JSON.stringify(view), secrets });
    expect(reasons).toEqual([]);
  }
}

describe("D-11 layer 1: no seat's view ever leaks its own card across random legal action sequences", () => {
  it("holds over 200 random games (fast-check)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        fc.stringMatching(/^[0-9a-f]{32}$/),
        fc.array(fc.nat({ max: 15 }), { maxLength: 20 }),
        (seatCount, seed, guessIndexes) => {
          const seatIds = Array.from({ length: seatCount }, (_, i) => `seat-${i}`);
          let state = foreheadCardGame.createInitialState({ seatIds, variant: "base", seed });
          assertNoLeaksForEveryState(state, seed);

          for (const index of guessIndexes) {
            if (foreheadCardGame.checkGameEnd(state) !== null) break;
            const active = state.seatIds[state.turnIndex]!;
            const result = foreheadCardGame.applyAction(state, active, {
              type: "guess",
              value: FOREHEAD_CARD_VALUES[index],
            });
            if (result.ok) state = result.state;
            assertNoLeaksForEveryState(state, seed);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("holds for a deterministic 5-seat game played to completion (11 guesses)", () => {
    const seatIds = Array.from({ length: 5 }, (_, i) => `seat-${i}`);
    const seed = "fedcba9876543210fedcba9876543210";
    let state = foreheadCardGame.createInitialState({ seatIds, variant: "base", seed });
    assertNoLeaksForEveryState(state, seed);

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
      assertNoLeaksForEveryState(state, seed);
    }
    expect(guesses).toBe(11);
    expect(foreheadCardGame.checkGameEnd(state)).not.toBeNull();
    assertNoLeaksForEveryState(state, seed);
  });
});
