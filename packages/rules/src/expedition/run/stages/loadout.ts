import { equipError } from "../items";
import { dealCamp } from "../lifecycle";
import { useAbility } from "../abilities";
import { err, everySeat, ok, readied, type StageDef } from "./stage-def";
import { OUTFIT } from "./outfit";

/** Each seat equips, then readies; the last ready deals the camp. After its
 * ready a seat can change nothing. */
export const loadout: StageDef<"loadout"> = {
  on: {
    ...OUTFIT,
    "use-ability": (run, seatId, action, catalog) => useAbility(run, seatId, action.sourceKey, action.targets, catalog),
    ready: (run, seatId, _action, catalog) => {
      const ready = readied(run.stage.ready, seatId);
      if (ready === null) return err("already_ready");
      // A camp rule may have lowered the slots under the set carried in.
      const error = equipError(run, seatId, run.seats.find((s) => s.seatId === seatId)!.equipped, catalog);
      return error === null ? ok({ ...run, stage: { ...run.stage, ready } }) : err(error);
    },
  },
  advance: (run, catalog) => (everySeat(run, run.stage.ready) ? dealCamp(run, catalog) : run),
};
