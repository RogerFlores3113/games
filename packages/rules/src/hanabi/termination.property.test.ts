// D-20 property test: a game driven by random legal actions always reaches
// a non-null checkHanabiGameEnd within a hard turn bound. The bound exists
// to fail this test LOUDLY (not hang CI) if a rules bug makes the engine
// never satisfy any end condition — see MAX_SIMULATED_TURNS below.
//
// Also covers RULES-15/16 with a deterministic, seeded, non-property case:
// a game driven to deck exhaustion gives every player exactly one more
// turn with no draws during the final round.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { hanabiGame } from "./adapter";
import { checkHanabiGameEnd, type EndReason } from "./endgame";
import { MAX_FUSES } from "./legality";
import { maxScoreFor, variantConfig } from "./variant";
import type { Variant as HanabiVariant } from "../adapter";
import { currentActorSeatId, enumerateLegalActions, enumerateReorderActions } from "./test-support";
import type { HanabiState } from "./state";

const VARIANTS = ["base", "rainbow", "black"] as const;
const END_REASONS: readonly EndReason[] = [
  "fuses_exhausted",
  "all_stacks_complete",
  "final_round_elapsed",
];

// A real game cannot exceed roughly (deck size + hand size) turns before the
// final round forces an end — the largest deck (Rainbow/Black, 60-65 cards)
// with the smallest hand size still ends well under this cap. The cap exists
// to fail the property loudly rather than hang CI if a bug makes the engine
// never satisfy checkHanabiGameEnd.
const MAX_SIMULATED_TURNS = 500;

