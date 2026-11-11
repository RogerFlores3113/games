import { whisperedCard } from "../helpers";
import { defineItem, itemAbility } from "../source-def";

export const trainedMonkey = defineItem({
  id: "trained-monkey",
  name: "Trained Monkey",
  rarity: "common",
  price: 3,
  uses: { kind: "per-camp" },
  text: "Swap a card for one a teammate whispered to you, if they still hold it.",
  active: itemAbility({
    window: "between-tricks",
    targets: [{ kind: "card", where: "my-hand" }, { kind: "whisper", which: "received" }],
    canTarget: (ctx) => {
      const named = whisperedCard(ctx.run, ctx.targets[1].ordinal);
      const holds = named !== undefined && ctx.camp!.hands.find((h) => h.seatId === named.fromSeatId)?.cards.some((c) => c.id === named.cardId) === true;
      return holds ? true : "They no longer hold it";
    },
    apply: (ctx) => {
      const named = whisperedCard(ctx.run, ctx.targets[1].ordinal)!;
      return [{ op: "swap-cards", seatA: ctx.self, cardIdA: ctx.targets[0].cardId, seatB: named.fromSeatId, cardIdB: named.cardId }];
    },
  }),
});
