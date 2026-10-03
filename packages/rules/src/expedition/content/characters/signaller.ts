import { extraWhisper, whisperedTo } from "../helpers";
import { ability, defineCharacter, defineUpgrade } from "../source-def";

export const signaller = defineCharacter({
  id: "signaller",
  name: "The Signaller",
  theme: "Talks in drums",
  text: "You may whisper twice each camp.",
  passive: { modifier: (owner) => extraWhisper(owner.seatId) },
  upgrades: [
    defineUpgrade({
      id: "signaller.loud-call",
      name: "Loud Call",
      text: "Show one of your whispers to everyone.",
      active: ability({
        window: "between-tricks",
        limit: { kind: "per-camp", times: 1 },
        targets: [{ kind: "whisper", which: "sent" }],
        apply: (ctx) => [{ op: "share-reveal", whisperOrdinal: ctx.targets[0].ordinal, audience: ctx.run.seatIds }],
      }),
    }),
    defineUpgrade({
      id: "signaller.call-and-response",
      name: "Call and Response",
      text: "A teammate you whisper to may whisper once more this camp.",
      passive: {
        modifier: (owner) => ({
          whispersPerCamp: (prev) => (run, seatId) =>
            prev(run, seatId) + (seatId !== owner.seatId && whisperedTo(run, owner.seatId, seatId) ? 1 : 0),
        }),
      },
    }),
  ],
});
