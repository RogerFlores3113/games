import { openLoadout } from "../lifecycle";
import { err, everySeat, ok, readied, type StageDef } from "./stage-def";

/** The event between camps has no effect yet: every seat readies, then the
 * next camp's loadout opens. */
export const event: StageDef<"event"> = {
  on: {
    ready: (run, seatId) => {
      const ready = readied(run.stage.ready, seatId);
      return ready === null ? err("already_ready") : ok({ ...run, stage: { ...run.stage, ready } });
    },
  },
  advance: (run, catalog) => (everySeat(run, run.stage.ready) ? openLoadout(run, run.stage.route.next, catalog) : run),
};
