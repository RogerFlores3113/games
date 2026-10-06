import { openLegAfter, openLoadout } from "../lifecycle";
import { buy } from "../shop";
import { useAbility } from "../abilities";
import { err, everySeat, ok, readied, type StageDef } from "./stage-def";
import { OUTFIT } from "./outfit";

/** The shop before a boss camp: each seat buys, then readies. The last ready
 * moves on to the draft, or on a replay to the camp's loadout. */
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
  advance(run, catalog) {
    if (!everySeat(run, run.stage.ready)) return run;
    const { camp, next } = run.stage;
    return camp === null ? openLegAfter(run, next, "shop", catalog) : openLoadout(run, camp, catalog);
  },
};
