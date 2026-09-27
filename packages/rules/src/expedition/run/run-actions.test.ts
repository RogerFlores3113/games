// Tests for run/run-actions.ts (Plan 10-07: the single applyRunAction
// dispatcher). Fake GearDef catalogs are declared inline (sizes 1/2/3, one
// pre-deal gear, one passive +2-capacity gear); real gear/bosses arrive in
// wave 5. CampState fixtures for the delegation tests are hand-built literals
// (matching Phase 9's actions.test.ts convention) rather than driven through
// createCamp, so a single play can be forced to decide the camp deterministically.

import { describe, expect, it } from "vitest";
import { createRun, runPhase, runStatus } from "./lifecycle";
import { applyRunAction } from "./run-actions";
import type { Catalog, RunState, SeatRun } from "./types";
import type { GearDef } from "../gear/gear-def";
import type { CampState } from "../state";

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

function testCatalog(): Catalog {
  const gear: Record<string, GearDef> = {
    gear1: fakeGear({ id: "gear1", size: 1 }),
    gear2: fakeGear({ id: "gear2", size: 2 }),
    gear3: fakeGear({ id: "gear3", size: 3 }),
    predeal: fakeGear({
      id: "predeal",
      size: 1,
      window: "pre-deal",
      apply: () => [],
    }),
    tonic: fakeGear({
      id: "tonic",
      size: 0,
      window: "passive",
      passiveModifier(ownerSeatId) {
        return {
          capacity: (prev) => (run, seatId) => (seatId === ownerSeatId ? prev(run, seatId) + 2 : prev(run, seatId)),
        };
      },
    }),
  };
  return { gear, bosses: {} };
}

const SEAT_IDS = ["p0", "p1", "p2"];

function freshRun(catalog: Catalog = testCatalog(), seed = "fixture"): RunState {
  return createRun({ seatIds: SEAT_IDS, seed }, catalog);
}

function withSeats(run: RunState, overrides: Record<string, Partial<SeatRun>>): RunState {
  return {
    ...run,
    seats: run.seats.map((seat) => (overrides[seat.seatId] ? { ...seat, ...overrides[seat.seatId] } : seat)),
  };
}

/** A camp fixture at "playing", one trick, one win-card objective owned by
 * p0, where p0's single remaining play (the ace of spades) wins the trick
 * and completes the objective/camp in one action. p1 and p2 have already
 * played (lower spades), so p0 is the current actor. */
function decidingCamp(): CampState {
  return {
    seatIds: SEAT_IDS,
    playerCount: 3,
    removedCards: [],
    totalTricks: 1,
    hands: [
      { seatId: "p0", cards: [{ id: "c-p0", identity: { kind: "standard", suit: "spades", rank: 14 } }] },
      { seatId: "p1", cards: [] },
      { seatId: "p2", cards: [] },
    ],
    expeditionLeaderSeatId: "p1",
    objectives: [
      {
        id: "obj-1",
        kind: "win-card",
        target: { kind: "standard", suit: "spades", rank: 14 },
        ownerSeatId: "p0",
      },
    ],
    objectiveDeck: [],
    completedTricks: [],
    currentTrick: {
      index: 0,
      leaderSeatId: "p1",
      plays: [
        { seatId: "p1", card: { id: "c-p1", identity: { kind: "standard", suit: "spades", rank: 2 } } },
        { seatId: "p2", card: { id: "c-p2", identity: { kind: "standard", suit: "spades", rank: 3 } } },
      ],
    },
  };
}

function campRun(catalog: Catalog = testCatalog(), campOverrides: Partial<CampState> = {}): RunState {
  const run = freshRun(catalog);
  return {
    ...run,
    seats: run.seats.map((seat) => ({ ...seat, draftOffer: null })),
    attempt: {
      attemptNumber: 1,
      bossCancelled: false,
      gearUses: [],
      effects: [],
      reveals: [],
      log: [],
      camp: { ...decidingCamp(), ...campOverrides },
    },
  };
}

