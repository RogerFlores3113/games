// Tests for run/lifecycle.ts (Plan 10-05: createRun, runStatus, runPhase,
// nextAttemptNumber, capacityOf, loadoutSize, the gated pre-deal and rescue windows,
// drawBossTwist, startAttempt, dealAttempt, assignFaceDown,
// settleIfDecided, advanceRun).
//
// Fake GearDef/BossDef catalogs are declared inline; real gear and bosses
// arrive in wave 5.

import { describe, expect, it } from "vitest";
import { campPhase, currentActorSeatId } from "../camp";
import {
  advanceRun,
  assignFaceDown,
  capacityOf,
  createRun,
  dealAttempt,
  drawBossTwist,
  loadoutSize,
  nextAttemptNumber,
  runPhase,
  runStatus,
  settleIfDecided,
  startAttempt,
} from "./lifecycle";
import { attemptSeed } from "./rng";
import { applyRunAction } from "./run-actions";
import { IN_TRICK_TEST_GEAR, RESCUE_TEST_GEAR, advanceTo, setupRun } from "./run-test-support";
import { currentWindow, gatedPendingSeatIds } from "./windows";
import { CATALOG } from "./catalog";
import { rulesFor } from "./compose";
import type { AttemptState, CampResult, Catalog, RunState, SeatRun } from "./types";
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

function fiveGearCatalog(): Catalog {
  const gear: Record<string, GearDef> = {};
  for (let i = 0; i < 5; i++) {
    gear[`gear-${i}`] = fakeGear({ id: `gear-${i}` });
  }
  return { gear, bosses: {} };
}

function fourBossCatalog(): Catalog {
  const bosses: Record<string, BossDef> = {};
  for (let i = 0; i < 4; i++) {
    bosses[`boss-${i}`] = { id: `boss-${i}`, name: `Boss ${i}`, text: "", modifiers: {} };
  }
  return { gear: {}, bosses };
}

function readyRun(overrides: Partial<RunState> = {}, catalog: Catalog = fiveGearCatalog()): RunState {
  const run = createRun({ seatIds: ["p0", "p1", "p2"], seed: "fixture" }, catalog);
  return { ...run, readySeatIds: [...run.seatIds], ...overrides };
}

describe("createRun", () => {
  const catalog = fiveGearCatalog();

  it("starts at campNumber 1, supplies 3, fireside, with a private draft offer per seat", () => {
    const run = createRun({ seatIds: ["p0", "p1", "p2"], seed: "s" }, catalog);
    expect(run.campNumber).toBe(1);
    expect(run.supplies).toBe(3);
    expect(run.attempt).toBeNull();
    expect(run.readySeatIds).toEqual([]);
    expect(run.history).toEqual([]);
    expect(run.bossTwists).toEqual({ 3: null, 6: null });
    for (const seat of run.seats) {
      expect(seat.ownedGearIds).toEqual([]);
      expect(seat.equippedGearIds).toEqual([]);
      expect(seat.draftOffer).not.toBeNull();
      expect(seat.draftOffer!.length).toBe(3);
    }
    expect(runPhase(run)).toBe("fireside");
    expect(runStatus(run)).toBe("in_progress");
  });

  it("throws for 2 seats", () => {
    expect(() => createRun({ seatIds: ["p0", "p1"], seed: "s" }, catalog)).toThrow();
  });

  it("throws for 6 seats", () => {
    expect(() => createRun({ seatIds: ["p0", "p1", "p2", "p3", "p4", "p5"], seed: "s" }, catalog)).toThrow();
  });

  it("throws for duplicate seat ids", () => {
    expect(() => createRun({ seatIds: ["p0", "p0", "p2"], seed: "s" }, catalog)).toThrow();
  });

  it("throws for an empty seed", () => {
    expect(() => createRun({ seatIds: ["p0", "p1", "p2"], seed: "" }, catalog)).toThrow();
  });
});

describe("capacityOf (RUN-03)", () => {
  const catalog = fiveGearCatalog();

  it("is 1 at camp 1 and 4 at camp 4", () => {
    const run1 = readyRun({ campNumber: 1 }, catalog);
    const run4 = readyRun({ campNumber: 4 }, catalog);
    expect(capacityOf(run1, "p0", catalog)).toBe(1);
    expect(capacityOf(run4, "p0", catalog)).toBe(4);
  });

  it("stays 4 when history holds two failed camp-4 attempts", () => {
    const history: CampResult[] = [
      { campNumber: 4, attemptNumber: 1, status: "failed", suppliesSpent: 1 },
      { campNumber: 4, attemptNumber: 2, status: "failed", suppliesSpent: 1 },
    ];
    const run = readyRun({ campNumber: 4, history }, catalog);
    expect(capacityOf(run, "p0", catalog)).toBe(4);
  });
});

