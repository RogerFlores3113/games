// Tests for expeditionGame (Phase 11, Plan 03, COMM-03/ENG-03). Never
// imports adapter.test.ts's own describeAdapterConformance suite directly —
// that would re-register Hanabi's own conformance tests; this file writes an
// independent Expedition-shaped suite instead, mirroring its shape.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { expeditionGame } from "./adapter";
import { toExpeditionPlayerView } from "./view";
import { currentActorSeatId } from "../camp";
import { rulesFor } from "../run/compose";
import { attemptOf, withAttempt } from "../run/attempt";
import { createRun } from "../run/lifecycle";
import { campIndex } from "../run/plan";
import { CATALOG } from "../run/catalog";
import { advanceTo, driveRun, setupRun } from "../run/run-test-support";
import type { RunAction, RunState } from "../run/types";

const SEED = "cccccccccccccccccccccccccccccccc";

function fixtures(supplies?: number): Record<string, RunState> {
  const fresh = createRun({ seatIds: ["p0", "p1", "p2"], seed: SEED });
  const rescue = failedFirstTrick(
    advanceTo(setupRun({ seatIds: ["p0", "p1", "p2"], seed: SEED, catalog: CATALOG, camp: 3, supplies, items: { p0: ["rope-ladder"] } }), "between-tricks", CATALOG),
  );
  const objectivePick = advanceTo(
    setupRun({ seatIds: ["p0", "p1", "p2"], seed: SEED, catalog: CATALOG, camp: 2 }),
    "objective-pick",
    CATALOG,
  );
  const betweenTricks = advanceTo(
    setupRun({ seatIds: ["p0", "p1", "p2"], seed: SEED, catalog: CATALOG, camp: 2 }),
    "between-tricks",
    CATALOG,
  );
  const shop = setupRun({ seatIds: ["p0", "p1", "p2"], seed: SEED, catalog: CATALOG, camp: 3, purse: 9, items: { p0: ["bait", "parrot", "whetstone"] } });
  const draftBase = setupRun({ seatIds: ["p0", "p1", "p2"], seed: SEED, catalog: CATALOG, camp: 2 });
  const draft: RunState = {
    ...draftBase,
    seats: draftBase.seats.map((seat) => ({ ...seat, offers: [{ kind: "standard", bundles: [["bait", "parrot"], ["whetstone"]] }] })),
    stage: { tag: "draft", cleared: campIndex(2), payout: 5 },
  };
  return { fresh, rescue, objectivePick, betweenTricks, shop, draft };
}

/** Gives every seat a no-tricks objective and plays one trick, so its winner's
 * objective fails and the rescue window opens. */
function failedFirstTrick(run: RunState): RunState {
  const camp = attemptOf(run)!.camp;
  const objectives = camp.seatIds.map((seatId) => ({ id: `duck-${seatId}`, kind: "no-tricks" as const, ownerSeatId: seatId }));
  let next = withAttempt(run, { ...attemptOf(run)!, camp: { ...camp, objectives } });
  for (let i = 0; i < run.seatIds.length; i++) {
    const rules = rulesFor(next, CATALOG);
    const actor = currentActorSeatId(attemptOf(next)!.camp, rules)!;
    const played = expeditionGame.applyAction(next, actor, { type: "play-card", cardId: rules.legalPlays(attemptOf(next)!.camp, actor)[0]!.id });
    if (!played.ok) throw new Error(played.error);
    next = played.state;
  }
  return next;
}

const WELL_SHAPED_NONSENSE_ARB = fc.oneof(
  fc.record({ type: fc.constant("pick-character" as const), characterId: fc.string() }),
  fc.record({ type: fc.constant("vote" as const), choice: fc.option(fc.string(), { nil: null }) }),
  fc.record({ type: fc.constant("equip" as const), itemUids: fc.array(fc.oneof(fc.string(), fc.constantFrom("it0", "it1", "it2")), { maxLength: 5 }) }),
  fc.record({ type: fc.constant("buy" as const), stockId: fc.oneof(fc.string(), fc.constantFrom("supplies", "item0", "upgrade:explorer.second-wind", "upgrade:")) }),
  fc.record({ type: fc.constant("pick-bundle" as const), bundle: fc.integer({ min: 0, max: 5 }) }),
  fc.record({ type: fc.constant("ready" as const) }),
  fc.record({
    type: fc.constant("use-ability" as const),
    sourceKey: fc.oneof(fc.string(), fc.constantFrom("it0", "explorer", "rope-ladder")),
    targets: fc.array(fc.string(), { maxLength: 5 }),
  }),
  fc.record({ type: fc.constant("skip-window" as const) }),
  fc.record({ type: fc.constant("whisper" as const), targetSeatId: fc.string(), cardId: fc.string() }),
  fc.record({ type: fc.constant("pick-objective" as const), objectiveId: fc.string() }),
  fc.record({ type: fc.constant("play-card" as const), cardId: fc.string() }),
);

