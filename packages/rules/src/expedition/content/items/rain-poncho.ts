import { extraWhisper } from "../helpers";
import { defineItem, itemAbility } from "../source-def";

export const rainPoncho = defineItem({
  id: "rain-poncho",
  name: "Rain Poncho",
  rarity: "common",
  price: 3,
  uses: { kind: "charges", n: 2 },
  text: "Whisper once more this camp.",
  active: itemAbility({
    window: "between-tricks",
    targets: [],
    apply: () => [{ op: "add-modifier", lasts: "attempt", audience: "public", params: {} }],
    effect: (e) => extraWhisper(e.origin.seatId),
  }),
});
