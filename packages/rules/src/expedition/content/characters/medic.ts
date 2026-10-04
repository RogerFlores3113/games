import { SUPPLIES_MAX } from "../../run/balance";
import { ability, defineCharacter, defineUpgrade } from "../source-def";

export const medic = defineCharacter({
  id: "medic",
  name: "The Medic",
  theme: "Keeps the crew walking",
  power: "Triage",
  text: "Drop a failed objective.",
  active: ability({
    window: "rescue",
    limit: { kind: "supplies", cost: 1 },
    targets: [{ kind: "failed-objective" }],
    apply: (ctx) => [{ op: "remove-objective", objectiveId: ctx.targets[0].objective.id }],
  }),
  upgrades: [
    defineUpgrade({
      id: "medic.rally",
      name: "Rally",
      text: "Give a failed objective to the player who won its card.",
      active: ability({
        window: "rescue",
        limit: { kind: "per-run", times: 1 },
        targets: [{ kind: "failed-objective" }],
        canTarget: (ctx) => {
          const { objective, cardWinnerSeatId } = ctx.targets[0];
          if (objective.kind !== "win-card" && objective.kind !== "ordered") return "Only card objectives can be rallied";
          if (cardWinnerSeatId === null) return "Nobody has won its card";
          if (cardWinnerSeatId === objective.ownerSeatId) return "Its owner already won its card";
          if (ctx.rules.objectiveStatus(ctx.camp!, { ...objective, ownerSeatId: cardWinnerSeatId }) === "failed") return "It would still fail";
          return true;
        },
        apply: (ctx) => [{ op: "reassign-objective", objectiveId: ctx.targets[0].objective.id, toSeatId: ctx.targets[0].cardWinnerSeatId! }],
      }),
    }),
    defineUpgrade({
      id: "medic.field-kit",
      name: "Field Kit",
      text: "Restore 1 supply.",
      active: ability({
        window: "between-tricks",
        limit: { kind: "per-run", times: 1 },
        targets: [{ kind: "supplies" }],
        canUse: (ctx) => (ctx.run.supplies < SUPPLIES_MAX ? true : "Supplies are full"),
        apply: () => [{ op: "adjust-supplies", delta: 1 }],
      }),
    }),
  ],
});
