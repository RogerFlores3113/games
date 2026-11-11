import { whispersBy } from "../helpers";
import { defineItem, itemAbility } from "../source-def";

export const signalFlare = defineItem({
  id: "signal-flare",
  name: "Signal Flare",
  rarity: "common",
  price: 1,
  exclusiveTo: "pack-rat",
  uses: { kind: "single-use" },
  text: "Your next whisper this camp reaches every teammate.",
  active: itemAbility({
    window: "between-tricks",
    targets: [],
    // `sent` is how many whispers the seat had sent when it lit the flare;
    // the whisper that makes it sent + 1 is the next one.
    apply: (ctx) => [{ op: "add-modifier", lasts: "attempt", audience: "public", params: { sent: whispersBy(ctx.run, ctx.self) } }],
    effect: (effect) => ({
      whisperAudience: (prev) => (run, seatId, targetSeatId) =>
        effect.origin.kind === "seat" && seatId === effect.origin.seatId && whispersBy(run, seatId) === effect.params.sent
          ? run.seatIds.filter((id) => id !== seatId)
          : prev(run, seatId, targetSeatId),
    }),
  }),
});
