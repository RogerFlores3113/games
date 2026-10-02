import type { SceneServerInput } from "./build-scene-model";
import { BOSS_CAMP_NUMBERS, FINAL_CAMP_NUMBER } from "./build-scene-model";

/** The end of a run: won at the temple or turned back on the trail, with
 * how many tries each camp took. A pure display transform of the view. */

export interface RunEndCamp {
  campNumber: number;
  attempts: number;
  cleared: boolean;
  boss: boolean;
  /** "1 try", "2 tries", "not reached". */
  caption: string;
}

export interface RunEndModel {
  sceneKey: "run-end";
  outcome: "won" | "lost";
  campReached: number;
  supplies: number;
  headline: string;
  detail: string;
  history: RunEndCamp[];
  isHost: boolean;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function buildRunEndModel(server: SceneServerInput): RunEndModel {
  const view = server.game;
  const outcome = view.runStatus === "won" ? "won" : "lost";
  const history = Array.from({ length: FINAL_CAMP_NUMBER }, (_, i): RunEndCamp => {
    const campNumber = i + 1;
    const results = view.history.filter((h) => h.campNumber === campNumber);
    return {
      campNumber,
      attempts: results.length,
      cleared: results.some((h) => h.status === "succeeded"),
      boss: BOSS_CAMP_NUMBERS.includes(campNumber),
      caption: results.length === 0 ? "not reached" : plural(results.length, "try", "tries"),
    };
  });
  return {
    sceneKey: "run-end",
    outcome,
    campReached: outcome === "won" ? FINAL_CAMP_NUMBER : view.campNumber,
    supplies: view.supplies,
    headline: outcome === "won" ? "The expedition reached the temple!" : `The expedition turned back at camp ${view.campNumber}`,
    detail:
      outcome === "won"
        ? `Cleared all ${FINAL_CAMP_NUMBER} camps with ${plural(view.supplies, "supply", "supplies")} left`
        : "Out of supplies",
    history,
    isHost: view.yourSeatId !== null && view.yourSeatId === server.hostSeatId,
  };
}
