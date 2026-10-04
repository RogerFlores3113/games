import { routeOptions } from "../route";
import { err, ok, type StageDef } from "./stage-def";

/** Each seat with an offer takes one source from it. */
export const draft: StageDef<"draft"> = {
  on: {
    "pick-draft": (run, seatId, action) => {
      const seat = run.seats.find((s) => s.seatId === seatId)!;
      if (seat.draftOffer === null) return err("no_draft_pending");
      if (!seat.draftOffer.includes(action.sourceId)) return err("not_offered");
      return ok({ ...run, seats: run.seats.map((s) => (s.seatId === seatId ? { ...s, kit: [...s.kit, action.sourceId], draftOffer: null } : s)) });
    },
  },
  advance: (run) =>
    run.seats.some((seat) => seat.draftOffer !== null)
      ? run
      : { ...run, stage: { tag: "route", from: run.stage.cleared, options: routeOptions(run), ballots: {} } },
};
