// A coming camp's objectives, seen ahead of the deal by a seat the composed
// `surveys` hook names (the Cartographer's Survey). Derived, never stored:
// the deal is the same pure function of the run the loadout will deal from.

import type { Objective } from "../state";
import { dealCamp } from "./lifecycle";
import { planAfter, type CampSpec } from "./route";
import type { Catalog, RunAt, RunState } from "./types";

/** A camp the crew is shown ahead of its deal, and the run as it will be
 * there (a route option's boss swap written into the plan). */
export type SurveyedCamp = { readonly spec: CampSpec; readonly run: RunState };

/** The camps the stage previews: the loadout's camp, each route option's
 * next camp, or the chosen route's. [] elsewhere. */
export function surveyedCamps(run: RunState): readonly SurveyedCamp[] {
  const stage = run.stage;
  switch (stage.tag) {
    case "loadout":
      return [{ spec: stage.camp, run }];
    case "route":
      return stage.options.map((option) => ({ spec: option.next, run: { ...run, plan: planAfter(run.plan!, option) } }));
    case "event":
      return [{ spec: stage.route.next, run }];
    default:
      return [];
  }
}

/** The objectives the camp's next attempt deals, exactly as dealCamp will. */
export function surveyObjectives(camp: SurveyedCamp, catalog: Catalog): readonly Objective[] {
  const atLoadout: RunAt<"loadout"> = { ...camp.run, stage: { tag: "loadout", camp: camp.spec, stock: null, ready: {} } };
  return dealCamp(atLoadout, catalog).stage.attempt.camp.objectives;
}
