import { winnerExcluding } from "../helpers";
import { ability, defineItem } from "../source-def";

export const bait = defineItem({
  id: "bait",
  name: "Bait",
  text: "A card on the table can't win this trick.",
  active: ability({
    window: "in-trick",
    limit: { kind: "single-use" },
    targets: [{ kind: "card", where: "board" }],
    apply: (ctx) => [{ op: "add-modifier", lasts: "trick", audience: "public", params: { cardId: ctx.targets[0].cardId } }],
    effect: (effect) => ({
      trickWinner: (prev) => (plays) => winnerExcluding(prev, plays, (play) => play.card.id === effect.params.cardId),
    }),
  }),
});
