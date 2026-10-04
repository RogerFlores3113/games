import { RIVER_SHARE } from "../../run/balance";
import { guard } from "../../camp";
import { defineMod } from "./mod-def";

const ID = "flooding";

/** The trick count by which every objective must be done. */
export function river(totalTricks: number): number {
  return Math.ceil(totalTricks * RIVER_SHARE);
}

export const flooding = defineMod({
  id: ID,
  kind: "pairing",
  name: "Flooding",
  weight: 0,
  text: "Rain floods the cave, so every objective must be done before the river rises.",
  full: {
    rules: () => ({
      goals: (prev) => (camp, statuses) => [
        ...prev(camp, statuses),
        guard(ID, camp.completedTricks.length >= river(camp.totalTricks) && statuses.some((s) => s.status !== "done")),
      ],
    }),
    status: (ctx) => {
      if (ctx.camp === null) return [];
      const of = river(ctx.camp.totalTricks);
      return [{ kind: "meter", left: Math.max(0, of - ctx.camp.completedTricks.length), of }];
    },
  },
});
