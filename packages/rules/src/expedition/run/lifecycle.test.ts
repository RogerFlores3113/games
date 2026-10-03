// Tests for run/lifecycle.ts: createRun, runStatus, runPhase,
// nextAttemptNumber, the gated pre-deal and rescue windows, drawBossTwist,
// startAttempt, dealAttempt, assignFaceDown, settleIfDecided, advanceRun.
//
// Fake characters, items and bosses are declared inline and joined to the
// plain characters through testCatalog.

import { describe, expect, it } from "vitest";
import { campPhase, currentActorSeatId } from "../camp";
import { ability, defineCharacter, defineItem, defineUpgrade } from "../content/source-def";
import type { BossDef } from "../boss/boss-def";
import { rulesFor } from "./compose";
import {
  advanceRun,
  assignFaceDown,
  createRun,
  dealAttempt,
  drawBossTwist,
  nextAttemptNumber,
  runPhase,
  runStatus,
  settleIfDecided,
  startAttempt,
} from "./lifecycle";
import { attemptSeed } from "./rng";
import { applyRunAction } from "./run-actions";
import { advanceTo, setupRun, testCatalog } from "./run-test-support";
import type { AttemptState, CampResult, Catalog, RunState } from "./types";
import { currentWindow, gatedPendingSeatIds } from "./windows";

const SEAT_IDS = ["p0", "p1", "p2"];

function bosses(ids: readonly string[]): Record<string, BossDef> {
  return Object.fromEntries(ids.map((id) => [id, { id, name: id, text: "", modifiers: {} } satisfies BossDef]));
}

const FORCED_FAILURE: BossDef = { id: "always-fails", name: "Always Fails", text: "", modifiers: { failureChecks: () => () => ["forced"] } };

/** A fireside run past muster with every seat ready, so startAttempt can run. */
function readyRun(catalog: Catalog, overrides: Partial<RunState> = {}, kits: Record<string, readonly string[]> = {}): RunState {
  const run = setupRun({ seatIds: SEAT_IDS, seed: "fixture", catalog, kits });
  return { ...run, readySeatIds: [...run.seatIds], ...overrides };
}

const EMPTY_ATTEMPT: AttemptState = { attemptNumber: 1, bossCancelled: false, effects: [], reveals: [], log: [], camp: null };

const preDealItem = (canUse?: () => true | string) =>
  defineItem({
    id: "pre-deal-item",
    name: "Pre-deal item",
    text: "Does nothing.",
    active: ability({ window: "pre-deal", limit: { kind: "per-run", times: 1 }, targets: [], canUse, apply: () => [] }),
  });

describe("createRun", () => {
  it("starts at camp 1 with 3 supplies in muster: no characters, empty kits, no drafts, no ledger", () => {
    const run = createRun({ seatIds: SEAT_IDS, seed: "s" });
    expect(run.campNumber).toBe(1);
    expect(run.supplies).toBe(3);
    expect(run.attempt).toBeNull();
    expect(run.readySeatIds).toEqual([]);
    expect(run.history).toEqual([]);
    expect(run.bossTwists).toEqual({ 3: null, 6: null });
    expect(run.seats).toEqual(SEAT_IDS.map((seatId) => ({ seatId, characterId: null, kit: [], draftOffer: null, ledger: [] })));
    expect(runPhase(run)).toBe("muster");
    expect(runStatus(run)).toBe("in_progress");
  });

  it("throws for 2 seats", () => {
    expect(() => createRun({ seatIds: ["p0", "p1"], seed: "s" })).toThrow();
  });

  it("throws for 6 seats", () => {
    expect(() => createRun({ seatIds: ["p0", "p1", "p2", "p3", "p4", "p5"], seed: "s" })).toThrow();
  });

  it("throws for duplicate seat ids", () => {
    expect(() => createRun({ seatIds: ["p0", "p0", "p2"], seed: "s" })).toThrow();
  });

  it("throws for an empty seed", () => {
    expect(() => createRun({ seatIds: SEAT_IDS, seed: "" })).toThrow();
  });
});

