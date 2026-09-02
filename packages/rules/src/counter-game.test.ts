import { describe, expect, it } from "vitest";
import { counterGame } from "./counter-game";

const seatIds = ["seat-a", "seat-b", "seat-c"] as const;

function initial() {
  return counterGame.createInitialState({
    seatIds,
    variant: "base",
    seed: "test-seed",
  });
}

describe("counterGame", () => {
  it("increment on your turn advances count and turn", () => {
    const state = initial();
    const result = counterGame.applyAction(state, "seat-a", { type: "increment" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.count).toBe(1);
      expect(result.state.turnIndex).toBe(1);
      expect(result.state.turnsTaken).toBe(1);
    }
  });

  it("increment out of turn returns not_your_turn and leaves state untouched", () => {
    const state = initial();
    const snapshot = structuredClone(state);
    const result = counterGame.applyAction(state, "seat-b", { type: "increment" });
    expect(result).toEqual({ ok: false, error: "not_your_turn" });
    expect(state).toEqual(snapshot);
  });

  it("rejects an action payload carrying state fields", () => {
    const state = initial();
    const result = counterGame.applyAction(state, "seat-a", {
      type: "increment",
      count: 999,
    });
    expect(result).toEqual({ ok: false, error: "invalid_action" });
  });

  it("rejects a non-object payload", () => {
    const state = initial();
    const result = counterGame.applyAction(state, "seat-a", "increment");
    expect(result).toEqual({ ok: false, error: "invalid_action" });
  });

  it("rejects a wrong type value", () => {
    const state = initial();
    const result = counterGame.applyAction(state, "seat-a", { type: "decrement" });
    expect(result).toEqual({ ok: false, error: "invalid_action" });
  });

  it("toPlayerView yields isYourTurn true for exactly one seat", () => {
    const state = initial();
    const views = seatIds.map((seatId) => counterGame.toPlayerView(state, seatId));
    const trueCount = views.filter((v) => (v as { isYourTurn: boolean }).isYourTurn).length;
    expect(trueCount).toBe(1);
    expect((views[0] as { isYourTurn: boolean }).isYourTurn).toBe(true);
  });

  it("toPlayerView does not include seatIds", () => {
    const state = initial();
    const view = counterGame.toPlayerView(state, "seat-a");
    expect(Object.keys(view as object).sort()).toEqual([
      "activeSeatId",
      "count",
      "isYourTurn",
      "turnsTaken",
    ]);
  });

  it("a full lap of N seats returns turnIndex to 0", () => {
    let state = initial();
    for (const seatId of seatIds) {
      const result = counterGame.applyAction(state, seatId, { type: "increment" });
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state;
    }
    expect(state.turnIndex).toBe(0);
    expect(state.turnsTaken).toBe(seatIds.length);
  });

  it("does not mutate the input state on an accepted action", () => {
    const state = initial();
    const snapshot = structuredClone(state);
    counterGame.applyAction(state, "seat-a", { type: "increment" });
    expect(state).toEqual(snapshot);
  });
});
