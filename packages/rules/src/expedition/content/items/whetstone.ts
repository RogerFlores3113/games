import { shiftedRank } from "../helpers";
import { ability, defineItem } from "../source-def";

export const whetstone = defineItem({
  id: "whetstone",
  name: "Whetstone",
  text: "A card in your hand counts up to two ranks higher or lower this camp.",
  active: ability({
    window: "between-tricks",
    limit: { kind: "single-use" },
    targets: [{ kind: "card-value", spread: 2 }],
    apply: (ctx) => [
      { op: "add-modifier", lasts: "attempt", audience: "owner", params: { cardId: ctx.targets[0].cardId, rank: ctx.targets[0].rank } },
    ],
    effect: (effect) => shiftedRank(effect.params.cardId, effect.params.rank),
  }),
});
