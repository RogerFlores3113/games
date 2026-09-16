import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { GameAdapter } from "./adapter";
import { hanabiGame } from "./hanabi/adapter";

/**
 * Reusable adapter-conformance suite. Phase 2 and Phase 4 call this same
 * function for their own adapters — that reuse is the point, so keep it free
 * of game-specific assumptions.
 */
export function describeAdapterConformance(
  name: string,
  adapter: GameAdapter<any, any>,
  sampleActions: unknown[],
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

    it("checkGameEnd returns null or an object with a numeric score", () => {
      const state = adapter.createInitialState(createInput);
      const result = adapter.checkGameEnd(state);
      if (result !== null) {
        expect(typeof result.score).toBe("number");
      }
    });
  });
}

describeAdapterConformance("hanabi", hanabiGame, [
  { type: "discard", cardId: "zzzzzzzz" },
  { type: "clue", targetSeatId: "seat-b", clue: { type: "rank", value: 1 } },
]);

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