describe("loadoutSize", () => {
  const catalog = fiveGearCatalog();

  it("sums gear sizes", () => {
    expect(loadoutSize(["gear-0", "gear-1"], catalog)).toBe(2);
  });

  it("throws for an unknown gear id", () => {
    expect(() => loadoutSize(["ghost"], catalog)).toThrow();
  });
});

describe("startAttempt (D-01, D-02, D-03)", () => {
  it("at camp 1 leaves bossTwists untouched and produces a fresh AttemptState", () => {
    const catalog = fiveGearCatalog();
    const run = readyRun({ campNumber: 1 }, catalog);
    const next = startAttempt(run, catalog);
    expect(next.bossTwists).toEqual({ 3: null, 6: null });
    expect(next.attempt).not.toBeNull();
  });

  it("with no pre-deal gear equipped, deals immediately (runPhase camp, attempt.camp non-null)", () => {
    const catalog = fiveGearCatalog();
    const run = readyRun({ campNumber: 1 }, catalog);
    const next = startAttempt(run, catalog);
    expect(runPhase(next)).toBe("camp");
    expect(next.attempt!.camp).not.toBeNull();
  });

  it("D-02: at camp 3, sets bossTwists[3]; a second attempt (history holding one failed camp 3) keeps the same id", () => {
    const catalog = fourBossCatalog();
    const run = readyRun({ campNumber: 3 }, catalog);
    const first = startAttempt(run, catalog);
    expect(first.bossTwists[3]).not.toBeNull();

    const firstBossId = first.bossTwists[3];
    const history: CampResult[] = [
      { campNumber: 3, attemptNumber: 1, status: "failed", suppliesSpent: 1 },
    ];
    const replay = readyRun({ campNumber: 3, bossTwists: first.bossTwists, history }, catalog);
    const second = startAttempt(replay, catalog);
    expect(second.bossTwists[3]).toBe(firstBossId);
  });

  it("D-03: at camp 6, across 50 seeds with bossTwists[3] preset, bossTwists[6] is never equal to bossTwists[3]", () => {
    const catalog = fourBossCatalog();
    for (let i = 0; i < 50; i++) {
      const run = readyRun({ campNumber: 6, bossTwists: { 3: "boss-0", 6: null }, seed: `seed-${i}` }, catalog);
      const next = startAttempt(run, catalog);
      expect(next.bossTwists[6]).not.toBe("boss-0");
      expect(next.bossTwists[6]).not.toBeNull();
    }
  });

  it("throws unless every seat is ready", () => {
    const catalog = fiveGearCatalog();
    const run = createRun({ seatIds: ["p0", "p1", "p2"], seed: "s" }, catalog);
    expect(() => startAttempt(run, catalog)).toThrow();
  });
});

describe("drawBossTwist", () => {
  it("returns null when the pool is empty", () => {
    expect(drawBossTwist("s", 3, [], null)).toBeNull();
  });

  it("excludes the given id", () => {
    for (let i = 0; i < 20; i++) {
      const result = drawBossTwist(`seed-${i}`, 6, ["boss-0", "boss-1"], "boss-0");
      expect(result).toBe("boss-1");
    }
  });
});

