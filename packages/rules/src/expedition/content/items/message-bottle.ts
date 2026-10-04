import { extraWhisper } from "../helpers";
import { defineItem, itemAbility } from "../source-def";

export const messageBottle = defineItem({
  id: "message-bottle",
  name: "Message in a Bottle",
  rarity: "common",
  price: 1,
  exclusiveTo: "pack-rat",
  uses: { kind: "single-use" },
  text: "Whisper once more this camp.",
  active: itemAbility({
    window: "between-tricks",
    targets: [],
    apply: (ctx) => [{ op: "add-modifier", lasts: "attempt", audience: "public", params: { seatId: ctx.self } }],
    effect: (effect) => extraWhisper(effect.params.seatId as string),
  }),
});
