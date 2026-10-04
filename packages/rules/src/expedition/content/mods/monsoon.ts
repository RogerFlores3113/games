import { guard } from "../../camp";
import { river } from "./flooding";
import { defineBoss, type ModBody } from "./mod-def";

const ID = "monsoon";

/** `late` tricks after the shared river line. */
const body = (late: number): ModBody => ({
  rules: () => ({
    goals: (prev) => (camp, statuses) => [
      ...prev(camp, statuses),
      guard(ID, camp.completedTricks.length >= river(camp.totalTricks) + late && statuses.some((s) => s.status !== "done")),
    ],
  }),
  status: (ctx) => {
    if (ctx.camp === null) return [];
    const of = river(ctx.camp.totalTricks) + late;
    return [{ kind: "meter", left: Math.max(0, of - ctx.camp.completedTricks.length), of }];
  },
});

export const monsoon = defineBoss({
  id: ID,
  kind: "disaster",
  name: "Monsoon",
  weight: 1,
  text: "The river rises with every trick, and every objective must be done before it floods the camp.",
  full: body(0),
  half: body(1),
});
