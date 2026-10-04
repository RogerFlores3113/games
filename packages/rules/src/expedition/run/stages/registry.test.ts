// Tests for the run's one transition, run/stages/registry.ts: its guards,
// which stage accepts which action, and the advance that settles a decided
// camp in the same call. CampState fixtures for the delegation tests are
// hand-built literals (matching actions.test.ts), so a single play can be
// forced to decide the camp deterministically.

import { describe, expect, it } from "vitest";
import { defineItem, itemAbility } from "../../content/source-def";
import type { CampState } from "../../state";
import { attemptOf } from "../attempt";
import { createRun, runStatus } from "../lifecycle";
import { campIndex } from "../plan";
import { advanceTo, plainItem, setupRun, testCatalog } from "../run-test-support";
import type { RunAction, RunAt, RunState, SeatRun } from "../types";
import { applyRunAction } from "./registry";

const catalog = testCatalog({
  items: {
    spare: defineItem({
      id: "spare",
      name: "Spare",
      rarity: "common",
      price: 2,
      uses: { kind: "charges", n: 1 },
      text: "Does nothing between tricks.",
      active: itemAbility({ window: "between-tricks", targets: [], apply: () => [] }),
    }),
    "item-a": plainItem("item-a"),
    "item-b": plainItem("item-b"),
    "item-c": plainItem("item-c"),
  },
});

const SEAT_IDS = ["p0", "p1", "p2"];
const PROTOTYPE_KEYS = ["constructor", "__proto__", "toString", "hasOwnProperty"];

function musterRun(seed = "fixture"): RunState {
  return createRun({ seatIds: SEAT_IDS, seed });
}

