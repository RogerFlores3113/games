// Tests for run/lifecycle.ts and the stage loop around it: createRun,
// runStatus, dealing a camp, settling it (supplies, payout, drafts, replay
// of the same spec, win and loss) and the gated rescue window.
//
// Fake characters and items are declared inline and joined to the plain
// characters through testCatalog.

import { describe, expect, it } from "vitest";
import { campPhase, currentActorSeatId, guard } from "../camp";
import { ability, defineCharacter, defineItem, defineUpgrade } from "../content/source-def";
import { attemptOf, withAttempt } from "./attempt";
import { rulesFor } from "./compose";
import { createRun, dealCamp, nextAttemptNumber, runStatus, settleCamp } from "./lifecycle";
import { campIndex } from "./plan";
import { applyRunAction } from "./stages/registry";
import { advanceTo, setupRun, testCatalog } from "./run-test-support";
import type { Catalog, RunAt, RunState } from "./types";
import { currentWindow, gatedPendingSeatIds } from "./windows";

const SEAT_IDS = ["p0", "p1", "p2"];

const FORCED_FAILURE = defineItem({
  id: "always-fails",
  name: "Always Fails",
  text: "The camp fails.",
  passive: { modifier: () => ({ goals: () => () => [guard("forced", true)] }) },
});

function act(run: RunState, seatId: string, action: Parameters<typeof applyRunAction>[2], catalog: Catalog): RunState {
  const result = applyRunAction(run, seatId, action, catalog);
  if (!result.ok) throw new Error(`${seatId} ${action.type}: ${result.error}`);
  return result.state;
}

function readyAll(run: RunState, catalog: Catalog): RunState {
  return run.seatIds.reduce((next, seatId) => act(next, seatId, { type: "ready" }, catalog), run);
}

/** A dealt camp whose objectives are all gone, so it reads as cleared. */
function clearedCamp(run: RunState, catalog: Catalog): RunAt<"camp"> {
  const dealt = dealCamp(run as RunAt<"loadout">, catalog);
  return withAttempt(dealt, { ...dealt.stage.attempt, camp: { ...dealt.stage.attempt.camp, objectives: [] } }) as RunAt<"camp">;
}

