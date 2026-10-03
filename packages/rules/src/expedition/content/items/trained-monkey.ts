import { ability, defineItem } from "../source-def";

export const trainedMonkey = defineItem({
  id: "trained-monkey",
  name: "Trained Monkey",
  text: "Swap a card in your hand with a random card from a teammate's hand.",
  active: ability({
    window: "between-tricks",
    limit: { kind: "per-camp", times: 1 },
    targets: [{ kind: "card", where: "my-hand" }, { kind: "hand" }],
    apply: (ctx) => {
      const [own, hand] = ctx.targets;
      const [taken] = ctx.randomCards(hand.seatId, 1);
      return [{ op: "swap-cards", seatA: ctx.self, cardIdA: own.cardId, seatB: hand.seatId, cardIdB: taken! }];
    },
  }),
});
