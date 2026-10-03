import { extraWhisper } from "../helpers";
import { ability, defineCharacter, defineUpgrade } from "../source-def";

export const cartographer = defineCharacter({
  id: "cartographer",
  name: "The Cartographer",
  theme: "Redraws the route",
  power: "Redraw",
  text: "Replace a face-up objective with a new one.",
  active: ability({
    window: "objective-pick",
    limit: { kind: "per-camp", times: 1 },
    targets: [{ kind: "objective", whose: "unclaimed" }],
    canTarget: (ctx) => {
      const { objective } = ctx.targets[0];
      if (objective.kind !== "win-card" && objective.kind !== "ordered") return "Only card objectives can be redrawn";
      if (ctx.camp!.objectiveDeck.length === 0) return "The objective deck is empty";
      return true;
    },
    apply: (ctx) => [{ op: "replace-objective", objectiveId: ctx.targets[0].objective.id }],
  }),
  upgrades: [
    defineUpgrade({
      id: "cartographer.detour",
      name: "Detour",
      text: "Give one of your open objectives to a teammate.",
      active: ability({
        window: "between-tricks",
        limit: { kind: "per-camp", times: 1 },
        targets: [{ kind: "objective", whose: "mine" }, { kind: "player", who: "teammate" }],
        apply: (ctx) => [{ op: "reassign-objective", objectiveId: ctx.targets[0].objective.id, toSeatId: ctx.targets[1].seatId }],
      }),
    }),
    defineUpgrade({
      id: "cartographer.landmark",
      name: "Landmark",
      text: "The owner of a completed objective may whisper once more this camp.",
      active: ability({
        window: "between-tricks",
        limit: { kind: "per-camp", times: 1 },
        targets: [{ kind: "completed-objective" }],
        canTarget: (ctx) => (ctx.targets[0].objective.ownerSeatId === null ? "Nobody holds it" : true),
        apply: (ctx) => [{ op: "add-modifier", lasts: "attempt", audience: "public", params: { seatId: ctx.targets[0].objective.ownerSeatId! } }],
        effect: (effect) => extraWhisper(effect.params.seatId),
      }),
    }),
  ],
});
