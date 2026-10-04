import { equipError } from "../items";
import { dealCamp } from "../lifecycle";
import { buy } from "../shop";
import { err, everySeat, ok, readied, type StageDef } from "./stage-def";

/** Each seat equips, buys before a boss camp, then readies; the last ready
 * deals the camp. After its ready a seat can change nothing. */
export const loadout: StageDef<"loadout"> = {
  on: {
    equip: (run, seatId, action, catalog) => {
      if (Object.hasOwn(run.stage.ready, seatId)) return err("already_ready");
      const error = equipError(run, seatId, action.itemUids, catalog);
      if (error !== null) return err(error);
      return ok({ ...run, seats: run.seats.map((s) => (s.seatId === seatId ? { ...s, equipped: [...action.itemUids] } : s)) });
    },
    buy: (run, seatId, action, catalog) => buy(run, seatId, action.stockId, catalog),
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
