import { lowestOfLedSuit } from "../helpers";
import { ability, defineCharacter, defineUpgrade } from "../source-def";

export const guide = defineCharacter({
  id: "guide",
  name: "The Guide",
  theme: "Cuts the trail",
  power: "Machete",
  text: "Choose who leads the next trick.",
  active: ability({
    window: "between-tricks",
    limit: (owner) => ({ kind: "per-camp", times: owner.hasUpgrade("guide.pathfinder") ? 2 : 1 }),
    targets: [{ kind: "player", who: "anyone" }],
    canTarget: (ctx) => (ctx.camp!.currentTrick.leaderSeatId === ctx.targets[0].seatId ? "They already lead the next trick" : true),
    apply: (ctx) => [{ op: "set-next-leader", seatId: ctx.targets[0].seatId }],
  }),
  upgrades: [
    defineUpgrade({ id: "guide.pathfinder", name: "Pathfinder", text: "Your Machete works twice per camp." }),
    defineUpgrade({
      id: "guide.howler-call",
      name: "Howler Call",
      text: "The lowest card of the led suit wins this trick.",
      active: ability({
        window: "in-trick",
        limit: { kind: "per-run", times: 1 },
        targets: [{ kind: "board" }],
        apply: () => [{ op: "add-modifier", lasts: "trick", audience: "public", params: {} }],
        effect: () => ({ trickWinner: () => lowestOfLedSuit }),
      }),
    }),
  ],
});
