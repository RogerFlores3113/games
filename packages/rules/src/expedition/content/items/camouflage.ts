import { guard } from "../../camp";
import { countTricksWon } from "../../objectives";
import { ability, defineItem } from "../source-def";

export const camouflage = defineItem({
  id: "camouflage",
  name: "Camouflage",
  text: "Drop one of your open objectives, and the camp fails if you win a trick.",
  active: ability({
    window: "between-tricks",
    limit: { kind: "single-use" },
    targets: [{ kind: "objective", whose: "mine" }],
    canUse: (ctx) => (countTricksWon(ctx.camp, ctx.self) > 0 ? "You have already won a trick this camp" : true),
    apply: (ctx) => [
      { op: "remove-objective", objectiveId: ctx.targets[0].objective.id },
      { op: "add-modifier", lasts: "attempt", audience: "public", params: {} },
    ],
    // A guard goal, so breaking cover never opens the rescue window.
    effect: (effect) => ({
      goals: (prev) => (state) => [...prev(state), guard(`camouflage:${effect.seatId}`, countTricksWon(state, effect.seatId) > 0)],
    }),
  }),
});
