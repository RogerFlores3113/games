import { WHISPERS_PER_CAMP } from "../../run/balance";
import { whispersUsedBy } from "../../run/whisper";
import { attemptOf } from "../../run/attempt";
import { extraWhisper } from "../helpers";
import { ability, defineCharacter, defineUpgrade } from "../source-def";

export const leader = defineCharacter({
  id: "leader",
  name: "The Leader",
  theme: "Communicates",
  power: "Megaphone",
  text: "Whisper twice each camp.",
  passive: { modifier: (owner) => extraWhisper(owner.seatId) },
  upgrades: [
    defineUpgrade({
      id: "leader.open-ears",
      name: "Open Ears",
      text: "Hear every teammate's first whisper of each camp.",
      passive: {
        modifier: (owner) => ({
          whisperAudience: (prev) => (run, seatId, targetSeatId) => {
            const audience = prev(run, seatId, targetSeatId);
            return seatId !== owner.seatId && whispersUsedBy(run, seatId) === 0 && !audience.includes(owner.seatId) ? [...audience, owner.seatId] : audience;
          },
        }),
      },
    }),
    defineUpgrade({
      id: "leader.delegate",
      name: "Delegate",
      text: "Give one of your whispers to a teammate.",
      active: ability({
        window: "between-tricks",
        limit: { kind: "whispers" },
        targets: [{ kind: "player", who: "teammate" }],
        canTarget: (ctx) => {
          const seatId = ctx.targets[0].seatId;
          return ctx.rules.whisperAllowed(ctx.run, seatId) && ctx.rules.whispersPerCamp(ctx.run, seatId) > 0 ? true : "They can't whisper";
        },
        apply: (ctx) => [{ op: "add-modifier", lasts: "attempt", audience: "public", params: { from: ctx.self, to: ctx.targets[0].seatId } }],
        effect: (effect) => ({
          whispersPerCamp: (prev) => (run, seatId) => prev(run, seatId) + (seatId === effect.params.to ? 1 : 0) - (seatId === effect.params.from ? 1 : 0),
        }),
      }),
    }),
    defineUpgrade({
      id: "leader.momentum",
      name: "Momentum",
      text: "Whisper once more per trick you win, and no other bonus whisper counts.",
      passive: {
        foldsLast: true,
        modifier: (owner) => ({
          whispersPerCamp: (prev) => (run, seatId) => {
            if (seatId !== owner.seatId) return prev(run, seatId);
            const won = attemptOf(run)?.camp.completedTricks.filter((trick) => trick.winnerSeatId === seatId).length ?? 0;
            return WHISPERS_PER_CAMP + 1 + won;
          },
        }),
      },
    }),
  ],
});
