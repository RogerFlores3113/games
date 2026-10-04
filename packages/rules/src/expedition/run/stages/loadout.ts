import { dealCamp } from "../lifecycle";
import { err, everySeat, ok, readied, type StageDef } from "./stage-def";

/** Every seat readies; the last ready deals the camp. */
export const loadout: StageDef<"loadout"> = {
  on: {
    ready: (run, seatId) => {
      const ready = readied(run.stage.ready, seatId);
      return ready === null ? err("already_ready") : ok({ ...run, stage: { ...run.stage, ready } });
    },
  },
  advance: (run, catalog) => (everySeat(run, run.stage.ready) ? dealCamp(run, catalog) : run),
};
