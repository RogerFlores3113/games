// The run-level dispatcher (Plan 10-07, spec §6.6/§4). `applyRunAction` is
// the ONE entry point Phase 11's adapter wraps: every fireside action
// (pick-draft, set-loadout, ready), the pre-deal skip, use-gear, whisper, and
// the two camp actions (pick-objective, play-card) all flow through this
// single function, and `advanceRun` (lifecycle.ts) runs after every accepted
// action — this is what settles a camp decided mid-action (a play, or a gear
// effect like Camouflage removing the last open objective) and deals once
// the pre-deal wait clears, all in the SAME call.
//
// GUARD ORDER (T-10-24): typeof action !== "object" or null, or an unknown
// `type` (including any hand-forged "undo" — GEAR-05/XRULE-08: there is no
// undo action anywhere in this engine) -> invalid_action; actor not a seat in
// this run -> not_a_seat; runStatus(run) !== "in_progress" -> run_over; only
// THEN does the per-type handler run, and every per-type handler re-checks
// its own required runPhase before touching anything else.
//
// D-07 (pure data): `ready`/readySeatIds is nothing but a data flag here.
// Whether a disconnected seat's un-readied state pauses the table, and any
// notion of a host "force start", is entirely Phase 11's concern — there is
// no such action in RunAction, by design, and none is added here.
//
// D-13: actions are processed strictly in the order they arrive at this
// function — there is no queue, no batching, no reordering by type or actor.
//
// Never mutates `run`; every handler builds and returns a new RunState (or
// the eventual applyCampAction/applyWhisper/applyUseGear delegate's own new
// state), consistent with every other Phase 9/10 transition in this package.

import { applyCampAction } from "../actions";
import { rulesFor } from "./compose";
import { advanceRun, capacityOf, loadoutSize, runPhase, runStatus, startAttempt } from "./lifecycle";
import { WINDOWS, currentWindow, gatedPendingSeatIds, pendingGearIds } from "./windows";
import { applyUseGear } from "./use-gear";
import { applyWhisper } from "./whisper";
import type { AdapterResult } from "../../adapter";
import type { Catalog, GearUse, RunAction, RunError, RunState } from "./types";

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function err(error: RunError): AdapterResult<RunState, RunError> {
  return { ok: false, error };
}

/** Every accepted-handler exit point routes through here so advanceRun
 * (settle-then-deal) always runs exactly once per accepted action, whatever
 * handler produced the new state. */
function accept(next: RunState, catalog: Catalog): AdapterResult<RunState, RunError> {
  return { ok: true, state: advanceRun(next, catalog) };
}

/** Re-wraps a delegate's own AdapterResult (applyWhisper/applyUseGear)
 * through the same advanceRun pass every other accepted action gets — a
 * gear effect can decide a camp (e.g. Camouflage removing the last open
 * objective) just as a play can. */
function delegated(result: AdapterResult<RunState, RunError>, catalog: Catalog): AdapterResult<RunState, RunError> {
  if (!result.ok) return result;
  return accept(result.state, catalog);
}

function handlePickDraft(
  run: RunState,
  actorSeatId: string,
  gearId: string,
  catalog: Catalog,
): AdapterResult<RunState, RunError> {
  if (runPhase(run) !== "fireside") return err("wrong_phase");
  const seat = run.seats.find((s) => s.seatId === actorSeatId)!;
  if (seat.draftOffer === null) return err("no_draft_pending");
  if (!seat.draftOffer.includes(gearId)) return err("not_offered");

  const seats = run.seats.map((s) =>
    s.seatId === actorSeatId ? { ...s, ownedGearIds: [...s.ownedGearIds, gearId], draftOffer: null } : s,
  );
  return accept({ ...run, seats }, catalog);
}

function handleSetLoadout(
  run: RunState,
  actorSeatId: string,
  gearIds: unknown,
  catalog: Catalog,
): AdapterResult<RunState, RunError> {
  if (runPhase(run) !== "fireside") return err("wrong_phase");
  if (!isStringArray(gearIds)) return err("invalid_action");

  if (new Set(gearIds).size !== gearIds.length) return err("duplicate_gear");
  const seat = run.seats.find((s) => s.seatId === actorSeatId)!;
  if (!gearIds.every((id) => seat.ownedGearIds.includes(id))) return err("gear_not_owned");

  const seats = run.seats.map((s) => (s.seatId === actorSeatId ? { ...s, equippedGearIds: gearIds } : s));
  const candidate: RunState = { ...run, seats };
  // T-10-26: capacity is computed WITH the proposed loadout in place, so a
  // passive gear inside the same proposed set (Energy Tonic's own +2) counts
  // toward its own room.
  const capacity = capacityOf(candidate, actorSeatId, catalog);
  if (loadoutSize(gearIds, catalog) > capacity) return err("over_capacity");

  const readySeatIds = run.readySeatIds.filter((id) => id !== actorSeatId);
  return accept({ ...candidate, readySeatIds }, catalog);
}

