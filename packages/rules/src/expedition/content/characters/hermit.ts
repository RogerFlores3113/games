import { guard } from "../../camp";
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
  text: "Drop one of your open objectives if you've won no tricks, then win none this camp.",
  active: ability({
    window: "between-tricks",
    limit: (owner) => ({ kind: "per-camp", times: owner.hasUpgrade("hermit.burden") ? 2 : 1 }),
    targets: [{ kind: "objective", whose: "mine" }],
    canUse: (ctx) => (ctx.camp!.completedTricks.some((trick) => trick.winnerSeatId === ctx.self) ? "You've already won a trick" : true),
    apply: (ctx) => [
      { op: "remove-objective", objectiveId: ctx.targets[0].objective.id },
      { op: "add-modifier", lasts: "attempt", audience: "public", params: { seatId: ctx.self } },
    ],
    effect: (effect) => {
      const seatId = effect.params.seatId as string;
      const id = `hermit:${seatId}`;
      return {
        goals: (prev) => (camp, statuses) => {
          const goals = prev(camp, statuses);
          return goals.some((g) => g.id === id) ? goals : [...goals, guard(id, camp.completedTricks.some((trick) => trick.winnerSeatId === seatId))];
        },
      };
    },
  }),
  upgrades: [
    defineUpgrade({
      id: "hermit.burden",
      name: "Burden",
      text: "Start each camp with an extra objective, and your vow drops up to two.",
      on: { "camp-dealt": (ctx) => [{ op: "add-objective", ownerSeatId: ctx.self }] },
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
