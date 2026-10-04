import type { SceneServerInput } from "./build-scene-model";
import { plannedBossAt } from "./view-access";

/** The end of a run: won at the temple or turned back on the trail, with
 * how many tries each camp took. A pure display transform of the view. */

export interface RunEndCamp {
  index: number;
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
  purse: number;
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
  const campCount = view.campCount ?? Math.max(0, ...view.history.map((h) => h.camp));
  const history = Array.from({ length: campCount }, (_, i): RunEndCamp => {
    const index = i + 1;
    const results = view.history.filter((h) => h.camp === index);
    return {
      index,
      attempts: results.length,
      cleared: results.some((h) => h.status === "cleared"),
      boss: plannedBossAt(view, index) !== null,
      caption: results.length === 0 ? "not reached" : plural(results.length, "try", "tries"),
    };
  });
  const campReached = view.history.at(-1)?.camp ?? 0;
  const coins = view.purse === 0 ? "" : ` and ${plural(view.purse, "coin", "coins")}`;
  return {
    sceneKey: "run-end",
    outcome,
    campReached,
    supplies: view.supplies.count,
    purse: view.purse,
    headline: outcome === "won" ? "The expedition reached the temple!" : `The expedition turned back at camp ${campReached}`,
    detail: outcome === "won" ? `Cleared all ${campCount} camps with ${plural(view.supplies.count, "supply", "supplies")}${coins} left` : "Out of supplies",
    history,
    isHost: view.yourSeatId !== null && view.yourSeatId === server.hostSeatId,
  };
}
