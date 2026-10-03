// Tests for run/run-test-support.ts (Plan 10-07: setupRun, advanceTo,
// enumerateLegalRunActions, driveRun, replayRun). A small fake catalog is
// used throughout: 4 fake gear, one per GearWindow, plus 1 fake boss; real
// gear/bosses arrive in wave 5.

import { describe, expect, it } from "vitest";
import { createRun, runPhase, runStatus } from "./lifecycle";
import { applyRunAction } from "./run-actions";
import { advanceTo, driveRun, enumerateLegalRunActions, replayRun, setupRun } from "./run-test-support";
import { currentWindow } from "./windows";
import { rulesFor } from "./compose";
import { reroll } from "../gear/reroll";
import type { Catalog, CampNumber } from "./types";
import type { GearDef } from "../gear/gear-def";
import type { BossDef } from "../boss/boss-def";

function fakeGear(overrides: Partial<GearDef> & { id: string }): GearDef {
  return {
    name: overrides.id,
    size: 1,
    window: "passive",
    text: "",
    targets: [],
    ...overrides,
  };
}

function fakeCatalog(): Catalog {
  const gear: Record<string, GearDef> = {
    "gear-predeal": fakeGear({ id: "gear-predeal", window: "pre-deal", apply: () => [] }),
    "gear-objpick": fakeGear({
      id: "gear-objpick",
      window: "objective-pick",
      targets: [{ kind: "face-up-objective" }],
      apply: () => [],
    }),
    "gear-betweentricks": fakeGear({
      id: "gear-betweentricks",
      window: "between-tricks",
      targets: [{ kind: "teammate" }],
      apply: (ctx) => [{ op: "log", event: "used", subjectSeatIds: [ctx.targets[0]!], audience: "public" }],
    }),
    "gear-passive": fakeGear({ id: "gear-passive", window: "passive" }),
  };
  const bosses: Record<string, BossDef> = {
    "boss-1": { id: "boss-1", name: "Boss One", text: "", modifiers: {} },
  };
  return { gear, bosses };
}

const SEAT_IDS = ["p0", "p1", "p2"];

describe("setupRun", () => {
  const catalog = fakeCatalog();

  it("builds a fireside RunState with the given campNumber, cleared drafts, and the requested loadout", () => {
    const run = setupRun({
      seatIds: SEAT_IDS,
      seed: "setup-seed",
      catalog,
      campNumber: 4,
      loadouts: { p0: ["gear-passive"] },
    });

    expect(run.campNumber).toBe(4);
    expect(run.supplies).toBe(3);
    expect(runPhase(run)).toBe("fireside");
    for (const seat of run.seats) {
      expect(seat.draftOffer).toBeNull();
    }
    const p0 = run.seats.find((s) => s.seatId === "p0")!;
    expect(p0.ownedGearIds).toEqual(["gear-passive"]);
    expect(p0.equippedGearIds).toEqual(["gear-passive"]);
    const p1 = run.seats.find((s) => s.seatId === "p1")!;
    expect(p1.ownedGearIds).toEqual([]);
    expect(p1.equippedGearIds).toEqual([]);
  });

  it("honors a supplies override", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "s", catalog, supplies: 7 });
    expect(run.supplies).toBe(7);
  });

  it("honors a bossTwists override", () => {
    const run = setupRun({
      seatIds: SEAT_IDS,
      seed: "s",
      catalog,
      campNumber: 3,
      bossTwists: { 3: "boss-1", 6: null },
    });
    expect(run.bossTwists).toEqual({ 3: "boss-1", 6: null });
  });
});

describe("advanceTo", () => {
  const catalog = fakeCatalog();

  it("reaches pre-deal when a seat has pre-deal gear equipped, and currentWindow agrees", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "adv-1", catalog, loadouts: { p0: ["gear-predeal"] } });
    const result = advanceTo(run, "pre-deal", catalog);
    expect(runPhase(result)).toBe("pre-deal");
    expect(currentWindow(result, rulesFor(result, catalog))).toBe("pre-deal");
  });

  it("throws for 'pre-deal' when no seat has pre-deal gear (the deal already happened)", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "adv-2", catalog });
    expect(() => advanceTo(run, "pre-deal", catalog)).toThrow();
  });

  it("reaches objective-pick with no pre-deal gear equipped anywhere", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "adv-3", catalog });
    const result = advanceTo(run, "objective-pick", catalog);
    expect(runPhase(result)).toBe("camp");
    expect(currentWindow(result, rulesFor(result, catalog))).toBe("objective-pick");
  });

  it("reaches between-tricks by picking every seat's first unowned objective", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "adv-4", catalog });
    const result = advanceTo(run, "between-tricks", catalog);
    expect(runPhase(result)).toBe("camp");
    expect(currentWindow(result, rulesFor(result, catalog))).toBe("between-tricks");
  });
});