describe("runPhase", () => {
  const catalog = testCatalog();

  it("is muster until every seat has a character, then fireside", () => {
    const run = createRun({ seatIds: SEAT_IDS, seed: "s" });
    const partly: RunState = { ...run, seats: run.seats.map((s, i) => (i < 2 ? { ...s, characterId: `plain-${i + 1}` } : s)) };
    expect(runPhase(partly)).toBe("muster");
    expect(runPhase(setupRun({ seatIds: SEAT_IDS, seed: "s", catalog }))).toBe("fireside");
  });

  it("is ended once supplies are gone", () => {
    expect(runPhase({ ...createRun({ seatIds: SEAT_IDS, seed: "s" }), supplies: 0 })).toBe("ended");
  });
});

describe("startAttempt (D-01, D-02, D-03)", () => {
  it("at camp 1 leaves bossTwists untouched and produces a fresh AttemptState", () => {
    const catalog = testCatalog();
    const next = startAttempt(readyRun(catalog), catalog);
    expect(next.bossTwists).toEqual({ 3: null, 6: null });
    expect(next.attempt).not.toBeNull();
    expect(next.readySeatIds).toEqual([]);
  });

  it("with no pre-deal ability in the crew, deals immediately", () => {
    const catalog = testCatalog();
    const next = startAttempt(readyRun(catalog), catalog);
    expect(runPhase(next)).toBe("camp");
    expect(next.attempt!.camp).not.toBeNull();
  });

  it("D-02: at camp 3, sets bossTwists[3]; a second attempt keeps the same id", () => {
    const catalog = testCatalog({ bosses: bosses(["boss-0", "boss-1", "boss-2", "boss-3"]) });
    const first = startAttempt(readyRun(catalog, { campNumber: 3 }), catalog);
    expect(first.bossTwists[3]).not.toBeNull();

    const history: CampResult[] = [{ campNumber: 3, attemptNumber: 1, status: "failed", suppliesSpent: 1 }];
    const second = startAttempt(readyRun(catalog, { campNumber: 3, bossTwists: first.bossTwists, history }), catalog);
    expect(second.bossTwists[3]).toBe(first.bossTwists[3]);
  });

  it("D-03: at camp 6, across 50 seeds with bossTwists[3] preset, bossTwists[6] is never boss-0", () => {
    const catalog = testCatalog({ bosses: bosses(["boss-0", "boss-1", "boss-2", "boss-3"]) });
    for (let i = 0; i < 50; i++) {
      const next = startAttempt(readyRun(catalog, { campNumber: 6, bossTwists: { 3: "boss-0", 6: null }, seed: `seed-${i}` }), catalog);
      expect(next.bossTwists[6]).not.toBe("boss-0");
      expect(next.bossTwists[6]).not.toBeNull();
    }
  });

  it("throws unless every seat is ready", () => {
    const catalog = testCatalog();
    expect(() => startAttempt({ ...readyRun(catalog), readySeatIds: ["p0"] }, catalog)).toThrow();
  });

  it("throws in muster", () => {
    const catalog = testCatalog();
    const run = createRun({ seatIds: SEAT_IDS, seed: "s" });
    expect(() => startAttempt({ ...run, readySeatIds: [...SEAT_IDS] }, catalog)).toThrow();
  });
});

describe("drawBossTwist", () => {
  it("returns null when the pool is empty", () => {
    expect(drawBossTwist("s", 3, [], null)).toBeNull();
  });

  it("excludes the given id", () => {
    for (let i = 0; i < 20; i++) {
      expect(drawBossTwist(`seed-${i}`, 6, ["boss-0", "boss-1"], "boss-0")).toBe("boss-1");
    }
  });
});

