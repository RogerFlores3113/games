import { SUPPLIES_MAX } from "../../run/balance";
import { defineItem, itemAbility } from "../source-def";

export const firstAidKit = defineItem({
  id: "first-aid-kit",
  name: "First Aid Kit",
  rarity: "common",
  price: 2,
  exclusiveTo: "pack-rat",
  uses: { kind: "single-use" },
  text: "Restore 1 supply.",
  active: itemAbility({
    window: "between-tricks",
    targets: [{ kind: "supplies" }],
    canUse: (ctx) => (ctx.run.supplies < SUPPLIES_MAX ? true : "Supplies are full"),
    apply: () => [{ op: "adjust-supplies", delta: 1 }],
  }),
});
