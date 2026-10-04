// The dealt attempt lives on the camp stage. Code that also runs outside a
// camp (views, windows, usage) reads it through attemptOf.

import type { AttemptState, CampIndex, RunState } from "./types";

export function attemptOf(run: RunState): AttemptState | null {
  return run.stage.tag === "camp" ? run.stage.attempt : null;
}

export function withAttempt(run: RunState, attempt: AttemptState): RunState {
  if (run.stage.tag !== "camp") throw new Error(`withAttempt: the run is at ${run.stage.tag}, not in a camp`);
  return { ...run, stage: { ...run.stage, attempt } };
}

/** 1 + the attempts already recorded at this camp. */
export function nextAttemptNumber(run: RunState, at: CampIndex): number {
  return 1 + run.history.filter((entry) => entry.camp === at).length;
}
