import { hasPendingObjective } from "../helpers";
import { ability, defineItem } from "../source-def";

export const trailMap = defineItem({
  id: "trail-map",
  name: "Trail Map",
  text: "Swap all your open objectives with a teammate's.",
  active: ability({
    window: "between-tricks",
    limit: { kind: "per-run", times: 1 },
    targets: [{ kind: "player", who: "teammate" }],
    canTarget: (ctx) => {
      const camp = ctx.camp;
      return hasPendingObjective(camp, ctx.self, ctx.rules) || hasPendingObjective(camp, ctx.targets[0].seatId, ctx.rules)
        ? true
        : "Neither of you has an open objective";
    },
    apply: (ctx) => [{ op: "swap-objectives", seatA: ctx.self, seatB: ctx.targets[0].seatId }],
  }),
});
