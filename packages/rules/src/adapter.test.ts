import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { GameAdapter } from "./adapter";
import { hanabiGame } from "./hanabi/adapter";
import type { HanabiAction, HanabiState } from "./hanabi/state";

/**
 * Reusable adapter-conformance suite. Phase 2 and Phase 4 call this same
 * function for their own adapters — that reuse is the point, so keep it free
 * of game-specific assumptions.
 */
export function describeAdapterConformance(
  name: string,
  adapter: GameAdapter<any, any>,
  sampleActions: unknown[],
  /** Returns one legal move for the current state; used to play a game to
   * completion so `checkGameEnd`'s non-null branch is genuinely exercised. */
  nextLegalMove: (state: any) => { actorSeatId: string; action: unknown },
) {
  describe(`${name} adapter conformance`, () => {
    const seatIds = ["seat-a", "seat-b", "seat-c"];
    const createInput = { seatIds, variant: "base" as const, seed: "conformance-seed" };

    it("createInitialState is deterministic", () => {
      const a = adapter.createInitialState(createInput);
      const b = adapter.createInitialState(createInput);
      expect(a).toEqual(b);
    });

    it("applyAction never mutates its state argument (accepted and rejected)", () => {
      const state = adapter.createInitialState(createInput);

      const acceptedSnapshot = structuredClone(state);
      for (const action of sampleActions) {
        adapter.applyAction(state, seatIds[0]!, action);
      }
      expect(state).toEqual(acceptedSnapshot);

      const rejectedSnapshot = structuredClone(state);
      adapter.applyAction(state, "not-a-real-seat", { type: "__nonexistent__" });
      expect(state).toEqual(rejectedSnapshot);
    });

    it("toPlayerView is pure and per-seat, and never returns the state object itself", () => {
      const state = adapter.createInitialState(createInput);
      for (const seatId of seatIds) {
        const view1 = adapter.toPlayerView(state, seatId);
        const view2 = adapter.toPlayerView(state, seatId);
        expect(view1).toEqual(view2);
        expect(view1).not.toBe(state);
      }
    });

    it("applyAction rejects hostile payloads without ever throwing", () => {
      const state = adapter.createInitialState(createInput);
      fc.assert(
        fc.property(fc.jsonValue(), (payload) => {
          // Skip payloads that happen to be legitimate sample actions —
          // this property is about hostile/arbitrary input, not the adapter's
          // own defined action shapes.
          const isSample = sampleActions.some(
            (sample) => JSON.stringify(sample) === JSON.stringify(payload),
          );
          if (isSample) return true;

          let result: ReturnType<typeof adapter.applyAction>;
          expect(() => {
            result = adapter.applyAction(state, seatIds[0]!, payload);
          }).not.toThrow();
          expect(result!.ok === true || result!.ok === false).toBe(true);
          return true;
        }),
      );
    });

    it("checkGameEnd returns null for a fresh game", () => {
      const state = adapter.createInitialState(createInput);
      expect(adapter.checkGameEnd(state)).toBeNull();
    });

    // WR-02: the non-null branch must actually execute — drive the game to
    // its end with the caller-supplied legal-move driver, then assert shape.
    it("checkGameEnd returns an object with a numeric score once the game ends", () => {
      let state = adapter.createInitialState(createInput);
      let ended = adapter.checkGameEnd(state);
      let guard = 0;
      while (ended === null && guard < 2000) {
        guard++;
        const { actorSeatId, action } = nextLegalMove(state);
        const result = adapter.applyAction(state, actorSeatId, action);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("driver produced an illegal move");
        state = result.state;
        ended = adapter.checkGameEnd(state);
      }
      expect(ended).not.toBeNull();
      expect(typeof ended!.score).toBe("number");
    });
  });
}

/** One legal Hanabi move for the active seat: a rank clue on a card another
 * seat holds when tokens remain; else a discard below the token cap; else a
 * play of the actor's first card. */
function nextLegalHanabiMove(state: HanabiState): { actorSeatId: string; action: HanabiAction } {
  const actorSeatId = state.seatIds[state.turnIndex]!;
  const activeHand = state.hands.find((h) => h.seatId === actorSeatId)!;
  if (state.clueTokens > 0) {
    const otherHand = state.hands.find((h) => h.seatId !== actorSeatId && h.slots.length > 0);
    if (otherHand !== undefined) {
      const card = otherHand.slots[0]!.card;
      return {
        actorSeatId,
        action: { type: "clue", targetSeatId: otherHand.seatId, clue: { type: "rank", value: card.rank } },
      };
    }
  }
  if (state.clueTokens < 8) {
    return { actorSeatId, action: { type: "discard", cardId: activeHand.slots[0]!.card.id } };
  }
  return { actorSeatId, action: { type: "play", cardId: activeHand.slots[0]!.card.id } };
}

describeAdapterConformance(
  "hanabi",
  hanabiGame,
  [
    { type: "discard", cardId: "zzzzzzzz" },
    { type: "clue", targetSeatId: "seat-b", clue: { type: "rank", value: 1 } },
  ],
  nextLegalHanabiMove,
);

describe("packages/rules purity", () => {
  it("has no non-empty runtime dependencies", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkg.dependencies == null || Object.keys(pkg.dependencies).length === 0).toBe(true);
  });

  it("imports no Node/Worker-specific runtime modules from src", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const forbidden = ["node:", "from \"fs\"", "from 'fs'", "partyserver", "cloudflare:"];
    const files = [
      "adapter.ts",
      "index.ts",
      "shuffle.ts",
      "hanabi/variant.ts",
      "hanabi/state.ts",
      "hanabi/deck.ts",
      "hanabi/history.ts",
      "hanabi/clue-facts.ts",
      "hanabi/legality.ts",
      "hanabi/actions.ts",
      "hanabi/endgame.ts",
      "hanabi/projection.ts",
      "hanabi/hanabi-leak-check.ts",
      "hanabi/adapter.ts",
      "hanabi/test-support.ts",
    ];
    for (const file of files) {
      // Do not scan this test file itself — it legitimately uses node:fs/node:url
      // to read package.json for the purity check above.
      const source = readFileSync(join(here, file), "utf-8");
      for (const token of forbidden) {
        expect(source.includes(token)).toBe(false);
      }
    }
  });
});
