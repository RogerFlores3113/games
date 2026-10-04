// Tests for run/run-test-support.ts: setupRun, advanceTo,
// enumerateLegalRunActions, driveRun, replayRun. A small catalogue is used
// throughout: plain characters plus one item per window.

import { describe, expect, it } from "vitest";
import { defineItem, itemAbility } from "../content/source-def";
import { rulesFor } from "./compose";
import { attemptOf } from "./attempt";
import { createRun, runStatus } from "./lifecycle";
import { campIndex } from "./plan";
import { applyRunAction } from "./stages/registry";
import { advanceTo, driveRun, enumerateLegalRunActions, replayRun, setupRun, testCatalog } from "./run-test-support";
import type { RunState } from "./types";
import { currentWindow } from "./windows";

const ITEMS = {
  "item-objpick": defineItem({
    id: "item-objpick",
    name: "Objective-pick item",
    rarity: "common",
    price: 2,
    uses: { kind: "charges", n: 1 },
    text: "Does nothing while picking.",
    active: itemAbility({
      window: "objective-pick",
      targets: [{ kind: "objective", whose: "unclaimed" }],
      apply: () => [],
    }),
  }),
  "item-between": defineItem({
    id: "item-between",
    name: "Between-tricks item",
    rarity: "common",
    price: 2,
    uses: { kind: "charges", n: 1 },
    text: "Logs a teammate.",
    active: itemAbility({
      window: "between-tricks",
      targets: [{ kind: "player", who: "teammate" }],
      apply: (ctx) => [{ op: "log", event: "used", subjectSeatIds: [ctx.targets[0].seatId], audience: "public" }],
    }),
  }),
  "item-passive": defineItem({
    id: "item-passive",
    name: "Passive item",
    rarity: "common",
    price: 2,
    text: "Does nothing.",
    passive: { modifier: () => ({}) },
  }),
};
const catalog = testCatalog({ items: ITEMS });
const SEAT_IDS = ["p0", "p1", "p2"];

describe("setupRun", () => {
  it("builds a RunState at the loadout of the given camp, with no offers, assigned characters, the upgrade and the items", () => {
    const run = setupRun({
      seatIds: SEAT_IDS,
      seed: "setup-seed",
      catalog,
      camp: 4,
      characters: { p0: "plain-3" },
      upgrades: { p1: "plain-1.b" },
      items: { p0: ["item-passive"], p2: ["item-between", "item-passive", "item-objpick"] },
    });

    expect(run.stage.tag).toBe("loadout");
    expect(run.stage.tag === "loadout" && run.stage.camp.index).toBe(4);
    expect(run.plan).toEqual({ length: "standard", bosses: [{ at: 3, tier: "animal", modId: "crocodile" }, { at: 6, tier: "temple", modId: null }] });
    expect(run.supplies).toBe(3);
    expect(run.seats.map((s) => s.offers)).toEqual([[], [], []]);
    expect(run.seats.map((s) => s.characterId)).toEqual(["plain-3", "plain-1", "plain-2"]);
    expect(run.seats.map((s) => s.upgradeId)).toEqual([null, "plain-1.b", null]);
    expect(run.seats.map((s) => s.items.map((item) => `${item.uid}:${item.itemId}`))).toEqual([["it0:item-passive"], [], ["it1:item-between", "it2:item-passive", "it3:item-objpick"]]);
    expect(run.seats.map((s) => s.equipped)).toEqual([["it0"], [], ["it1", "it2"]]);
    expect(run.itemSerial).toBe(4);
  });

  it("honors a supplies override", () => {
    expect(setupRun({ seatIds: SEAT_IDS, seed: "s", catalog, supplies: 2 }).supplies).toBe(2);
  });

  it("plans a run of the requested length", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "s", catalog, length: "short" });
    expect(run.plan).toEqual({ length: "short", bosses: [{ at: 4, tier: "temple", modId: null }] });
  });

  it("throws when the catalogue has too few characters for the crew", () => {
    const tiny = testCatalog();
    const noSpare = { ...tiny, characters: { "plain-1": tiny.characters["plain-1"]! } };
    expect(() => setupRun({ seatIds: SEAT_IDS, seed: "s", catalog: noSpare })).toThrow();
  });
});

