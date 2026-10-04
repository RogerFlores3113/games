// Camp modifiers and live sources reacting to the engine. One pass over the
// events in order; for each, every stack layer with a handler, in stack
// order, then every live seat source with one (seat order, then
// [character, upgrade, ...equipped]), each seeing the run after the
// previous reactor's ops. Ops never emit events, so a reaction never
// triggers another: no cascade, and each reactor's ops fold through
// applyToolkitOps on their own, so conservation is checked per reactor.
// Camp modifiers react only in a dealt camp; sources react in any stage.

import { shuffleWithSeed } from "../../shuffle";
import { checkCampOutcome } from "../camp";
import type { ReactionCtx } from "../content/mods/mod-def";
import type { SourceEvent, SourceReactionCtx } from "../content/source-def";
import type { CampEvent } from "../state";
import { attemptOf } from "./attempt";
import { rulesFor } from "./compose";
import { drawOffer } from "./draft";
import { STREAMS, seededIndex } from "./rng";
import { campStack, modCtx, specOf } from "./stack";
import { applyToolkitOps, type ToolkitOp } from "./toolkit";
import type { Catalog, RunAt, RunState } from "./types";
import { currentStamp, defIdOf, defOfKey, liveSourceKeys, ownerOf } from "./usage";

export type EngineEvent =
  | CampEvent
  | { readonly type: "camp-dealt" }
  | { readonly type: "whisper-sent"; readonly ordinal: number; readonly fromSeatId: string; readonly toSeatId: string }
  /** Before a decided camp settles: the run is still at the camp. */
  | { readonly type: "camp-settled"; readonly status: "cleared" | "failed" };
export type EngineEventType = EngineEvent["type"];

const EVENT_TYPE_SET: Readonly<Record<EngineEventType, true>> = {
  "camp-dealt": true,
  "objective-picked": true,
  "card-played": true,
  "trick-completed": true,
  "trick-voided": true,
  "trick-started": true,
  "whisper-sent": true,
  "camp-settled": true,
};
export const ENGINE_EVENT_TYPES: readonly EngineEventType[] = Object.keys(EVENT_TYPE_SET) as EngineEventType[];

/** The event's part of a draw stream name. `picked` counts the camp's owned
 * objectives once the pick is made. */
function eventKey(event: SourceEvent, picked: number): string {
  switch (event.type) {
    case "run-started":
      return "started";
    case "camp-dealt":
      return "dealt";
    case "objective-picked":
      return `pick${picked - 1}`;
    case "card-played":
      return `t${event.trickIndex}-p${event.position}`;
    case "trick-completed":
      return `t${event.trickIndex}-done`;
    case "trick-voided":
      return `t${event.trickIndex}-void`;
    case "trick-started":
      return `t${event.trickIndex}-start`;
    case "whisper-sent":
      return `whisper${event.ordinal}`;
    case "camp-settled":
      return "settled";
  }
}

/** Trick reactions stop once the camp is decided or no trick remains. */
function skipped(run: RunState, event: SourceEvent, catalog: Catalog): boolean {
  if (event.type !== "trick-completed" && event.type !== "trick-started" && event.type !== "trick-voided") return false;
  const camp = attemptOf(run)?.camp;
  if (camp === undefined) return true;
  return camp.completedTricks.length >= camp.totalTricks || checkCampOutcome(camp, rulesFor(run, catalog)).status !== "in_progress";
}

function modReactions(run: RunAt<"camp">, event: EngineEvent, key: string, catalog: Catalog): RunAt<"camp"> {
  let current = run;
  const spec = run.stage.camp;
  for (const layer of campStack(run, catalog)) {
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
      ...modCtx(before, spec, layer, catalog),
      camp,
      event,
      rules,
      draw: (n) => seededIndex(before.seed, nextStream(), n),
      randomCards: (seatId, n) => shuffleWithSeed((camp.hands.find((h) => h.seatId === seatId)?.cards ?? []).map((c) => c.id), before.seed, nextStream()).slice(0, n),
    });
    if (ops.length === 0) continue;
    current = applyToolkitOps(before, { kind: "mod", modId: layer.def.id, strength: layer.strength }, ops, rules, catalog) as RunAt<"camp">;
  }
  return current;
}

function sourceReactions(run: RunState, event: SourceEvent, key: string, catalog: Catalog): RunState {
  let current = run;
  for (const seatId of run.seatIds) {
    const seat = run.seats.find((s) => s.seatId === seatId)!;
    for (const sourceKey of liveSourceKeys(seat)) {
      const def = defOfKey(seat, sourceKey, catalog);
      const handler = (def.kind === "item" ? undefined : def.on?.[event.type]) as ((ctx: SourceReactionCtx) => readonly ToolkitOp[]) | undefined;
      if (handler === undefined) continue;
      const before = current;
      const holder = before.seats.find((s) => s.seatId === seatId)!;
      const stamp = currentStamp(before);
      const place = stamp === null ? "run" : `camp${stamp.camp}:attempt${stamp.attempt}`;
      let draws = 0;
      const rules = rulesFor(before, catalog);
      const ops = handler({
        self: seatId,
        sourceId: defIdOf(holder, sourceKey),
        owner: ownerOf(holder),
        run: before,
        camp: attemptOf(before)?.camp ?? null,
        rules,
        catalog,
        event,
        draw: (n) => seededIndex(before.seed, STREAMS.sourceDraw(sourceKey, seatId, place, key, draws++), n),
        drawOffer: (forSeatId, shape) => {
          const j = draws++;
          const character = before.seats.find((s) => s.seatId === forSeatId)?.characterId ?? null;
          return drawOffer(before.seed, (bundle, item, part) => STREAMS.sourceItem(sourceKey, seatId, place, key, j, bundle, item, part), character, catalog, shape, "special");
        },
      });
      if (ops.length === 0) continue;
      current = applyToolkitOps(before, { kind: "seat", seatId, sourceKey, sourceId: defIdOf(holder, sourceKey) }, ops, rules, catalog);
    }
  }
  return current;
}

/** The camp's modifiers (in a dealt camp) and then the seats' live sources
 * react to each event in turn. Ops never change the stage, so the run stays
 * at the stage it came in at. */
export function react<R extends RunState>(run: R, events: readonly SourceEvent[], catalog: Catalog): R {
  let current: RunState = run;
  for (const event of events) {
    if (skipped(current, event, catalog)) continue;
    const camp = attemptOf(current)?.camp;
    const key = eventKey(event, camp?.objectives.filter((o) => o.ownerSeatId !== null).length ?? 0);
    if (event.type !== "run-started" && current.stage.tag === "camp" && specOf(current) !== null) current = modReactions(current as RunAt<"camp">, event, key, catalog);
    current = sourceReactions(current, event, key, catalog);
  }
  return current as R;
}