describe("the pre-deal gated window (D-12)", () => {
  function started(catalog: Catalog, kits: Record<string, readonly string[]>): RunState {
    return { ...readyRun(catalog, {}, kits), attempt: EMPTY_ATTEMPT, readySeatIds: [] };
  }

  it("a seat holding a usable pre-deal item is pending; runPhase stays pre-deal", () => {
    const catalog = testCatalog({ items: { "pre-deal-item": preDealItem() } });
    const run = started(catalog, { p0: ["pre-deal-item"] });
    expect(runPhase(run)).toBe("pre-deal");
    expect(gatedPendingSeatIds(run, catalog)).toEqual(["p0"]);
  });

  it("a seat whose pre-deal item's canUse returns a reason is not pending", () => {
    const catalog = testCatalog({ items: { "pre-deal-item": preDealItem(() => "Not available right now") } });
    expect(gatedPendingSeatIds(started(catalog, { p0: ["pre-deal-item"] }), catalog)).toEqual([]);
  });

  it("a seat with no pre-deal ability never blocks", () => {
    const catalog = testCatalog();
    expect(gatedPendingSeatIds(started(catalog, {}), catalog)).toEqual([]);
  });

  it("the last ready holds at pre-deal for a pending seat, and its pass deals the camp", () => {
    const catalog = testCatalog({ items: { "pre-deal-item": preDealItem() } });
    const run = readyRun(catalog, { readySeatIds: ["p0", "p1"] }, { p2: ["pre-deal-item"] });
    const waiting = applyRunAction(run, "p2", { type: "ready" }, catalog);
    if (!waiting.ok) throw new Error(waiting.error);
    expect(runPhase(waiting.state)).toBe("pre-deal");
    const dealt = applyRunAction(waiting.state, "p2", { type: "skip-window" }, catalog);
    if (!dealt.ok) throw new Error(dealt.error);
    expect(runPhase(dealt.state)).toBe("camp");
  });
});

describe("assignFaceDown / dealAttempt face-down assignment", () => {
  const fog: BossDef = { id: "thick-fog", name: "Thick Fog", text: "", modifiers: { objectiveAssignment: () => () => "face-down" } };
  const catalog = testCatalog({ bosses: { "thick-fog": fog } });

  it("every objective gets a non-null ownerSeatId (campPhase is playing) at camp 3", () => {
    const run = readyRun(catalog, { campNumber: 3, bossTwists: { 3: "thick-fog", 6: null } });
    const started = startAttempt(run, catalog);
    const camp = started.attempt!.camp!;
    expect(camp.objectives.every((o) => o.ownerSeatId !== null)).toBe(true);
    expect(campPhase(camp, rulesFor(started, catalog))).toBe("playing");
  });

  it("round-robins from the expedition leader over seeded-shuffled objectives; with 3 objectives and 5 seats, exactly 2 own none (A5)", () => {
    const seatIds = ["p0", "p1", "p2", "p3", "p4"];
    const run = setupRun({ seatIds, seed: "fixture", catalog });
    const ready: RunState = { ...run, campNumber: 3, bossTwists: { 3: "thick-fog", 6: null }, readySeatIds: [...seatIds] };
    const started = startAttempt(ready, catalog);
    const camp = started.attempt!.camp!;
    expect(camp.objectives).toHaveLength(3);
    const owners = camp.objectives.map((o) => o.ownerSeatId);
    expect(new Set(owners).size).toBe(3);
    expect(seatIds.filter((s) => !owners.includes(s))).toHaveLength(2);

    const rebuilt = assignFaceDown(
      { ...camp, objectives: camp.objectives.map((o) => ({ ...o, ownerSeatId: null })) },
      run.seed,
      3,
      started.attempt!.attemptNumber,
    );
    expect(rebuilt.objectives.map((o) => o.ownerSeatId)).toEqual(owners);
  });
});

describe("replay deals differ", () => {
  it("attempt 2 at the same camp is a fresh deal from attemptSeed(seed, N, 2)", () => {
    const catalog = testCatalog();
    const started1 = startAttempt(readyRun(catalog), catalog);
    const hands1 = started1.attempt!.camp!.hands;

    const history: CampResult[] = [{ campNumber: 1, attemptNumber: 1, status: "failed", suppliesSpent: 1 }];
    const run2 = readyRun(catalog, { history });
    const started2 = startAttempt(run2, catalog);
    expect(started2.attempt!.attemptNumber).toBe(2);
    const hands2 = started2.attempt!.camp!.hands;
    expect(hands1).not.toEqual(hands2);

    const redealt = dealAttempt({ ...run2, attempt: { ...started2.attempt!, camp: null } }, catalog);
    expect(redealt.attempt!.camp!.hands).toEqual(hands2);
    expect(attemptSeed("fixture", 1, 2)).toBe("fixture:camp1:attempt2");
  });
});

