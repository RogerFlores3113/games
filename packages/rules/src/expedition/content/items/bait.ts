import { winnerExcluding } from "../helpers";
import { defineItem, itemAbility } from "../source-def";

export const bait = defineItem({
  id: "bait",
  name: "Bait",
  rarity: "common",
  price: 2,
  uses: { kind: "single-use" },
  text: "A card on the table can't win this trick.",
  active: itemAbility({
    window: "in-trick",
    targets: [{ kind: "card", where: "board" }],
    apply: (ctx) => [{ op: "add-modifier", lasts: "trick", audience: "public", params: { cardId: ctx.targets[0].cardId } }],
    effect: (effect) => ({
      trickWinner: (prev) => (plays, led) => winnerExcluding(prev, plays, led, (play) => play.card.id === effect.params.cardId),
    }),
  }),
});
