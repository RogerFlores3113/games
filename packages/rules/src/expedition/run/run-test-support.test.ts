// Tests for run/run-test-support.ts: setupRun, advanceTo,
// enumerateLegalRunActions, driveRun, replayRun. A small catalogue is used
// throughout: plain characters plus one item per window and one boss.

import { describe, expect, it } from "vitest";
import { ability, defineItem } from "../content/source-def";
import type { BossDef } from "../boss/boss-def";
import { rulesFor } from "./compose";
import { createRun, runPhase, runStatus } from "./lifecycle";
import { applyRunAction } from "./run-actions";
import { advanceTo, driveRun, enumerateLegalRunActions, replayRun, setupRun, testCatalog } from "./run-test-support";
import { currentWindow } from "./windows";

const ITEMS = {
  "item-predeal": defineItem({
    id: "item-predeal",
    name: "Pre-deal item",
    text: "Does nothing before the deal.",
    active: ability({ window: "pre-deal", limit: { kind: "per-run", times: 1 }, targets: [], apply: () => [] }),
  }),
  "item-objpick": defineItem({
    id: "item-objpick",
    name: "Objective-pick item",
    text: "Does nothing while picking.",
    active: ability({
      window: "objective-pick",
      limit: { kind: "per-run", times: 1 },
      targets: [{ kind: "objective", whose: "unclaimed" }],
      apply: () => [],
    }),
  }),
  "item-between": defineItem({
    id: "item-between",
    name: "Between-tricks item",
    text: "Logs a teammate.",
    active: ability({
      window: "between-tricks",
      limit: { kind: "per-run", times: 1 },
      targets: [{ kind: "player", who: "teammate" }],
      apply: (ctx) => [{ op: "log", event: "used", subjectSeatIds: [ctx.targets[0].seatId], audience: "public" }],
    }),
  }),
  "item-passive": defineItem({
    id: "item-passive",
    name: "Passive item",
    text: "Does nothing.",
    passive: { modifier: () => ({}) },
  }),
};
const BOSSES: Record<string, BossDef> = {
  "boss-1": { id: "boss-1", name: "Boss One", text: "", modifiers: {} },
};
const catalog = testCatalog({ items: ITEMS, bosses: BOSSES });
const SEAT_IDS = ["p0", "p1", "p2"];

describe("setupRun", () => {
  it("builds a fireside RunState with the given campNumber, cleared drafts, assigned characters and the requested kit", () => {
    const run = setupRun({
      seatIds: SEAT_IDS,
      seed: "setup-seed",
      catalog,
      campNumber: 4,
      characters: { p0: "plain-3" },
      kits: { p0: ["item-passive"] },
    });

    expect(run.campNumber).toBe(4);
    expect(run.supplies).toBe(3);
    expect(runPhase(run)).toBe("fireside");
    expect(run.seats.map((s) => s.draftOffer)).toEqual([null, null, null]);
    expect(run.seats.map((s) => s.characterId)).toEqual(["plain-3", "plain-1", "plain-2"]);
    expect(run.seats.map((s) => s.kit)).toEqual([["item-passive"], [], []]);
  });

  it("honors a supplies override", () => {
    expect(setupRun({ seatIds: SEAT_IDS, seed: "s", catalog, supplies: 7 }).supplies).toBe(7);
  });

  it("honors a bossTwists override", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "s", catalog, campNumber: 3, bossTwists: { 3: "boss-1", 6: null } });
    expect(run.bossTwists).toEqual({ 3: "boss-1", 6: null });
  });

  it("throws when the catalogue has too few characters for the crew", () => {
    const tiny = testCatalog();
    const noSpare = { ...tiny, characters: { "plain-1": tiny.characters["plain-1"]! } };
    expect(() => setupRun({ seatIds: SEAT_IDS, seed: "s", catalog: noSpare })).toThrow();
  });
});

describe("advanceTo", () => {
  it("reaches pre-deal when a seat holds a pre-deal item, and currentWindow agrees", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "adv-1", catalog, kits: { p0: ["item-predeal"] } });
    const result = advanceTo(run, "pre-deal", catalog);
    expect(runPhase(result)).toBe("pre-deal");
    expect(currentWindow(result, rulesFor(result, catalog))).toBe("pre-deal");
  });

  it("throws for 'pre-deal' when no seat has a pre-deal ability (the deal already happened)", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "adv-2", catalog });
    expect(() => advanceTo(run, "pre-deal", catalog)).toThrow();
  });

  it("reaches objective-pick with no pre-deal ability anywhere", () => {
    const result = advanceTo(setupRun({ seatIds: SEAT_IDS, seed: "adv-3", catalog }), "objective-pick", catalog);
    expect(runPhase(result)).toBe("camp");
    expect(currentWindow(result, rulesFor(result, catalog))).toBe("objective-pick");
  });

  it("reaches between-tricks by picking every seat's first unowned objective", () => {
    const result = advanceTo(setupRun({ seatIds: SEAT_IDS, seed: "adv-4", catalog }), "between-tricks", catalog);
    expect(runPhase(result)).toBe("camp");
    expect(currentWindow(result, rulesFor(result, catalog))).toBe("between-tricks");
  });

  it("skips a pre-deal item to reach the deal", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "adv-5", catalog, kits: { p0: ["item-predeal"] } });
    const result = advanceTo(run, "objective-pick", catalog);
    expect(result.seats[0]!.ledger).toEqual([{ kind: "passed", sourceId: "item-predeal", at: { camp: 1, attempt: 1, trick: null } }]);
  });
});

