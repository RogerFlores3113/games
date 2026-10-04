import { winnerExcluding } from "../helpers";
import { ability, defineItem } from "../source-def";

export const puffball = defineItem({
  id: "puffball",
  name: "Puffball",
  text: "You can't win the next trick.",
  active: ability({
    window: "between-tricks",
    limit: { kind: "single-use" },
    targets: [{ kind: "self" }],
    apply: () => [{ op: "add-modifier", lasts: "trick", audience: "public", params: {} }],
    effect: (effect) => ({
      trickWinner: (prev) => (plays, led) => winnerExcluding(prev, plays, led, (play) => play.seatId === effect.seatId),
    }),
  }),
});