describe("settleIfDecided / advanceRun on failure", () => {
  const catalog = testCatalog({ bosses: { "always-fails": FORCED_FAILURE } });
  const atCamp3 = (overrides: Partial<RunState> = {}, kits: Record<string, readonly string[]> = {}, cat: Catalog = catalog) =>
    readyRun(cat, { campNumber: 3, bossTwists: { 3: "always-fails", 6: null }, ...overrides }, kits);

  it("supplies drop by failureCost, history gains a failed entry, the attempt clears, no draft is dealt (D-01), kits stay and the next attempt is 2", () => {
    const kits = { p0: ["item-a"], p1: [], p2: [] };
    const cat = testCatalog({
      bosses: { "always-fails": FORCED_FAILURE },
      items: { "item-a": defineItem({ id: "item-a", name: "A", text: "Nothing." }) },
    });
    const started = startAttempt(atCamp3({}, kits, cat), cat);

    expect(started.attempt).toBeNull();
    expect(started.supplies).toBe(2);
    expect(started.history).toEqual([{ campNumber: 3, attemptNumber: 1, status: "failed", suppliesSpent: 1 }]);
    expect(started.campNumber).toBe(3);
    expect(started.seats.map((s) => s.draftOffer)).toEqual([null, null, null]);
    expect(started.seats.map((s) => s.kit)).toEqual([["item-a"], [], []]);
    expect(nextAttemptNumber(started)).toBe(2);
  });

  it("a passive item adding 1 to failureCost, held by two seats, makes a failure cost 3", () => {
    const tonic = defineItem({
      id: "energy-tonic",
      name: "Energy Tonic",
      text: "Failures cost more.",
      passive: { modifier: () => ({ failureCost: (prev) => (run) => prev(run) + 1 }) },
    });
    const cat = testCatalog({ bosses: { "always-fails": FORCED_FAILURE }, items: { "energy-tonic": tonic } });
    const started = startAttempt(atCamp3({}, { p0: ["energy-tonic"], p1: ["energy-tonic"] }, cat), cat);
    expect(started.history[0]!.suppliesSpent).toBe(3);
    expect(started.supplies).toBe(0);
  });

  it("throws if a failure's composed cost is not an integer >= 1 (POLICY A3)", () => {
    const zero: BossDef = { id: "zero", name: "Zero", text: "", modifiers: { failureChecks: () => () => ["forced"], failureCost: () => () => 0 } };
    const cat = testCatalog({ bosses: { zero } });
    expect(() => startAttempt(readyRun(cat, { campNumber: 3, bossTwists: { 3: "zero", 6: null } }), cat)).toThrow();
  });

  it("when supplies reach 0 after a failure, runStatus is lost", () => {
    const started = startAttempt(atCamp3({ supplies: 1 }), catalog);
    expect(started.supplies).toBe(0);
    expect(runStatus(started)).toBe("lost");
    expect(runPhase(started)).toBe("ended");
  });

  it("a new attempt after a failure starts clean while seats, ledgers and bossTwists persist (RUN-06)", () => {
    const failed = startAttempt(atCamp3(), catalog);
    const ledger = [{ kind: "used" as const, sourceId: "plain-1", at: { camp: 3 as const, attempt: 1, trick: 0 }, poolCost: 0 }];
    const seats = failed.seats.map((s) => (s.seatId === "p0" ? { ...s, ledger } : s));
    const replay = readyRun(catalog, { campNumber: 3, bossTwists: failed.bossTwists, history: failed.history, seats });
    const second = startAttempt(replay, catalog);
    expect(second.attempt).toBeNull();
    expect(second.history.map((h) => h.attemptNumber)).toEqual([1, 2]);
    expect(second.bossTwists).toEqual({ 3: "always-fails", 6: null });
    expect(second.seats).toEqual(seats);
  });

  it("a replay's attempt state is fresh: no effects, reveals, log or cancelled boss", () => {
    const dealt = startAttempt(readyRun(testCatalog(), { history: [{ campNumber: 1, attemptNumber: 1, status: "failed", suppliesSpent: 1 }] }), testCatalog());
    expect(dealt.attempt).toMatchObject({ attemptNumber: 2, bossCancelled: false, effects: [], reveals: [], log: [] });
  });
});