function preDealRun(catalog: Catalog = testCatalog()): RunState {
  const run = freshRun(catalog);
  return withSeats(
    { ...run, attempt: { attemptNumber: 1, bossCancelled: false, gearUses: [], effects: [], reveals: [], log: [], camp: null } },
    { p0: { ownedGearIds: ["predeal"], equippedGearIds: ["predeal"], draftOffer: null } },
  );
}

describe("applyRunAction: guards", () => {
  const catalog = testCatalog();

  it("rejects a null action as invalid_action", () => {
    const run = freshRun(catalog);
    const result = applyRunAction(run, "p0", null as never, catalog);
    expect(result).toEqual({ ok: false, error: "invalid_action" });
  });

  it("rejects a hand-forged undo action as invalid_action (GEAR-05: no undo)", () => {
    const run = freshRun(catalog);
    const result = applyRunAction(run, "p0", { type: "undo" } as never, catalog);
    expect(result).toEqual({ ok: false, error: "invalid_action" });
  });

  it("rejects an actor outside seatIds as not_a_seat", () => {
    const run = freshRun(catalog);
    const result = applyRunAction(run, "zz", { type: "ready" }, catalog);
    expect(result).toEqual({ ok: false, error: "not_a_seat" });
  });

  it("rejects any action once the run is lost (supplies 0) as run_over", () => {
    const run: RunState = { ...freshRun(catalog), supplies: 0 };
    const result = applyRunAction(run, "p0", { type: "ready" }, catalog);
    expect(result).toEqual({ ok: false, error: "run_over" });
  });

  it("never mutates the input run", () => {
    const run = freshRun(catalog);
    const snapshot = structuredClone(run);
    applyRunAction(run, "p0", { type: "ready" }, catalog);
    expect(run).toEqual(snapshot);
  });
});

