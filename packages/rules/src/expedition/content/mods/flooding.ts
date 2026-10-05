import { RIVER_SHARE } from "../../run/balance";
import type { RuleModifier } from "../../run/run-rules";
import { defineMod, type ModBody } from "./mod-def";

const ID = "flooding";

/** The trick count by which every objective must be done. */
export function river(totalTricks: number): number {
  return Math.ceil(totalTricks * RIVER_SHARE);
}

/** The river ends the camp `late` tricks after the shared line: from then on
 * every objective is judged as if the camp's last trick was the one just
 * played, so a trick count resolves on the tricks won so far and an unwon
 * card fails. */
export function riverBody(late: number): ModBody {
  const floods: RuleModifier = {
    objectiveStatus: (prev) => (camp, objective) => {
      const played = camp.completedTricks.length;
      return prev(played >= river(camp.totalTricks) + late ? { ...camp, totalTricks: played } : camp, objective);
    },
  };
  return {
    rules: () => floods,
    status: (ctx) => {
      if (ctx.camp === null) return [];
      const of = river(ctx.camp.totalTricks) + late;
      return [{ kind: "meter", left: Math.max(0, of - ctx.camp.completedTricks.length), of }];
    },
  };
}

export const flooding = defineMod({
  id: ID,
  kind: "pairing",
  name: "Flooding",
  weight: 0,
  text: "Rain floods the cave: the camp ends when the river rises, and every objective not done by then fails.",
  full: riverBody(0),
});