describe("advanceTo", () => {
  it("reaches objective-pick once every seat readies", () => {
    const result = advanceTo(setupRun({ seatIds: SEAT_IDS, seed: "adv-3", catalog }), "objective-pick", catalog);
    expect(result.stage.tag).toBe("camp");
    expect(currentWindow(result, rulesFor(result, catalog))).toBe("objective-pick");
  });

  it("reaches between-tricks by picking every seat's first unowned objective", () => {
    const result = advanceTo(setupRun({ seatIds: SEAT_IDS, seed: "adv-4", catalog }), "between-tricks", catalog);
    expect(result.stage.tag).toBe("camp");
    expect(currentWindow(result, rulesFor(result, catalog))).toBe("between-tricks");
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

  it("at muster, offers each seat without a ballot a vote per length and an abstention", () => {
    const base = createRun({ seatIds: SEAT_IDS, seed: "enum-votes" });
    const run = { ...base, stage: { tag: "muster" as const, ballots: { p1: "long" as const } } };
    const votes = enumerateLegalRunActions(run, catalog).filter((c) => c.action.type === "vote");
    expect(votes.filter((c) => c.seatId === "p1")).toEqual([]);
    expect(votes.filter((c) => c.seatId === "p0").map((c) => c.action)).toEqual([
      { type: "vote", choice: "short" },
      { type: "vote", choice: "standard" },
      { type: "vote", choice: "long" },
      { type: "vote", choice: null },
    ]);
  });

  it("at the draft, offers a seat a pick per bundle of its head offer and nothing to a seat with no offer", () => {
    const base = setupRun({ seatIds: SEAT_IDS, seed: "enum-3", catalog });
    const run: RunState = {
      ...base,
      seats: base.seats.map((s) => (s.seatId === "p0" ? { ...s, offers: [{ kind: "standard", bundles: [["item-passive"], ["item-between"]] }] } : s)),
      stage: { tag: "draft", cleared: campIndex(1), payout: 5 },
    };
    const candidates = enumerateLegalRunActions(run, catalog);
    expect(candidates.map((c) => [c.seatId, c.action])).toEqual([
      ["p0", { type: "pick-bundle", bundle: 0 }],
      ["p0", { type: "pick-bundle", bundle: 1 }],
    ]);
  });

  it("at a shop loadout, offers the readies, an equip of the newest items when it changes the set, and every buy", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "enum-shop", catalog, camp: 3, purse: 30, items: { p0: ["item-passive", "item-passive", "item-between"] } });
    const candidates = enumerateLegalRunActions(run, catalog);
    expect(candidates.filter((c) => c.action.type === "equip").map((c) => [c.seatId, c.action])).toEqual([["p0", { type: "equip", itemUids: ["it1", "it2"] }]]);
    expect(candidates.filter((c) => c.seatId === "p1" && c.action.type === "buy").map((c) => c.action)).toEqual(
      ["supplies", "item0", "item1", "item2", "upgrade:plain-2.a", "upgrade:plain-2.b"].map((stockId) => ({ type: "buy", stockId })),
    );
  });

  it("at a route, offers each seat a vote per option and an abstention", () => {
    const base = setupRun({ seatIds: SEAT_IDS, seed: "enum-route", catalog });
    const next = base.stage.tag === "loadout" ? base.stage.camp : null;
    const run: RunState = {
      ...base,
      stage: { tag: "route", from: campIndex(1), options: [{ id: "a", next: next! }, { id: "b", next: next! }], ballots: { p0: "a" } },
    };
    const votes = enumerateLegalRunActions(run, catalog);
    expect(votes.filter((c) => c.seatId === "p0")).toEqual([]);
    expect(votes.filter((c) => c.seatId === "p2").map((c) => c.action)).toEqual([
      { type: "vote", choice: "a" },
      { type: "vote", choice: "b" },
      { type: "vote", choice: null },
    ]);
  });

  it("at objective-pick, offers use-ability for an objective-pick item targeting only unclaimed objectives", () => {
    const run = advanceTo(
      setupRun({
        seatIds: SEAT_IDS,
        seed: "enum-objpick",
        catalog,
        camp: 2,
        items: Object.fromEntries(SEAT_IDS.map((seatId) => [seatId, ["item-objpick"]])),
      }),
      "objective-pick",
      catalog,
    );
    const uses = enumerateLegalRunActions(run, catalog).filter((c) => c.action.type === "use-ability");
    expect(uses.length).toBeGreaterThan(0);
    const camp = attemptOf(run)!.camp;
    for (const candidate of uses) {
      if (candidate.action.type !== "use-ability") continue;
      expect(candidate.action.sourceKey).toBe(`it${SEAT_IDS.indexOf(candidate.seatId)}`);
      const targetId = candidate.action.targets[0]!;
      expect(targetId.startsWith("objective:")).toBe(true);
      const objective = camp.objectives.find((o) => o.id === targetId.slice("objective:".length))!;
      expect(objective.ownerSeatId).toBeNull();
    }
  });

  it("between tricks, offers whispers and a between-tricks item aimed at a teammate", () => {
    const run = advanceTo(
      setupRun({ seatIds: SEAT_IDS, seed: "enum-between", catalog, items: { p0: ["item-between"] } }),
      "between-tricks",
      catalog,
    );
    const legal = enumerateLegalRunActions(run, catalog);
    expect(legal.some((c) => c.action.type === "whisper")).toBe(true);
    const item = legal.filter((c) => c.action.type === "use-ability").map((c) => ({ seatId: c.seatId, action: c.action }));
    expect(item).toEqual([
      { seatId: "p0", action: { type: "use-ability", sourceKey: "it0", targets: ["seat:p1"] } },
      { seatId: "p0", action: { type: "use-ability", sourceKey: "it0", targets: ["seat:p2"] } },
    ]);
  });
});

describe("driveRun / replayRun", () => {
  it("drives a whole run from muster to won or lost without throwing, and replayRun reproduces every state", () => {
    const run = createRun({ seatIds: SEAT_IDS, seed: "drive-seed" });
    const { states, log } = driveRun(run, [3, 1, 4, 1, 5, 9, 2, 6], catalog);

    expect(states[0]!.stage.tag).toBe("muster");
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
    expect(() => replayRun(run, [{ seatId: "p0", action: { type: "ready" } }], catalog)).toThrow(/wrong_stage/);
  });
});
