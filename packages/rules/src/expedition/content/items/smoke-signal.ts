import { extraWhisper } from "../helpers";
import { defineItem, itemAbility } from "../source-def";

export const smokeSignal = defineItem({
  id: "smoke-signal",
  name: "Smoke Signal",
  rarity: "rare",
  price: 5,
  uses: { kind: "charges", n: 2 },
  text: "Everyone may whisper once more this camp.",
  active: itemAbility({
    window: "between-tricks",
    targets: [],
    apply: () => [{ op: "add-modifier", lasts: "attempt", audience: "public", params: {} }],
    effect: () => extraWhisper(null),
  }),
});
