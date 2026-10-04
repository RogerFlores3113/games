import { applyCampAction } from "../../actions";
import { checkCampOutcome } from "../../camp";
import { passWindow, useAbility } from "../abilities";
import { withAttempt } from "../attempt";
import { rulesFor } from "../compose";
import { settleCamp } from "../lifecycle";
import type { Catalog, RunAt } from "../types";
import { applyWhisper } from "../whisper";
import { currentWindow, gatedPendingSeatIds } from "../windows";
import { err, ok, type Handler, type StageDef } from "./stage-def";

const campAction: Handler<"camp", { readonly type: "pick-objective"; readonly objectiveId: string } | { readonly type: "play-card"; readonly cardId: string }> = (run, seatId, action, catalog) => {
  const attempt = run.stage.attempt;
  const result = applyCampAction(attempt.camp, seatId, action, rulesFor(run, catalog));
  return result.ok ? ok(withAttempt(run, { ...attempt, camp: result.state })) : err(result.error);
};

/** A decided camp settles at once, unless it failed only by objectives and
 * a seat can still answer the rescue window. */
function settleIfDecided(run: RunAt<"camp">, catalog: Catalog) {
  const rules = rulesFor(run, catalog);
  const outcome = checkCampOutcome(run.stage.attempt.camp, rules);
  if (outcome.status === "in_progress") return run;
  if (outcome.status === "succeeded") return settleCamp(run, "cleared", catalog);
  if (currentWindow(run, rules) === "rescue" && gatedPendingSeatIds(run, catalog).length > 0) return run;
  return settleCamp(run, "failed", catalog);
}

export const camp: StageDef<"camp"> = {
  on: {
    "use-ability": (run, seatId, action, catalog) => useAbility(run, seatId, action.sourceId, action.targets, catalog),
    "skip-window": (run, seatId, _action, catalog) => passWindow(run, seatId, catalog),
    whisper: (run, seatId, action, catalog) => applyWhisper(run, seatId, action, catalog),
    "pick-objective": campAction,
    "play-card": campAction,
  },
  advance: settleIfDecided,
};
