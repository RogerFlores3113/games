import { identitiesEqual } from "../../deck";
import { attemptOf } from "../../run/attempt";
import type { ToolkitOp } from "../../run/toolkit";
import { currentStamp } from "../../run/usage";
import type { RunState } from "../../run/types";
import { extraWhisper } from "../helpers";
import { ability, defineCharacter, defineUpgrade } from "../source-def";

/** The Hermit's uses of `key` this attempt. */
function usesThisCamp(run: RunState, seatId: string, key: string): number {
  const stamp = currentStamp(run);
  const seat = run.seats.find((s) => s.seatId === seatId);
  if (stamp === null || seat === undefined) return 0;
  return seat.ledger.filter((e) => e.kind === "used" && e.sourceKey === key && e.at.camp === stamp.camp && e.at.attempt === stamp.attempt).length;
}

export const hermit = defineCharacter({
  id: "hermit",
  name: "The Hermit",
  theme: "Sheds objectives it takes",
  power: "Lone Vow",
  text: "Drop an open objective if you've won no tricks, then take a new one if you win a trick later this camp.",
  active: ability({
    window: "between-tricks",
    limit: (owner) => ({ kind: "per-camp", times: owner.hasUpgrade("hermit.burden") ? 2 : 1 }),
    targets: [{ kind: "objective", whose: "mine" }],
    canUse: (ctx) => (ctx.camp!.completedTricks.some((trick) => trick.winnerSeatId === ctx.self) ? "You've already won a trick" : true),
    apply: (ctx) => [
      { op: "remove-objective", objectiveId: ctx.targets[0].objective.id },
      // The vow's mark; its reward is the Hermit's own trick-completed reaction.
      { op: "add-modifier", lasts: "attempt", audience: "public", params: { seatId: ctx.self } },
    ],
    effect: () => ({}),
  }),
  on: {
    // Winning the first trick after vowing pays each vow with a fresh objective.
    "trick-completed": (ctx) => {
      if (ctx.event.winnerSeatId !== ctx.self || ctx.camp === null) return [];
      const camp = ctx.camp;
      if (camp.completedTricks.filter((trick) => trick.winnerSeatId === ctx.self).length !== 1) return [];
      const vows = (attemptOf(ctx.run)?.effects ?? []).filter((e) => e.origin.kind === "seat" && e.origin.sourceId === "hermit" && e.params !== null && e.params.seatId === ctx.self).length;
      const fresh = camp.objectiveDeck.filter((identity) => camp.hands.some((hand) => hand.cards.some((card) => identitiesEqual(card.identity, identity)))).length;
      return Array.from({ length: Math.min(vows, fresh) }, (): ToolkitOp => ({ op: "add-objective", ownerSeatId: ctx.self }));
    },
  },
  upgrades: [
    defineUpgrade({
      id: "hermit.burden",
      name: "Burden",
      text: "Your vow can drop up to two objectives each camp.",
    }),
    defineUpgrade({
      id: "hermit.first-pick",
      name: "First Pick",
      text: "Take the first objective of every camp.",
      passive: { modifier: (owner) => ({ objectivePicker: (prev) => (state, picked) => (picked === 0 ? owner.seatId : prev(state, picked - 1)) }) },
    }),
    defineUpgrade({
      id: "hermit.alms",
      name: "Alms",
      text: "For each objective you drop, give a teammate one more whisper this camp.",
      active: ability({
        window: "between-tricks",
        limit: { kind: "unlimited" },
        targets: [{ kind: "player", who: "teammate" }],
        canUse: (ctx) => (usesThisCamp(ctx.run, ctx.self, "hermit") > usesThisCamp(ctx.run, ctx.self, "hermit.alms") ? true : "Drop an objective first"),
        apply: (ctx) => [{ op: "add-modifier", lasts: "attempt", audience: "public", params: { seatId: ctx.targets[0].seatId } }],
        effect: (effect) => extraWhisper(effect.params.seatId as string),
      }),
    }),
  ],
});
