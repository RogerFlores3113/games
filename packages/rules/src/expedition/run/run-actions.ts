// The run-level dispatcher (spec §6.6/§4). `applyRunAction` is the ONE entry
// point the adapter wraps: muster (pick-character), the fireside (pick-draft,
// ready), abilities and window passes, whisper, and the two camp actions
// (pick-objective, play-card) all flow through this single function, and
// `settleIfDecided` (lifecycle.ts) runs after every accepted action. That is
// what settles a camp decided mid-action (a play, or an ability like
// Camouflage removing the last open objective) in the SAME call.
//
// GUARD ORDER (T-10-24): typeof action !== "object" or null, or an unknown
// `type` (including any hand-forged "undo": there is no undo action anywhere
// in this engine) -> invalid_action; actor not a seat in this run ->
// not_a_seat; runStatus(run) !== "in_progress" -> run_over; only THEN does
// the per-type handler run, and every per-type handler re-checks its own
// required runPhase before touching anything else.
//
// D-07 (pure data): `ready`/readySeatIds is nothing but a data flag here.
// Whether a disconnected seat's un-readied state pauses the table is the
// room layer's concern.
//
// D-13: actions are processed strictly in the order they arrive at this
// function — there is no queue, no batching, no reordering by type or actor.
//
// Never mutates `run`; every handler builds and returns a new RunState.

import { applyCampAction } from "../actions";
import { rulesFor } from "./compose";
import { passWindow, useAbility } from "./abilities";
import { runPhase, runStatus, settleIfDecided, startAttempt } from "./lifecycle";
import { applyWhisper } from "./whisper";
import type { AdapterResult } from "../../adapter";
import type { Catalog, RunAction, RunError, RunState } from "./types";

function err(error: RunError): AdapterResult<RunState, RunError> {
  return { ok: false, error };
}

/** Every accepted-handler exit point routes through here so settleIfDecided
 * always runs exactly once per accepted action, whatever handler produced
 * the new state. */
function accept(next: RunState, catalog: Catalog): AdapterResult<RunState, RunError> {
  return { ok: true, state: settleIfDecided(next, catalog) };
}

/** Re-wraps a delegate's own AdapterResult (abilities, whisper) through the
 * same settleIfDecided pass every other accepted action gets — an ability can
 * decide a camp (e.g. Camouflage removing the last open objective) just as
 * a play can. */
function delegated(result: AdapterResult<RunState, RunError>, catalog: Catalog): AdapterResult<RunState, RunError> {
  if (!result.ok) return result;
  return accept(result.state, catalog);
}

/** Muster: public, final, and unique within the crew. */
function handlePickCharacter(run: RunState, actorSeatId: string, characterId: string, catalog: Catalog): AdapterResult<RunState, RunError> {
  if (runPhase(run) !== "muster") return err("wrong_phase");
  const seat = run.seats.find((s) => s.seatId === actorSeatId)!;
  if (seat.characterId !== null) return err("wrong_phase");
  if (!Object.hasOwn(catalog.characters, characterId)) return err("unknown_character");
  if (run.seats.some((s) => s.characterId === characterId)) return err("character_taken");

  const seats = run.seats.map((s) => (s.seatId === actorSeatId ? { ...s, characterId } : s));
  return accept({ ...run, seats }, catalog);
}

function handlePickDraft(run: RunState, actorSeatId: string, sourceId: string, catalog: Catalog): AdapterResult<RunState, RunError> {
  if (runPhase(run) !== "fireside") return err("wrong_phase");
  const seat = run.seats.find((s) => s.seatId === actorSeatId)!;
  if (seat.draftOffer === null) return err("no_draft_pending");
  if (!seat.draftOffer.includes(sourceId)) return err("not_offered");

  const seats = run.seats.map((s) => (s.seatId === actorSeatId ? { ...s, kit: [...s.kit, sourceId], draftOffer: null } : s));
  return accept({ ...run, seats }, catalog);
}

/** Muster and fireside: a seat readies once it has a character and no
 * pending draft. The last ready starts the attempt. */
function handleReady(run: RunState, actorSeatId: string, catalog: Catalog): AdapterResult<RunState, RunError> {
  const phase = runPhase(run);
  if (phase !== "fireside" && phase !== "muster") return err("wrong_phase");
  const seat = run.seats.find((s) => s.seatId === actorSeatId)!;
  if (seat.characterId === null) return err("character_pending");
  if (seat.draftOffer !== null) return err("draft_pending");
  if (run.readySeatIds.includes(actorSeatId)) return err("already_ready");

  const readySeatIds = [...run.readySeatIds, actorSeatId];
  const next: RunState = { ...run, readySeatIds };

  return accept(run.seatIds.every((id) => readySeatIds.includes(id)) ? startAttempt(next, catalog) : next, catalog);
}

function handleCampAction(
  run: RunState,
  actorSeatId: string,
  action: { readonly type: "pick-objective"; readonly objectiveId: string } | { readonly type: "play-card"; readonly cardId: string },
  catalog: Catalog,
): AdapterResult<RunState, RunError> {
  if (runPhase(run) !== "camp") return err("wrong_phase");
  const attempt = run.attempt!;
  const camp = attempt.camp;
  const rules = rulesFor(run, catalog);

  const result = applyCampAction(camp, actorSeatId, action, rules);
  if (!result.ok) return err(result.error);

  return accept({ ...run, attempt: { ...attempt, camp: result.state } }, catalog);
}

/** The single run-level transition. Dispatches every `RunAction` type after
 * three guards (invalid_action, not_a_seat, run_over); calls `settleIfDecided`
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
    case "pick-character":
      return handlePickCharacter(run, actorSeatId, action.characterId, catalog);
    case "pick-draft":
      return handlePickDraft(run, actorSeatId, action.sourceId, catalog);
    case "ready":
      return handleReady(run, actorSeatId, catalog);
    case "use-ability":
      return delegated(useAbility(run, actorSeatId, action.sourceId, action.targets, catalog), catalog);
    case "skip-window":
      return delegated(passWindow(run, actorSeatId, catalog), catalog);
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