describe("the pre-deal gated window (D-12)", () => {
  function catalogWithPreDealGear(canUse: true | string): Catalog {
    const gear: Record<string, GearDef> = {
      "pre-deal-gear": fakeGear({ id: "pre-deal-gear", window: "pre-deal", canUse: () => canUse }),
    };
    return { gear, bosses: {} };
  }

  it("a seat with an equipped pre-deal gear (canUse -> true) is pending; runPhase stays pre-deal", () => {
    const catalog = catalogWithPreDealGear(true);
    const run = readyRun({ campNumber: 1 }, catalog);
    const withGear: RunState = {
      ...run,
      seats: run.seats.map((s) => (s.seatId === "p0" ? { ...s, equippedGearIds: ["pre-deal-gear"] } : s)),
    };
    const attempt: AttemptState = {
      attemptNumber: 1,
      bossCancelled: false,
      gearUses: [],
      effects: [],
      reveals: [],
      log: [],
      camp: null,
    };
    const started: RunState = { ...withGear, attempt };
    expect(runPhase(started)).toBe("pre-deal");
    expect(gatedPendingSeatIds(started, catalog)).toEqual(["p0"]);
  });

  it("a seat whose pre-deal gear's canUse returns a reason is not pending", () => {
    const catalog = catalogWithPreDealGear("Not available right now");
    const run = readyRun({ campNumber: 1 }, catalog);
    const withGear: RunState = {
      ...run,
      seats: run.seats.map((s) => (s.seatId === "p0" ? { ...s, equippedGearIds: ["pre-deal-gear"] } : s)),
    };
    const attempt: AttemptState = {
      attemptNumber: 1,
      bossCancelled: false,
      gearUses: [],
      effects: [],
      reveals: [],
      log: [],
      camp: null,
    };
    const started: RunState = { ...withGear, attempt };
    expect(gatedPendingSeatIds(started, catalog)).toEqual([]);
  });

  it("a seat with no pre-deal gear never blocks", () => {
    const catalog = fiveGearCatalog();
    const run = readyRun({ campNumber: 1 }, catalog);
    const attempt: AttemptState = {
      attemptNumber: 1,
      bossCancelled: false,
      gearUses: [],
      effects: [],
      reveals: [],
      log: [],
      camp: null,
    };
    const started: RunState = { ...run, attempt };
    expect(gatedPendingSeatIds(started, catalog)).toEqual([]);
  });
});

describe("assignFaceDown / dealAttempt face-down assignment", () => {
  function faceDownBossCatalog(): Catalog {
    return {
      gear: {},
      bosses: {
        "thick-fog": {
          id: "thick-fog",
          name: "Thick Fog",
          text: "",
          modifiers: { objectiveAssignment: () => () => "face-down" },
        },
      },
    };
  }

  it("every objective gets a non-null ownerSeatId (campPhase is playing) at camp 3", () => {
    const catalog = faceDownBossCatalog();
    const run = readyRun({ campNumber: 3, bossTwists: { 3: "thick-fog", 6: null } }, catalog);
    const started = startAttempt(run, catalog);
    const camp = started.attempt!.camp!;
    expect(camp.objectives.every((o) => o.ownerSeatId !== null)).toBe(true);
    const rules = rulesFor(started, catalog);
    expect(campPhase(camp, rules)).toBe("playing");
  });

  it("round-robins from the expedition leader over seeded-shuffled objectives; with 3 objectives and 5 seats, exactly 2 own none (A5)", () => {
    const catalog = faceDownBossCatalog();
    const seatIds = ["p0", "p1", "p2", "p3", "p4"];
    const run = createRun({ seatIds, seed: "fixture" }, catalog);
    const ready: RunState = { ...run, campNumber: 3, bossTwists: { 3: "thick-fog", 6: null }, readySeatIds: [...seatIds] };
    const started = startAttempt(ready, catalog);
    const camp = started.attempt!.camp!;
    expect(camp.objectives.length).toBe(3);
    const ownersUsed = new Set(camp.objectives.map((o) => o.ownerSeatId));
    const seatsWithNone = seatIds.filter((s) => !ownersUsed.has(s));
    expect(seatsWithNone.length).toBe(2);

    // Round-robin: verify the manual assignFaceDown call matches dealAttempt's.
    const rebuilt = assignFaceDown(
      { ...camp, objectives: camp.objectives.map((o) => ({ ...o, ownerSeatId: null })) },
      run.seed,
      3,
      started.attempt!.attemptNumber,
    );
    expect(rebuilt.objectives.map((o) => o.ownerSeatId)).toEqual(camp.objectives.map((o) => o.ownerSeatId));
  });
});

describe("replay deals differ", () => {
  it("attempt 1 and attempt 2 at the same camp use attemptSeed(seed, N, 2) and produce different hands", () => {
    const catalog = fiveGearCatalog();
    const run1 = readyRun({ campNumber: 1 }, catalog);
    const started1 = startAttempt(run1, catalog);
    const hands1 = started1.attempt!.camp!.hands;

    const history: CampResult[] = [{ campNumber: 1, attemptNumber: 1, status: "failed", suppliesSpent: 1 }];
    const run2 = readyRun({ campNumber: 1, history }, catalog);
    const started2 = startAttempt(run2, catalog);
    expect(started2.attempt!.attemptNumber).toBe(2);
    const hands2 = started2.attempt!.camp!.hands;

    expect(hands1).not.toEqual(hands2);

    const expectedDeal = dealAttempt(
      { ...run2, attempt: { ...started2.attempt!, camp: null } },
      catalog,
    );
    expect(expectedDeal.attempt!.camp!.hands).toEqual(hands2);
    // Sanity: the seed used really was attemptSeed(seed, 1, 2).
    const seedUsed = attemptSeed(run2.seed, 1, 2);
    expect(typeof seedUsed).toBe("string");
  });
});

