import { mintItems, roomFor } from "../items";
import { openLegAfter } from "../lifecycle";
import { useAbility } from "../abilities";
import { err, ok, type StageDef } from "./stage-def";
import { OUTFIT } from "./outfit";

/** Each seat with an offer takes one bundle of its head offer; one that
 * does not fit is refused until the seat discards. */
export const draft: StageDef<"draft"> = {
  on: {
    ...OUTFIT,
    "use-ability": (run, seatId, action, catalog) => useAbility(run, seatId, action.sourceKey, action.targets, catalog),
    "pick-bundle": (run, seatId, action, catalog) => {
      const seat = run.seats.find((s) => s.seatId === seatId)!;
      const bundle = seat.offers[0]?.bundles[action.bundle];
      if (bundle === undefined) return err("not_a_choice");
      if (bundle.length > roomFor(run, seatId, catalog)) return err("backpack_full");
      const picked = { ...run, seats: run.seats.map((s) => (s.seatId === seatId ? { ...s, offers: s.offers.slice(1) } : s)) };
      return ok(mintItems(picked, seatId, bundle, catalog));
    },
  },
  advance: (run, catalog) => (run.seats.some((seat) => seat.offers.length > 0) ? run : openLegAfter(run, run.stage.next, "draft", catalog)),
};
