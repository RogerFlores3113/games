import { openLoadout } from "../lifecycle";
import { buy } from "../shop";
import { useAbility } from "../abilities";
import { err, everySeat, ok, readied, type StageDef } from "./stage-def";
import { OUTFIT } from "./outfit";

/** The shop before a shop camp, after its route vote or on a replay: each
 * seat buys, then readies. The last ready opens the camp's loadout. */
export const shop: StageDef<"shop"> = {
  on: {
    ...OUTFIT,
    "use-ability": (run, seatId, action, catalog) => useAbility(run, seatId, action.sourceKey, action.targets, catalog),
    buy: (run, seatId, action, catalog) => buy(run, seatId, action.stockId, catalog),
    ready: (run, seatId) => {
      const ready = readied(run.stage.ready, seatId);
      return ready === null ? err("already_ready") : ok({ ...run, stage: { ...run.stage, ready } });
    },
  },
  advance: (run, catalog) => (everySeat(run, run.stage.ready) ? openLoadout(run, run.stage.camp, catalog) : run),
};