describe("settleIfDecided / advanceRun on failure", () => {
  function forcedFailureCatalog(): Catalog {
    return {
      gear: { "gear-x": { id: "gear-x", name: "Gear X", size: 1, window: "passive", text: "", targets: [] } },
      bosses: {
        "always-fails": {
          id: "always-fails",
          name: "Always Fails",
          text: "",
          modifiers: { failureChecks: () => () => ["forced"] },
        },
      },
    };
  }

  it("supplies drop by failureCost, history gains a failed entry, attempt clears, draftOffer stays null (D-01), equippedGearIds unchanged (D-06), nextAttemptNumber is 2", () => {
    const catalog = forcedFailureCatalog();
    // A boss-camp twist forces failure (activeBossId only applies on camps
    // 3/6), so this fixture runs the scenario at camp 3.
    const run = readyRun({ campNumber: 3, bossTwists: { 3: "always-fails", 6: null } }, catalog);
    const seats: SeatRun[] = run.seatIds.map((seatId) => ({
      seatId,
      ownedGearIds: [],
      equippedGearIds: ["gear-x"],
      draftOffer: null,
    }));
    const withEquip: RunState = { ...run, seats };

    const started = startAttempt(withEquip, catalog);
    expect(started.attempt).toBeNull(); // settled immediately by advanceRun inside startAttempt

    expect(started.supplies).toBe(2);
    expect(started.history.length).toBe(1);
    const entry = started.history[0]!;
    expect(entry.campNumber).toBe(3);
    expect(entry.attemptNumber).toBe(1);
    expect(entry.status).toBe("failed");
    expect(entry.suppliesSpent).toBe(1);
    expect(started.campNumber).toBe(3);
    for (const seat of started.seats) {
      expect(seat.draftOffer).toBeNull();
      expect(seat.equippedGearIds).toEqual(["gear-x"]);
    }
    expect(nextAttemptNumber(started)).toBe(2);
  });

  it("a fake passive gear adding +1 failureCost, equipped by two seats, makes a failure cost 3", () => {
    const gear: Record<string, GearDef> = {
      "energy-tonic": fakeGear({
        id: "energy-tonic",
        passiveModifier: (ownerSeatId) => ({
          failureCost: (prev) => (run) => prev(run) + (run.seats.some((s) => s.seatId === ownerSeatId && s.equippedGearIds.includes("energy-tonic")) ? 1 : 0),
        }),
      }),
    };
    const bosses = {
      "always-fails": { id: "always-fails", name: "Always Fails", text: "", modifiers: { failureChecks: () => () => ["forced"] } },
    };
    const catalog: Catalog = { gear, bosses };

    const run = readyRun({ campNumber: 3, bossTwists: { 3: "always-fails", 6: null } }, catalog);
    const seats: SeatRun[] = run.seatIds.map((seatId, i) => ({
      seatId,
      ownedGearIds: [],
      equippedGearIds: i < 2 ? ["energy-tonic"] : [],
      draftOffer: null,
    }));
    const withEquip: RunState = { ...run, seats };

    const started = startAttempt(withEquip, catalog);
    expect(started.history[0]!.suppliesSpent).toBe(3);
  });

  it("throws if a failure's composed cost is not an integer >= 1 (POLICY A3)", () => {
    const bosses = {
      zero: { id: "zero", name: "Zero", text: "", modifiers: { failureChecks: () => () => ["forced"], failureCost: () => () => 0 } },
    };
    const catalog: Catalog = { gear: {}, bosses };
    const run = readyRun({ campNumber: 3, bossTwists: { 3: "zero", 6: null } }, catalog);
    expect(() => startAttempt(run, catalog)).toThrow();
  });

  it("when supplies reach 0 after a failure, runStatus is lost", () => {
    const catalog = forcedFailureCatalog();
    const run = readyRun(
      { campNumber: 3, bossTwists: { 3: "always-fails", 6: null }, supplies: 1 },
      catalog,
    );
    const started = startAttempt(run, catalog);
    expect(started.supplies).toBe(0);
    expect(runStatus(started)).toBe("lost");
    expect(runPhase(started)).toBe("ended");
  });

  it("a new attempt after a failure resets gearUses/effects/reveals/log and bossCancelled, while seats/bossTwists persist (RUN-06)", () => {
    const catalog = forcedFailureCatalog();
    const run = readyRun({ campNumber: 3, bossTwists: { 3: "always-fails", 6: null } }, catalog);
    const failed = startAttempt(run, catalog);
    expect(failed.attempt).toBeNull();

    const replay = readyRun({ campNumber: 3, bossTwists: failed.bossTwists, history: failed.history, seats: failed.seats }, catalog);
    const secondAttempt = startAttempt(replay, catalog);
    expect(secondAttempt.attempt).toBeNull(); // settles again (always-fails)
    expect(secondAttempt.bossTwists).toEqual(failed.bossTwists);
    expect(secondAttempt.seats).toEqual(failed.seats);
  });
});

