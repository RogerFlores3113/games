import { ability, defineItem } from "../source-def";

export const ropeLadder = defineItem({
  id: "rope-ladder",
  name: "Rope Ladder",
  text: "Drop a failed objective.",
  active: ability({
    window: "rescue",
    limit: { kind: "single-use" },
    targets: [{ kind: "failed-objective" }],
    apply: (ctx) => [{ op: "remove-objective", objectiveId: ctx.targets[0].objective.id }],
  }),
});
