// The real Expedition GameAdapter (Phase 11, Plan 03, COMM-03/ENG-03).
// `expeditionGame` is a thin delegation layer over the Phase 10 run engine,
// mirroring hanabi/adapter.ts's discipline exactly: every method is a
// one-line call into an existing module (run/lifecycle.ts, run/run-actions.ts,
// ./view.ts) — no rule logic lives in this file. `toExpeditionPlayerView` is
// the ONLY exit point from state, matching adapter.ts's file-level invariant
// #3; this file adds no whole-state serializer. `applyAction` never wraps
// `applyRunAction` in exception-handling machinery (POLICY A3) — if a
// well-shaped hostile request ever throws inside the engine, the fix belongs
// in the rejecting guard under run/, not a blanket rescue here that would
// mask the defect.

import type { AdapterResult, GameAdapter } from "../../adapter";
import { createRun, runStatus } from "../run/lifecycle";
import { applyRunAction } from "../run/run-actions";
import { CATALOG } from "../run/catalog";
import { toExpeditionPlayerView } from "./view";
import { parseRunAction } from "./request-guards";
import type { RunAction, RunError, RunState } from "../run/types";

/** MGR-03: Expedition has no settings in v2.0 — `config` is always null and
 * ignored by `createInitialState`. */
export type ExpeditionConfig = null;

/** Expedition's own end-result shape (spec §6.6) — a NEW type, not a reuse of
 * Hanabi's `{ score, reason, band? }`. */
export type ExpeditionEndResult = {
  readonly outcome: "won" | "lost";
  readonly campReached: number;
  readonly suppliesLeft: number;
};

export const expeditionGame: GameAdapter<RunState, RunAction, ExpeditionConfig, ExpeditionEndResult, RunError> = {
  id: "expedition",

  createInitialState({ seatIds, seed }): RunState {
    return createRun({ seatIds, seed });
  },

  applyAction(state, actorSeatId, request): AdapterResult<RunState, RunError> {
    const parsed = parseRunAction(request);
    if (parsed === null) return { ok: false, error: "invalid_action" };
    return applyRunAction(state, actorSeatId, parsed, CATALOG);
  },

  toPlayerView(state, seatId) {
    return toExpeditionPlayerView(state, seatId, CATALOG);
  },

  checkGameEnd(state): ExpeditionEndResult | null {
    const status = runStatus(state);
    if (status === "in_progress") return null;
    return { outcome: status, campReached: state.campNumber, suppliesLeft: state.supplies };
  },
};