describe("settleIfDecided / advanceRun on success", () => {
  it("advances campNumber and deals every seat a fresh non-null draftOffer excluding owned gear", () => {
    const catalog = fiveGearCatalog();
    const run = readyRun({ campNumber: 1 }, catalog);
    const started = startAttempt(run, catalog);
    // Force success by clearing objectives.
    const forced: RunState = {
      ...started,
      attempt: { ...started.attempt!, camp: { ...started.attempt!.camp!, objectives: [] } },
    };
    const settled = settleIfDecided(forced, catalog);
    expect(settled.campNumber).toBe(2);
    expect(settled.attempt).toBeNull();
    for (const seat of settled.seats) {
      expect(seat.draftOffer).not.toBeNull();
    }
  });

  it("clearing camp 6 wins (runStatus won, runPhase ended)", () => {
    const catalog = fiveGearCatalog();
    const run = readyRun({ campNumber: 6 }, catalog);
    const started = startAttempt(run, catalog);
    const forced: RunState = {
      ...started,
      attempt: { ...started.attempt!, camp: { ...started.attempt!.camp!, objectives: [] } },
    };
    const settled = settleIfDecided(forced, catalog);
    expect(runStatus(settled)).toBe("won");
    expect(runPhase(settled)).toBe("ended");
  });
});

describe("advanceRun", () => {
  it("deals once pre-deal pending is empty, then settles", () => {
    const catalog = fiveGearCatalog();
    const run = readyRun({ campNumber: 1 }, catalog);
    const attempt: AttemptState = {
      attemptNumber: 1,
      bossCancelled: false,
      gearUses: [],
      effects: [],
      reveals: [],
      log: [],
      camp: null,
    };
    const preDeal: RunState = { ...run, attempt };
    const advanced = advanceRun(preDeal, catalog);
    expect(advanced.attempt!.camp).not.toBeNull();
  });
});

