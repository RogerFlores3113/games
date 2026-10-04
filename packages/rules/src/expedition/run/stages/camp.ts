import { applyCampAction } from "../../actions";
import { checkCampOutcome } from "../../camp";
import type { CampError, CampEvent } from "../../state";
import { passWindow, useAbility } from "../abilities";
import { withAttempt } from "../attempt";
import { rulesFor } from "../compose";
import { settleCamp } from "../lifecycle";
import { react } from "../react";
import type { Catalog, RunAt } from "../types";
import { applyWhisper } from "../whisper";
import { currentWindow, gatedPendingSeatIds } from "../windows";
import { err, ok, type Handler, type StageDef } from "./stage-def";

type CampAction = { readonly type: "pick-objective"; readonly objectiveId: string } | { readonly type: "play-card"; readonly cardId: string };
type Played = { readonly ok: true; readonly run: RunAt<"camp">; readonly events: readonly CampEvent[] } | { readonly ok: false; readonly error: CampError };

function play(run: RunAt<"camp">, seatId: string, action: CampAction, catalog: Catalog): Played {
  const attempt = run.stage.attempt;
  const result = applyCampAction(attempt.camp, seatId, action, rulesFor(run, catalog));
  if (!result.ok) return result;
  return { ok: true, run: withAttempt(run, { ...attempt, camp: result.state }) as RunAt<"camp">, events: result.events };
}

function failed(run: RunAt<"camp">, catalog: Catalog): boolean {
  return checkCampOutcome(run.stage.attempt.camp, rulesFor(run, catalog)).status === "failed";
}

/** A deferIfFatal effect on the trick a play completed waits a trick when
 * it, under the fully composed rules, is what lost the camp: the same play
 * is recomputed with those effects on the next trick (dropped after the
 * last one), and kept only if that does not lose the camp. */
function deferFatalEffects(before: RunAt<"camp">, seatId: string, action: CampAction, played: Played & { ok: true }, catalog: Catalog): Played & { ok: true } {
  const attempt = before.stage.attempt;
  const t = attempt.camp.currentTrick.index;
  const completed = played.run.stage.attempt.camp.completedTricks.length > attempt.camp.completedTricks.length;
  const deferrable = attempt.effects.filter((e) => e.deferIfFatal && e.lasts === "trick" && e.atTrick === t);
  if (!completed || deferrable.length === 0 || !failed(played.run, catalog)) return played;
  const last = t + 1 >= attempt.camp.totalTricks;
  const effects = attempt.effects.flatMap((e) => (!deferrable.includes(e) ? [e] : last ? [] : [{ ...e, atTrick: t + 1 }]));
  const retried = play(withAttempt(before, { ...attempt, effects }) as RunAt<"camp">, seatId, action, catalog);
  return retried.ok && !failed(retried.run, catalog) ? retried : played;
}

const campAction: Handler<"camp", CampAction> = (run, seatId, action, catalog) => {
  const played = play(run, seatId, action, catalog);
  if (!played.ok) return err(played.error);
  const settled = deferFatalEffects(run, seatId, action, played, catalog);
  return ok(react(settled.run, settled.events, catalog));
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
    "use-ability": (run, seatId, action, catalog) => useAbility(run, seatId, action.sourceKey, action.targets, catalog),
    "skip-window": (run, seatId, _action, catalog) => passWindow(run, seatId, catalog),
    whisper: (run, seatId, action, catalog) => applyWhisper(run, seatId, action, catalog),
    "pick-objective": campAction,
    "play-card": campAction,
  },
  advance: settleIfDecided,
};