describe("settleIfDecided / advanceRun on success", () => {
  const pooled = defineCharacter({
    id: "pooled",
    name: "Pooled",
    theme: "Has a pool",
    power: "Pool power",
    text: "Nothing happens.",
    pool: { name: "Herbs", start: 1, max: 3, regain: (owner) => (owner.hasUpgrade("pooled.rich") ? 2 : 1) },
    upgrades: [
      defineUpgrade({ id: "pooled.rich", name: "Rich", text: "Regain more." }),
      defineUpgrade({ id: "pooled.b", name: "B", text: "Nothing happens." }),
    ],
  });
  const catalog = testCatalog({
    characters: { pooled },
    items: { "item-a": defineItem({ id: "item-a", name: "A", text: "Nothing." }), "item-b": defineItem({ id: "item-b", name: "B", text: "Nothing." }), "item-c": defineItem({ id: "item-c", name: "C", text: "Nothing." }) },
  });

  function cleared(run: RunState): RunState {
    const started = startAttempt(run, catalog);
    return { ...started, attempt: { ...started.attempt!, camp: { ...started.attempt!.camp!, objectives: [] } } };
  }

  it("advances campNumber and deals every seat a fresh offer: its own unowned upgrade first, no owned source", () => {
    const run = readyRun(catalog, {}, { p0: ["item-a"] });
    const settled = settleIfDecided(cleared(run), catalog);
    expect(settled.campNumber).toBe(2);
    expect(settled.attempt).toBeNull();
    expect(settled.history).toEqual([{ campNumber: 1, attemptNumber: 1, status: "succeeded", suppliesSpent: 0 }]);
    for (const seat of settled.seats) {
      expect(seat.draftOffer).toHaveLength(3);
      expect(seat.draftOffer![0]!.startsWith(`${seat.characterId}.`)).toBe(true);
    }
    expect(settled.seats[0]!.draftOffer).not.toContain("item-a");
  });

  it("appends a pool `regained` ledger entry for a pooled character, stamped at the clear, tuned by its upgrades", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "fixture", catalog, characters: { p0: "pooled", p1: "plain-1", p2: "plain-2" }, kits: { p0: ["pooled.rich"] } });
    const settled = settleIfDecided(cleared({ ...run, readySeatIds: [...SEAT_IDS] }), catalog);
    expect(settled.seats[0]!.ledger).toEqual([{ kind: "regained", amount: 2, at: { camp: 1, attempt: 1, trick: 0 } }]);
    expect(settled.seats[1]!.ledger).toEqual([]);
    expect(settled.seats[2]!.ledger).toEqual([]);
  });

  it("regains the base amount without the upgrade", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "fixture", catalog, characters: { p0: "pooled" } });
    const settled = settleIfDecided(cleared({ ...run, readySeatIds: [...SEAT_IDS] }), catalog);
    expect(settled.seats[0]!.ledger).toEqual([{ kind: "regained", amount: 1, at: { camp: 1, attempt: 1, trick: 0 } }]);
  });

  it("clearing camp 6 wins (runStatus won, runPhase ended)", () => {
    const settled = settleIfDecided(cleared(readyRun(catalog, { campNumber: 6 })), catalog);
    expect(runStatus(settled)).toBe("won");
    expect(runPhase(settled)).toBe("ended");
  });
});

describe("advanceRun", () => {
  it("deals once pre-deal pending is empty", () => {
    const catalog = testCatalog();
    const advanced = advanceRun({ ...readyRun(catalog), attempt: EMPTY_ATTEMPT, readySeatIds: [] }, catalog);
    expect(advanced.attempt!.camp).not.toBeNull();
  });
});

