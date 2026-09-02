// D-15 shared-counter placeholder game. Exercises turn order, action
// submission, and per-seat projection with essentially no rules, so that
// Phase 2's swap to a secret-holding toy is a small, legible diff. This file
// is meant to be DELETED in Phase 2 — keep it minimal and self-contained.

import type { GameAdapter } from "./adapter";

export type CounterState = {
  count: number;
  seatIds: readonly string[];
  turnIndex: number;
  turnsTaken: number;
};

export type CounterAction = { type: "increment" };

export type CounterView = {
  count: number;
  activeSeatId: string;
  isYourTurn: boolean;
  turnsTaken: number;
};

/** Accepts ONLY an object whose sole own key is `type` with value
 * `"increment"`. Any extra own key — including `count`, `state`,
 * `turnIndex`, or `seatIds` — makes the payload invalid. Rejecting on extra
 * keys, not just on wrong shape, is what makes state-assertion structurally
 * impossible. */
function isIncrementRequest(request: unknown): request is CounterAction {
  if (typeof request !== "object" || request === null) return false;
  const keys = Object.keys(request);
  if (keys.length !== 1 || keys[0] !== "type") return false;
  return (request as { type: unknown }).type === "increment";
}

export const counterGame: GameAdapter<CounterState, CounterAction> = {
  id: "counter",

  createInitialState({ seatIds }) {
    return {
      count: 0,
      seatIds: [...seatIds],
      turnIndex: 0,
      turnsTaken: 0,
    };
  },

  applyAction(state, actorSeatId, request) {
    if (!isIncrementRequest(request)) {
      return { ok: false, error: "invalid_action" };
    }
    if (actorSeatId !== state.seatIds[state.turnIndex]) {
      return { ok: false, error: "not_your_turn" };
    }
    return {
      ok: true,
      state: {
        count: state.count + 1,
        seatIds: state.seatIds,
        turnIndex: (state.turnIndex + 1) % state.seatIds.length,
        turnsTaken: state.turnsTaken + 1,
      },
    };
  },

  toPlayerView(state, seatId): CounterView {
    const activeSeatId = state.seatIds[state.turnIndex] as string;
    return {
      count: state.count,
      activeSeatId,
      isYourTurn: activeSeatId === seatId,
      turnsTaken: state.turnsTaken,
    };
  },

  checkGameEnd() {
    return null;
  },
};
