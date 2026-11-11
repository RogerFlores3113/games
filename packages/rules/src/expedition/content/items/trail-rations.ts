import { defineItem, itemAbility } from "../source-def";

export const trailRations = defineItem({
  id: "trail-rations",
  name: "Trail Rations",
  rarity: "rare",
  price: 5,
  noFreeUse: true,
  uses: { kind: "single-use" },
  text: "This failure costs the crew no supply.",
  active: itemAbility({
    window: "rescue",
    targets: [],
    // Not a refund: it only zeroes what the failure would cost, so a camp
    // rescued some other way gains no supply.
    apply: () => [{ op: "add-modifier", lasts: "attempt", audience: "public", params: {} }],
    effect: () => ({ failureCost: () => () => 0 }),
  }),
});
