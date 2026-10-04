// Tests for run/run-actions.ts: the single applyRunAction dispatcher. Fake
// items are declared inline (one between-tricks, three plain) beside the plain
// characters. CampState fixtures for the delegation tests are hand-built
// literals (matching actions.test.ts) rather than driven through createCamp,
// so a single play can be forced to decide the camp deterministically.

import { describe, expect, it } from "vitest";
import { ability, defineItem } from "../content/source-def";
import type { CampState } from "../state";
import { createRun, runPhase, runStatus } from "./lifecycle";
import { applyRunAction } from "./run-actions";
import { advanceTo, setupRun, testCatalog } from "./run-test-support";
import type { AttemptState, RunState, SeatRun } from "./types";

const plain = (id: string) => defineItem({ id, name: id, text: "Nothing happens." });
const catalog = testCatalog({
  items: {
    spare: defineItem({
      id: "spare",
      name: "Spare",
      text: "Does nothing between tricks.",
      active: ability({ window: "between-tricks", limit: { kind: "per-run", times: 1 }, targets: [], apply: () => [] }),
    }),
    "item-a": plain("item-a"),
    "item-b": plain("item-b"),
    "item-c": plain("item-c"),
  },
});

const SEAT_IDS = ["p0", "p1", "p2"];
const PROTOTYPE_KEYS = ["constructor", "__proto__", "toString", "hasOwnProperty"];

/** Muster: nobody has a character yet. */
function musterRun(seed = "fixture"): RunState {
  return createRun({ seatIds: SEAT_IDS, seed });
}

/** The fireside past muster, every draft cleared. */
function firesideRun(kits: Record<string, readonly string[]> = {}): RunState {
  return setupRun({ seatIds: SEAT_IDS, seed: "fixture", catalog, kits });
}

function withSeats(run: RunState, overrides: Record<string, Partial<SeatRun>>): RunState {
  return { ...run, seats: run.seats.map((seat) => (overrides[seat.seatId] ? { ...seat, ...overrides[seat.seatId] } : seat)) };
}

function ok(result: ReturnType<typeof applyRunAction>): RunState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** One trick, one win-card objective owned by p0, where p0's single
 * remaining play (the ace of spades) wins the trick and completes the camp.
 * p1 and p2 have already played, so p0 is the current actor. */
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
    objectives: [{ id: "obj-1", kind: "win-card", target: { kind: "standard", suit: "spades", rank: 14 }, ownerSeatId: "p0" }],
    objectiveDeck: [],
    discards: [],
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

function campRun(kits: Record<string, readonly string[]> = {}): RunState {
  const attempt: AttemptState = { attemptNumber: 1, effects: [], reveals: [], log: [], camp: decidingCamp() };
  return { ...firesideRun(kits), attempt };
}

/** Between tricks of a dealt camp, with p0 holding the between-tricks item. */
function betweenRun(): RunState {
  return advanceTo(firesideRun({ p0: ["spare"] }), "between-tricks", catalog);
}

describe("applyRunAction: guards", () => {
  it("rejects a null action as invalid_action", () => {
    expect(applyRunAction(musterRun(), "p0", null as never, catalog)).toEqual({ ok: false, error: "invalid_action" });
  });

  it("rejects a hand-forged undo action as invalid_action (no undo)", () => {
    expect(applyRunAction(musterRun(), "p0", { type: "undo" } as never, catalog)).toEqual({ ok: false, error: "invalid_action" });
  });

  it("rejects the removed gear actions as invalid_action", () => {
    for (const action of [{ type: "use-gear", gearId: "x", targets: [] }, { type: "set-loadout", gearIds: [] }]) {
      expect(applyRunAction(firesideRun(), "p0", action as never, catalog)).toEqual({ ok: false, error: "invalid_action" });
    }
  });

  it("rejects an actor outside seatIds as not_a_seat", () => {
    expect(applyRunAction(musterRun(), "zz", { type: "ready" }, catalog)).toEqual({ ok: false, error: "not_a_seat" });
  });

  it("rejects any action once the run is lost (supplies 0) as run_over", () => {
    expect(applyRunAction({ ...musterRun(), supplies: 0 }, "p0", { type: "ready" }, catalog)).toEqual({ ok: false, error: "run_over" });
  });

  it("checks not_a_seat before run_over", () => {
    expect(applyRunAction({ ...musterRun(), supplies: 0 }, "zz", { type: "ready" }, catalog)).toEqual({ ok: false, error: "not_a_seat" });
  });

  it("never mutates the input run", () => {
    const run = musterRun();
    const snapshot = structuredClone(run);
    applyRunAction(run, "p0", { type: "pick-character", characterId: "plain-1" }, catalog);
    expect(run).toEqual(snapshot);
  });
});

