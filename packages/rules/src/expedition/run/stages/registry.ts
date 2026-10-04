// The run's one transition. A stage accepts only its own action types, runs
// the handler, then the run advances stage by stage until the tag stops
// changing: the last ballot of a vote, the last ready, or the play that
// decides a camp all move the run on in the same call.
//
// D-13: actions apply strictly in arrival order; there is no queue. Never
// mutates `run`.

import type { Catalog, RunAction, RunState, StageTag } from "../types";
import { runStatus } from "../lifecycle";
import { camp } from "./camp";
import { draft } from "./draft";
import { event } from "./event";
import { loadout } from "./loadout";
import { muster } from "./muster";
import { route } from "./route";
import { err, ok, type Handler, type StageDef, type StageResult } from "./stage-def";

export const STAGES: { readonly [T in StageTag]: StageDef<T> } = {
  muster,
  loadout,
  camp,
  draft,
  route,
  event,
  ended: { on: {}, advance: (run) => run },
};

const ACTION_TYPES: Readonly<Record<RunAction["type"], true>> = {
  "pick-character": true,
  vote: true,
  "pick-draft": true,
  ready: true,
  "use-ability": true,
  "skip-window": true,
  whisper: true,
  "pick-objective": true,
  "play-card": true,
};

function stageDef(run: RunState): StageDef<StageTag> {
  return STAGES[run.stage.tag] as unknown as StageDef<StageTag>;
}

/** Advances to a fixed point, bounded by the stage count. */
export function advance(run: RunState, catalog: Catalog): RunState {
  let current = run;
  for (let step = 0; step <= Object.keys(STAGES).length; step++) {
    const next = stageDef(current).advance(current, catalog);
    if (next.stage.tag === current.stage.tag) return next;
    current = next;
  }
  throw new Error(`advance: stages did not settle, last at ${current.stage.tag}`);
}

/** invalid_action, not_a_seat, run_over, wrong_stage, the stage's handler,
 * then advance. */
export function applyRunAction(run: RunState, seatId: string, action: RunAction, catalog: Catalog): StageResult {
  if (typeof action !== "object" || action === null || !Object.hasOwn(ACTION_TYPES, action.type)) return err("invalid_action");
  if (!run.seatIds.includes(seatId)) return err("not_a_seat");
  if (runStatus(run) !== "in_progress") return err("run_over");
  const handler = stageDef(run).on[action.type] as Handler<StageTag, RunAction> | undefined;
  if (handler === undefined) return err("wrong_stage");
  const result = handler(run, seatId, action, catalog);
  return result.ok ? ok(advance(result.state, catalog)) : result;
}
