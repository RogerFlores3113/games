import { winnerExcluding } from "../helpers";
import { defineItem, itemAbility } from "../source-def";

export const puffball = defineItem({
  id: "puffball",
  name: "Puffball",
  rarity: "common",
  price: 2,
  uses: { kind: "single-use" },
  text: "You can't win the coming trick, or this one if you use it on your turn.",
  active: itemAbility({
    window: ["between-tricks", "in-trick"],
    targets: [{ kind: "self" }],
    apply: () => [{ op: "add-modifier", lasts: "trick", audience: "public", params: {} }],
    effect: (effect) => ({
      trickWinner: (prev) => (plays, led) => winnerExcluding(prev, plays, led, (play) => play.seatId === effect.origin.seatId),
    }),
  }),
});
