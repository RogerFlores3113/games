import { describe, expect, it } from "vitest";
import { CATALOG } from "../run/catalog";
import { createRun, runStatus } from "../run/lifecycle";
import { campIndex } from "../run/plan";
import { campSpecAt } from "../run/route";
import { applyRunAction } from "../run/stages/registry";
import type { RunState } from "../run/types";
import { botMove } from "./autoplay";
import { DEV_SHORTCUTS } from "./shortcuts";

function playOut(seatIds: readonly string[]): RunState {
  let run = createRun({ seatIds, seed: "autoplay" });
  for (let step = 0; step < 5000 && runStatus(run) === "in_progress"; step++) {
    const move = botMove(run, seatIds, CATALOG);
    if (move === null) throw new Error(`bot stalled at step ${step}`);
    const result = applyRunAction(run, move.seatId, move.request, CATALOG);
    if (!result.ok) throw new Error(`bot move rejected: ${result.error}`);
    run = result.state;
  }
  return run;
}

describe("botMove", () => {
  it("plays a 3-player run to its end", () => {
    expect(runStatus(playOut(["a", "b", "c"]))).not.toBe("in_progress");
  });

  it("plays a 5-player run to its end", () => {
    expect(runStatus(playOut(["a", "b", "c", "d", "e"]))).not.toBe("in_progress");
  });

  const crewed = (): RunState => {
    const muster = createRun({ seatIds: ["a", "b", "c"], seed: "autoplay" });
    return { ...muster, seats: muster.seats.map((seat, i) => ({ ...seat, characterId: ["scout", "guide", "medic"][i]! })) };
  };

  it("at muster, picks a free character first and then abstains from the length vote", () => {
    const muster = createRun({ seatIds: ["a", "b", "c"], seed: "autoplay" });
    expect(botMove(muster, ["a"], CATALOG)).toEqual({ seatId: "a", request: { type: "pick-character", characterId: Object.keys(CATALOG.characters)[0]! } });
    expect(botMove(crewed(), ["b"], CATALOG)).toEqual({ seatId: "b", request: { type: "vote", choice: null } });
    const voted: RunState = { ...crewed(), stage: { tag: "muster", ballots: { a: "long", b: null } } };
    expect(botMove(voted, ["a", "b"], CATALOG)).toBeNull();
  });

  it("on a route, abstains until the seat has a ballot", () => {
    const spec = campSpecAt("autoplay", "standard", campIndex(2));
    const route: RunState = {
      ...DEV_SHORTCUTS["jump-to-camp"].apply(crewed(), { length: "standard", camp: 1, stage: "loadout" }, CATALOG),
      stage: { tag: "route", from: campIndex(1), options: [{ id: "a", next: spec }, { id: "b", next: spec }], ballots: { a: "a" } },
    };
    expect(botMove(route, ["a"], CATALOG)).toBeNull();
    expect(botMove(route, ["a", "c"], CATALOG)).toEqual({ seatId: "c", request: { type: "vote", choice: null } });
  });

  it("returns null at the loadout when only already-ready seats are controlled", () => {
    const loadout = DEV_SHORTCUTS["jump-to-camp"].apply(crewed(), { length: "standard", camp: 1, stage: "loadout" }, CATALOG);
    const run: RunState = { ...loadout, stage: { ...(loadout.stage as Extract<RunState["stage"], { tag: "loadout" }>), ready: { b: true, c: true } } };
    expect(botMove(run, ["b", "c"], CATALOG)).toBeNull();
    expect(botMove(run, ["a"], CATALOG)).toEqual({ seatId: "a", request: { type: "ready" } });
  });

  it("readies in the event between camps", () => {
    const loadout = DEV_SHORTCUTS["jump-to-camp"].apply(crewed(), { length: "standard", camp: 2, stage: "loadout" }, CATALOG);
    const next = (loadout.stage as Extract<RunState["stage"], { tag: "loadout" }>).camp;
    const event: RunState = { ...loadout, stage: { tag: "event", route: { id: "a", next }, ready: { a: true } } };
    expect(botMove(event, ["a"], CATALOG)).toBeNull();
    expect(botMove(event, ["a", "b"], CATALOG)).toEqual({ seatId: "b", request: { type: "ready" } });
  });
});
