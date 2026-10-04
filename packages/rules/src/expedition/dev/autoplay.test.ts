import { describe, expect, it } from "vitest";
import { CATALOG } from "../run/catalog";
import { createRun, runStatus } from "../run/lifecycle";
import { applyRunAction } from "../run/run-actions";
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

  it("returns null at the fireside when only already-ready seats are controlled", () => {
    const fireside = DEV_SHORTCUTS["set-character"].apply(
      DEV_SHORTCUTS["set-character"].apply(
        DEV_SHORTCUTS["set-character"].apply(createRun({ seatIds: ["a", "b", "c"], seed: "autoplay" }), { seat: "a", character: "scout" }, CATALOG),
        { seat: "b", character: "guide" },
        CATALOG,
      ),
      { seat: "c", character: "medic" },
      CATALOG,
    );
    const run = { ...fireside, readySeatIds: ["b", "c"] };
    expect(botMove(run, ["b", "c"], CATALOG)).toBeNull();
    expect(botMove(run, ["a"], CATALOG)).toEqual({ seatId: "a", request: { type: "ready" } });
  });
});
