import { openLegAfter } from "../lifecycle";
import { err, everySeat, ok, readied, type StageDef } from "./stage-def";
import { OUTFIT } from "./outfit";

/** The event after every other camp has no effect yet: every seat readies,
 * then the route vote opens. */
export const event: StageDef<"event"> = {
  on: {
    ...OUTFIT,
    ready: (run, seatId) => {
      const ready = readied(run.stage.ready, seatId);
      return ready === null ? err("already_ready") : ok({ ...run, stage: { ...run.stage, ready } });
    },
  },
  advance: (run, catalog) => (everySeat(run, run.stage.ready) ? openLegAfter(run, run.stage.next, "event", catalog) : run),
};