const HOSTILE_ARB = fc.oneof(fc.jsonValue(), WELL_SHAPED_NONSENSE_ARB);

function assertHostileSafety(state: RunState, actorSeatId: string): void {
  fc.assert(
    fc.property(HOSTILE_ARB, (payload) => {
      const before = JSON.stringify(state);
      let result: ReturnType<typeof expeditionGame.applyAction>;
      expect(() => {
        result = expeditionGame.applyAction(state, actorSeatId, payload);
      }).not.toThrow();
      expect(result!.ok === true || result!.ok === false).toBe(true);
      // Whatever the outcome, the INPUT state argument itself must never be
      // mutated by the call (invariant #1) — re-serializing it after the
      // call must match the pre-call snapshot exactly.
      expect(JSON.stringify(state)).toBe(before);
    }),
    { numRuns: 30 },
  );
}

describe("expeditionGame: identity and createInitialState", () => {
  it("id is 'expedition'", () => {
    expect(expeditionGame.id).toBe("expedition");
  });

  it("createInitialState deep-equals createRun and is deterministic", () => {
    const input = { seatIds: ["p0", "p1", "p2"], config: null, seed: SEED };
    const a = expeditionGame.createInitialState(input);
    const b = expeditionGame.createInitialState(input);
    expect(a).toEqual(createRun({ seatIds: input.seatIds, seed: input.seed }));
    expect(a).toEqual(b);
  });
});

describe("expeditionGame: applyAction accepts valid actions and never mutates state", () => {
  it("picking characters and voting a length from every seat is accepted and opens the first camp's loadout", () => {
    let state = createRun({ seatIds: ["p0", "p1", "p2"], seed: SEED });
    expect(state.stage).toEqual({ tag: "muster", ballots: {} });
    const characterIds = Object.keys(CATALOG.characters);
    state.seatIds.forEach((seatId, i) => {
      const result = expeditionGame.applyAction(state, seatId, { type: "pick-character", characterId: characterIds[i] });
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state;
    });
    expect(state.seats.map((s) => s.characterId)).toEqual(characterIds.slice(0, 3));
    for (const seatId of state.seatIds) {
      const snapshotBefore = structuredClone(state);
      const result = expeditionGame.applyAction(state, seatId, { type: "vote", choice: "short" });
      expect(result.ok).toBe(true);
      expect(state).toEqual(snapshotBefore);
      if (result.ok) state = result.state;
    }
    expect(state.stage.tag).toBe("loadout");
    expect(state.plan?.length).toBe("short");
  });

  it("readying at muster is rejected with wrong_stage", () => {
    const state = createRun({ seatIds: ["p0", "p1", "p2"], seed: SEED });
    expect(expeditionGame.applyAction(state, "p0", { type: "ready" })).toEqual({ ok: false, error: "wrong_stage" });
  });

  it("a vote for a length that does not exist is rejected with not_a_choice", () => {
    const state = createRun({ seatIds: ["p0", "p1", "p2"], seed: SEED });
    expect(expeditionGame.applyAction(state, "p0", { type: "vote", choice: "epic" })).toEqual({ ok: false, error: "not_a_choice" });
  });

  it("a removed action shape is rejected as invalid_action", () => {
    const state = createRun({ seatIds: ["p0", "p1", "p2"], seed: SEED });
    expect(expeditionGame.applyAction(state, "p0", { type: "set-loadout", gearIds: [] })).toEqual({ ok: false, error: "invalid_action" });
    expect(expeditionGame.applyAction(state, "p0", { type: "pick-draft", gearId: "x" })).toEqual({ ok: false, error: "invalid_action" });
  });

  it("a non-seat actor gets not_a_seat for a well-formed ready", () => {
    const state = createRun({ seatIds: ["p0", "p1", "p2"], seed: SEED });
    const before = structuredClone(state);
    const result = expeditionGame.applyAction(state, "intruder", { type: "ready" });
    expect(result).toEqual({ ok: false, error: "not_a_seat" });
    expect(state).toEqual(before);
  });
});

describe("expeditionGame: hostile-input safety across every run phase", () => {
  const fixtureEntries = Object.entries(fixtures());

  for (const [name, state] of fixtureEntries) {
    it(`never throws and never mutates state at "${name}"`, () => {
      assertHostileSafety(state, state.seatIds[0]!);
    });
  }
});

describe("expeditionGame: toPlayerView", () => {
  it("delegates to toExpeditionPlayerView for every seat and an unseated id, never returning state itself", () => {
    const state = createRun({ seatIds: ["p0", "p1", "p2"], seed: SEED });
    for (const seatId of [...state.seatIds, "unseated-viewer"]) {
      const view = expeditionGame.toPlayerView(state, seatId);
      expect(view).toEqual(toExpeditionPlayerView(state, seatId, CATALOG));
      expect(view).not.toBe(state);
    }
  });
});