describe("enumerateLegalRunActions", () => {
  it("every returned candidate is accepted by applyRunAction", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "enum-1", catalog });
    const candidates = enumerateLegalRunActions(run, catalog);
    expect(candidates.map((c) => `${c.seatId}:${c.action.type}`)).toEqual(["p0:ready", "p1:ready", "p2:ready"]);
    for (const { seatId, action } of candidates) {
      expect(applyRunAction(run, seatId, action, catalog).ok).toBe(true);
    }
  });

  it("at muster, offers a pick-character per seat and character, and no ready", () => {
    const run = createRun({ seatIds: SEAT_IDS, seed: "enum-muster" });
    const candidates = enumerateLegalRunActions(run, catalog);
    expect(candidates.filter((c) => c.action.type === "ready")).toEqual([]);
    expect(candidates.filter((c) => c.action.type === "pick-character")).toHaveLength(15);
    expect(candidates.filter((c) => c.seatId === "p1" && c.action.type === "pick-character").map((c) => c.action)).toEqual(
      ["plain-1", "plain-2", "plain-3", "plain-4", "plain-5"].map((characterId) => ({ type: "pick-character", characterId })),
    );
  });

  it("at the fireside with a draft pending, offers its pick-drafts and no ready for that seat", () => {
    const base = setupRun({ seatIds: SEAT_IDS, seed: "enum-3", catalog });
    const run = { ...base, seats: base.seats.map((s) => (s.seatId === "p0" ? { ...s, draftOffer: ["item-passive", "item-between"] } : s)) };
    const candidates = enumerateLegalRunActions(run, catalog);
    expect(candidates.filter((c) => c.seatId === "p0").map((c) => c.action)).toEqual([
      { type: "pick-draft", sourceId: "item-passive" },
      { type: "pick-draft", sourceId: "item-between" },
    ]);
    expect(candidates.filter((c) => c.action.type === "ready").map((c) => c.seatId)).toEqual(["p1", "p2"]);
  });

  it("at objective-pick, offers use-ability for an objective-pick item targeting only unclaimed objectives", () => {
    const run = advanceTo(
      setupRun({
        seatIds: SEAT_IDS,
        seed: "enum-objpick",
        catalog,
        campNumber: 2,
        kits: Object.fromEntries(SEAT_IDS.map((seatId) => [seatId, ["item-objpick"]])),
      }),
      "objective-pick",
      catalog,
    );
    const uses = enumerateLegalRunActions(run, catalog).filter((c) => c.action.type === "use-ability");
    expect(uses.length).toBeGreaterThan(0);
    const camp = run.attempt!.camp!;
    for (const candidate of uses) {
      if (candidate.action.type !== "use-ability") continue;
      expect(candidate.action.sourceId).toBe("item-objpick");
      const targetId = candidate.action.targets[0]!;
      expect(targetId.startsWith("objective:")).toBe(true);
      const objective = camp.objectives.find((o) => o.id === targetId.slice("objective:".length))!;
      expect(objective.ownerSeatId).toBeNull();
    }
  });

  it("between tricks, offers whispers and a between-tricks item aimed at a teammate", () => {
    const run = advanceTo(
      setupRun({ seatIds: SEAT_IDS, seed: "enum-between", catalog, kits: { p0: ["item-between"] } }),
      "between-tricks",
      catalog,
    );
    const legal = enumerateLegalRunActions(run, catalog);
    expect(legal.some((c) => c.action.type === "whisper")).toBe(true);
    const item = legal.filter((c) => c.action.type === "use-ability").map((c) => ({ seatId: c.seatId, action: c.action }));
    expect(item).toEqual([
      { seatId: "p0", action: { type: "use-ability", sourceId: "item-between", targets: ["seat:p1"] } },
      { seatId: "p0", action: { type: "use-ability", sourceId: "item-between", targets: ["seat:p2"] } },
    ]);
  });
});

describe("driveRun / replayRun", () => {
  it("drives a whole run from muster to won or lost without throwing, and replayRun reproduces every state", () => {
    const run = createRun({ seatIds: SEAT_IDS, seed: "drive-seed" });
    const { states, log } = driveRun(run, [3, 1, 4, 1, 5, 9, 2, 6], catalog);

    expect(runPhase(states[0]!)).toBe("muster");
    expect(states.length).toBe(log.length + 1);
    expect(["won", "lost"]).toContain(runStatus(states[states.length - 1]!));
    expect(replayRun(states[0]!, log, catalog)).toEqual(states);
  });

  it("never throws across several different seeds/choice streams", () => {
    const choiceStreams = [
      [1, 2, 3, 4, 5],
      [0, 0, 0, 0, 0],
      [7, 3, 1, 9, 2, 6, 4],
    ];
    for (const seed of ["a", "b", "c"]) {
      for (const choices of choiceStreams) {
        const run = createRun({ seatIds: SEAT_IDS, seed });
        expect(() => driveRun(run, choices, catalog)).not.toThrow();
      }
    }
  });

  it("replayRun throws when an action in the log is refused", () => {
    const run = createRun({ seatIds: SEAT_IDS, seed: "bad-log" });
    expect(() => replayRun(run, [{ seatId: "p0", action: { type: "ready" } }], catalog)).toThrow(/character_pending/);
  });
});
