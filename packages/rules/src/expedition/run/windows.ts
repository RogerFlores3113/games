// The timing windows abilities fire in. At most one is open; each is
// derived from the run, never stored. A gated window holds the table until
// every seat that can act in it has used or passed: rescue holds the settle
// of a camp failed only by failed objectives. The stage windows (loadout,
// draft, route) are open for their whole stage, between camps.

import { campPhase, checkCampOutcome, currentActorSeatId } from "../camp";
import { pendingSourceKeys } from "./abilities";
import { attemptOf } from "./attempt";
import { rulesFor } from "./compose";
import type { RunRules } from "./run-rules";
import type { Catalog, RunState } from "./types";

export type ActiveWindow = "objective-pick" | "between-tricks" | "in-trick" | "rescue" | "loadout" | "draft" | "route";

export type WindowDef = {
  readonly id: ActiveWindow;
  readonly phrase: string; // badge text
  readonly gated: boolean; // gated windows wait for every eligible seat to use or pass
  isOpen(run: RunState, rules: RunRules): boolean;
  mayAct(run: RunState, rules: RunRules, seatId: string): boolean;
};

function playingTrickSize(run: RunState, rules: RunRules): number | null {
  const camp = attemptOf(run)?.camp;
  if (camp === undefined || campPhase(camp, rules) !== "playing") return null;
  return camp.currentTrick.plays.length;
}

const anySeat = () => true;

export const WINDOWS: { readonly [W in ActiveWindow]: WindowDef } = {
  "objective-pick": {
    id: "objective-pick",
    phrase: "While picking objectives",
    gated: false,
    isOpen: (run, rules) => {
      const camp = attemptOf(run)?.camp;
      return camp !== undefined && campPhase(camp, rules) === "objective-pick";
    },
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
    mayAct: (run, rules, seatId) => currentActorSeatId(attemptOf(run)!.camp, rules) === seatId,
  },
  rescue: {
    id: "rescue",
    phrase: "When an objective fails",
    gated: true,
    // Only failed objectives open it; a failed goal never does. A failure
    // with a trick on the table settles at once: a rescue there could not
    // void or replay a trick half played.
    isOpen: (run, rules) => {
      const camp = attemptOf(run)?.camp;
      if (camp === undefined || camp.currentTrick.plays.length > 0) return false;
      const outcome = checkCampOutcome(camp, rules);
      return outcome.status === "failed" && outcome.failedObjectiveIds.length > 0 && outcome.failedGoalIds.length === 0;
    },
    mayAct: anySeat,
  },
  loadout: {
    id: "loadout",
    phrase: "Before setting out",
    gated: false,
    isOpen: (run) => run.stage.tag === "loadout",
    // After its ready a seat can change nothing.
    mayAct: (run, _rules, seatId) => run.stage.tag === "loadout" && !Object.hasOwn(run.stage.ready, seatId),
  },
  draft: {
    id: "draft",
    phrase: "While drafting",
    gated: false,
    isOpen: (run) => run.stage.tag === "draft",
    mayAct: (run, _rules, seatId) => run.seats.some((seat) => seat.seatId === seatId && seat.offers.length > 0),
  },
  route: {
    id: "route",
    phrase: "While choosing the route",
    gated: false,
    isOpen: (run) => run.stage.tag === "route",
    mayAct: anySeat,
  },
};

const WINDOW_ORDER = Object.keys(WINDOWS) as ActiveWindow[];

/** At most one window is open; the isOpen predicates are mutually exclusive
 * by construction (no attempt, picking, playing with or without plays,
 * decided, or a stage between camps). */
export function currentWindow(run: RunState, rules: RunRules): ActiveWindow | null {
  return WINDOW_ORDER.find((id) => WINDOWS[id].isOpen(run, rules)) ?? null;
}

/** Seats an open gated window waits on: each owns a live active ability for
 * this window whose abilityStatus is usable, and has no `passed` ledger
 * entry for it at the current stamp. [] when no gated window is open. */
export function gatedPendingSeatIds(run: RunState, catalog: Catalog): readonly string[] {
  const rules = rulesFor(run, catalog);
  const window = currentWindow(run, rules);
  if (window === null || !WINDOWS[window].gated) return [];
  return run.seatIds.filter((seatId) => pendingSourceKeys(run, seatId, window, catalog, rules).length > 0);
}
