// Which objectives a seat may see. Shared by the per-seat view and the
// target-kind registry, so a choice list can never name an objective the
// view hides.

import type { CampState, Objective } from "../state";
import type { RunRules } from "./run-rules";
import type { RunState } from "./types";

/** Every objective under face-up assignment. Under face-down (Thick Fog),
 * only the seat's own; none for a viewer who holds no seat. */
export function visibleObjectives(run: RunState, camp: CampState, rules: RunRules, seatId: string): readonly Objective[] {
  if (rules.objectiveAssignment(run) === "face-up") return camp.objectives;
  if (!run.seatIds.includes(seatId)) return [];
  return camp.objectives.filter((objective) => objective.ownerSeatId === seatId);
}
