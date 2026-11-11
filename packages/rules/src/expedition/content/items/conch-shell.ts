import { defineItem, itemAbility } from "../source-def";

export const conchShell = defineItem({
  id: "conch-shell",
  name: "Conch Shell",
  rarity: "uncommon",
  price: 3,
  uses: { kind: "single-use" },
  text: "Choose who leads the next trick.",
  active: itemAbility({
    window: "between-tricks",
    targets: [{ kind: "player", who: "anyone" }],
    apply: (ctx) => [{ op: "set-next-leader", seatId: ctx.targets[0].seatId }],
  }),
});
