// Sets a camp modifier off now, through its own code. A reaction fires on
// the first event it answers, and its ops go through the toolkit as the
// modifier's own; a rule rolls with loaded dice, and the modifier's own
// status says when the roll shows what was asked for. What the table shows
// is what the game would do.

import { checkCampOutcome } from "../camp";
import { SUITS } from "../deck";
import type { ReactionCtx, StatusPart } from "../content/mods/mod-def";
import { withAttempt } from "../run/attempt";
import { rulesFor } from "../run/compose";
import { reactionCtx, type EngineEvent } from "../run/react";
import { modCtx, type StackLayer } from "../run/stack";
import { applyToolkitOps, type ToolkitOp } from "../run/toolkit";
import type { Catalog, RunAt, RunState } from "../run/types";
import type { DevField, DevParams } from "../../adapter";

export type TriggerDef = {
  readonly label: string;
  fields(run: RunState): readonly DevField[];
  fire(run: RunAt<"camp">, layer: StackLayer, params: DevParams, catalog: Catalog): RunAt<"camp">;
};

function readSeat(run: RunState, params: DevParams): string {
  const seat = params.seat;
  if (typeof seat !== "string" || !run.seatIds.includes(seat)) throw new Error(`seat must be one of: ${run.seatIds.join(", ")}`);
  return seat;
}

const seatField = (run: RunState): DevField => ({ name: "seat", label: "Seat", kind: "choice", options: run.seatIds.map((value) => ({ value, label: value })) });

/** The layer's own handler on the first of `events` it answers, its ops
 * applied as the layer's. `load` replaces parts of the context: the dice. */
function react(run: RunAt<"camp">, layer: StackLayer, events: readonly EngineEvent[], catalog: Catalog, load: Partial<ReactionCtx> = {}): RunAt<"camp"> {
  // Draws are seeded per trigger, so a second gust blows other cards.
  const key = `dev${run.stage.attempt.log.length}`;
  for (const event of events) {
    const handler = layer.body.on?.[event.type] as ((ctx: ReactionCtx) => readonly ToolkitOp[]) | undefined;
    if (handler === undefined) continue;
    const ctx = { ...reactionCtx(run, layer, event, key, catalog), ...load };
    const ops = handler(ctx);
    if (ops.length > 0) return applyToolkitOps(run, { kind: "mod", modId: layer.def.id, strength: layer.strength }, ops, ctx.rules, catalog) as RunAt<"camp">;
  }
  throw new Error(`the ${layer.def.name} has nothing to do right now`);
}

/** A trick ending at every index the camp has, for a reaction that waits
 * for one of them. */
function trickEnds(run: RunAt<"camp">): EngineEvent[] {
  const camp = run.stage.attempt.camp;
  return Array.from({ length: camp.totalTricks }, (_, trickIndex) => ({ type: "trick-completed", trickIndex, winnerSeatId: camp.currentTrick.leaderSeatId, burnedCardIds: [] }));
}

/** The run with the layer's rule roll `label` loaded to the first of `n`
 * values whose status shows `wanted`. Its rules derive every trick from
 * that roll, so a value that would lose the camp on tricks already played
 * is refused rather than rewriting them. */
function loadRoll(run: RunAt<"camp">, layer: StackLayer, label: string, n: number, wanted: (part: StatusPart) => boolean, catalog: Catalog): RunAt<"camp"> {
  const attempt = run.stage.attempt;
  const key = `${layer.def.id}:${layer.strength}:${label}`;
  for (let value = 0; value < n; value++) {
    const loaded = withAttempt(run, { ...attempt, loaded: { rolls: { ...attempt.loaded?.rolls, [key]: value }, objectives: attempt.loaded?.objectives ?? {} } }) as RunAt<"camp">;
    if (!(layer.body.status?.(modCtx(loaded, loaded.stage.camp, layer, catalog)) ?? []).some(wanted)) continue;
    if (checkCampOutcome(attempt.camp, rulesFor(loaded, catalog)).status === "failed") {
      throw new Error(`the ${layer.def.name} would then have lost the camp on a trick already played`);
    }
    return loaded;
  }
  throw new Error(`the ${layer.def.name} can't do that on this trick`);
}

/** Keyed by camp modifier id: one trigger each for every modifier with a
 * moment or a turning choice. */
export const TRIGGERS: Readonly<Record<string, TriggerDef>> = {
  tornado: {
    label: "gust now",
    fields: () => [],
    fire: (run, layer, _params, catalog) => react(run, layer, trickEnds(run), catalog),
  },
  earthquake: {
    label: "quake now",
    fields: () => [],
    fire: (run, layer, _params, catalog) => react(run, layer, trickEnds(run), catalog),
  },
  locusts: {
    label: "swarm now",
    fields: () => [],
    fire: (run, layer, _params, catalog) => react(run, layer, trickEnds(run), catalog),
  },
  thunderstorm: {
    label: "strike this trick",
    fields: () => [],
    fire: (run, layer, _params, catalog) => {
      const trick = run.stage.attempt.camp.currentTrick;
      return react(run, layer, [{ type: "trick-started", trickIndex: trick.index, leaderSeatId: trick.leaderSeatId }], catalog, { draw: () => 0 });
    },
  },
  snake: {
    label: "bite a seat",
    fields: (run) => [seatField(run)],
    fire: (run, layer, params, catalog) => {
      const seatId = readSeat(run, params);
      const to = run.seatIds[(run.seatIds.indexOf(seatId) + 1) % run.seatIds.length]!;
      return react(run, layer, [{ type: "whisper-sent", ordinal: 0, fromSeatId: seatId, toSeatId: to }], catalog);
    },
  },
  crocodile: {
    label: "watch a seat this trick",
    fields: (run) => [seatField(run)],
    fire: (run, layer, params, catalog) => {
      const seatId = readSeat(run, params);
      return loadRoll(run, layer, "start", run.seatIds.length, (part) => part.kind === "facing" && part.seatId === seatId, catalog);
    },
  },
  beaver: {
    label: "dam a suit this trick",
    fields: () => [{ name: "suit", label: "Suit", kind: "choice", options: SUITS.map((value) => ({ value, label: value })) }],
    fire: (run, layer, params, catalog) => {
      const suit = params.suit;
      if (typeof suit !== "string" || !(SUITS as readonly string[]).includes(suit)) throw new Error(`suit must be one of: ${SUITS.join(", ")}`);
      return loadRoll(run, layer, "start", SUITS.length, (part) => part.kind === "dam" && part.suit === suit, catalog);
    },
  },
};