describe("applyRunAction: pick-draft (RUN-04)", () => {
  const catalog = testCatalog();

  it("moves an offered gear into ownedGearIds and clears the offer", () => {
    const run = freshRun(catalog);
    const offer = run.seats.find((s) => s.seatId === "p0")!.draftOffer!;
    const gearId = offer[0]!;

    const result = applyRunAction(run, "p0", { type: "pick-draft", gearId }, catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const seat = result.state.seats.find((s) => s.seatId === "p0")!;
    expect(seat.ownedGearIds).toContain(gearId);
    expect(seat.draftOffer).toBeNull();
  });

  it("rejects an id not offered as not_offered", () => {
    const run = freshRun(catalog);
    const offer = run.seats.find((s) => s.seatId === "p0")!.draftOffer!;
    const notOffered = Object.keys(catalog.gear).find((id) => !offer.includes(id))!;

    const result = applyRunAction(run, "p0", { type: "pick-draft", gearId: notOffered }, catalog);
    expect(result).toEqual({ ok: false, error: "not_offered" });
  });

  it("rejects a second pick-draft as no_draft_pending", () => {
    const run = freshRun(catalog);
    const offer = run.seats.find((s) => s.seatId === "p0")!.draftOffer!;
    const first = applyRunAction(run, "p0", { type: "pick-draft", gearId: offer[0]! }, catalog);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = applyRunAction(first.state, "p0", { type: "pick-draft", gearId: offer[0]! }, catalog);
    expect(second).toEqual({ ok: false, error: "no_draft_pending" });
  });

  it("rejects pick-draft during pre-deal as wrong_phase", () => {
    const run = preDealRun(catalog);
    const result = applyRunAction(run, "p1", { type: "pick-draft", gearId: "gear1" }, catalog);
    expect(result).toEqual({ ok: false, error: "wrong_phase" });
  });

  it("rejects pick-draft during camp as wrong_phase", () => {
    const run = campRun(catalog);
    const result = applyRunAction(run, "p1", { type: "pick-draft", gearId: "gear1" }, catalog);
    expect(result).toEqual({ ok: false, error: "wrong_phase" });
  });
});

describe("applyRunAction: set-loadout (RUN-05)", () => {
  const catalog = testCatalog();

  it("rejects unowned gear as gear_not_owned", () => {
    const run = withSeats(freshRun(catalog), { p0: { draftOffer: null, ownedGearIds: ["gear1"] } });
    const result = applyRunAction(run, "p0", { type: "set-loadout", gearIds: ["gear2"] }, catalog);
    expect(result).toEqual({ ok: false, error: "gear_not_owned" });
  });

  it("rejects a duplicated id as duplicate_gear", () => {
    const run = withSeats(freshRun(catalog), { p0: { draftOffer: null, ownedGearIds: ["gear1"] } });
    const result = applyRunAction(run, "p0", { type: "set-loadout", gearIds: ["gear1", "gear1"] }, catalog);
    expect(result).toEqual({ ok: false, error: "duplicate_gear" });
  });

  it("rejects a size-2 gear at camp 1 as over_capacity", () => {
    const run = withSeats(freshRun(catalog), { p0: { draftOffer: null, ownedGearIds: ["gear2"] } });
    const result = applyRunAction(run, "p0", { type: "set-loadout", gearIds: ["gear2"] }, catalog);
    expect(result).toEqual({ ok: false, error: "over_capacity" });
  });

  it("accepts the +2-capacity passive plus a size-3 gear at camp 1 (capacity computed WITH the proposed loadout)", () => {
    const run = withSeats(freshRun(catalog), { p0: { draftOffer: null, ownedGearIds: ["tonic", "gear3"] } });
    const result = applyRunAction(run, "p0", { type: "set-loadout", gearIds: ["tonic", "gear3"] }, catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const seat = result.state.seats.find((s) => s.seatId === "p0")!;
    expect(seat.equippedGearIds).toEqual(["tonic", "gear3"]);
  });

  it("removes a ready seat from readySeatIds", () => {
    const run = withSeats(freshRun(catalog), { p0: { draftOffer: null, ownedGearIds: ["gear1"] } });
    const readied: RunState = { ...run, readySeatIds: ["p0"] };
    const result = applyRunAction(readied, "p0", { type: "set-loadout", gearIds: ["gear1"] }, catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.readySeatIds).not.toContain("p0");
  });

  it("rejects a non-array gearIds as invalid_action", () => {
    const run = withSeats(freshRun(catalog), { p0: { draftOffer: null } });
    const result = applyRunAction(run, "p0", { type: "set-loadout", gearIds: "gear1" as never }, catalog);
    expect(result).toEqual({ ok: false, error: "invalid_action" });
  });
});

describe("applyRunAction: ready (D-07)", () => {
  const catalog = testCatalog();

  it("rejects ready while the actor's draft is pending", () => {
    const run = freshRun(catalog); // every seat still has a pending draftOffer
    const result = applyRunAction(run, "p0", { type: "ready" }, catalog);
    expect(result).toEqual({ ok: false, error: "draft_pending" });
  });

  it("rejects a second ready as already_ready", () => {
    const run = withSeats(freshRun(catalog), {
      p0: { draftOffer: null },
      p1: { draftOffer: null },
      p2: { draftOffer: null },
    });
    const first = applyRunAction(run, "p0", { type: "ready" }, catalog);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyRunAction(first.state, "p0", { type: "ready" }, catalog);
    expect(second).toEqual({ ok: false, error: "already_ready" });
  });

  it("starts the attempt when the last seat readies, landing on 'camp' with no pre-deal gear equipped", () => {
    const run: RunState = {
      ...withSeats(freshRun(catalog), { p0: { draftOffer: null }, p1: { draftOffer: null }, p2: { draftOffer: null } }),
      readySeatIds: ["p0", "p1"],
    };
    const result = applyRunAction(run, "p2", { type: "ready" }, catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(runPhase(result.state)).toBe("camp");
  });

  it("starts the attempt landing on 'pre-deal' when a seat has pre-deal gear equipped (D-07, D-12)", () => {
    const run: RunState = {
      ...withSeats(freshRun(catalog), {
        p0: { draftOffer: null, ownedGearIds: ["predeal"], equippedGearIds: ["predeal"] },
        p1: { draftOffer: null },
        p2: { draftOffer: null },
      }),
      readySeatIds: ["p0", "p1"],
    };
    const result = applyRunAction(run, "p2", { type: "ready" }, catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(runPhase(result.state)).toBe("pre-deal");
  });

  it("rejects ready outside the fireside as wrong_phase", () => {
    const run = campRun(catalog);
    const result = applyRunAction(run, "p1", { type: "ready" }, catalog);
    expect(result).toEqual({ ok: false, error: "wrong_phase" });
  });
});

describe("applyRunAction: skip-window (D-12)", () => {
  const catalog = testCatalog();

  it("resolves the pending seat's pre-deal gear and deals (runPhase becomes camp)", () => {
    const run = preDealRun(catalog);
    const result = applyRunAction(run, "p0", { type: "skip-window" }, catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(runPhase(result.state)).toBe("camp");
  });

  it("rejects a seat with no pre-deal gear as nothing_to_skip", () => {
    const run = preDealRun(catalog);
    const result = applyRunAction(run, "p1", { type: "skip-window" }, catalog);
    expect(result).toEqual({ ok: false, error: "nothing_to_skip" });
  });

  it("rejects skip-window outside pre-deal as wrong_phase", () => {
    const run = freshRun(catalog);
    const result = applyRunAction(run, "p0", { type: "skip-window" }, catalog);
    expect(result).toEqual({ ok: false, error: "wrong_phase" });
  });
});

describe("applyRunAction: camp delegation", () => {
  const catalog = testCatalog();

  it("rejects pick-objective/play-card at the fireside as wrong_phase", () => {
    const run = freshRun(catalog);
    expect(applyRunAction(run, "p0", { type: "pick-objective", objectiveId: "x" }, catalog)).toEqual({
      ok: false,
      error: "wrong_phase",
    });
    expect(applyRunAction(run, "p0", { type: "play-card", cardId: "x" }, catalog)).toEqual({
      ok: false,
      error: "wrong_phase",
    });
  });

  it("passes a camp-rule error through unchanged (not_your_turn)", () => {
    const run = campRun(catalog);
    const result = applyRunAction(run, "p1", { type: "play-card", cardId: "c-p1" }, catalog);
    expect(result).toEqual({ ok: false, error: "not_your_turn" });
  });

  it("settles a decided camp in the same call: history gains one entry, runPhase returns to fireside", () => {
    const run = withSeats(campRun(catalog), { p0: { ownedGearIds: ["gear1"], equippedGearIds: ["gear1"] } });
    const result = applyRunAction(run, "p0", { type: "play-card", cardId: "c-p0" }, catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.history).toHaveLength(1);
    expect(result.state.history[0]).toMatchObject({ campNumber: 1, status: "succeeded" });
    expect(runPhase(result.state)).toBe("fireside");
  });

  it("D-06: equippedGearIds are unchanged and the freshly drafted gear is not auto-equipped after a cleared camp", () => {
    const run = withSeats(campRun(catalog), { p0: { ownedGearIds: ["gear1"], equippedGearIds: ["gear1"] } });
    const result = applyRunAction(run, "p0", { type: "play-card", cardId: "c-p0" }, catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const seat = result.state.seats.find((s) => s.seatId === "p0")!;
    expect(seat.equippedGearIds).toEqual(["gear1"]);
    expect(seat.draftOffer).not.toBeNull(); // a fresh camp-2 offer, but never auto-equipped
  });

  it("never mutates the input run when settling", () => {
    const run = withSeats(campRun(catalog), { p0: { ownedGearIds: ["gear1"], equippedGearIds: ["gear1"] } });
    const snapshot = structuredClone(run);
    applyRunAction(run, "p0", { type: "play-card", cardId: "c-p0" }, catalog);
    expect(run).toEqual(snapshot);
  });
});

describe("applyRunAction: runStatus stays consistent", () => {
  const catalog = testCatalog();

  it("run_over is checked even for a healthy-looking action once supplies hit 0", () => {
    const run: RunState = { ...freshRun(catalog), supplies: 0 };
    expect(runStatus(run)).toBe("lost");
    const result = applyRunAction(run, "p0", { type: "pick-draft", gearId: "gear1" }, catalog);
    expect(result).toEqual({ ok: false, error: "run_over" });
  });
});