describe("applyRunAction: pick-character (muster)", () => {
  it("assigns the character to the actor's seat only", () => {
    const state = ok(applyRunAction(musterRun(), "p1", { type: "pick-character", characterId: "plain-3" }, catalog));
    expect(state.seats.map((s) => s.characterId)).toEqual([null, "plain-3", null]);
    expect(runPhase(state)).toBe("muster");
  });

  it("rejects an id outside the catalogue as unknown_character", () => {
    expect(applyRunAction(musterRun(), "p0", { type: "pick-character", characterId: "nobody" }, catalog)).toEqual({
      ok: false,
      error: "unknown_character",
    });
  });

  it.each(PROTOTYPE_KEYS)("rejects the prototype key %s as unknown_character", (characterId) => {
    expect(applyRunAction(musterRun(), "p0", { type: "pick-character", characterId }, catalog)).toEqual({ ok: false, error: "unknown_character" });
  });

  it("rejects a character another seat holds as character_taken", () => {
    const first = ok(applyRunAction(musterRun(), "p0", { type: "pick-character", characterId: "plain-1" }, catalog));
    expect(applyRunAction(first, "p1", { type: "pick-character", characterId: "plain-1" }, catalog)).toEqual({
      ok: false,
      error: "character_taken",
    });
  });

  it("rejects a second pick by the same seat as wrong_phase", () => {
    const first = ok(applyRunAction(musterRun(), "p0", { type: "pick-character", characterId: "plain-1" }, catalog));
    expect(applyRunAction(first, "p0", { type: "pick-character", characterId: "plain-2" }, catalog)).toEqual({
      ok: false,
      error: "wrong_phase",
    });
  });

  it("rejects a pick at the fireside as wrong_phase", () => {
    expect(applyRunAction(firesideRun(), "p0", { type: "pick-character", characterId: "plain-5" }, catalog)).toEqual({
      ok: false,
      error: "wrong_phase",
    });
  });

  it("moves the run to the fireside once the last seat picks, with no draft", () => {
    let run = musterRun();
    SEAT_IDS.forEach((seatId, i) => {
      run = ok(applyRunAction(run, seatId, { type: "pick-character", characterId: `plain-${i + 1}` }, catalog));
    });
    expect(runPhase(run)).toBe("fireside");
    expect(run.seats.map((s) => s.draftOffer)).toEqual([null, null, null]);
    expect(run.attempt).toBeNull();
  });
});

