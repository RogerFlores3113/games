import { identitiesEqual } from "../../deck";
import { defineItem, itemAbility } from "../source-def";

export const packMule = defineItem({
  id: "pack-mule",
  name: "Pack Mule",
  rarity: "common",
  price: 3,
  uses: { kind: "per-camp" },
  text: "Give a trick you won to a teammate.",
  active: itemAbility({
    window: "between-tricks",
    targets: [{ kind: "won-trick" }, { kind: "player", who: "teammate" }],
    canTarget: (ctx) => {
      const { trick } = ctx.targets[0];
      const settles = ctx.camp!.objectives.some(
        (o) => (o.kind === "win-card" || o.kind === "ordered") && trick.plays.some((play) => !play.burned && identitiesEqual(play.countsAs ?? play.card.identity, o.target)),
      );
      return settles ? "That trick settles a card objective" : true;
    },
    apply: (ctx) => [{ op: "reassign-trick", trickIndex: ctx.targets[0].trick.index, toSeatId: ctx.targets[1].seatId }],
  }),
});
