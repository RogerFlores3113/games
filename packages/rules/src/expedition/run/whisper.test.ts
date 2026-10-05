// Tests for run/whisper.ts (Plan 10-06, COMM-01/COMM-02). Fixtures mirror
// toolkit.test.ts's own discipline: a hand-built 3-seat RunState whose
// attempt.camp is createCamp(...), with objectives picked and tricks played
// via the real currentActorSeatId + applyCampAction path — never a
// hand-rolled copy of pick-order/follow-suit rules. Fake items are
// declared inline in a local Catalog; the catalog is empty unless a test
// says otherwise.

import { describe, expect, it } from "vitest";
import { applyCampAction } from "../actions";
import { campPhase, createCamp, currentActorSeatId } from "../camp";
import { baseRules } from "../rules";
import type { CampState } from "../state";
import { ability, defineItem, itemAbility } from "../content/source-def";
import { attemptOf, withAttempt } from "./attempt";
import { campIndex } from "./plan";
import { CATALOG } from "./catalog";
import { campSpecAt } from "./route";
import { baseRunHooks, type RunRules } from "./run-rules";
import { testCatalog } from "./run-test-support";
import type { ActiveEffect, AttemptState, Catalog, RunState, SeatRun } from "./types";
import { applyWhisper, whisperLegality, whispersUsedBy } from "./whisper";

const SEAT_IDS = ["p0", "p1", "p2"] as const;

const CORE_RULES: RunRules = { ...baseRules, ...baseRunHooks };

function freshCamp(seed = "whisper-seed"): CampState {
  return createCamp(
    { seatIds: [...SEAT_IDS], seed, objectiveSlots: [{ kind: "win-card" }, { kind: "win-card" }] },
    CORE_RULES,
  );
}

/** Picks every face-up objective via the real currentActorSeatId +
 * applyCampAction path (mirrors toolkit.test.ts). */
function pickAllObjectives(camp: CampState): CampState {
  let state = camp;
  while (campPhase(state, CORE_RULES) === "objective-pick") {
    const actor = currentActorSeatId(state, CORE_RULES)!;
    const objective = state.objectives.find((o) => o.ownerSeatId === null)!;
    const result = applyCampAction(state, actor, { type: "pick-objective", objectiveId: objective.id }, CORE_RULES);
    if (!result.ok) throw new Error(`test setup: pick-objective failed: ${result.error}`);
    state = result.state;
  }
  return state;
}

/** Plays exactly one card via the real legal-plays path. */
function playOneCard(camp: CampState): CampState {
  const actor = currentActorSeatId(camp, CORE_RULES)!;
  const legal = CORE_RULES.legalPlays(camp, actor);
  const card = legal[0]!;
  const result = applyCampAction(camp, actor, { type: "play-card", cardId: card.id }, CORE_RULES);
  if (!result.ok) throw new Error(`test setup: play-card failed: ${result.error}`);
  return result.state;
}

/** Plays exactly one full trick (seatIds.length plays). */
function playOneTrick(camp: CampState): CampState {
  let state = camp;
  for (let i = 0; i < state.seatIds.length; i++) {
    state = playOneCard(state);
  }
  return state;
}

/** A between-tricks camp: all objectives picked, no card of the current
 * trick played yet. */
function betweenTricksCamp(seed?: string): CampState {
  return pickAllObjectives(freshCamp(seed));
}

function makeSeats(): readonly SeatRun[] {
  return SEAT_IDS.map((seatId) => ({ seatId, characterId: "plain-1", upgradeId: null, items: [], equipped: [], offers: [], ledger: [] }));
}

/** A run in camp 2 whose attempt holds `camp`; at the loadout, with no
 * attempt, when camp is null. */
