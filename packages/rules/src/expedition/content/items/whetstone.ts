import { shiftedRank } from "../helpers";
import { defineItem, itemAbility } from "../source-def";

export const whetstone = defineItem({
  id: "whetstone",
  name: "Whetstone",
  rarity: "common",
  price: 2,
  uses: { kind: "single-use" },
  text: "A card in your hand counts up to two ranks higher or lower this camp.",
  active: itemAbility({
    window: "between-tricks",
    targets: [{ kind: "card-value", spread: 2 }],
    apply: (ctx) => [
      { op: "add-modifier", lasts: "attempt", audience: "owner", params: { cardId: ctx.targets[0].cardId, rank: ctx.targets[0].rank } },
    ],
    effect: (effect, run) => shiftedRank(run, effect.origin.seatId, effect.params.cardId, effect.params.rank),
  }),
});
