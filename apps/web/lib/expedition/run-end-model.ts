import { RUN_LENGTH_DISPLAY } from "@games/rules";
import type { SceneServerInput } from "./build-scene-model";
import { bossLabel, plannedBossAt } from "./view-access";
import { modDisplayName } from "./weather-model";

/** The end of a run: won at the temple or turned back on the trail, with
 * how many tries each camp took. A pure display transform of the view. */

export interface RunEndCamp {
  index: number;
  attempts: number;
  cleared: boolean;
  /** The boss that waited there ("Tiger", "The Temple"), its tier while
   * unrevealed, or null for a plain camp. */
  boss: string | null;
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

function bossName(view: SceneServerInput["game"], index: number): string | null {
  const boss = plannedBossAt(view, index);
  if (boss === null) return null;
  return boss.bossId === null ? bossLabel(view, index) : modDisplayName(boss.bossId);
}

/** "after 2 tries against the Tiger", "after 1 try in the temple". */
function lostAt(view: SceneServerInput["game"], camp: RunEndCamp | undefined): string {
  if (camp === undefined) return "";
  const tries = ` after ${plural(camp.attempts, "try", "tries")}`;
  const boss = plannedBossAt(view, camp.index);
  if (boss === null || camp.boss === null) return tries;
  return boss.tier === "temple" ? `${tries} in the temple` : `${tries} against the ${camp.boss}`;
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
      boss: bossName(view, index),
      caption: results.length === 0 ? "not reached" : plural(results.length, "try", "tries"),
    };
  });
  const campReached = view.history.at(-1)?.camp ?? 0;
  const coins = view.purse === 0 ? "" : ` and ${plural(view.purse, "coin", "coins")}`;
  const length = view.length === null ? "" : `${RUN_LENGTH_DISPLAY[view.length].name} run: `;
  return {
    sceneKey: "run-end",
    outcome,
    campReached,
    supplies: view.supplies.count,
    purse: view.purse,
    headline: outcome === "won" ? "The temple is cleared!" : `The expedition turned back at camp ${campReached}`,
    detail:
      outcome === "won"
        ? `${length}all ${campCount} camps cleared, with ${plural(view.supplies.count, "supply", "supplies")}${coins} left`
        : `Out of supplies${lostAt(view, history[campReached - 1])}`,
    history,
    isHost: view.yourSeatId !== null && view.yourSeatId === server.hostSeatId,
  };
}
