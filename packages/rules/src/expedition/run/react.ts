// Camp modifiers reacting to the engine. One pass over the events in order;
// for each, every stack layer with a handler, in stack order, each seeing the
// run after the previous layer's ops. Ops never emit events, so a reaction
// never triggers another: no cascade, and each reactor's ops fold through
// applyToolkitOps on their own, so conservation is checked per reactor.

import { shuffleWithSeed } from "../../shuffle";
import { checkCampOutcome } from "../camp";
import type { ReactionCtx } from "../content/mods/mod-def";
import type { CampEvent } from "../state";
import { rulesFor } from "./compose";
import { STREAMS, seededIndex } from "./rng";
import { campStack, modCtx } from "./stack";
import { applyToolkitOps, type ToolkitOp } from "./toolkit";
import type { Catalog, RunAt } from "./types";

export type EngineEvent =
  | CampEvent
  | { readonly type: "camp-dealt" }
  | { readonly type: "whisper-sent"; readonly ordinal: number; readonly fromSeatId: string; readonly toSeatId: string };
export type EngineEventType = EngineEvent["type"];

const EVENT_TYPE_SET: Readonly<Record<EngineEventType, true>> = {
  "camp-dealt": true,
  "objective-picked": true,
  "card-played": true,
  "trick-completed": true,
  "trick-started": true,
  "whisper-sent": true,
};
export const ENGINE_EVENT_TYPES: readonly EngineEventType[] = Object.keys(EVENT_TYPE_SET) as EngineEventType[];

/** The event's part of a draw stream name. `picked` counts the camp's owned
 * objectives once the pick is made. */
function eventKey(event: EngineEvent, picked: number): string {
  switch (event.type) {
    case "camp-dealt":
      return "dealt";
    case "objective-picked":
      return `pick${picked - 1}`;
    case "card-played":
      return `t${event.trickIndex}-p${event.position}`;
    case "trick-completed":
      return `t${event.trickIndex}-done`;
    case "trick-started":
      return `t${event.trickIndex}-start`;
    case "whisper-sent":
      return `whisper${event.ordinal}`;
  }
}

/** Trick reactions stop once the camp is decided or no trick remains. */
function skipped(run: RunAt<"camp">, event: EngineEvent, catalog: Catalog): boolean {
  if (event.type !== "trick-completed" && event.type !== "trick-started") return false;
  const camp = run.stage.attempt.camp;
  return camp.completedTricks.length >= camp.totalTricks || checkCampOutcome(camp, rulesFor(run, catalog)).status !== "in_progress";
}

export function react(run: RunAt<"camp">, events: readonly EngineEvent[], catalog: Catalog): RunAt<"camp"> {
  let current = run;
  for (const event of events) {
    if (skipped(current, event, catalog)) continue;
    const spec = current.stage.camp;
    const picked = current.stage.attempt.camp.objectives.filter((o) => o.ownerSeatId !== null).length;
    const key = eventKey(event, picked);
    for (const layer of campStack(current, catalog)) {
      // One widening cast: `on` is keyed by type, so this handler takes this event.
      const handler = layer.body.on?.[event.type] as ((ctx: ReactionCtx) => readonly ToolkitOp[]) | undefined;
      if (handler === undefined) continue;
      const before = current;
      const camp = before.stage.attempt.camp;
      const attemptNumber = before.stage.attempt.attemptNumber;
      let draws = 0;
      const nextStream = () => STREAMS.modDraw(layer.def.id, layer.strength, spec.index, attemptNumber, key, draws++);
      const rules = rulesFor(before, catalog);
      const ops = handler({
        ...modCtx(before, spec, layer),
        camp,
        event,
        rules,
        draw: (n) => seededIndex(before.seed, nextStream(), n),
        randomCards: (seatId, n) => shuffleWithSeed((camp.hands.find((h) => h.seatId === seatId)?.cards ?? []).map((c) => c.id), before.seed, nextStream()).slice(0, n),
      });
      if (ops.length === 0) continue;
      current = applyToolkitOps(before, { kind: "mod", modId: layer.def.id, strength: layer.strength }, ops, rules) as RunAt<"camp">;
    }
  }
  return current;
}
