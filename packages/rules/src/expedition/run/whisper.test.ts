// Tests for run/whisper.ts (Plan 10-06, COMM-01/COMM-02). Fixtures mirror
// toolkit.test.ts's own discipline: a hand-built 3-seat RunState whose
// attempt.camp is createCamp(...), with objectives picked and tricks played
// via the real currentActorSeatId + applyCampAction path — never a
// hand-rolled copy of pick-order/follow-suit rules. Fake BossDef/GearDef
// objects are declared inline in a local Catalog; the catalog is empty
// unless a test says otherwise.

import { describe, expect, it } from "vitest";
import { applyCampAction } from "../actions";
import { campPhase, createCamp, currentActorSeatId } from "../camp";
import { baseRules } from "../rules";
import type { CampState } from "../state";
import type { BossDef } from "../boss/boss-def";
import type { GearDef } from "../gear/gear-def";
import { baseRunHooks, type RunRules } from "./run-rules";
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

function makeSeats(equipped: Readonly<Record<string, readonly string[]>> = {}): readonly SeatRun[] {
  return SEAT_IDS.map((seatId) => ({
    seatId,
    ownedGearIds: equipped[seatId] ?? [],
    equippedGearIds: equipped[seatId] ?? [],
    draftOffer: null,
  }));
}

function makeRun(input: {
  camp: CampState | null;
  attempt?: AttemptState | null;
  equipped?: Readonly<Record<string, readonly string[]>>;
  effects?: readonly ActiveEffect[];
  campNumber?: 1 | 2 | 3 | 4 | 5 | 6;
  bossTwists?: { readonly 3: string | null; readonly 6: string | null };
  log?: AttemptState["log"];
  seed?: string;
}): RunState {
  const attempt: AttemptState | null =
    input.attempt !== undefined
      ? input.attempt
      : {
          attemptNumber: 1,
          bossCancelled: false,
          gearUses: [],
          effects: input.effects ?? [],
          reveals: [],
          log: input.log ?? [],
          camp: input.camp,
        };

  return {
    seed: input.seed ?? "whisper-seed",
    seatIds: [...SEAT_IDS],
    campNumber: input.campNumber ?? 2,
    supplies: 10,
    seats: makeSeats(input.equipped),
    bossTwists: input.bossTwists ?? { 3: null, 6: null },
    readySeatIds: [],
    attempt,
    history: [],
  };
}

function emptyCatalog(): Catalog {
  return { gear: {}, bosses: {} };
}

describe("whisperLegality", () => {
  it("rejects during objective-pick with wrong_window", () => {
    const run = makeRun({ camp: freshCamp() });
    const actor = currentActorSeatId(run.attempt!.camp!, CORE_RULES)!;
    const target = SEAT_IDS.find((s) => s !== actor)!;
    const cardId = run.attempt!.camp!.hands.find((h) => h.seatId === actor)!.cards[0]!.id;
    const result = whisperLegality(run, actor, target, cardId, emptyCatalog());
    expect(result).toEqual({ legal: false, reason: "wrong_window" });
  });

  it("rejects at the fireside (attempt null) with wrong_phase", () => {
    const run = makeRun({ camp: null, attempt: null });
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

  it("rejects with whisper_blocked when a boss forbids whispering", () => {
    const camp = betweenTricksCamp();
    const bossDef: BossDef = {
      id: "boss-block",
      name: "Blocker",
      text: "",
      modifiers: {
        whisperAllowed: () => () => false,
      },
    };
    const catalog: Catalog = { gear: {}, bosses: { "boss-block": bossDef } };
    const run = makeRun({ camp, campNumber: 3, bossTwists: { 3: "boss-block", 6: null } });
    const cardId = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;
    const result = whisperLegality(run, "p0", "p1", cardId, catalog);
    expect(result).toEqual({ legal: false, reason: "whisper_blocked" });
  });

  it("rejects a second whisper by the same seat with no_whispers_left (base whispersPerCamp 1)", () => {
    const camp = betweenTricksCamp();
    const run = makeRun({
      camp,
      log: [{ event: "whisper", actorSeatId: "p0", subjectSeatIds: ["p1"], gearId: null, audience: "public" }],
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
    expect(result.state.attempt!.reveals).toEqual([
      { cardId, fromSeatId: "p0", audience: ["p1"], source: "whisper", targetSeatId: "p1" },
    ]);
    expect(result.state.attempt!.log).toEqual([
      { event: "whisper", actorSeatId: "p0", subjectSeatIds: ["p1"], gearId: null, audience: "public" },
    ]);
    expect(whispersUsedBy(result.state, "p0")).toBe(1);
    expect(run).toEqual(before); // input state not mutated
  });

  it("a fake effect layer raising whispersPerCamp to 2 for p0 allows a second whisper", () => {
    const camp = betweenTricksCamp();
    const boostGear: GearDef = {
      id: "boost",
      name: "Boost",
      size: 1,
      window: "passive",
      text: "",
      targets: [],
      effectModifier(effect: ActiveEffect) {
        return {
          whispersPerCamp: (prev) => (r, seatId) => (seatId === effect.seatId ? 2 : prev(r, seatId)),
        };
      },
    };
    const catalog: Catalog = { gear: { boost: boostGear }, bosses: {} };
    const run = makeRun({
      camp,
      effects: [{ gearId: "boost", seatId: "p0", atTrick: 0 }],
      log: [{ event: "whisper", actorSeatId: "p0", subjectSeatIds: ["p1"], gearId: null, audience: "public" }],
    });
    const cardId = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;

    const result = applyWhisper(run, "p0", { targetSeatId: "p2", cardId }, catalog);

    expect(result.ok).toBe(true);
  });

  it("a fake whisperAudience layer returning all seats produces an audience of all seats", () => {
    const camp = betweenTricksCamp();
    const broadcastGear: GearDef = {
      id: "broadcast",
      name: "Broadcast",
      size: 1,
      window: "passive",
      text: "",
      targets: [],
      effectModifier() {
        return {
          whisperAudience: () => (r) => [...r.seatIds],
        };
      },
    };
    const catalog: Catalog = { gear: { broadcast: broadcastGear }, bosses: {} };
    const run = makeRun({ camp, effects: [{ gearId: "broadcast", seatId: "p0", atTrick: 0 }] });
    const cardId = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;

    const result = applyWhisper(run, "p0", { targetSeatId: "p1", cardId }, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.attempt!.reveals[0]!.audience).toEqual(["p0", "p1", "p2"]);
  });

  it("the whisper stays in attempt.reveals after further tricks are played (COMM-02 within the camp)", () => {
    const camp = betweenTricksCamp();
    const run = makeRun({ camp });
    const cardId = camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;

    const whispered = applyWhisper(run, "p0", { targetSeatId: "p1", cardId }, emptyCatalog());
    expect(whispered.ok).toBe(true);
    if (!whispered.ok) return;

    const afterTrick = playOneTrick(whispered.state.attempt!.camp!);
    const finalRun: RunState = { ...whispered.state, attempt: { ...whispered.state.attempt!, camp: afterTrick } };

    expect(finalRun.attempt!.reveals).toEqual([{ cardId, fromSeatId: "p0", audience: ["p1"], source: "whisper", targetSeatId: "p1" }]);
  });
});
