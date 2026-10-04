import { extraWhisper } from "../helpers";
import { defineItem, itemAbility } from "../source-def";

export const signalFlare = defineItem({
  id: "signal-flare",
  name: "Signal Flare",
  rarity: "common",
  price: 1,
  exclusiveTo: "pack-rat",
  uses: { kind: "single-use" },
  text: "The owner of a completed objective may whisper once more this camp.",
  active: itemAbility({
    window: "between-tricks",
    targets: [{ kind: "completed-objective" }],
    canTarget: (ctx) => (ctx.targets[0].objective.ownerSeatId === null ? "Nobody holds it" : true),
    apply: (ctx) => [{ op: "add-modifier", lasts: "attempt", audience: "public", params: { seatId: ctx.targets[0].objective.ownerSeatId! } }],
    effect: (effect) => extraWhisper(effect.params.seatId as string),
  }),
});
