// The timing windows abilities fire in. At most one is open; each is
// derived from the run, never stored. A gated window holds the table until
// every seat that can act in it has used or passed: pre-deal holds the deal,
// rescue holds the settle of a camp failed only by failed objectives.

import { campPhase, checkCampOutcome, currentActorSeatId } from "../camp";
import { rulesFor } from "./compose";
import type { RunRules } from "./run-rules";
import { gearAvailability, gearTargetsHaveChoices } from "./toolkit";
import type { Catalog, RunState } from "./types";

export type ActiveWindow = "pre-deal" | "objective-pick" | "between-tricks" | "in-trick" | "rescue";

export type WindowDef = {
  readonly id: ActiveWindow;
  readonly phrase: string; // badge text
  readonly gated: boolean; // gated windows wait for every eligible seat to use or pass
  isOpen(run: RunState, rules: RunRules): boolean;
  mayAct(run: RunState, rules: RunRules, seatId: string): boolean;
};

function playingTrickSize(run: RunState, rules: RunRules): number | null {
  const camp = run.attempt?.camp ?? null;
  if (camp === null || campPhase(camp, rules) !== "playing") return null;
  return camp.currentTrick.plays.length;
}

const anySeat = () => true;

export const WINDOWS: { readonly [W in ActiveWindow]: WindowDef } = {
  "pre-deal": {
    id: "pre-deal",
    phrase: "Before the deal",
    gated: true,
    isOpen: (run) => run.attempt !== null && run.attempt.camp === null,
    mayAct: anySeat,
  },
  "objective-pick": {
    id: "objective-pick",
    phrase: "While picking objectives",
    gated: false,
    isOpen: (run, rules) => run.attempt?.camp != null && campPhase(run.attempt.camp, rules) === "objective-pick",
    mayAct: anySeat,
  },
  "between-tricks": {
    id: "between-tricks",
    phrase: "Between tricks",
    gated: false,
    // D-13: closes the instant the trick's leader plays.
    isOpen: (run, rules) => playingTrickSize(run, rules) === 0,
    mayAct: anySeat,
  },
  "in-trick": {
    id: "in-trick",
    phrase: "On your turn",
    gated: false,
    isOpen: (run, rules) => (playingTrickSize(run, rules) ?? 0) > 0,
    mayAct: (run, rules, seatId) => currentActorSeatId(run.attempt!.camp!, rules) === seatId,
  },
  rescue: {
    id: "rescue",
    phrase: "When an objective fails",
    gated: true,
    // Only failed objectives open it; a fired failure check never does.
    isOpen: (run, rules) => {
      const camp = run.attempt?.camp ?? null;
      if (camp === null) return false;
      const outcome = checkCampOutcome(camp, rules);
      return outcome.status === "failed" && outcome.failedObjectiveIds.length > 0 && outcome.firedFailureCheckIds.length === 0;
    },
    mayAct: anySeat,
  },
};

const WINDOW_ORDER = Object.keys(WINDOWS) as ActiveWindow[];

/** At most one window is open; the isOpen predicates are mutually exclusive
 * by construction (no attempt, undealt, picking, playing with or without
 * plays, decided). */
export function currentWindow(run: RunState, rules: RunRules): ActiveWindow | null {
  return WINDOW_ORDER.find((id) => WINDOWS[id].isOpen(run, rules)) ?? null;
}

/** The seat's equipped gear it could fire in `window` right now: available,
 * and with a choice for every target step. */
export function pendingGearIds(run: RunState, seatId: string, window: ActiveWindow, catalog: Catalog, rules: RunRules): string[] {
  const seat = run.seats.find((s) => s.seatId === seatId);
  return (seat?.equippedGearIds ?? []).filter((gearId) => {
    const def = catalog.gear[gearId];
    if (def === undefined) {
      throw new Error(`pendingGearIds: unknown gear id "${gearId}"`);
    }
    if (def.window !== window) return false;
    return gearAvailability(run, seatId, gearId, catalog, rules).ok && gearTargetsHaveChoices(run, seatId, def, rules);
  });
}

/** Seats an open gated window waits on: each holds gear for this window it
 * could fire right now and has neither used nor passed it. [] when no gated
 * window is open. */
export function gatedPendingSeatIds(run: RunState, catalog: Catalog): readonly string[] {
  const rules = rulesFor(run, catalog);
  const window = currentWindow(run, rules);
  if (window === null || !WINDOWS[window].gated) return [];
  return run.seatIds.filter((seatId) => pendingGearIds(run, seatId, window, catalog, rules).length > 0);
}
