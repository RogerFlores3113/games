import { ability, defineItem } from "../source-def";

export const parrot = defineItem({
  id: "parrot",
  name: "Parrot",
  text: "Pass a whisper you received on to a teammate.",
  active: ability({
    window: "between-tricks",
    limit: { kind: "per-camp", times: 1 },
    targets: [{ kind: "whisper", which: "received" }, { kind: "player", who: "teammate" }],
    canTarget: (ctx) => {
      const [whisper, player] = ctx.targets;
      if (player.seatId === whisper.fromSeatId) return "They sent it";
      if (whisper.toSeatIds.includes(player.seatId)) return "They already heard it";
      return true;
    },
    apply: (ctx) => [{ op: "share-reveal", whisperOrdinal: ctx.targets[0].ordinal, audience: [ctx.targets[1].seatId] }],
  }),
});
