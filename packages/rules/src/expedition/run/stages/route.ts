import { STREAMS } from "../rng";
import type { RouteChoice } from "../route";
import { tally } from "../vote";
import { err, ok, type StageDef } from "./stage-def";

/** Each seat votes for a route option (changeable until the vote resolves);
 * the last ballot picks the route and opens its event. */
export const route: StageDef<"route"> = {
  on: {
    vote: (run, seatId, action) => {
      if (action.choice !== null && !run.stage.options.some((o) => o.id === action.choice)) return err("not_a_choice");
      return ok({ ...run, stage: { ...run.stage, ballots: { ...run.stage.ballots, [seatId]: action.choice as RouteChoice | null } } });
    },
  },
  advance(run) {
    const { from, options, ballots } = run.stage;
    const result = tally(run.seed, STREAMS.routeVote(from + 1), options.map((o) => o.id), run.seatIds, ballots);
    if (result === null) return run;
    const chosen = options.find((o) => o.id === result.winner)!;
    return { ...run, lastVote: { topic: "route", result }, stage: { tag: "event", route: chosen, ready: {} } };
  },
};