function makeRun(input: {
  camp: CampState | null;
  effects?: readonly ActiveEffect[];
  log?: AttemptState["log"];
  seed?: string;
}): RunState {
  const seed = input.seed ?? "whisper-seed";
  const spec = campSpecAt(seed, "standard", campIndex(2), CATALOG);
  const stage: RunState["stage"] =
    input.camp === null
      ? { tag: "loadout", camp: spec, stock: null, ready: {} }
      : {
          tag: "camp",
          camp: spec,
          attempt: { attemptNumber: 1, effects: input.effects ?? [], reveals: [], log: input.log ?? [], camp: input.camp },
        };

  return {
    seed,
    seatIds: [...SEAT_IDS],
    seats: makeSeats(),
    kicked: [],
    purse: 0,
    supplies: 3,
    plan: { length: "standard", bosses: [] },
    history: [],
    lastVote: null,
    itemSerial: 0,
    stage,
  };
}

function emptyCatalog(): Catalog {
  return testCatalog();
}

describe("whisperLegality", () => {
  it("rejects during objective-pick with wrong_window", () => {
    const run = makeRun({ camp: freshCamp() });
    const actor = currentActorSeatId(attemptOf(run)!.camp, CORE_RULES)!;
    const target = SEAT_IDS.find((s) => s !== actor)!;
    const cardId = attemptOf(run)!.camp.hands.find((h) => h.seatId === actor)!.cards[0]!.id;
    const result = whisperLegality(run, actor, target, cardId, emptyCatalog());
    expect(result).toEqual({ legal: false, reason: "wrong_window" });
  });

  it("rejects at the loadout (no attempt) with wrong_phase", () => {
    const run = makeRun({ camp: null });
    const result = whisperLegality(run, "p0", "p1", "anything", emptyCatalog());
    expect(result).toEqual({ legal: false, reason: "wrong_phase" });
  });

  it("rejects after the trick's first card is played with wrong_window", () => {
    const camp = playOneCard(betweenTricksCamp());
    const run = makeRun({ camp });
    const actor = currentActorSeatId(camp, CORE_RULES)!;
    const target = SEAT_IDS.find((s) => s !== actor)!;
    const cardId = camp.hands.find((h) => h.seatId === actor)!.cards[0]!.id;
    const result = whisperLegality(run, actor, target, cardId, emptyCatalog());
    expect(result).toEqual({ legal: false, reason: "wrong_window" });
  });

  it("rejects with whisper_blocked when a layer forbids whispering", () => {
    const camp = betweenTricksCamp();
    const gag = defineItem({ id: "gag", name: "Gag", rarity: "common", price: 2, text: "Nobody may whisper.", passive: { modifier: () => ({ whisperAllowed: () => () => false }) } });
    const catalog: Catalog = testCatalog({ items: { gag } });
    const run = { ...makeRun({ camp }), seats: makeSeats().map((seat) => (seat.seatId === "p2" ? { ...seat, items: [{ uid: "it0", itemId: "gag" }], equipped: ["it0"] } : seat)) };
    const cardId = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;
    const result = whisperLegality(run, "p0", "p1", cardId, catalog);
    expect(result).toEqual({ legal: false, reason: "whisper_blocked" });
  });

  it("rejects a second whisper by the same seat with no_whispers_left (base whispersPerCamp 1)", () => {
    const camp = betweenTricksCamp();
    const run = makeRun({
      camp,
      log: [{ event: "whisper", actorSeatId: "p0", subjectSeatIds: ["p1"], sourceId: null, audience: "public" }],
    });
    const cardId = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;
    const result = whisperLegality(run, "p0", "p2", cardId, emptyCatalog());
    expect(result).toEqual({ legal: false, reason: "no_whispers_left" });
  });

  it("rejects a target of self with invalid_target", () => {
    const camp = betweenTricksCamp();
    const run = makeRun({ camp });
    const cardId = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;
    const result = whisperLegality(run, "p0", "p0", cardId, emptyCatalog());
    expect(result).toEqual({ legal: false, reason: "invalid_target" });
  });

  it("rejects a target that is not a seat with invalid_target", () => {
    const camp = betweenTricksCamp();
    const run = makeRun({ camp });
    const cardId = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;
    const result = whisperLegality(run, "p0", "ghost", cardId, emptyCatalog());
    expect(result).toEqual({ legal: false, reason: "invalid_target" });
  });

  it("rejects a cardId from a teammate's hand with card_not_in_hand", () => {
    const camp = betweenTricksCamp();
    const run = makeRun({ camp });
    const teammateCardId = camp.hands.find((h) => h.seatId === "p1")!.cards[0]!.id;
    const result = whisperLegality(run, "p0", "p1", teammateCardId, emptyCatalog());
    expect(result).toEqual({ legal: false, reason: "card_not_in_hand" });
  });
});