describe("createRun", () => {
  it("starts in muster with 3 supplies, an empty purse and no plan: no characters, empty kits, no drafts, no ledger", () => {
    const run = createRun({ seatIds: SEAT_IDS, seed: "s" });
    expect(run.stage).toEqual({ tag: "muster", ballots: {} });
    expect(run.supplies).toBe(3);
    expect(run.purse).toBe(0);
    expect(run.plan).toBeNull();
    expect(run.lastVote).toBeNull();
    expect(run.history).toEqual([]);
    expect(run.seats).toEqual(SEAT_IDS.map((seatId) => ({ seatId, characterId: null, kit: [], draftOffer: null, ledger: [] })));
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

describe("muster and the length vote", () => {
  const catalog = testCatalog();
  const crewed = (run: RunState): RunState =>
    act(act(act(run, "p0", { type: "pick-character", characterId: "plain-1" }, catalog), "p1", { type: "pick-character", characterId: "plain-2" }, catalog), "p2", { type: "pick-character", characterId: "plain-3" }, catalog);

  it("waits until every seat has a character and a ballot, then opens camp 1's loadout in the Jungle", () => {
    let run = crewed(createRun({ seatIds: SEAT_IDS, seed: "s" }));
    run = act(run, "p0", { type: "vote", choice: "long" }, catalog);
    run = act(run, "p1", { type: "vote", choice: "long" }, catalog);
    expect(run.stage.tag).toBe("muster");
    run = act(run, "p2", { type: "vote", choice: "short" }, catalog);
    expect(run.plan).toEqual({ length: "long", bosses: [{ at: 3, tier: "animal", modId: null }, { at: 6, tier: "disaster", modId: null }, { at: 8, tier: "temple", modId: null }] });
    expect(run.lastVote).toEqual({ topic: "length", result: { tally: [{ choice: "short", votes: 1 }, { choice: "standard", votes: 0 }, { choice: "long", votes: 2 }], tied: null, winner: "long" } });
    expect(run.stage).toEqual({
      tag: "loadout",
      camp: { index: 1, location: "jungle", weather: "fair", event: null, slots: [{ kind: "win-card" }, { kind: "win-card" }] },
      ready: {},
    });
  });

  it("a ballot changes until the vote resolves", () => {
    let run = act(createRun({ seatIds: SEAT_IDS, seed: "s" }), "p0", { type: "vote", choice: "long" }, catalog);
    run = act(run, "p0", { type: "vote", choice: "short" }, catalog);
    expect(run.stage).toEqual({ tag: "muster", ballots: { p0: "short" } });
  });

  it("the last character pick resolves a vote every seat already cast", () => {
    let run = createRun({ seatIds: SEAT_IDS, seed: "s" });
    for (const seatId of SEAT_IDS) run = act(run, seatId, { type: "vote", choice: "short" }, catalog);
    expect(run.stage.tag).toBe("muster");
    expect(crewed(run).plan?.length).toBe("short");
  });

  it("refuses a length that does not exist as not_a_choice, and ready as wrong_stage", () => {
    const run = createRun({ seatIds: SEAT_IDS, seed: "s" });
    expect(applyRunAction(run, "p0", { type: "vote", choice: "epic" }, catalog)).toEqual({ ok: false, error: "not_a_choice" });
    expect(applyRunAction(run, "p0", { type: "ready" }, catalog)).toEqual({ ok: false, error: "wrong_stage" });
  });

  it("a tie resolves by the seeded flip, recorded with the tied choices", () => {
    const winners = new Set<string>();
    for (let n = 0; n < 40; n++) {
      let run = crewed(createRun({ seatIds: SEAT_IDS, seed: `tie-${n}` }));
      run = act(run, "p0", { type: "vote", choice: "short" }, catalog);
      run = act(run, "p1", { type: "vote", choice: "long" }, catalog);
      run = act(run, "p2", { type: "vote", choice: null }, catalog);
      expect(run.lastVote?.result.tied).toEqual(["short", "long"]);
      winners.add(run.plan!.length);
    }
    expect([...winners].sort()).toEqual(["long", "short"]);
  });

  it("an abstention does not block: two abstain and the third ballot decides", () => {
    let run = crewed(createRun({ seatIds: SEAT_IDS, seed: "s" }));
    run = act(run, "p0", { type: "vote", choice: null }, catalog);
    run = act(run, "p1", { type: "vote", choice: null }, catalog);
    run = act(run, "p2", { type: "vote", choice: "standard" }, catalog);
    expect(run.plan?.length).toBe("standard");
    expect(run.lastVote?.result.tied).toBeNull();
  });
});

describe("dealing a camp", () => {
  it("the last ready deals the loadout's camp at once", () => {
    const catalog = testCatalog();
    const next = readyAll(setupRun({ seatIds: SEAT_IDS, seed: "fixture", catalog }), catalog);
    expect(next.stage.tag).toBe("camp");
    expect(attemptOf(next)!.attemptNumber).toBe(1);
    expect(attemptOf(next)!.camp.hands.map((h) => h.cards.length)).toEqual([18, 18, 18]);
    expect(attemptOf(next)!.camp.objectives).toHaveLength(2);
  });

  it("a second ready by the same seat is already_ready", () => {
    const catalog = testCatalog();
    const once = act(setupRun({ seatIds: SEAT_IDS, seed: "fixture", catalog }), "p0", { type: "ready" }, catalog);
    expect(applyRunAction(once, "p0", { type: "ready" }, catalog)).toEqual({ ok: false, error: "already_ready" });
  });

  it("deals a boss camp like any other, with the ramp's slot count", () => {
    const catalog = testCatalog();
    const next = readyAll(setupRun({ seatIds: SEAT_IDS, seed: "fixture", catalog, camp: 3 }), catalog);
    expect(next.stage.tag).toBe("camp");
    expect(attemptOf(next)!.camp.objectives).toHaveLength(3);
  });
});

describe("settling a failure", () => {
  const catalog = testCatalog({ items: { "always-fails": FORCED_FAILURE } });
  const atCamp3 = (opts: { supplies?: number; kits?: Record<string, readonly string[]>; cat?: Catalog } = {}): RunState =>
    setupRun({ seatIds: SEAT_IDS, seed: "fixture", catalog: opts.cat ?? catalog, camp: 3, supplies: opts.supplies, kits: { p2: ["always-fails"], ...opts.kits } });

  it("costs a supply, records the failure, deals no draft and reopens the loadout for the same spec", () => {
    const kits = { p0: ["item-a"], p1: [] };
    const cat = testCatalog({ items: { "always-fails": FORCED_FAILURE, "item-a": defineItem({ id: "item-a", name: "A", text: "Nothing." }) } });
    const before = atCamp3({ kits, cat });
    const failed = readyAll(before, cat);

    expect(failed.supplies).toBe(2);
    expect(failed.purse).toBe(0);
    expect(failed.history).toEqual([{ camp: 3, attempt: 1, status: "failed", suppliesSpent: 1, coins: 0 }]);
    expect(failed.stage).toEqual({ ...before.stage, ready: {} });
    expect(failed.seats.map((s) => s.draftOffer)).toEqual([null, null, null]);
    expect(failed.seats.map((s) => s.kit)).toEqual([["item-a"], [], ["always-fails"]]);
    expect(nextAttemptNumber(failed, campIndex(3))).toBe(2);
  });

  it("a failure replays the same spec with a fresh deal", () => {
    const first = readyAll(atCamp3({ kits: { p2: [] } }), catalog);
    const firstHands = attemptOf(first)!.camp.hands;
    const failed = settleCamp(first as RunAt<"camp">, "failed", catalog);
    const replay = readyAll(failed, catalog) as RunAt<"camp">;
    expect(replay.stage.camp).toEqual((first as RunAt<"camp">).stage.camp);
    expect(attemptOf(replay)).toMatchObject({ attemptNumber: 2, effects: [], reveals: [], log: [] });
    expect(attemptOf(replay)!.camp.hands).not.toEqual(firstHands);
  });

  it("a passive item adding 1 to failureCost, held by two seats, makes a failure cost 3", () => {
    const tonic = defineItem({
      id: "energy-tonic",
      name: "Energy Tonic",
      text: "Failures cost more.",
      passive: { modifier: () => ({ failureCost: (prev) => (run) => prev(run) + 1 }) },
    });
    const cat = testCatalog({ items: { "always-fails": FORCED_FAILURE, "energy-tonic": tonic } });
    const failed = readyAll(atCamp3({ kits: { p0: ["energy-tonic"], p1: ["energy-tonic"] }, cat }), cat);
    expect(failed.history[0]!.suppliesSpent).toBe(3);
    expect(failed.supplies).toBe(0);
    expect(failed.stage).toEqual({ tag: "ended", result: "lost" });
  });

  it("throws if a failure's composed cost is not an integer >= 1 (POLICY A3)", () => {
    const zero = defineItem({
      id: "zero",
      name: "Zero",
      text: "Failures are free.",
      passive: { modifier: () => ({ goals: () => () => [guard("forced", true)], failureCost: () => () => 0 }) },
    });
    const cat = testCatalog({ items: { zero } });
    expect(() => readyAll(setupRun({ seatIds: SEAT_IDS, seed: "fixture", catalog: cat, kits: { p0: ["zero"] } }), cat)).toThrow();
  });

  it("supplies at 0 end the run lost, and every later action is run_over", () => {
    const lost = readyAll(atCamp3({ supplies: 1 }), catalog);
    expect(lost.supplies).toBe(0);
    expect(runStatus(lost)).toBe("lost");
    expect(lost.stage).toEqual({ tag: "ended", result: "lost" });
    expect(applyRunAction(lost, "p0", { type: "ready" }, catalog)).toEqual({ ok: false, error: "run_over" });
  });

  it("seats and ledgers persist across a replay (RUN-06)", () => {
    const failed = readyAll(atCamp3(), catalog);
    const ledger = [{ kind: "used" as const, sourceId: "plain-1", at: { camp: campIndex(3), attempt: 1, trick: 0 }, poolCost: 0 }];
    const seats = failed.seats.map((s) => (s.seatId === "p0" ? { ...s, ledger } : s));
    const second = readyAll({ ...failed, seats }, catalog);
    expect(second.history.map((h) => h.attempt)).toEqual([1, 2]);
    expect(second.seats).toEqual(seats);
  });
});

describe("settling a clear", () => {
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

  it("a clear pays 5 + min(3, unplayed tricks) into the purse", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "fixture", catalog });
    const fresh = clearedCamp(run, catalog);
    expect(settleCamp(fresh, "cleared", catalog).purse).toBe(8);

    const withUnplayed = (n: number): RunAt<"camp"> =>
      withAttempt(fresh, { ...fresh.stage.attempt, camp: { ...fresh.stage.attempt.camp, totalTricks: n } }) as RunAt<"camp">;
    const settled = settleCamp({ ...withUnplayed(1), purse: 4 }, "cleared", catalog);
    expect(settled.purse).toBe(10);
    expect(settled.history).toEqual([{ camp: 1, attempt: 1, status: "cleared", suppliesSpent: 0, coins: 6 }]);
    expect(settleCamp(withUnplayed(0), "cleared", catalog).purse).toBe(5);
  });

  it("opens the draft and deals every seat a fresh offer: its own unowned upgrade first, no owned source", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "fixture", catalog, kits: { p0: ["item-a"] } });
    const settled = settleCamp(clearedCamp(run, catalog), "cleared", catalog);
    expect(settled.stage).toEqual({ tag: "draft", cleared: 1, payout: 8 });
    expect(settled.history).toEqual([{ camp: 1, attempt: 1, status: "cleared", suppliesSpent: 0, coins: 8 }]);
    for (const seat of settled.seats) {
      expect(seat.draftOffer).toHaveLength(3);
      expect(seat.draftOffer![0]!.startsWith(`${seat.characterId}.`)).toBe(true);
    }
    expect(settled.seats[0]!.draftOffer).not.toContain("item-a");
  });

  it("appends a pool `regained` ledger entry for a pooled character, stamped at the clear, tuned by its upgrades", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "fixture", catalog, characters: { p0: "pooled", p1: "plain-1", p2: "plain-2" }, kits: { p0: ["pooled.rich"] } });
    const settled = settleCamp(clearedCamp(run, catalog), "cleared", catalog);
    expect(settled.seats[0]!.ledger).toEqual([{ kind: "regained", amount: 2, at: { camp: 1, attempt: 1, trick: 0 } }]);
    expect(settled.seats[1]!.ledger).toEqual([]);
    expect(settled.seats[2]!.ledger).toEqual([]);
  });

  it("regains the base amount without the upgrade", () => {
    const run = setupRun({ seatIds: SEAT_IDS, seed: "fixture", catalog, characters: { p0: "pooled" } });
    const settled = settleCamp(clearedCamp(run, catalog), "cleared", catalog);
    expect(settled.seats[0]!.ledger).toEqual([{ kind: "regained", amount: 1, at: { camp: 1, attempt: 1, trick: 0 } }]);
  });

  it("clearing the final camp wins: camp 4 of a short run, camp 8 of a long one", () => {
    const short = settleCamp(clearedCamp(setupRun({ seatIds: SEAT_IDS, seed: "fixture", catalog, length: "short", camp: 4 }), catalog), "cleared", catalog);
    expect(short.stage).toEqual({ tag: "ended", result: "won" });
    expect(runStatus(short)).toBe("won");
    const long = settleCamp(clearedCamp(setupRun({ seatIds: SEAT_IDS, seed: "fixture", catalog, length: "long", camp: 6 }), catalog), "cleared", catalog);
    expect(long.stage.tag).toBe("draft");
  });
});

