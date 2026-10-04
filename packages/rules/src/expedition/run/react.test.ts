import { describe, expect, it } from "vitest";
import { defineMod } from "../content/mods/mod-def";
import { attemptOf } from "./attempt";
import { react } from "./react";
import { advanceTo, setupRun, testCatalog } from "./run-test-support";
import { STAGES, applyRunAction } from "./stages/registry";
import { rulesFor } from "./compose";
import { currentActorSeatId } from "../camp";
import type { Catalog, LogEntry, RunAt, RunState } from "./types";

const SEATS = ["p0", "p1", "p2"];

/** A location and a weather that log every event they hear; the weather
 * also logs how many entries the location left before it. */
const echoes = testCatalog({
  mods: {
    "echo-place": defineMod({
      id: "echo-place",
      kind: "location",
      name: "Echo place",
      weight: 0,
      text: "Logs what it hears.",
      full: {
        on: {
          "camp-dealt": () => [{ op: "log", event: "dealt", subjectSeatIds: [], audience: "public" }],
          "whisper-sent": (ctx) => [{ op: "log", event: `whisper${ctx.event.ordinal}`, subjectSeatIds: [ctx.event.fromSeatId, ctx.event.toSeatId], audience: "public" }],
          "trick-completed": (ctx) => [{ op: "log", event: `done${ctx.event.trickIndex}`, subjectSeatIds: [ctx.event.winnerSeatId], audience: "public" }],
        },
      },
    }),
    "echo-sky": defineMod({
      id: "echo-sky",
      kind: "weather",
      name: "Echo sky",
      weight: 0,
      text: "Counts what the place logged.",
      full: { on: { "camp-dealt": (ctx) => [{ op: "log", event: `after${ctx.run.stage.tag === "camp" ? ctx.run.stage.attempt.log.length : -1}`, subjectSeatIds: [], audience: "public" }] } },
    }),
  },
});

function echoLoadout(catalog: Catalog = echoes): RunAt<"loadout"> {
  const run = setupRun({ seatIds: SEATS, seed: "react-1", catalog, camp: 2 }) as RunAt<"loadout">;
  return { ...run, stage: { ...run.stage, camp: { ...run.stage.camp, location: "echo-place", weather: "echo-sky" } } };
}

const events = (run: RunState) => (attemptOf(run)?.log ?? []).filter((entry) => entry.actorSeatId === null).map((entry) => entry.event);

describe("react", () => {
  it("hears the deal, in stack order, each layer seeing the ops before it, logged as the mod with no actor", () => {
    const dealt = advanceTo(echoLoadout(), "objective-pick", echoes);
    const log = attemptOf(dealt)!.log;
    expect(log).toEqual<LogEntry[]>([
      { event: "dealt", actorSeatId: null, subjectSeatIds: [], sourceId: "echo-place", audience: "public" },
      { event: "after1", actorSeatId: null, subjectSeatIds: [], sourceId: "echo-sky", audience: "public" },
    ]);
  });

  it("hears each whisper with its ordinal, sender and receiver", () => {
    const run = advanceTo(echoLoadout(), "between-tricks", echoes);
    const cardId = attemptOf(run)!.camp.hands.find((h) => h.seatId === "p1")!.cards[0]!.id;
    const result = applyRunAction(run, "p1", { type: "whisper", targetSeatId: "p2", cardId }, echoes);
    if (!result.ok) throw new Error(result.error);
    const heard = attemptOf(result.state)!.log.at(-1)!;
    expect(heard).toEqual({ event: "whisper0", actorSeatId: null, subjectSeatIds: ["p1", "p2"], sourceId: "echo-place", audience: "public" });
  });

  it("hears a completed trick with its winner", () => {
    let run = advanceTo(echoLoadout(), "between-tricks", echoes) as RunAt<"camp">;
    while (run.stage.attempt.camp.completedTricks.length === 0) {
      const camp = run.stage.attempt.camp;
      const rules = rulesFor(run, echoes);
      const actor = currentActorSeatId(camp, rules)!;
      const result = STAGES.camp.on["play-card"]!(run, actor, { type: "play-card", cardId: rules.legalPlays(camp, actor)[0]!.id }, echoes);
      if (!result.ok) throw new Error(result.error);
      run = result.state as RunAt<"camp">;
    }
    expect(events(run)).toEqual(["dealt", "after1", "done0"]);
    expect(run.stage.attempt.log.at(-1)!.subjectSeatIds).toEqual([run.stage.attempt.camp.completedTricks[0]!.winnerSeatId]);
  });

  it("skips trick reactions once no trick remains", () => {
    const run = advanceTo(echoLoadout(), "objective-pick", echoes) as RunAt<"camp">;
    const attempt = run.stage.attempt;
    const finished: RunAt<"camp"> = { ...run, stage: { ...run.stage, attempt: { ...attempt, camp: { ...attempt.camp, totalTricks: 0 } } } };
    expect(react(finished, [{ type: "trick-completed", trickIndex: 0, winnerSeatId: "p0", burnedCardIds: [] }], echoes)).toEqual(finished);
  });

  it("is deterministic and never mutates its input", () => {
    const run = advanceTo(echoLoadout(), "objective-pick", echoes) as RunAt<"camp">;
    const snapshot = structuredClone(run);
    const once = react(run, [{ type: "camp-dealt" }], echoes);
    expect(react(run, [{ type: "camp-dealt" }], echoes)).toEqual(once);
    expect(run).toEqual(snapshot);
  });
});