function handleReady(run: RunState, actorSeatId: string, catalog: Catalog): AdapterResult<RunState, RunError> {
  if (runPhase(run) !== "fireside") return err("wrong_phase");
  const seat = run.seats.find((s) => s.seatId === actorSeatId)!;
  if (seat.draftOffer !== null) return err("draft_pending");
  if (run.readySeatIds.includes(actorSeatId)) return err("already_ready");

  const readySeatIds = [...run.readySeatIds, actorSeatId];
  const next: RunState = { ...run, readySeatIds };

  if (run.seatIds.every((id) => readySeatIds.includes(id))) {
    // startAttempt itself ends by calling advanceRun (lifecycle.ts) — do not
    // wrap a second advanceRun call around its result.
    return { ok: true, state: startAttempt(next, catalog) };
  }
  return accept(next, catalog);
}

/** Passes the open gated window (pre-deal or rescue): every gear the seat
 * could still fire in it is marked skipped. */
function handleSkipWindow(run: RunState, actorSeatId: string, catalog: Catalog): AdapterResult<RunState, RunError> {
  const rules = rulesFor(run, catalog);
  const window = currentWindow(run, rules);
  if (window === null || !WINDOWS[window].gated) return err("wrong_phase");
  if (!gatedPendingSeatIds(run, catalog).includes(actorSeatId)) return err("nothing_to_skip");

  const attempt = run.attempt!; // a gated window is only open during an attempt
  const newUses: GearUse[] = pendingGearIds(run, actorSeatId, window, catalog, rules).map((gearId) => ({
    seatId: actorSeatId,
    gearId,
    kind: "skipped" as const,
  }));

  return accept(
    { ...run, attempt: { ...attempt, gearUses: [...attempt.gearUses, ...newUses] } },
    catalog,
  );
}

function handleCampAction(
  run: RunState,
  actorSeatId: string,
  action: { readonly type: "pick-objective"; readonly objectiveId: string } | { readonly type: "play-card"; readonly cardId: string },
  catalog: Catalog,
): AdapterResult<RunState, RunError> {
  if (runPhase(run) !== "camp") return err("wrong_phase");
  const attempt = run.attempt!; // runPhase === "camp" guarantees attempt.camp !== null
  const camp = attempt.camp!;
  const rules = rulesFor(run, catalog);

  const result = applyCampAction(camp, actorSeatId, action, rules);
  if (!result.ok) return err(result.error);

  return accept({ ...run, attempt: { ...attempt, camp: result.state } }, catalog);
}

/** The single run-level transition. Dispatches all 8 `RunAction` types after
 * three guards (invalid_action, not_a_seat, run_over); calls `advanceRun`
 * after every accepted action; never mutates `run`. */
export function applyRunAction(
  run: RunState,
  actorSeatId: string,
  action: RunAction,
  catalog: Catalog,
): AdapterResult<RunState, RunError> {
  if (typeof action !== "object" || action === null) {
    return err("invalid_action");
  }
  if (!run.seatIds.includes(actorSeatId)) {
    return err("not_a_seat");
  }
  if (runStatus(run) !== "in_progress") {
    return err("run_over");
  }

  switch (action.type) {
    case "pick-draft":
      return handlePickDraft(run, actorSeatId, action.gearId, catalog);
    case "set-loadout":
      return handleSetLoadout(run, actorSeatId, action.gearIds, catalog);
    case "ready":
      return handleReady(run, actorSeatId, catalog);
    case "use-gear":
      return delegated(applyUseGear(run, actorSeatId, action, catalog), catalog);
    case "skip-window":
      return handleSkipWindow(run, actorSeatId, catalog);
    case "whisper":
      return delegated(applyWhisper(run, actorSeatId, action, catalog), catalog);
    case "pick-objective":
      return handleCampAction(run, actorSeatId, action, catalog);
    case "play-card":
      return handleCampAction(run, actorSeatId, action, catalog);
    default: {
      const exhaustive: never = action;
      void exhaustive;
      return err("invalid_action");
    }
  }
}