describe("applyWhisper", () => {
  it("succeeds between tricks: reveal + public log + whispersUsedBy", () => {
    const camp = betweenTricksCamp();
    const run = makeRun({ camp });
    const cardId = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;
    const before = structuredClone(run);

    const result = applyWhisper(run, "p0", { targetSeatId: "p1", cardId }, emptyCatalog());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(attemptOf(result.state)!.reveals).toEqual([
      { cardId, fromSeatId: "p0", audience: ["p1"], source: "whisper", targetSeatId: "p1" },
    ]);
    expect(attemptOf(result.state)!.log).toEqual([
      { event: "whisper", actorSeatId: "p0", subjectSeatIds: ["p1"], sourceId: null, audience: "public" },
    ]);
    expect(whispersUsedBy(result.state, "p0")).toBe(1);
    expect(run).toEqual(before); // input state not mutated
  });

  it("a fake effect layer raising whispersPerCamp to 2 for p0 allows a second whisper", () => {
    const camp = betweenTricksCamp();
    const boost = defineItem({
      id: "boost",
      name: "Boost",
      rarity: "common",
      price: 2,
      uses: { kind: "per-camp" },
      text: "",
      active: itemAbility({
        window: "between-tricks",
        targets: [],
        apply: () => [],
        effect: (effect) => ({
          whispersPerCamp: (prev) => (r, seatId) => (seatId === effect.origin.seatId ? 2 : prev(r, seatId)),
        }),
      }),
    });
    const catalog = testCatalog({ items: { boost } });
    const run = makeRun({
      camp,
      effects: [{ origin: { kind: "seat", seatId: "p0", sourceKey: "boost", sourceId: "boost" }, atTrick: 0, lasts: "attempt", deferIfFatal: false, params: {}, audience: "public" }],
      log: [{ event: "whisper", actorSeatId: "p0", subjectSeatIds: ["p1"], sourceId: null, audience: "public" }],
    });
    const cardId = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;

    const result = applyWhisper(run, "p0", { targetSeatId: "p2", cardId }, catalog);

    expect(result.ok).toBe(true);
  });

  it("a fake whisperAudience layer returning all seats produces an audience of all seats", () => {
    const camp = betweenTricksCamp();
    const broadcast = defineItem({
      id: "broadcast",
      name: "Broadcast",
      rarity: "common",
      price: 2,
      uses: { kind: "per-camp" },
      text: "",
      active: itemAbility({
        window: "between-tricks",
        targets: [],
        apply: () => [],
        effect: () => ({ whisperAudience: () => (r) => [...r.seatIds] }),
      }),
    });
    const catalog = testCatalog({ items: { broadcast } });
    const run = makeRun({ camp, effects: [{ origin: { kind: "seat", seatId: "p0", sourceKey: "broadcast", sourceId: "broadcast" }, atTrick: 0, lasts: "attempt", deferIfFatal: false, params: {}, audience: "public" }] });
    const cardId = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;

    const result = applyWhisper(run, "p0", { targetSeatId: "p1", cardId }, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(attemptOf(result.state)!.reveals[0]!.audience).toEqual(["p0", "p1", "p2"]);
  });

  it("the whisper stays in attempt.reveals after further tricks are played (COMM-02 within the camp)", () => {
    const camp = betweenTricksCamp();
    const run = makeRun({ camp });
    const cardId = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;

    const whispered = applyWhisper(run, "p0", { targetSeatId: "p1", cardId }, emptyCatalog());
    expect(whispered.ok).toBe(true);
    if (!whispered.ok) return;

    const afterTrick = playOneTrick(attemptOf(whispered.state)!.camp);
    const finalRun = withAttempt(whispered.state, { ...attemptOf(whispered.state)!, camp: afterTrick });

    expect(attemptOf(finalRun)!.reveals).toEqual([{ cardId, fromSeatId: "p0", audience: ["p1"], source: "whisper", targetSeatId: "p1" }]);
  });
});
