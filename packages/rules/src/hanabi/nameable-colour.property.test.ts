// RULES-14 / D-04 / T-07-01 property test: no accepted colour clue, in any
// variant, ever names a colour outside that variant's `cluableColors` — the
// server-side proof that canClue's nameable-colour guard (legality.ts) holds
// across every reachable state, not just the hand-crafted regression cases
// in legality.test.ts/actions.test.ts. Driver shape copied from
// termination.property.test.ts.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { hanabiGame } from "./adapter";
import { checkHanabiGameEnd } from "./endgame";
import { ALL_SUITS, variantConfig } from "./variant";
import { currentActorSeatId, enumerateLegalActions } from "./test-support";

const VARIANTS = ["base", "rainbow", "black"] as const;
const MAX_SIMULATED_TURNS = 60;

describe("property: nameable colour", () => {
  it("no accepted colour clue ever names a colour outside cluableColors (RULES-14/D-04)", () => {
    let attemptedNonNameable = 0;
    let acceptedNameable = 0;

    fc.assert(
      fc.property(
        fc.constantFrom(...VARIANTS),
        fc.integer({ min: 2, max: 5 }),
        fc.stringMatching(/^[0-9a-f]{32}$/),
        fc.array(fc.nat({ max: 40 }), { minLength: 1, maxLength: 40 }),
        fc.array(fc.constantFrom(...ALL_SUITS), { minLength: 1, maxLength: 40 }),
        (variant, seatCount, seed, actionIndexes, forgedColours) => {
          const seatIds = Array.from({ length: seatCount }, (_, i) => `seat-${i}`);
          let state = hanabiGame.createInitialState({ seatIds, variant, seed });
          const config = variantConfig(variant);

          let turn = 0;
          let endResult = checkHanabiGameEnd(state);
          while (endResult === null && turn < MAX_SIMULATED_TURNS) {
            const actorSeatId = currentActorSeatId(state);
            const otherSeatId = state.seatIds.find((id) => id !== actorSeatId);

            // Only meaningful when a clue is otherwise dispatchable (enough
            // tokens) — guard ordering (not_your_turn/game_over/
            // no_clue_tokens/clue_target_invalid) legitimately wins over the
            // nameable-colour check per D-01's stated ordering, so this probe
            // is skipped rather than asserted when tokens are exhausted.
            if (otherSeatId !== undefined && state.clueTokens > 0) {
              const colour = forgedColours[turn % forgedColours.length]!;
              const attemptResult = hanabiGame.applyAction(state, actorSeatId, {
                type: "clue",
                targetSeatId: otherSeatId,
                clue: { type: "color", value: colour },
              });
              const isNameable = config.cluableColors.includes(colour);
              if (!isNameable) {
                attemptedNonNameable++;
                expect(attemptResult).toEqual({
                  ok: false,
                  error: "clue_color_not_nameable",
                });
              } else if (attemptResult.ok) {
                acceptedNameable++;
              } else {
                expect(attemptResult.error).not.toBe("clue_color_not_nameable");
              }
            }

            const legal = enumerateLegalActions(state);
            if (legal.length === 0) break;
            const index = actionIndexes[turn % actionIndexes.length]!;
            const action = legal[index % legal.length]!;
            const result = hanabiGame.applyAction(state, actorSeatId, action);
            if (result.ok) state = result.state;
            turn++;
            endResult = checkHanabiGameEnd(state);
          }

          // Every clue history entry with a colour value carries a nameable
          // colour — read from state.history directly, never re-derived.
          for (const entry of state.history) {
            if (entry.type === "clue" && entry.clue.type === "color") {
              expect(config.cluableColors.includes(entry.clue.value)).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );

    // Non-vacuousness: the property actually exercised both the rejection
    // path and the acceptance path across the sampled runs.
    expect(attemptedNonNameable).toBeGreaterThan(0);
    expect(acceptedNameable).toBeGreaterThan(0);
  });
});
