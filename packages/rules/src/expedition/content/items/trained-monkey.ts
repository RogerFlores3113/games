import { defineItem, itemAbility } from "../source-def";

export const trainedMonkey = defineItem({
  id: "trained-monkey",
  name: "Trained Monkey",
  rarity: "common",
  price: 3,
  uses: { kind: "per-camp" },
  text: "Swap a card in your hand with a random card from a teammate's hand.",
  active: itemAbility({
    window: "between-tricks",
    targets: [{ kind: "card", where: "my-hand" }, { kind: "hand" }],
    apply: (ctx) => {
      const [own, hand] = ctx.targets;
      const [taken] = ctx.randomCards(hand.seatId, 1);
      return [{ op: "swap-cards", seatA: ctx.self, cardIdA: own.cardId, seatB: hand.seatId, cardIdB: taken! }];
    },
  }),
});