describe("applyRunAction: pick-draft (RUN-04)", () => {
  const drafting = () => withSeats(firesideRun({ p0: ["item-c"] }), { p0: { draftOffer: ["item-a", "item-b"] } });

  it("adds the offered source to the kit after what is already held, and clears the offer", () => {
    const state = ok(applyRunAction(drafting(), "p0", { type: "pick-draft", sourceId: "item-b" }, catalog));
    const seat = state.seats[0]!;
    expect(seat.kit).toEqual(["item-c", "item-b"]);
    expect(seat.draftOffer).toBeNull();
  });

  it("rejects an id not offered as not_offered", () => {
    expect(applyRunAction(drafting(), "p0", { type: "pick-draft", sourceId: "item-c" }, catalog)).toEqual({ ok: false, error: "not_offered" });
  });

  it.each(PROTOTYPE_KEYS)("rejects the prototype key %s as not_offered", (sourceId) => {
    expect(applyRunAction(drafting(), "p0", { type: "pick-draft", sourceId }, catalog)).toEqual({ ok: false, error: "not_offered" });
  });

  it("rejects a seat with no offer as no_draft_pending", () => {
    expect(applyRunAction(drafting(), "p1", { type: "pick-draft", sourceId: "item-a" }, catalog)).toEqual({
      ok: false,
      error: "no_draft_pending",
    });
  });

  it("rejects a second pick-draft as no_draft_pending", () => {
    const first = ok(applyRunAction(drafting(), "p0", { type: "pick-draft", sourceId: "item-a" }, catalog));
    expect(applyRunAction(first, "p0", { type: "pick-draft", sourceId: "item-a" }, catalog)).toEqual({ ok: false, error: "no_draft_pending" });
  });

  it("rejects pick-draft in muster and camp as wrong_phase", () => {
    const pick = { type: "pick-draft", sourceId: "item-a" } as const;
    expect(applyRunAction(musterRun(), "p1", pick, catalog)).toEqual({ ok: false, error: "wrong_phase" });
    expect(applyRunAction(campRun(), "p1", pick, catalog)).toEqual({ ok: false, error: "wrong_phase" });
  });
});

describe("applyRunAction: ready (D-07)", () => {
  it("rejects ready during muster, for a seat with no character, as character_pending", () => {
    expect(applyRunAction(musterRun(), "p0", { type: "ready" }, catalog)).toEqual({ ok: false, error: "character_pending" });
  });

  it("rejects ready while the actor's draft is pending", () => {
    const run = withSeats(firesideRun(), { p0: { draftOffer: ["item-a"] } });
    expect(applyRunAction(run, "p0", { type: "ready" }, catalog)).toEqual({ ok: false, error: "draft_pending" });
  });

  it("rejects a second ready as already_ready", () => {
    const first = ok(applyRunAction(firesideRun(), "p0", { type: "ready" }, catalog));
    expect(first.readySeatIds).toEqual(["p0"]);
    expect(applyRunAction(first, "p0", { type: "ready" }, catalog)).toEqual({ ok: false, error: "already_ready" });
  });

  it("starts and deals the attempt when the last seat readies", () => {
    const run = { ...firesideRun(), readySeatIds: ["p0", "p1"] };
    const state = ok(applyRunAction(run, "p2", { type: "ready" }, catalog));
    expect(runPhase(state)).toBe("camp");
    expect(state.readySeatIds).toEqual([]);
  });

  it("lets seats with a character ready during muster, and the last ready after the last pick starts the attempt", () => {
    let run = musterRun();
    run = ok(applyRunAction(run, "p0", { type: "pick-character", characterId: "plain-1" }, catalog));
    run = ok(applyRunAction(run, "p0", { type: "ready" }, catalog));
    run = ok(applyRunAction(run, "p1", { type: "pick-character", characterId: "plain-2" }, catalog));
    run = ok(applyRunAction(run, "p1", { type: "ready" }, catalog));
    expect(runPhase(run)).toBe("muster");
    expect(run.attempt).toBeNull();
    run = ok(applyRunAction(run, "p2", { type: "pick-character", characterId: "plain-3" }, catalog));
    expect(runPhase(run)).toBe("fireside");
    expect(run.attempt).toBeNull();
    run = ok(applyRunAction(run, "p2", { type: "ready" }, catalog));
    expect(runPhase(run)).toBe("camp");
    expect(run.attempt!.attemptNumber).toBe(1);
  });

  it("rejects ready outside muster and the fireside as wrong_phase", () => {
    expect(applyRunAction(campRun(), "p1", { type: "ready" }, catalog)).toEqual({ ok: false, error: "wrong_phase" });
  });
});

