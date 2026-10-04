import { attemptOf } from "../../run/attempt";
import type { RuleModifier } from "../../run/run-rules";
import type { RunState } from "../../run/types";
import { heldOrPlayedBy, shiftedRank } from "../helpers";
import { ability, defineCharacter, defineUpgrade } from "../source-def";

/** True Form: the changed card counts as the card it became, so objectives
 * read it too. Like shiftedRank, only while its user holds or played it. */
function trueForm(run: RunState, seatId: string, cardId: string, rank: number): RuleModifier {
  const camp = attemptOf(run)?.camp ?? null;
  if (camp === null || !heldOrPlayedBy(camp, seatId, cardId)) return {};
  return {
    identityOf: (prev) => (card) => {
      const identity = prev(card);
      return card.id === cardId && identity.kind === "standard" ? { ...identity, rank: rank as typeof identity.rank } : identity;
    },
  };
}

export const explorer = defineCharacter({
  id: "explorer",
  name: "The Explorer",
  theme: "Changes card values",
  power: "Compass",
  text: "A card in your hand counts one rank higher or lower.",
  active: ability({
    window: ["between-tricks", "in-trick"],
    limit: (owner) => ({ kind: "per-camp", times: owner.hasUpgrade("explorer.second-wind") ? 2 : 1 }),
    targets: [{ kind: "card-value", spread: 1 }],
    apply: (ctx) => [
      {
        op: "add-modifier",
        lasts: "attempt",
        audience: "owner",
        params: { cardId: ctx.targets[0].cardId, rank: ctx.targets[0].rank, trueForm: ctx.owner.hasUpgrade("explorer.true-form") },
      },
    ],
    effect: (effect, run) =>
      effect.params.trueForm === true
        ? trueForm(run, effect.origin.seatId, effect.params.cardId as string, effect.params.rank as number)
        : shiftedRank(run, effect.origin.seatId, effect.params.cardId as string, effect.params.rank as number),
  }),
  upgrades: [
    defineUpgrade({ id: "explorer.second-wind", name: "Second Wind", text: "Your Compass works twice per camp." }),
    defineUpgrade({ id: "explorer.true-form", name: "True Form", text: "A card your Compass changes counts as its new card for objectives too." }),
    defineUpgrade({
      id: "explorer.reshape",
      name: "Reshape",
      text: "Shift an open objective's card one rank instead of a card in hand.",
      active: ability({
        window: ["between-tricks", "in-trick"],
        limit: { kind: "shares", of: "explorer", spends: 1 },
        targets: [{ kind: "objective-value", spread: 1 }],
        apply: (ctx) => [{ op: "retarget-objective", objectiveId: ctx.targets[0].objective.id, target: ctx.targets[0].target }],
      }),
    }),
  ],
});