describe("property: termination", () => {
  it("every game driven by random legal actions ends within the hard turn bound", () => {
    let gamesEnded = 0;
    let reorderSteps = 0;

    fc.assert(
      fc.property(
        fc.constantFrom(...VARIANTS),
        fc.integer({ min: 2, max: 5 }),
        fc.stringMatching(/^[0-9a-f]{32}$/),
        fc.array(fc.nat({ max: 40 }), { minLength: 1, maxLength: 40 }),
        (variant, seatCount, seed, actionIndexes) => {
          const seatIds = Array.from({ length: seatCount }, (_, i) => `seat-${i}`);
          let state = hanabiGame.createInitialState({ seatIds, variant, seed });
          const maxScore = maxScoreFor(variantConfig(variant));

          let turn = 0;
          let endResult = checkHanabiGameEnd(state);
          while (endResult === null && turn < MAX_SIMULATED_TURNS) {
            const legal = enumerateLegalActions(state);
            if (legal.length === 0) {
              // No legal action while the game has not ended is itself a
              // termination failure — stop the loop so the assertion below
              // fails the property instead of looping forever.
              break;
            }
            const index = actionIndexes[turn % actionIndexes.length]!;

            // D-23: reorders must NOT consume a simulated turn — drive one
            // every third step (using the same index, frequently an off-turn
            // seat) and assert every turn/token/round/deck/history counter
            // is byte-identical before and after.
            if (index % 3 === 0) {
              const reorderSeatId = state.seatIds[index % state.seatIds.length]!;
              const reorderCandidates = enumerateReorderActions(state, reorderSeatId);
              if (reorderCandidates.length > 0) {
                const reorderAction = reorderCandidates[index % reorderCandidates.length]!;
                const beforeReorder = state;
                const reorderResult = hanabiGame.applyAction(state, reorderSeatId, reorderAction);
                if (reorderResult.ok) {
                  state = reorderResult.state;
                  reorderSteps++;
                  expect(state.turnIndex).toBe(beforeReorder.turnIndex);
                  expect(state.clueTokens).toBe(beforeReorder.clueTokens);
                  expect(state.fuses).toBe(beforeReorder.fuses);
                  expect(state.finalTurnsRemaining).toBe(beforeReorder.finalTurnsRemaining);
                  expect(state.deck.length).toBe(beforeReorder.deck.length);
                  expect(state.history.length).toBe(beforeReorder.history.length);
                }
              }
            }

            const action = legal[index % legal.length]!;
            const actorSeatId = currentActorSeatId(state);
            const result = hanabiGame.applyAction(state, actorSeatId, action);
            if (result.ok) state = result.state;
            turn++;
            endResult = checkHanabiGameEnd(state);
          }

          // A bound breach or a stuck game FAILS the property outright —
          // there is deliberately no soft-warn or soft-skip fallback here.
          expect(endResult).not.toBeNull();
          if (endResult === null) return;

          expect(END_REASONS).toContain(endResult.reason);
          expect(endResult.score).toBeGreaterThanOrEqual(0);
          expect(endResult.score).toBeLessThanOrEqual(maxScore);
          gamesEnded++;
        },
      ),
      { numRuns: 200 },
    );

    // D-22/WR-02 non-vacuousness: the driving loop actually produced ended
    // games, so a generator regression that always exits before any action
    // is applied cannot pass this property vacuously.
    expect(gamesEnded).toBeGreaterThan(0);
    expect(reorderSteps).toBeGreaterThan(0);
  });

  it("a game driven to deck exhaustion gives every seat exactly one more turn with no draws (RULES-15/16)", () => {
    const seatIds = ["seat-0", "seat-1"];
    const seed = "4".repeat(32);
    const variant: HanabiVariant = "base";

    // Drive the game by discarding whenever legal (never playing, so no
    // fuse can ever be lost and no stack can ever complete), falling back to
    // a clue when discard is momentarily illegal at the clue-token cap. This
    // deterministically exhausts the deck without ever ending the game
    // early via the other two end conditions.
    let state = hanabiGame.createInitialState({ seatIds, variant, seed });
    let preFinalRoundTurns = 0;
    const HARD_BOUND = 2000;
    while (state.deck.length > 0) {
      if (preFinalRoundTurns >= HARD_BOUND) {
        throw new Error("failed to exhaust the deck within the hard iteration bound");
      }
      const actorSeatId = currentActorSeatId(state);
      const legal = enumerateLegalActions(state);
      const action =
        legal.find((a) => a.type === "discard") ?? legal.find((a) => a.type === "clue") ?? legal[0];
      if (action === undefined) {
        throw new Error("no legal action available while the deck is non-empty");
      }
      const result = hanabiGame.applyAction(state, actorSeatId, action);
      if (!result.ok) {
        throw new Error(`unexpected rejection while exhausting the deck: ${result.error}`);
      }
      state = result.state;
      preFinalRoundTurns++;
      if (checkHanabiGameEnd(state) !== null) {
        throw new Error("game ended before the deck was exhausted");
      }
    }

    expect(preFinalRoundTurns).toBeGreaterThan(0);
    expect(state.finalTurnsRemaining).toBe(seatIds.length);

    const handSizesAtExhaustion = new Map(state.hands.map((h) => [h.seatId, h.slots.length]));
    let finalTurnsTaken = 0;
    while (checkHanabiGameEnd(state) === null) {
      const before = state.finalTurnsRemaining;
      const actorSeatId = currentActorSeatId(state);
      const legal = enumerateLegalActions(state);
      const action =
        legal.find((a) => a.type === "discard") ?? legal.find((a) => a.type === "clue") ?? legal[0];
      if (action === undefined) {
        throw new Error("no legal action available during the final round");
      }
      const result = hanabiGame.applyAction(state, actorSeatId, action);
      if (!result.ok) {
        throw new Error(`unexpected rejection during the final round: ${result.error}`);
      }
      state = result.state;
      finalTurnsTaken++;

      // RULES-16: no draws during the final round — no hand's slot count
      // may grow above what it was the instant the deck emptied.
      for (const hand of state.hands) {
        expect(hand.slots.length).toBeLessThanOrEqual(handSizesAtExhaustion.get(hand.seatId)!);
      }
      if (before !== null) {
        expect(state.finalTurnsRemaining).toBe(before - 1);
      }
    }

    // RULES-15: exactly seatIds.length further turns, no more, no fewer.
    expect(finalTurnsTaken).toBe(seatIds.length);
    expect(state.fuses).toBeLessThan(MAX_FUSES);
    const endResult = checkHanabiGameEnd(state);
    expect(endResult).not.toBeNull();
    expect(endResult?.reason).toBe("final_round_elapsed");
  });
});
