import { freshObjectiveAvailable, shiftedRank } from "../helpers";
import { ability, defineCharacter, defineUpgrade } from "../source-def";

export const botanist = defineCharacter({
  id: "botanist",
  name: "The Botanist",
  theme: "Brews jungle herbs",
  power: "Herb Tonic",
  pool: { name: "Herbs", start: 2, max: 3, regain: (owner) => (owner.hasUpgrade("botanist.greenhouse") ? 2 : 1) },
  text: "A card in your hand counts one rank higher or lower this camp.",
  active: ability({
    window: "between-tricks",
    limit: { kind: "pool", cost: 1 },
    targets: [{ kind: "card-value", spread: 1 }],
    apply: (ctx) => [
      { op: "add-modifier", lasts: "attempt", audience: "owner", params: { cardId: ctx.targets[0].cardId, rank: ctx.targets[0].rank } },
    ],
    effect: (effect, run) => shiftedRank(run, effect.origin.seatId, effect.params.cardId, effect.params.rank),
  }),
  upgrades: [
    defineUpgrade({ id: "botanist.greenhouse", name: "Greenhouse", text: "Regain 2 herbs after each cleared camp." }),
    defineUpgrade({
      id: "botanist.antidote",
      name: "Antidote",
      text: "Swap a failed objective for a fresh one.",
      active: ability({
        window: "rescue",
        limit: { kind: "pool", cost: 2 },
        targets: [{ kind: "failed-objective" }],
        // No canUse on the deck: whether a fresh card is still in a hand is
        // hidden, so with none left the failed objective is dropped instead.
        apply: (ctx) => {
          const objectiveId = ctx.targets[0].objective.id;
          return [freshObjectiveAvailable(ctx.camp) ? { op: "replace-objective", objectiveId } : { op: "remove-objective", objectiveId }];
        },
      }),
    }),
  ],
});
