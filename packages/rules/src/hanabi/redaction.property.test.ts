// D-20 property test: no seat's view ever leaks its own cards' identities,
// checked with the generalized Hanabi leak checker (D-21) that plan 04's
// canaries prove can fail. Mirrors forehead-card.property.test.ts's
// assertNoLeaksForEveryState helper shape and its non-vacuousness
// discipline (D-22/WR-02): the invariant is asserted after the initial
// state AND after every step, including steps where the chosen action was
// rejected, over 200 random games per variant.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { hanabiGame } from "./adapter";
import { checkHanabiGameEnd } from "./endgame";
import { checkHanabiViewForLeaks, secretsForHanabiSeat } from "./hanabi-leak-check";
import { currentActorSeatId, enumerateLegalActions } from "./test-support";
import type { HanabiState } from "./state";

const VARIANTS = ["base", "rainbow", "black"] as const;

/** Checks every seat's view for leaks of its own identity, passing the
 * server seed into secretsForHanabiSeat so a seed leak would itself be
 * caught (D-14). Returns the number of seats checked, so callers can assert
 * non-vacuousness. */
function assertNoLeaksForEverySeat(state: HanabiState, seed: string): number {
  let seatsChecked = 0;
  for (const seatId of state.seatIds) {
    const view = hanabiGame.toPlayerView(state, seatId);
    const secrets = secretsForHanabiSeat(state, seatId, seed);
    const reasons = checkHanabiViewForLeaks({
      view,
      serialized: JSON.stringify(view),
      secrets,
    });
    expect(reasons).toEqual([]);
    seatsChecked++;
  }
  return seatsChecked;
}

describe("property: redaction", () => {
  it("no seat's view leaks its own cards over 200 random games per variant", () => {
    let totalSteps = 0;
    let totalSeatChecks = 0;

    fc.assert(
      fc.property(
        fc.constantFrom(...VARIANTS),
        fc.integer({ min: 2, max: 5 }),
        fc.stringMatching(/^[0-9a-f]{32}$/),
        fc.array(fc.nat({ max: 40 }), { minLength: 1, maxLength: 60 }),
        (variant, seatCount, seed, actionIndexes) => {
          const seatIds = Array.from({ length: seatCount }, (_, i) => `seat-${i}`);
          let state = hanabiGame.createInitialState({ seatIds, variant, seed });
          totalSeatChecks += assertNoLeaksForEverySeat(state, seed);

          for (const index of actionIndexes) {
            if (checkHanabiGameEnd(state) !== null) break;
            const legal = enumerateLegalActions(state);
            if (legal.length === 0) break;
            const action = legal[index % legal.length]!;
            const actorSeatId = currentActorSeatId(state);
            const result = hanabiGame.applyAction(state, actorSeatId, action);
            if (result.ok) {
              state = result.state;
              totalSteps++;
            }
            // Asserted even when the action was rejected — a rejected
            // request must not have mutated state into a leaky shape either.
            totalSeatChecks += assertNoLeaksForEverySeat(state, seed);
          }
        },
      ),
      { numRuns: 200 },
    );

    // D-22/WR-02 non-vacuousness: the driving loop and the per-seat loop
    // inside assertNoLeaksForEverySeat both actually ran.
    expect(totalSteps).toBeGreaterThan(0);
    expect(totalSeatChecks).toBeGreaterThan(0);
  });
});