describe("the rescue window", () => {
  const rope = defineItem({
    id: "test-rope",
    name: "Test Rope",
    text: "Drop a failed objective.",
    active: ability({
      window: "rescue",
      limit: { kind: "single-use" },
      targets: [{ kind: "failed-objective" }],
      apply: (ctx) => [{ op: "remove-objective", objectiveId: ctx.targets[0].objective.id }],
    }),
  });
  const lasso = defineItem({
    id: "test-lasso",
    name: "Test Lasso",
    text: "Drop a failed objective, three times a run.",
    active: ability({
      window: "rescue",
      limit: { kind: "per-run", times: 3 },
      targets: [{ kind: "failed-objective" }],
      apply: (ctx) => [{ op: "remove-objective", objectiveId: ctx.targets[0].objective.id }],
    }),
  });
  const shove = defineItem({
    id: "test-shove",
    name: "Test Shove",
    text: "Give the first trick to a player.",
    active: ability({
      window: "between-tricks",
      limit: { kind: "per-run", times: 3 },
      targets: [{ kind: "player", who: "anyone" }],
      apply: (ctx) => [{ op: "reassign-trick", trickIndex: 0, toSeatId: ctx.targets[0].seatId }],
    }),
  });
  const catalog = testCatalog({ items: { "test-rope": rope, "test-lasso": lasso, "test-shove": shove } });

  /** Between tricks with every seat holding a no-tricks objective, so the
   * first trick fails exactly its winner's objective. */
  function everyoneDucks(kits: Readonly<Record<string, readonly string[]>>, seed = "rescue-seed"): RunState {
    const run = advanceTo(setupRun({ seatIds: SEAT_IDS, seed, catalog, kits }), "between-tricks", catalog);
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

  function act(run: RunState, seatId: string, action: Parameters<typeof applyRunAction>[2]): RunState {
    const result = applyRunAction(run, seatId, action, catalog);
    if (!result.ok) throw new Error(`${seatId} ${action.type}: ${result.error}`);
    return result.state;
  }

  it("a rescue holder pauses settle", () => {
    const paused = playTrick(everyoneDucks({ p0: ["test-rope"] }));
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
    const paused = playTrick(everyoneDucks({ p0: ["test-rope"] }));
    const winner = paused.attempt!.camp!.completedTricks[0]!.winnerSeatId;
    const passed = act(paused, "p0", { type: "skip-window" });
    expect(passed.attempt).toBeNull();
    expect(passed.supplies).toBe(2);
    expect(passed.history).toEqual([{ campNumber: 1, attemptNumber: 1, status: "failed", suppliesSpent: 1 }]);
    expect(passed.seats[0]!.ledger).toEqual([{ kind: "passed", sourceId: "test-rope", at: { camp: 1, attempt: 1, trick: 1 }, failedObjectiveIds: [`duck-${winner}`] }]);
  });

  it("a rescue that clears every failure resumes play and spends a single-use item", () => {
    const paused = playTrick(everyoneDucks({ p0: ["test-rope"] }));
    const winner = paused.attempt!.camp!.completedTricks[0]!.winnerSeatId;
    const rescued = act(paused, "p0", { type: "use-ability", sourceId: "test-rope", targets: [`objective:duck-${winner}`] });
    const camp = rescued.attempt!.camp!;
    expect(camp.objectives.map((o) => o.id)).toEqual(SEAT_IDS.filter((id) => id !== winner).map((id) => `duck-${id}`));
    expect(campPhase(camp, rulesFor(rescued, catalog))).toBe("playing");
    expect(currentWindow(rescued, rulesFor(rescued, catalog))).toBe("between-tricks");
    expect(rescued.history).toEqual([]);
    expect(rescued.seats[0]!.kit).toEqual([]);
    expect(playCard(rescued).attempt!.camp!.currentTrick.plays).toHaveLength(1);
  });

  it("with no rescue holder the camp fails at once", () => {
    const failed = playTrick(everyoneDucks({}));
    expect(failed.attempt).toBeNull();
    expect(failed.supplies).toBe(2);
    expect(failed.history).toEqual([{ campNumber: 1, attemptNumber: 1, status: "failed", suppliesSpent: 1 }]);
  });

  it("a pass is stamped with its trick, so a later failure at another trick reopens rescue for that seat", () => {
    const paused = playTrick(everyoneDucks({ p0: ["test-lasso"], p1: ["test-rope"] }, "reopen-seed"));
    expect(gatedPendingSeatIds(paused, catalog)).toEqual(["p0", "p1"]);
    const firstWinner = paused.attempt!.camp!.completedTricks[0]!.winnerSeatId;

    const afterPass = act(paused, "p0", { type: "skip-window" });
    expect(afterPass.seats[0]!.ledger).toEqual([{ kind: "passed", sourceId: "test-lasso", at: { camp: 1, attempt: 1, trick: 1 }, failedObjectiveIds: [`duck-${firstWinner}`] }]);
    expect(gatedPendingSeatIds(afterPass, catalog)).toEqual(["p1"]);
    expect(afterPass.attempt).not.toBeNull();

    const rescued = act(afterPass, "p1", { type: "use-ability", sourceId: "test-rope", targets: [`objective:duck-${firstWinner}`] });
    const second = playTrick(rescued);
    expect(second.attempt!.camp!.completedTricks).toHaveLength(2);
    expect(currentWindow(second, rulesFor(second, catalog))).toBe("rescue");
    expect(gatedPendingSeatIds(second, catalog)).toEqual(["p0"]);
    expect(second.seats[0]!.ledger).toHaveLength(1);
  });

  it("a pass covers only the failures it saw, so a new failure at the same trick reopens rescue", () => {
    const paused = playTrick(everyoneDucks({ p0: ["test-lasso"], p1: ["test-rope"], p2: ["test-shove"] }, "reopen-seed"));
    const firstWinner = paused.attempt!.camp!.completedTricks[0]!.winnerSeatId;
    const afterPass = act(paused, "p0", { type: "skip-window" });
    const rescued = act(afterPass, "p1", { type: "use-ability", sourceId: "test-rope", targets: [`objective:duck-${firstWinner}`] });
    expect(currentWindow(rescued, rulesFor(rescued, catalog))).toBe("between-tricks");

    const blamed = SEAT_IDS.find((id) => id !== firstWinner)!;
    const shoved = act(rescued, "p2", { type: "use-ability", sourceId: "test-shove", targets: [`seat:${blamed}`] });
    expect(shoved.attempt!.camp!.completedTricks).toHaveLength(1);
    expect(currentWindow(shoved, rulesFor(shoved, catalog))).toBe("rescue");
    expect(gatedPendingSeatIds(shoved, catalog)).toEqual(["p0"]);
  });

  it("skip-window outside a gated window is wrong_window", () => {
    const between = everyoneDucks({ p0: ["test-rope"] });
    expect(applyRunAction(between, "p0", { type: "skip-window" }, catalog)).toEqual({ ok: false, error: "wrong_window" });
  });
});

describe("the in-trick window", () => {
  const duck = defineItem({
    id: "test-duck",
    name: "Test Duck",
    text: "Your card can't win this trick.",
    active: ability({
      window: "in-trick",
      limit: { kind: "per-run", times: 3 },
      targets: [{ kind: "self" }],
      apply: (ctx) => [{ op: "add-modifier", lasts: "trick", params: { seatId: ctx.self }, audience: "public" }],
      effect: (effect) => ({
        trickWinner: (prev) => (plays) => {
          const eligible = plays.filter((play) => play.seatId !== effect.seatId);
          return eligible.length === 0 || eligible.length === plays.length ? prev(plays) : prev(eligible);
        },
      }),
    }),
  });
  const catalog = testCatalog({ items: { "test-duck": duck } });

  it("opens once the leader plays and admits only the seat whose turn it is", () => {
    const kits = { p0: ["test-duck"], p1: ["test-duck"], p2: ["test-duck"] };
    const start = advanceTo(setupRun({ seatIds: SEAT_IDS, seed: "in-trick-seed", catalog, kits }), "between-tricks", catalog);
    const leader = start.attempt!.camp!.currentTrick.leaderSeatId;
    const useAs = (seatId: string) => ({ type: "use-ability" as const, sourceId: "test-duck", targets: [`seat:${seatId}`] });
    expect(applyRunAction(start, leader, useAs(leader), catalog)).toEqual({ ok: false, error: "wrong_window" });

    const rules = rulesFor(start, catalog);
    const led = applyRunAction(start, leader, { type: "play-card", cardId: rules.legalPlays(start.attempt!.camp!, leader)[0]!.id }, catalog);
    if (!led.ok) throw new Error(led.error);
    const ledRules = rulesFor(led.state, catalog);
    const next = currentActorSeatId(led.state.attempt!.camp!, ledRules)!;
    const later = SEAT_IDS.find((id) => id !== leader && id !== next)!;
    expect(currentWindow(led.state, ledRules)).toBe("in-trick");
    expect(applyRunAction(led.state, leader, useAs(leader), catalog)).toEqual({ ok: false, error: "wrong_window" });
    expect(applyRunAction(led.state, later, useAs(later), catalog)).toEqual({ ok: false, error: "wrong_window" });
    expect(applyRunAction(led.state, next, useAs(next), catalog).ok).toBe(true);
  });
});
