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
import { createRun } from "../run/lifecycle";
import { CATALOG } from "../run/catalog";
import { advanceTo, driveRun, setupRun } from "../run/run-test-support";
import type { RunAction, RunState } from "../run/types";

const SEED = "cccccccccccccccccccccccccccccccc";

function fixtures(): Record<string, RunState> {
  const fresh = createRun({ seatIds: ["p0", "p1", "p2"], seed: SEED });
  const rescue = failedFirstTrick(
    advanceTo(setupRun({ seatIds: ["p0", "p1", "p2"], seed: SEED, catalog: CATALOG, campNumber: 3, kits: { p0: ["rope-ladder"] } }), "between-tricks", CATALOG),
  );
  const objectivePick = advanceTo(
    setupRun({ seatIds: ["p0", "p1", "p2"], seed: SEED, catalog: CATALOG, campNumber: 2 }),
    "objective-pick",
    CATALOG,
  );
  const betweenTricks = advanceTo(
    setupRun({ seatIds: ["p0", "p1", "p2"], seed: SEED, catalog: CATALOG, campNumber: 2 }),
    "between-tricks",
    CATALOG,
  );
  return { fresh, rescue, objectivePick, betweenTricks };
}

/** Gives every seat a no-tricks objective and plays one trick, so its winner's
 * objective fails and the rescue window opens. */
function failedFirstTrick(run: RunState): RunState {
  const camp = run.attempt!.camp;
  const objectives = camp.seatIds.map((seatId) => ({ id: `duck-${seatId}`, kind: "no-tricks" as const, ownerSeatId: seatId }));
  let next: RunState = { ...run, attempt: { ...run.attempt!, camp: { ...camp, objectives } } };
  for (let i = 0; i < run.seatIds.length; i++) {
    const rules = rulesFor(next, CATALOG);
    const actor = currentActorSeatId(next.attempt!.camp, rules)!;
    const played = expeditionGame.applyAction(next, actor, { type: "play-card", cardId: rules.legalPlays(next.attempt!.camp, actor)[0]!.id });
    if (!played.ok) throw new Error(played.error);
    next = played.state;
  }
  return next;
}

const WELL_SHAPED_NONSENSE_ARB = fc.oneof(
  fc.record({ type: fc.constant("pick-character" as const), characterId: fc.string() }),
  fc.record({ type: fc.constant("pick-draft" as const), sourceId: fc.string() }),
  fc.record({ type: fc.constant("ready" as const) }),
  fc.record({
    type: fc.constant("use-ability" as const),
    sourceId: fc.string(),
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
  it("picking a character then readying from every seat is accepted and starts an attempt", () => {
    let state = createRun({ seatIds: ["p0", "p1", "p2"], seed: SEED });
    expect(state.attempt).toBeNull();
    const characterIds = Object.keys(CATALOG.characters);
    state.seatIds.forEach((seatId, i) => {
      const result = expeditionGame.applyAction(state, seatId, { type: "pick-character", characterId: characterIds[i] });
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state;
    });
    expect(state.seats.map((s) => s.characterId)).toEqual(characterIds.slice(0, 3));
    for (const seatId of state.seatIds) {
      const snapshotBefore = structuredClone(state);
      const result = expeditionGame.applyAction(state, seatId, { type: "ready" });
      expect(result.ok).toBe(true);
      expect(state).toEqual(snapshotBefore);
      if (result.ok) state = result.state;
    }
    expect(state.attempt).not.toBeNull();
  });

  it("readying before a character is picked is rejected with character_pending", () => {
    const state = createRun({ seatIds: ["p0", "p1", "p2"], seed: SEED });
    expect(expeditionGame.applyAction(state, "p0", { type: "ready" })).toEqual({ ok: false, error: "character_pending" });
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

  it("is a request the game accepts, which moves the window on", () => {
    const { rescue } = fixtures();
    const passed = expeditionGame.applyAction(rescue!, "p0", expeditionGame.autoPassRequest!(rescue!, "p0"));
    if (!passed.ok) throw new Error(passed.error);
    expect(passed.state.attempt).toBeNull();
    expect(passed.state.history).toEqual([{ campNumber: 3, attemptNumber: 1, status: "failed", suppliesSpent: 1 }]);
    expect(expeditionGame.autoPassRequest!(passed.state, "p0")).toBeNull();
  });
});

describe("expeditionGame: checkGameEnd", () => {
  it("returns null for a fresh run", () => {
    const state = createRun({ seatIds: ["p0", "p1", "p2"], seed: SEED });
    expect(expeditionGame.checkGameEnd(state)).toBeNull();
  });

  it("returns a lost result once supplies reach 0", () => {
    const state = setupRun({ seatIds: ["p0", "p1", "p2"], seed: SEED, catalog: CATALOG, supplies: 0 });
    expect(expeditionGame.checkGameEnd(state)).toEqual({
      outcome: "lost",
      campReached: state.campNumber,
      suppliesLeft: 0,
    });
  });

  it("returns a won result once history ends with camp 6 succeeded", () => {
    const base = setupRun({ seatIds: ["p0", "p1", "p2"], seed: SEED, catalog: CATALOG, campNumber: 6 });
    const state: RunState = {
      ...base,
      history: [...base.history, { campNumber: 6, attemptNumber: 1, status: "succeeded", suppliesSpent: 0 }],
    };
    expect(expeditionGame.checkGameEnd(state)).toEqual({
      outcome: "won",
      campReached: 6,
      suppliesLeft: state.supplies,
    });
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
      const initial = setupRun({ seatIds, seed, catalog: CATALOG });
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