describe("enumerateLegalRunActions", () => {
  const catalog = fakeCatalog();

  it("every returned candidate is accepted by applyRunAction", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "enum-1", catalog });
    const candidates = enumerateLegalRunActions(run, catalog);
    expect(candidates.length).toBeGreaterThan(0);
    for (const { seatId, action } of candidates) {
      expect(applyRunAction(run, seatId, action, catalog).ok).toBe(true);
    }
  });

  it("at the fireside, includes a ready action for each unready seat whose draft is not pending", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "enum-2", catalog });
    const candidates = enumerateLegalRunActions(run, catalog);
    const readySeats = candidates.filter((c) => c.action.type === "ready").map((c) => c.seatId);
    expect(new Set(readySeats)).toEqual(new Set(SEAT_IDS));
  });

  it("excludes pick-draft and ready while a real draft is still pending", () => {
    const run = createRun({ seatIds: SEAT_IDS, seed: "enum-3" }, catalog);
    const candidates = enumerateLegalRunActions(run, catalog);
    const readySeats = candidates.filter((c) => c.action.type === "ready");
    expect(readySeats).toEqual([]);
    const draftCandidates = candidates.filter((c) => c.action.type === "pick-draft");
    expect(draftCandidates.length).toBeGreaterThan(0);
  });

  it("WR-01: at objective-pick, offers use-gear reroll targeting a win-card objective", () => {
    const reelCatalog: Catalog = { gear: { reroll }, bosses: {} };
    const run = advanceTo(
      setupRun({
        seatIds: SEAT_IDS,
        seed: "enum-objpick-reroll",
        catalog: reelCatalog,
        campNumber: 2 as CampNumber,
        loadouts: Object.fromEntries(SEAT_IDS.map((seatId) => [seatId, ["reroll"]])),
      }),
      "objective-pick",
      reelCatalog,
    );
    const candidates = enumerateLegalRunActions(run, reelCatalog);
    const rerollCandidates = candidates.filter(
      (c) => c.action.type === "use-gear" && c.action.gearId === "reroll",
    );
    expect(rerollCandidates.length).toBeGreaterThan(0);
    const camp = run.attempt!.camp!;
    for (const candidate of rerollCandidates) {
      if (candidate.action.type !== "use-gear") continue;
      const targetId = candidate.action.targets[0]!;
      const objective = camp.objectives.find((o) => o.id === targetId)!;
      expect(objective.kind).toBe("win-card");
    }
  });
});

describe("driveRun / replayRun", () => {
  const catalog = fakeCatalog();

  it("drives a whole run to won or lost without throwing, and replayRun reproduces every state", () => {
    const run = createRun({ seatIds: SEAT_IDS, seed: "drive-seed" }, catalog);
    const { states, log } = driveRun(run, [3, 1, 4, 1, 5, 9, 2, 6], catalog);

    expect(states.length).toBeGreaterThan(1);
    expect(states.length).toBe(log.length + 1);
    const finalStatus = runStatus(states[states.length - 1]!);
    expect(["won", "lost"]).toContain(finalStatus);

    const replayed = replayRun(states[0]!, log, catalog);
    expect(replayed).toEqual(states);
  });

  it("never throws across several different seeds/choice streams", () => {
    const seeds = ["a", "b", "c"];
    const choiceStreams = [
      [1, 2, 3, 4, 5],
      [0, 0, 0, 0, 0],
      [7, 3, 1, 9, 2, 6, 4],
    ];
    for (const seed of seeds) {
      for (const choices of choiceStreams) {
        const run = createRun({ seatIds: SEAT_IDS, seed }, catalog);
        expect(() => driveRun(run, choices, catalog)).not.toThrow();
      }
    }
  });
});