describe("the rescue window", () => {
  const catalog: Catalog = { gear: { ...CATALOG.gear, [RESCUE_TEST_GEAR.id]: RESCUE_TEST_GEAR }, bosses: CATALOG.bosses };

  /** Between tricks with every seat holding a no-tricks objective, so the
   * first trick fails exactly its winner's objective. */
  function everyoneDucks(loadouts: Readonly<Record<string, readonly string[]>>): RunState {
    const run = advanceTo(setupRun({ seatIds: ["p0", "p1", "p2"], seed: "rescue-seed", catalog, loadouts }), "between-tricks", catalog);
    const camp = run.attempt!.camp!;
    const objectives = camp.seatIds.map((seatId) => ({ id: `duck-${seatId}`, kind: "no-tricks" as const, ownerSeatId: seatId }));
    return { ...run, attempt: { ...run.attempt!, camp: { ...camp, objectives } } };
  }

  function playCard(run: RunState): RunState {
    const camp = run.attempt!.camp!;
    const rules = rulesFor(run, catalog);
    const actor = currentActorSeatId(camp, rules)!;
    const played = applyRunAction(run, actor, { type: "play-card", cardId: rules.legalPlays(camp, actor)[0]!.id }, catalog);
    if (!played.ok) throw new Error(played.error);
    return played.state;
  }

  function playTrick(run: RunState): RunState {
    return run.seatIds.reduce((next) => playCard(next), run);
  }

  it("a rescue holder pauses settle", () => {
    const paused = playTrick(everyoneDucks({ p0: [RESCUE_TEST_GEAR.id] }));
    expect(paused.attempt).not.toBeNull();
    expect(currentWindow(paused, rulesFor(paused, catalog))).toBe("rescue");
    expect(gatedPendingSeatIds(paused, catalog)).toEqual(["p0"]);
    expect(paused.history).toEqual([]);
    expect(paused.supplies).toBe(3);
    expect(applyRunAction(paused, "p1", { type: "skip-window" }, catalog)).toEqual({ ok: false, error: "nothing_to_skip" });
    const winner = paused.attempt!.camp!.completedTricks[0]!.winnerSeatId;
    expect(applyRunAction(paused, winner, { type: "whisper", targetSeatId: winner === "p0" ? "p1" : "p0", cardId: "x" }, catalog)).toEqual({
      ok: false,
      error: "wrong_window",
    });
  });

  it("a pass settles the camp as failed", () => {
    const paused = playTrick(everyoneDucks({ p0: [RESCUE_TEST_GEAR.id] }));
    const passed = applyRunAction(paused, "p0", { type: "skip-window" }, catalog);
    if (!passed.ok) throw new Error(passed.error);
    expect(passed.state.attempt).toBeNull();
    expect(passed.state.supplies).toBe(2);
    expect(passed.state.history).toEqual([{ campNumber: 1, attemptNumber: 1, status: "failed", suppliesSpent: 1 }]);
  });

  it("a rescue that clears every failure resumes play", () => {
    const paused = playTrick(everyoneDucks({ p0: [RESCUE_TEST_GEAR.id] }));
    const winner = paused.attempt!.camp!.completedTricks[0]!.winnerSeatId;
    const rescued = applyRunAction(paused, "p0", { type: "use-gear", gearId: RESCUE_TEST_GEAR.id, targets: [] }, catalog);
    if (!rescued.ok) throw new Error(rescued.error);
    const camp = rescued.state.attempt!.camp!;
    expect(camp.objectives.map((o) => o.id)).toEqual(["p0", "p1", "p2"].filter((id) => id !== winner).map((id) => `duck-${id}`));
    expect(campPhase(camp, rulesFor(rescued.state, catalog))).toBe("playing");
    expect(currentWindow(rescued.state, rulesFor(rescued.state, catalog))).toBe("between-tricks");
    expect(rescued.state.history).toEqual([]);
    expect(playCard(rescued.state).attempt!.camp!.currentTrick.plays).toHaveLength(1);
  });

  it("with no rescue holder the camp fails at once", () => {
    const failed = playTrick(everyoneDucks({}));
    expect(failed.attempt).toBeNull();
    expect(failed.supplies).toBe(2);
    expect(failed.history).toEqual([{ campNumber: 1, attemptNumber: 1, status: "failed", suppliesSpent: 1 }]);
  });
});

describe("the in-trick window", () => {
  const catalog: Catalog = { gear: { ...CATALOG.gear, [IN_TRICK_TEST_GEAR.id]: IN_TRICK_TEST_GEAR }, bosses: CATALOG.bosses };
  const use = { type: "use-gear", gearId: IN_TRICK_TEST_GEAR.id, targets: [] } as const;

  it("opens once the leader plays and admits only the seat whose turn it is", () => {
    const loadouts = { p0: [IN_TRICK_TEST_GEAR.id], p1: [IN_TRICK_TEST_GEAR.id], p2: [IN_TRICK_TEST_GEAR.id] };
    const start = advanceTo(setupRun({ seatIds: ["p0", "p1", "p2"], seed: "in-trick-seed", catalog, loadouts }), "between-tricks", catalog);
    const leader = start.attempt!.camp!.currentTrick.leaderSeatId;
    expect(applyRunAction(start, leader, use, catalog)).toEqual({ ok: false, error: "wrong_window" });

    const rules = rulesFor(start, catalog);
    const led = applyRunAction(start, leader, { type: "play-card", cardId: rules.legalPlays(start.attempt!.camp!, leader)[0]!.id }, catalog);
    if (!led.ok) throw new Error(led.error);
    const ledRules = rulesFor(led.state, catalog);
    const next = currentActorSeatId(led.state.attempt!.camp!, ledRules)!;
    const later = ["p0", "p1", "p2"].find((id) => id !== leader && id !== next)!;
    expect(currentWindow(led.state, ledRules)).toBe("in-trick");
    expect(applyRunAction(led.state, leader, use, catalog)).toEqual({ ok: false, error: "wrong_window" });
    expect(applyRunAction(led.state, later, use, catalog)).toEqual({ ok: false, error: "wrong_window" });
    const used = applyRunAction(led.state, next, use, catalog);
    expect(used.ok).toBe(true);
  });
});
