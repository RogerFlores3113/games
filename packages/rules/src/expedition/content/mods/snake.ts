import type { ActiveEffect, RunState } from "../../run/types";
import { trickContaining } from "../../objectives";
import { defineBoss, type ModBody, type StatusPart, type Strength } from "./mod-def";

const ID = "snake";

type Bite = { readonly seatId: string; readonly from: number; readonly through: number };

function bitesOf(run: RunState, strength: Strength): readonly Bite[] {
  if (run.stage.tag !== "camp") return [];
  return run.stage.attempt.effects
    .filter((e) => e.origin.kind === "mod" && e.origin.modId === ID && e.origin.strength === strength)
    .map((e) => biteOf(e));
}

function biteOf(effect: ActiveEffect): Bite {
  const { seatId, from, through } = effect.params;
  if (typeof seatId !== "string" || typeof from !== "number" || typeof through !== "number") throw new Error("snake: malformed bite");
  return { seatId, from, through };
}

/** One part per bitten seat whose bite covers the trick in play. */
function status(run: RunState, trick: number, strength: Strength): readonly StatusPart[] {
  const left = new Map<string, number>();
  for (const bite of bitesOf(run, strength)) {
    if (bite.from <= trick && trick <= bite.through) left.set(bite.seatId, Math.max(left.get(bite.seatId) ?? 0, bite.through - trick + 1));
  }
  return [...left].map(([seatId, tricksLeft]) => ({ kind: "bitten", seatId, tricksLeft }));
}

/** A whisper is a bite lasting `tricks` tricks from the next one played. */
const body = (tricks: number): ModBody => ({
  on: {
    "whisper-sent": (ctx) => {
      if (!ctx.affects(ctx.event.fromSeatId)) return [];
      const from = ctx.camp.currentTrick.index;
      return [{ op: "add-modifier", lasts: "attempt", audience: "public", params: { seatId: ctx.event.fromSeatId, from, through: from + tricks - 1 } }];
    },
  },
  effect: (effect) => {
    const bite = biteOf(effect);
    return {
      objectiveStatus: (prev) => (state, objective) => {
        const status = prev(state, objective);
        if (status !== "done" || objective.ownerSeatId !== bite.seatId || !("target" in objective)) return status;
        const trick = trickContaining(state, objective.target);
        return trick !== undefined && trick.index >= bite.from && trick.index <= bite.through ? "failed" : status;
      },
    };
  },
  status: (ctx) => (ctx.camp === null ? [] : status(ctx.run, ctx.camp.currentTrick.index, ctx.strength)),
});

export const snake = defineBoss({
  id: ID,
  kind: "animal",
  name: "Snake",
  weight: 1,
  text: "The snake bites whoever whispers, and any objective they win in the next two tricks fails.",
  full: body(2),
  half: body(1),
});
