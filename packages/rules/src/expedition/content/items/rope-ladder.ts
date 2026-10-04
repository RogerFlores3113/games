import { defineItem, itemAbility } from "../source-def";

export const ropeLadder = defineItem({
  id: "rope-ladder",
  name: "Rope Ladder",
  rarity: "common",
  price: 3,
  uses: { kind: "single-use" },
  text: "Drop a failed objective.",
  active: itemAbility({
    window: "rescue",
    targets: [{ kind: "failed-objective" }],
    apply: (ctx) => [{ op: "remove-objective", objectiveId: ctx.targets[0].objective.id }],
  }),
});
