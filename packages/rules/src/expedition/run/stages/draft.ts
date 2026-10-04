import { mintItems } from "../items";
import { routeOptions } from "../route";
import { err, ok, type StageDef } from "./stage-def";

/** Each seat with an offer takes one bundle of its head offer. */
export const draft: StageDef<"draft"> = {
  on: {
    "pick-bundle": (run, seatId, action, catalog) => {
      const seat = run.seats.find((s) => s.seatId === seatId)!;
      const bundle = seat.offers[0]?.bundles[action.bundle];
      if (bundle === undefined) return err("not_a_choice");
      const picked = { ...run, seats: run.seats.map((s) => (s.seatId === seatId ? { ...s, offers: s.offers.slice(1) } : s)) };
      return ok(mintItems(picked, seatId, bundle, catalog));
    },
  },
  advance: (run, catalog) =>
    run.seats.some((seat) => seat.offers.length > 0)
      ? run
      : { ...run, stage: { tag: "route", from: run.stage.cleared, options: routeOptions(run, catalog), ballots: {} } },
};