describe("between camps: draft, route vote and event", () => {
  const catalog = testCatalog({
    items: { "item-a": defineItem({ id: "item-a", name: "A", text: "Nothing." }), "item-b": defineItem({ id: "item-b", name: "B", text: "Nothing." }) },
  });
  const drafting = (camp = 1, seed = "between") => settleCamp(clearedCamp(setupRun({ seatIds: SEAT_IDS, seed, catalog, camp }), catalog), "cleared", catalog);
  const drafted = (run: RunState): RunState => run.seats.reduce((next, seat) => act(next, seat.seatId, { type: "pick-draft", sourceId: seat.draftOffer![0]! }, catalog), run);

  it("the last draft pick opens the route vote over 2 or 3 options to the next camp", () => {
    const run = drafted(drafting());
    expect(run.stage.tag).toBe("route");
    if (run.stage.tag !== "route") return;
    expect(run.stage.from).toBe(1);
    expect(run.stage.ballots).toEqual({});
    expect([2, 3]).toContain(run.stage.options.length);
    expect(run.stage.options[0]).toEqual({ id: "a", next: { index: 2, location: "jungle", weather: "fair", event: "event", slots: [{ kind: "win-card" }, { kind: "win-card" }, { kind: "win-card" }] } });
  });

  it("the last route ballot opens the chosen route's event, and the last ready opens its loadout", () => {
    let run = drafted(drafting());
    if (run.stage.tag !== "route") throw new Error("expected the route vote");
    const second = run.stage.options[1]!;
    run = act(run, "p0", { type: "vote", choice: "b" }, catalog);
    run = act(run, "p1", { type: "vote", choice: "b" }, catalog);
    run = act(run, "p2", { type: "vote", choice: "a" }, catalog);
    expect(run.stage).toEqual({ tag: "event", route: second, ready: {} });
    expect(run.lastVote).toEqual({ topic: "route", result: { tally: expect.arrayContaining([{ choice: "a", votes: 1 }, { choice: "b", votes: 2 }]), tied: null, winner: "b" } });
    expect(applyRunAction(run, "p0", { type: "vote", choice: "a" }, catalog)).toEqual({ ok: false, error: "wrong_stage" });
    run = readyAll(run, catalog);
    expect(run.stage).toEqual({ tag: "loadout", camp: second.next, ready: {} });
  });

  it("a route vote naming no option is not_a_choice", () => {
    const run = drafted(drafting());
    expect(applyRunAction(run, "p0", { type: "vote", choice: "z" }, catalog)).toEqual({ ok: false, error: "not_a_choice" });
  });

  it("from camp 4 the options draw ordered pairs and trick-count slots", () => {
    const kinds = new Set<string>();
    for (let n = 0; n < 30; n++) {
      const run = drafted(drafting(3, `mix-${n}`));
      if (run.stage.tag !== "route") throw new Error("expected the route vote");
      for (const option of run.stage.options) {
        expect(option.next.index).toBe(4);
        expect(option.next.slots).toHaveLength(4);
        for (const slot of option.next.slots) kinds.add(slot.kind);
      }
    }
    expect([...kinds].sort()).toEqual(["ordered", "trick-count", "win-card"]);
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
    const attempt = attemptOf(run)!;
    const objectives = attempt.camp.seatIds.map((seatId) => ({ id: `duck-${seatId}`, kind: "no-tricks" as const, ownerSeatId: seatId }));
    return withAttempt(run, { ...attempt, camp: { ...attempt.camp, objectives } });
  }

  function playCard(run: RunState): RunState {
    const camp = attemptOf(run)!.camp;
    const rules = rulesFor(run, catalog);
    const actor = currentActorSeatId(camp, rules)!;
    const played = applyRunAction(run, actor, { type: "play-card", cardId: rules.legalPlays(camp, actor)[0]!.id }, catalog);
    if (!played.ok) throw new Error(played.error);
    return played.state;
  }

  function playTrick(run: RunState): RunState {
    return run.seatIds.reduce((next) => playCard(next), run);
  }

  const use = (run: RunState, seatId: string, action: Parameters<typeof applyRunAction>[2]): RunState => act(run, seatId, action, catalog);

  it("a rescue holder pauses settle", () => {
    const paused = playTrick(everyoneDucks({ p0: ["test-rope"] }));
    expect(paused.stage.tag).toBe("camp");
    expect(currentWindow(paused, rulesFor(paused, catalog))).toBe("rescue");
    expect(gatedPendingSeatIds(paused, catalog)).toEqual(["p0"]);
    expect(paused.history).toEqual([]);
    expect(paused.supplies).toBe(3);
    expect(applyRunAction(paused, "p1", { type: "skip-window" }, catalog)).toEqual({ ok: false, error: "nothing_to_skip" });
    const winner = attemptOf(paused)!.camp.completedTricks[0]!.winnerSeatId;
    expect(applyRunAction(paused, winner, { type: "whisper", targetSeatId: winner === "p0" ? "p1" : "p0", cardId: "x" }, catalog)).toEqual({
      ok: false,
      error: "wrong_window",
    });
  });

  it("a pass settles the camp as failed", () => {
    const paused = playTrick(everyoneDucks({ p0: ["test-rope"] }));
    const winner = attemptOf(paused)!.camp.completedTricks[0]!.winnerSeatId;
    const passed = use(paused, "p0", { type: "skip-window" });
    expect(passed.stage.tag).toBe("loadout");
    expect(passed.supplies).toBe(2);
    expect(passed.history).toEqual([{ camp: 1, attempt: 1, status: "failed", suppliesSpent: 1, coins: 0 }]);
    expect(passed.seats[0]!.ledger).toEqual([{ kind: "passed", sourceId: "test-rope", at: { camp: 1, attempt: 1, trick: 1 }, failedObjectiveIds: [`duck-${winner}`] }]);
  });

  it("a rescue that clears every failure resumes play and spends a single-use item", () => {
    const paused = playTrick(everyoneDucks({ p0: ["test-rope"] }));
    const winner = attemptOf(paused)!.camp.completedTricks[0]!.winnerSeatId;
    const rescued = use(paused, "p0", { type: "use-ability", sourceId: "test-rope", targets: [`objective:duck-${winner}`] });
    const camp = attemptOf(rescued)!.camp;
    expect(camp.objectives.map((o) => o.id)).toEqual(SEAT_IDS.filter((id) => id !== winner).map((id) => `duck-${id}`));
    expect(campPhase(camp, rulesFor(rescued, catalog))).toBe("playing");
    expect(currentWindow(rescued, rulesFor(rescued, catalog))).toBe("between-tricks");
    expect(rescued.history).toEqual([]);
    expect(rescued.seats[0]!.kit).toEqual([]);
    expect(attemptOf(playCard(rescued))!.camp.currentTrick.plays).toHaveLength(1);
  });

  it("with no rescue holder the camp fails at once", () => {
    const failed = playTrick(everyoneDucks({}));
    expect(failed.stage.tag).toBe("loadout");
    expect(failed.supplies).toBe(2);
    expect(failed.history).toEqual([{ camp: 1, attempt: 1, status: "failed", suppliesSpent: 1, coins: 0 }]);
  });

  it("a pass is stamped with its trick, so a later failure at another trick reopens rescue for that seat", () => {
    const paused = playTrick(everyoneDucks({ p0: ["test-lasso"], p1: ["test-rope"] }, "reopen-seed"));
    expect(gatedPendingSeatIds(paused, catalog)).toEqual(["p0", "p1"]);
    const firstWinner = attemptOf(paused)!.camp.completedTricks[0]!.winnerSeatId;

    const afterPass = use(paused, "p0", { type: "skip-window" });
    expect(afterPass.seats[0]!.ledger).toEqual([{ kind: "passed", sourceId: "test-lasso", at: { camp: 1, attempt: 1, trick: 1 }, failedObjectiveIds: [`duck-${firstWinner}`] }]);
    expect(gatedPendingSeatIds(afterPass, catalog)).toEqual(["p1"]);
    expect(afterPass.stage.tag).toBe("camp");

    const rescued = use(afterPass, "p1", { type: "use-ability", sourceId: "test-rope", targets: [`objective:duck-${firstWinner}`] });
    const second = playTrick(rescued);
    expect(attemptOf(second)!.camp.completedTricks).toHaveLength(2);
    expect(currentWindow(second, rulesFor(second, catalog))).toBe("rescue");
    expect(gatedPendingSeatIds(second, catalog)).toEqual(["p0"]);
    expect(second.seats[0]!.ledger).toHaveLength(1);
  });

  it("a pass covers only the failures it saw, so a new failure at the same trick reopens rescue", () => {
    const paused = playTrick(everyoneDucks({ p0: ["test-lasso"], p1: ["test-rope"], p2: ["test-shove"] }, "reopen-seed"));
    const firstWinner = attemptOf(paused)!.camp.completedTricks[0]!.winnerSeatId;
    const afterPass = use(paused, "p0", { type: "skip-window" });
    const rescued = use(afterPass, "p1", { type: "use-ability", sourceId: "test-rope", targets: [`objective:duck-${firstWinner}`] });
    expect(currentWindow(rescued, rulesFor(rescued, catalog))).toBe("between-tricks");

    const blamed = SEAT_IDS.find((id) => id !== firstWinner)!;
    const shoved = use(rescued, "p2", { type: "use-ability", sourceId: "test-shove", targets: [`seat:${blamed}`] });
    expect(attemptOf(shoved)!.camp.completedTricks).toHaveLength(1);
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
        trickWinner: (prev) => (plays, led) => {
          const eligible = plays.filter((play) => play.seatId !== effect.seatId);
          return eligible.length === 0 || eligible.length === plays.length ? prev(plays, led) : prev(eligible, led);
        },
      }),
    }),
  });
  const catalog = testCatalog({ items: { "test-duck": duck } });

  it("opens once the leader plays and admits only the seat whose turn it is", () => {
    const kits = { p0: ["test-duck"], p1: ["test-duck"], p2: ["test-duck"] };
    const start = advanceTo(setupRun({ seatIds: SEAT_IDS, seed: "in-trick-seed", catalog, kits }), "between-tricks", catalog);
    const leader = attemptOf(start)!.camp.currentTrick.leaderSeatId;
    const useAs = (seatId: string) => ({ type: "use-ability" as const, sourceId: "test-duck", targets: [`seat:${seatId}`] });
    expect(applyRunAction(start, leader, useAs(leader), catalog)).toEqual({ ok: false, error: "wrong_window" });

    const rules = rulesFor(start, catalog);
    const led = applyRunAction(start, leader, { type: "play-card", cardId: rules.legalPlays(attemptOf(start)!.camp, leader)[0]!.id }, catalog);
    if (!led.ok) throw new Error(led.error);
    const ledRules = rulesFor(led.state, catalog);
    const next = currentActorSeatId(attemptOf(led.state)!.camp, ledRules)!;
    const later = SEAT_IDS.find((id) => id !== leader && id !== next)!;
    expect(currentWindow(led.state, ledRules)).toBe("in-trick");
    expect(applyRunAction(led.state, leader, useAs(leader), catalog)).toEqual({ ok: false, error: "wrong_window" });
    expect(applyRunAction(led.state, later, useAs(later), catalog)).toEqual({ ok: false, error: "wrong_window" });
    expect(applyRunAction(led.state, next, useAs(next), catalog).ok).toBe(true);
  });
});