describe("applyRunAction: skip-window and use-ability", () => {
  it("using a between-tricks item records a use stamped with the trick", () => {
    const state = ok(applyRunAction(betweenRun(), "p0", { type: "use-ability", sourceId: "spare", targets: [] }, catalog));
    expect(runPhase(state)).toBe("camp");
    expect(state.seats[0]!.ledger).toEqual([{ kind: "used", sourceId: "spare", at: { camp: 1, attempt: 1, trick: 0 }, poolCost: 0 }]);
  });

  it("rejects skip-window in muster, at the fireside and in an ungated window as wrong_window", () => {
    expect(applyRunAction(musterRun(), "p0", { type: "skip-window" }, catalog)).toEqual({ ok: false, error: "wrong_window" });
    expect(applyRunAction(firesideRun(), "p0", { type: "skip-window" }, catalog)).toEqual({ ok: false, error: "wrong_window" });
    expect(applyRunAction(campRun(), "p0", { type: "skip-window" }, catalog)).toEqual({ ok: false, error: "wrong_window" });
  });

  it.each(PROTOTYPE_KEYS)("rejects using the prototype key %s as not_owned", (sourceId) => {
    expect(applyRunAction(betweenRun(), "p0", { type: "use-ability", sourceId, targets: [] }, catalog)).toEqual({ ok: false, error: "not_owned" });
  });

  it("rejects using a source the seat does not hold as not_owned", () => {
    expect(applyRunAction(betweenRun(), "p1", { type: "use-ability", sourceId: "spare", targets: [] }, catalog)).toEqual({
      ok: false,
      error: "not_owned",
    });
  });
});

describe("applyRunAction: camp delegation", () => {
  it("rejects pick-objective/play-card at the fireside as wrong_phase", () => {
    const run = firesideRun();
    expect(applyRunAction(run, "p0", { type: "pick-objective", objectiveId: "x" }, catalog)).toEqual({ ok: false, error: "wrong_phase" });
    expect(applyRunAction(run, "p0", { type: "play-card", cardId: "x" }, catalog)).toEqual({ ok: false, error: "wrong_phase" });
  });

  it("passes a camp-rule error through unchanged (not_your_turn)", () => {
    expect(applyRunAction(campRun(), "p1", { type: "play-card", cardId: "c-p1" }, catalog)).toEqual({ ok: false, error: "not_your_turn" });
  });

  it("settles a decided camp in the same call: history gains one entry, runPhase returns to fireside", () => {
    const state = ok(applyRunAction(campRun({ p0: ["item-a"] }), "p0", { type: "play-card", cardId: "c-p0" }, catalog));
    expect(state.history).toEqual([{ campNumber: 1, attemptNumber: 1, status: "succeeded", suppliesSpent: 0 }]);
    expect(runPhase(state)).toBe("fireside");
  });

  it("deals each seat a private offer after a clear and leaves kits and characters as they were", () => {
    const state = ok(applyRunAction(campRun({ p0: ["item-a"] }), "p0", { type: "play-card", cardId: "c-p0" }, catalog));
    expect(state.seats.map((s) => s.kit)).toEqual([["item-a"], [], []]);
    expect(state.seats.map((s) => s.characterId)).toEqual(["plain-1", "plain-2", "plain-3"]);
    for (const seat of state.seats) expect(seat.draftOffer).toHaveLength(3);
    expect(state.seats[0]!.draftOffer).not.toContain("item-a");
  });

  it("a seat that is not ready after a clear still cannot ready until it drafts", () => {
    const state = ok(applyRunAction(campRun(), "p0", { type: "play-card", cardId: "c-p0" }, catalog));
    expect(applyRunAction(state, "p0", { type: "ready" }, catalog)).toEqual({ ok: false, error: "draft_pending" });
  });

  it("never mutates the input run when settling", () => {
    const run = campRun({ p0: ["item-a"] });
    const snapshot = structuredClone(run);
    applyRunAction(run, "p0", { type: "play-card", cardId: "c-p0" }, catalog);
    expect(run).toEqual(snapshot);
  });
});

describe("applyRunAction: runStatus stays consistent", () => {
  it("run_over is checked even for a healthy-looking action once supplies hit 0", () => {
    const run: RunState = { ...firesideRun(), supplies: 0 };
    expect(runStatus(run)).toBe("lost");
    expect(applyRunAction(run, "p0", { type: "pick-draft", sourceId: "item-a" }, catalog)).toEqual({ ok: false, error: "run_over" });
  });
});