function loadoutRun(items: Record<string, readonly string[]> = {}): RunState {
  return setupRun({ seatIds: SEAT_IDS, seed: "fixture", catalog, items });
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
    discards: [], voidedTricks: [],
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

function campRun(items: Record<string, readonly string[]> = {}): RunState {
  const loadout = loadoutRun(items) as RunAt<"loadout">;
  return { ...loadout, stage: { tag: "camp", camp: loadout.stage.camp, attempt: { attemptNumber: 1, effects: [], reveals: [], log: [], camp: decidingCamp() } } };
}

/** p0 holds item-c (it0) and an offer of two bundles; p1 has a second
 * offer queued behind its first; p2 has none. */
function draftRun(): RunState {
  const offer = (bundles: string[][]) => ({ kind: "standard" as const, bundles });
  return {
    ...withSeats(loadoutRun({ p0: ["item-c"] }), {
      p0: { offers: [offer([["item-a", "item-b"], ["item-b"]])] },
      p1: { offers: [offer([["item-a"]]), offer([["item-c"]])] },
    }),
    stage: { tag: "draft", cleared: campIndex(1), payout: 8 },
  };
}

/** Between tricks of a dealt camp, with p0 holding the between-tricks item (it0). */
function betweenRun(): RunState {
  return advanceTo(loadoutRun({ p0: ["spare"] }), "between-tricks", catalog);
}

describe("applyRunAction: guards", () => {
  it("rejects a null action as invalid_action", () => {
    expect(applyRunAction(musterRun(), "p0", null as never, catalog)).toEqual({ ok: false, error: "invalid_action" });
  });

  it("rejects a hand-forged undo action as invalid_action (no undo)", () => {
    expect(applyRunAction(musterRun(), "p0", { type: "undo" } as never, catalog)).toEqual({ ok: false, error: "invalid_action" });
  });

  it("rejects the removed actions as invalid_action", () => {
    for (const action of [{ type: "use-gear", gearId: "x", targets: [] }, { type: "set-loadout", gearIds: [] }, { type: "toString" }]) {
      expect(applyRunAction(loadoutRun(), "p0", action as never, catalog)).toEqual({ ok: false, error: "invalid_action" });
    }
  });

  it("rejects an actor outside seatIds as not_a_seat", () => {
    expect(applyRunAction(musterRun(), "zz", { type: "ready" }, catalog)).toEqual({ ok: false, error: "not_a_seat" });
  });

  it("rejects any action once the run has ended as run_over, checking not_a_seat first", () => {
    const ended: RunState = { ...musterRun(), stage: { tag: "ended", result: "lost" } };
    expect(runStatus(ended)).toBe("lost");
    expect(applyRunAction(ended, "p0", { type: "ready" }, catalog)).toEqual({ ok: false, error: "run_over" });
    expect(applyRunAction(ended, "zz", { type: "ready" }, catalog)).toEqual({ ok: false, error: "not_a_seat" });
  });

  it("never mutates the input run", () => {
    const run = musterRun();
    const snapshot = structuredClone(run);
    applyRunAction(run, "p0", { type: "pick-character", characterId: "plain-1" }, catalog);
    expect(run).toEqual(snapshot);
  });
});

describe("applyRunAction: each stage accepts only its own actions", () => {
  const every: RunAction[] = [
    { type: "pick-character", characterId: "plain-5" },
    { type: "vote", choice: null },
    { type: "equip", itemUids: [] },
    { type: "buy", stockId: "supplies" },
    { type: "pick-bundle", bundle: 0 },
    { type: "ready" },
    { type: "use-ability", sourceKey: "spare", targets: [] },
    { type: "skip-window" },
    { type: "whisper", targetSeatId: "p1", cardId: "x" },
    { type: "pick-objective", objectiveId: "x" },
    { type: "play-card", cardId: "x" },
  ];
  const accepted = (run: RunState): string[] =>
    every.filter((action) => {
      const result = applyRunAction(run, "p0", action, catalog);
      return result.ok || result.error !== "wrong_stage";
    }).map((action) => action.type);

  it("muster: pick-character and vote", () => {
    expect(accepted(musterRun())).toEqual(["pick-character", "vote"]);
  });

  it("loadout: equip, buy, ready and abilities", () => {
    expect(accepted(loadoutRun())).toEqual(["equip", "buy", "ready", "use-ability"]);
  });

  it("camp: abilities, window passes, whispers and the two camp actions", () => {
    expect(accepted(campRun())).toEqual(["use-ability", "skip-window", "whisper", "pick-objective", "play-card"]);
  });

  it("draft: pick-bundle and abilities", () => {
    expect(accepted(draftRun())).toEqual(["pick-bundle", "use-ability"]);
  });
});

describe("applyRunAction: pick-character (muster)", () => {
  it("assigns the character to the actor's seat only", () => {
    const state = ok(applyRunAction(musterRun(), "p1", { type: "pick-character", characterId: "plain-3" }, catalog));
    expect(state.seats.map((s) => s.characterId)).toEqual([null, "plain-3", null]);
    expect(state.stage.tag).toBe("muster");
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

  it("stays in muster after the last pick until every seat has voted", () => {
    let run = musterRun();
    SEAT_IDS.forEach((seatId, i) => {
      run = ok(applyRunAction(run, seatId, { type: "pick-character", characterId: `plain-${i + 1}` }, catalog));
    });
    expect(run.stage).toEqual({ tag: "muster", ballots: {} });
  });
});

describe("applyRunAction: pick-bundle", () => {
  it("mints one instance per item of the bundle, equips into the free slot, and drops the offer", () => {
    const state = ok(applyRunAction(draftRun(), "p0", { type: "pick-bundle", bundle: 0 }, catalog));
    const seat = state.seats[0]!;
    expect(seat.items).toEqual([
      { uid: "it0", itemId: "item-c" },
      { uid: "it1", itemId: "item-a" },
      { uid: "it2", itemId: "item-b" },
    ]);
    expect(seat.equipped).toEqual(["it0", "it1"]);
    expect(seat.offers).toEqual([]);
    expect(state.itemSerial).toBe(3);
  });

  it("takes from the head offer and leaves the queued one", () => {
    const state = ok(applyRunAction(draftRun(), "p1", { type: "pick-bundle", bundle: 0 }, catalog));
    expect(state.seats[1]!.items).toEqual([{ uid: "it1", itemId: "item-a" }]);
    expect(state.seats[1]!.offers).toEqual([{ kind: "standard", bundles: [["item-c"]] }]);
  });

  it("rejects an index past the head offer's bundles, or a seat with no offer, as not_a_choice", () => {
    expect(applyRunAction(draftRun(), "p0", { type: "pick-bundle", bundle: 2 }, catalog)).toEqual({ ok: false, error: "not_a_choice" });
    expect(applyRunAction(draftRun(), "p2", { type: "pick-bundle", bundle: 0 }, catalog)).toEqual({ ok: false, error: "not_a_choice" });
  });

  it("opens the route once no seat has an offer", () => {
    let run = draftRun();
    for (const seatId of ["p0", "p1", "p1"]) {
      expect(run.stage.tag).toBe("draft");
      run = ok(applyRunAction(run, seatId, { type: "pick-bundle", bundle: 0 }, catalog));
    }
    expect(run.stage.tag).toBe("route");
  });
});

describe("applyRunAction: skip-window and use-ability", () => {
  it("using a between-tricks item records a use keyed by its uid, stamped with the trick", () => {
    const state = ok(applyRunAction(betweenRun(), "p0", { type: "use-ability", sourceKey: "it0", targets: [] }, catalog));
    expect(state.stage.tag).toBe("camp");
    expect(state.seats[0]!.ledger).toEqual([{ kind: "used", sourceKey: "it0", at: { camp: 1, attempt: 1, trick: 0 } }]);
  });

  it("refuses the item's def id as a key: abilities are used through the instance", () => {
    expect(applyRunAction(betweenRun(), "p0", { type: "use-ability", sourceKey: "spare", targets: [] }, catalog)).toEqual({ ok: false, error: "not_owned" });
  });

  it("rejects skip-window in an ungated window as wrong_window", () => {
    expect(applyRunAction(campRun(), "p0", { type: "skip-window" }, catalog)).toEqual({ ok: false, error: "wrong_window" });
  });

  it.each(PROTOTYPE_KEYS)("rejects using the prototype key %s as not_owned", (sourceKey) => {
    expect(applyRunAction(betweenRun(), "p0", { type: "use-ability", sourceKey, targets: [] }, catalog)).toEqual({ ok: false, error: "not_owned" });
  });

  it("rejects using a source the seat does not hold as not_owned", () => {
    expect(applyRunAction(betweenRun(), "p1", { type: "use-ability", sourceKey: "it0", targets: [] }, catalog)).toEqual({
      ok: false,
      error: "not_owned",
    });
  });
});

describe("applyRunAction: camp delegation", () => {
  it("passes a camp-rule error through unchanged (not_your_turn)", () => {
    expect(applyRunAction(campRun(), "p1", { type: "play-card", cardId: "c-p1" }, catalog)).toEqual({ ok: false, error: "not_your_turn" });
  });

  it("settles a decided camp in the same call: history gains one entry, the draft opens", () => {
    const state = ok(applyRunAction(campRun({ p0: ["item-a"] }), "p0", { type: "play-card", cardId: "c-p0" }, catalog));
    expect(state.history).toEqual([{ camp: 1, attempt: 1, status: "cleared", suppliesSpent: 0, coins: 5 }]);
    expect(state.stage).toEqual({ tag: "draft", cleared: 1, payout: 5 });
    expect(attemptOf(state)).toBeNull();
  });

  it("deals each seat one private offer of three bundles after a clear and leaves items and characters as they were", () => {
    const state = ok(applyRunAction(campRun({ p0: ["item-a"] }), "p0", { type: "play-card", cardId: "c-p0" }, catalog));
    expect(state.seats.map((s) => s.items)).toEqual([[{ uid: "it0", itemId: "item-a" }], [], []]);
    expect(state.seats.map((s) => s.characterId)).toEqual(["plain-1", "plain-2", "plain-3"]);
    for (const seat of state.seats) expect(seat.offers.map((offer) => offer.bundles.length)).toEqual([3]);
  });

  it("never mutates the input run when settling", () => {
    const run = campRun({ p0: ["item-a"] });
    const snapshot = structuredClone(run);
    applyRunAction(run, "p0", { type: "play-card", cardId: "c-p0" }, catalog);
    expect(run).toEqual(snapshot);
  });
});
