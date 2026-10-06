import { openLoadout } from "../lifecycle";
import { STREAMS } from "../rng";
import { planAfter, type RouteChoice } from "../route";
import { tally } from "../vote";
import { useAbility } from "../abilities";
import { err, ok, type StageDef } from "./stage-def";
import { OUTFIT } from "./outfit";

/** Each seat votes for a route option (changeable until the vote resolves);
 * the last ballot picks the route, writes any boss swap it carries into the
 * plan, and opens the chosen camp's loadout. */
export const route: StageDef<"route"> = {
  on: {
    ...OUTFIT,
    "use-ability": (run, seatId, action, catalog) => useAbility(run, seatId, action.sourceKey, action.targets, catalog),
    vote: (run, seatId, action) => {
      if (action.choice !== null && !run.stage.options.some((o) => o.id === action.choice)) return err("not_a_choice");
      return ok({ ...run, stage: { ...run.stage, ballots: { ...run.stage.ballots, [seatId]: action.choice as RouteChoice | null } } });
    },
  },
  advance(run, catalog) {
    const { from, options, ballots } = run.stage;
    const result = tally(run.seed, STREAMS.routeVote(from + 1), options.map((o) => o.id), run.seatIds, ballots);
    if (result === null) return run;
    const chosen = options.find((o) => o.id === result.winner)!;
    return openLoadout({ ...run, plan: planAfter(run.plan!, chosen), lastVote: { topic: "route", result } }, chosen.next, catalog);
  },
};
