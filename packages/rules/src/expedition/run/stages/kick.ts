// The two crew changes the room makes, not a seat: a kick voted by the
// connected players, and a kicked player connecting again (or dropping
// again before they rejoined).

import { benchSeat, markBack, MIN_CREW, rejoinBack } from "../crew";
import { reopenCamp, runStatus, withinSlots } from "../lifecycle";
import type { CampResult, Catalog, PerSeat, RunAt, RunState, Stage } from "../types";
import { advance } from "./registry";

export function canKick(run: RunState, seatId: string): boolean {
  return runStatus(run) === "in_progress" && run.seatIds.includes(seatId) && run.seatIds.length > MIN_CREW;
}

function without<V>(perSeat: PerSeat<V>, seatId: string): PerSeat<V> {
  return Object.fromEntries(Object.entries(perSeat).filter(([id]) => id !== seatId)) as PerSeat<V>;
}

function stageWithout(stage: Stage, seatId: string): Stage {
  switch (stage.tag) {
    case "muster":
      return { ...stage, ballots: without(stage.ballots, seatId), locked: without(stage.locked, seatId) };
    case "route":
      return { ...stage, ballots: without(stage.ballots, seatId) };
    case "shop":
    case "loadout":
    case "event":
      return { ...stage, ready: without(stage.ready, seatId) };
    case "camp":
    case "draft":
    case "ended":
      return stage;
  }
}

/** A dealt camp is abandoned for nothing: a `restarted` attempt, then the
 * same camp again (its shop first before a boss camp), whose deal is fresh
 * for the crew left. */
function restartCamp(run: RunState, catalog: Catalog): RunState {
  if (run.stage.tag !== "camp") return run;
  const { camp: spec, attempt } = (run as RunAt<"camp">).stage;
  const result: CampResult = { camp: spec.index, attempt: attempt.attemptNumber, location: spec.location, weather: spec.weather, status: "restarted", suppliesSpent: 0, coins: 0 };
  return reopenCamp({ ...run, history: [...run.history, result] }, spec, catalog);
}

/** Takes seatId out of the crew. Its ballot, lock-in or ready mark goes with it, a
 * dealt camp restarts without it, and the run advances: the seat may have
 * been the last one the stage waited on. Throws unless canKick. */
export function kickSeat(run: RunState, seatId: string, catalog: Catalog): RunState {
  if (!canKick(run, seatId)) throw new Error(`kickSeat: ${seatId} cannot be kicked now`);
  const benched = benchSeat(run, seatId);
  return advance(restartCamp({ ...benched, stage: stageWithout(benched.stage, seatId) }, catalog), catalog);
}

/** A kicked seat connecting is back: it rejoins at the next loadout, or at
 * once while the muster or a loadout is open. Dropping again before then
 * keeps it out. Any other seat is unchanged. */
export function seatPresence(run: RunState, seatId: string, connected: boolean, catalog: Catalog): RunState {
  const marked = markBack(run, seatId, connected);
  if (marked === run || !connected) return marked;
  if (marked.stage.tag === "muster") return rejoinBack(marked, catalog);
  if (marked.stage.tag === "loadout") return withinSlots(rejoinBack(marked, catalog) as RunAt<"loadout">, catalog);
  return marked;
}
