import { defineItem, itemAbility } from "../source-def";

export const pocketGlass = defineItem({
  id: "pocket-glass",
  name: "Pocket Glass",
  rarity: "common",
  price: 1,
  exclusiveTo: "pack-rat",
  uses: { kind: "single-use" },
  text: "See 2 random cards in a teammate's hand.",
  active: itemAbility({
    window: "between-tricks",
    targets: [{ kind: "hand" }],
    apply: (ctx) => ctx.randomCards(ctx.targets[0].seatId, 2).map((cardId) => ({ op: "reveal", cardId, audience: [ctx.self] })),
  }),
});
