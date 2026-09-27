// The generic use-gear pipeline (Plan 10-06, spec §6.2/§6.3). Every one of
// the ten v1 gear items (wave 5) is used through these two functions: they
// run availability -> target validation -> canTarget, then hand the def's
// declared ops to the toolkit (Plan 10-04), which is the ONLY thing that
// ever mutates state. This file never touches CampState/RunState fields
// directly beyond appending the bookkeeping (GearUse, LogEntry) that proves
// the use happened.
//
// GEAR-05 (engine side): once applyToolkitOps has run, the use is FINAL —
// the appended GearUse makes gearAvailability's isGearSpent check reject any
// further attempt to use the same gear this attempt (gear_already_used),
// and there is no action type in RunAction that reverses a GearUse. The
// player-facing "are you sure?" confirm step is Phase 12+ UI; this engine
// has nothing to confirm against because there is no undo to protect.
//
// GEAR-06: every refusal this pipeline can produce carries a human-readable
// reason string, sourced entirely from checkUseGear (which itself mostly
// delegates to toolkit.ts's gearAvailability, already GEAR-06-compliant,
// plus this file's own two additions: the shape check on `targets` and
// def.canTarget).
//
// ORCHESTRATOR'S TARGETS RULING (types.ts's own header): RunAction's
// "use-gear" targets are a flat `readonly string[]`, order-matched
// positionally to GearDef.targets. A malformed (non-array, or
// non-string-element) targets value is invalid_target, checked before any
// attempt to build a GearContext from it.
//
// RUN-06: GearUse lives on AttemptState, so a fresh attempt (a replay) makes
// every gear usable again — there is nothing to reset here by hand; a
// replay's attempt.gearUses starts at [] structurally (lifecycle.ts).
//
// A1: the random stream index k is attempt.gearUses.length AT THE TIME OF
// USE — buildGearContext is called against the PRE-USE `run` (before
// applyToolkitOps has appended anything), which is exactly toolkit.ts's own
// contract for buildGearContext's k.

import { buildGearContext, gearAvailability, validateTargets } from "./toolkit";
import { applyToolkitOps } from "./toolkit";
import { rulesFor } from "./compose";
import type { Catalog, GearUse, LogEntry, RunError, RunState } from "./types";
import type { AdapterResult } from "../../adapter";

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Availability -> targets-shape -> per-kind target validation ->
 * def.canTarget, in that order. Every rejection carries a reason string
 * (GEAR-06). */
export function checkUseGear(
  run: RunState,
  actorSeatId: string,
  gearId: string,
  targets: unknown,
  catalog: Catalog,
): { ok: true } | { ok: false; error: RunError; reason: string } {
  const rules = rulesFor(run, catalog);

  const availability = gearAvailability(run, actorSeatId, gearId, catalog, rules);
  if (!availability.ok) {
    return availability;
  }

  if (!isStringArray(targets)) {
    return { ok: false, error: "invalid_target", reason: "Invalid targets" };
  }

  const def = catalog.gear[gearId]!; // gearAvailability already proved this id is cataloged

  const ctx = buildGearContext(run, actorSeatId, gearId, targets, rules);

  const targetsResult = validateTargets(ctx, def.targets);
  if (targetsResult !== true) {
    return { ok: false, error: "invalid_target", reason: targetsResult };
  }

  const canTarget = def.canTarget ? def.canTarget(ctx) : true;
  if (canTarget !== true) {
    return { ok: false, error: "gear_unavailable", reason: canTarget };
  }

  return { ok: true };
}

/** Applies a legal gear use: runs the def's `apply` against a GearContext
 * built from the PRE-USE run, executes the returned ops through the
 * toolkit, then appends the GearUse (GEAR-05 finality) and a public
 * LogEntry naming only "teammate"-kind targets — never a card id. */
export function applyUseGear(
  run: RunState,
  actorSeatId: string,
  action: { readonly gearId: string; readonly targets: readonly string[] },
  catalog: Catalog,
): AdapterResult<RunState, RunError> {
  const check = checkUseGear(run, actorSeatId, action.gearId, action.targets, catalog);
  if (!check.ok) {
    return { ok: false, error: check.error };
  }

  const rules = rulesFor(run, catalog);
  const def = catalog.gear[action.gearId]!;
  // A1: ctx built against the PRE-USE `run` — k = attempt.gearUses.length
  // before this use is appended.
  const ctx = buildGearContext(run, actorSeatId, action.gearId, action.targets, rules);
  const ops = def.apply ? def.apply(ctx) : [];

  const applied = applyToolkitOps(run, actorSeatId, action.gearId, ops);
  const attempt = applied.attempt!; // applyToolkitOps requires (and preserves) a non-null attempt

  const gearUse: GearUse = { seatId: actorSeatId, gearId: action.gearId, kind: "used" };
  const subjectSeatIds = def.targets
    .map((spec, i) => (spec.kind === "teammate" ? action.targets[i]! : null))
    .filter((id): id is string => id !== null);
  const logEntry: LogEntry = {
    event: "use-gear",
    actorSeatId,
    subjectSeatIds,
    gearId: action.gearId,
    audience: "public",
  };

  return {
    ok: true,
    state: {
      ...applied,
      attempt: {
        ...attempt,
        gearUses: [...attempt.gearUses, gearUse],
        log: [...attempt.log, logEntry],
      },
    },
  };
}