describe("expeditionGame: autoPassRequest", () => {
  it("names skip-window for a seat a gated window waits on, and null for anyone else", () => {
    const { rescue, betweenTricks } = fixtures();
    expect(expeditionGame.autoPassRequest!(rescue!, "p0")).toEqual({ type: "skip-window" });
    expect(expeditionGame.autoPassRequest!(rescue!, "p1")).toBeNull();
    expect(expeditionGame.autoPassRequest!(betweenTricks!, "p0")).toBeNull();
  });

  it("names an abstention for a seat that has not voted at muster, and null once it has", () => {
    const fresh = createRun({ seatIds: ["p0", "p1", "p2"], seed: SEED });
    const voted = expeditionGame.applyAction(fresh, "p1", { type: "vote", choice: "long" });
    if (!voted.ok) throw new Error(voted.error);
    expect(expeditionGame.autoPassRequest!(voted.state, "p0")).toEqual({ type: "vote", choice: null });
    expect(expeditionGame.autoPassRequest!(voted.state, "p1")).toBeNull();
  });

  it("names an abstention for a seat that has not voted on a route", () => {
    const base = setupRun({ seatIds: ["p0", "p1", "p2"], seed: SEED, catalog: CATALOG, camp: 2 });
    const spec = base.stage.tag === "loadout" ? base.stage.camp : null;
    const route: RunState = { ...base, stage: { tag: "route", from: campIndex(1), options: [{ id: "a", next: spec!, reroll: 0, swapBoss: null }, { id: "b", next: spec!, reroll: 0, swapBoss: null }], ballots: { p2: "b" } } };
    expect(expeditionGame.autoPassRequest!(route, "p0")).toEqual({ type: "vote", choice: null });
    expect(expeditionGame.autoPassRequest!(route, "p2")).toBeNull();
  });

  it("is a request the game accepts, which moves the window on", () => {
    const { rescue } = fixtures();
    const passed = expeditionGame.applyAction(rescue!, "p0", expeditionGame.autoPassRequest!(rescue!, "p0"));
    if (!passed.ok) throw new Error(passed.error);
    expect(passed.state.stage.tag).toBe("loadout");
    expect(passed.state.history).toEqual([{ camp: 3, attempt: 1, status: "failed", suppliesSpent: 1, coins: 0 }]);
    expect(expeditionGame.autoPassRequest!(passed.state, "p0")).toBeNull();
  });
});

describe("expeditionGame: checkGameEnd", () => {
  it("returns null for a fresh run", () => {
    const state = createRun({ seatIds: ["p0", "p1", "p2"], seed: SEED });
    expect(expeditionGame.checkGameEnd(state)).toBeNull();
  });

  it("returns a lost result once a failure spends the last supply", () => {
    const { rescue } = fixtures(1);
    const passed = expeditionGame.applyAction(rescue!, "p0", { type: "skip-window" });
    if (!passed.ok) throw new Error(passed.error);
    expect(expeditionGame.checkGameEnd(passed.state)).toEqual({ outcome: "lost", campReached: 3, suppliesLeft: 0 });
  });

  it("returns a won result once the final camp is cleared", () => {
    const base = setupRun({ seatIds: ["p0", "p1", "p2"], seed: SEED, catalog: CATALOG, camp: 6 });
    const state: RunState = {
      ...base,
      history: [{ camp: campIndex(6), attempt: 1, status: "cleared", suppliesSpent: 0, coins: 5 }],
      stage: { tag: "ended", result: "won" },
    };
    expect(expeditionGame.checkGameEnd(state)).toEqual({ outcome: "won", campReached: 6, suppliesLeft: 3 });
  });
});

describe("expeditionGame: whole-run replay through applyAction", () => {
  const cases: Array<{ seatIds: string[]; seed: string }> = [
    { seatIds: ["p0", "p1", "p2"], seed: "dddddddddddddddddddddddddddddddd" },
    { seatIds: ["p0", "p1", "p2", "p3"], seed: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" },
    { seatIds: ["p0", "p1", "p2", "p3", "p4"], seed: "ffffffffffffffffffffffffffffffff" },
  ];

  for (const { seatIds, seed } of cases) {
    it(`drives a whole ${seatIds.length}-seat run to a non-null end result`, () => {
      const initial = createRun({ seatIds, seed });
      const choices = Array.from({ length: 500 }, (_, i) => i);
      const { log } = driveRun(initial, choices, CATALOG);

      let state = initial;
      for (const { seatId, action } of log) {
        const result = expeditionGame.applyAction(state, seatId, action as RunAction);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(`replay rejected: ${result.error}`);
        state = result.state;
      }

      const ended = expeditionGame.checkGameEnd(state);
      expect(ended).not.toBeNull();
      expect(ended!.outcome === "won" || ended!.outcome === "lost").toBe(true);
    });
  }
});
