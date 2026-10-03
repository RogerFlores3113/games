// Tests for run/compose.ts (Plan 10-03: composeRules, ruleLayersFor,
// rulesFor, activeBossId).

import { describe, expect, it } from "vitest";
import { createCamp } from "../camp";
import { baseRules } from "../rules";
import { isTrump, trickWinner } from "../trick";
import { activeBossId, composeRules, ruleLayersFor, rulesFor } from "./compose";
import type { RuleModifier } from "./run-rules";
import type { AttemptState, Catalog, RunState, SeatRun } from "./types";
import type { CampState, CardIdentity, ExpeditionCard, Hand, TrickPlay } from "../state";
import type { GearDef } from "../gear/gear-def";
import type { BossDef } from "../boss/boss-def";

function seat(seatId: string, overrides: Partial<SeatRun> = {}): SeatRun {
  return { seatId, ownedGearIds: [], equippedGearIds: [], draftOffer: null, ...overrides };
}

function makeRun(overrides: Partial<RunState> = {}): RunState {
  const seatIds = overrides.seatIds ?? ["p0", "p1", "p2"];
  return {
    seed: "test-seed",
    seatIds,
    campNumber: 2,
    supplies: 3,
    seats: seatIds.map((id) => seat(id)),
    bossTwists: { 3: null, 6: null },
    readySeatIds: [],
    attempt: null,
    history: [],
    ...overrides,
  };
}

function makeAttempt(overrides: Partial<AttemptState> = {}): AttemptState {
  return {
    attemptNumber: 1,
    bossCancelled: false,
    gearUses: [],
    effects: [],
    reveals: [],
    log: [],
    camp: null,
    ...overrides,
  };
}

function card(id: string, identity: CardIdentity): ExpeditionCard {
  return { id, identity };
}

const HEARTS_5: CardIdentity = { kind: "standard", suit: "hearts", rank: 5 };
const HEARTS_2: CardIdentity = { kind: "standard", suit: "hearts", rank: 2 };
const SPADES_3: CardIdentity = { kind: "standard", suit: "spades", rank: 3 };
const SPADES_7: CardIdentity = { kind: "standard", suit: "spades", rank: 7 };
const HEARTS_9: CardIdentity = { kind: "standard", suit: "hearts", rank: 9 };
const MOON: CardIdentity = { kind: "joker", joker: "moon" };

/** A layer that ADDS spades to whatever isTrump already recognizes (jokers
 * stay trump too), used for the WR-03-via-composition behavior test. */
const spadesAlsoTrump: RuleModifier = {
  isTrump: (prev) => (identity) => prev(identity) || (identity.kind === "standard" && identity.suit === "spades"),
};

function minimalCampStateFor(hands: readonly Hand[], currentTrickPlays: readonly TrickPlay[]): CampState {
  return {
    seatIds: hands.map((h) => h.seatId),
    playerCount: hands.length as 3 | 4 | 5,
    removedCards: [],
    totalTricks: 1,
    hands,
    expeditionLeaderSeatId: hands[0]!.seatId,
    objectives: [],
    objectiveDeck: [],
    completedTricks: [],
    currentTrick: { index: 0, leaderSeatId: hands[0]!.seatId, plays: currentTrickPlays },
  };
}

describe("composeRules([])", () => {
  it("trickWinner matches the base resolver", () => {
    const plays: TrickPlay[] = [
      { seatId: "p0", card: card("c0", HEARTS_5) },
      { seatId: "p1", card: card("c1", SPADES_3) },
      { seatId: "p2", card: card("c2", HEARTS_2) },
    ];
    const composed = composeRules([]);
    expect(composed.trickWinner(plays)).toBe(trickWinner(plays, isTrump));
    expect(composed.trickWinner(plays)).toBe("p0");
  });

  it("legalPlays matches the base resolver", () => {
    const hands: Hand[] = [
      { seatId: "p0", cards: [card("c0", HEARTS_9), card("c1", MOON)] },
      { seatId: "p1", cards: [] },
    ];
    const currentTrickPlays: TrickPlay[] = [{ seatId: "p1", card: card("led", SPADES_7) }];
    const state = minimalCampStateFor(hands, currentTrickPlays);
    const composed = composeRules([]);
    expect(composed.legalPlays(state, "p0")).toEqual(baseRules.legalPlays(state, "p0"));
  });

  it("has base-value whisper/objective/failure hooks", () => {
    const run = makeRun();
    const composed = composeRules([]);
    expect(composed.whisperAllowed(run, "p0")).toBe(true);
    expect(composed.whispersPerCamp(run, "p0")).toBe(1);
    expect(composed.whisperAudience(run, "p0", "p1")).toEqual(["p1"]);
    expect(composed.objectiveAssignment(run)).toBe("face-up");
    expect(composed.failureCost(run)).toBe(1);
  });
});

describe("composeRules layer folding", () => {
  it("folds two whispersPerCamp layers in order (non-commutative)", () => {
    const doubler: RuleModifier = { whispersPerCamp: (prev) => (run, seatId) => prev(run, seatId) * 2 };
    const incrementer: RuleModifier = { whispersPerCamp: (prev) => (run, seatId) => prev(run, seatId) + 1 };
    const run = makeRun();

    const doublerThenIncrementer = composeRules([doubler, incrementer]);
    expect(doublerThenIncrementer.whispersPerCamp(run, "p0")).toBe(3); // (1*2)+1

    const incrementerThenDoubler = composeRules([incrementer, doubler]);
    expect(incrementerThenDoubler.whispersPerCamp(run, "p0")).toBe(4); // (1+1)*2
  });

  it("an isTrump-only layer changes the composed trickWinner (WR-03)", () => {
    const plays: TrickPlay[] = [
      { seatId: "p0", card: card("c0", HEARTS_5) },
      { seatId: "p1", card: card("c1", SPADES_3) },
      { seatId: "p2", card: card("c2", HEARTS_2) },
    ];
    expect(composeRules([]).trickWinner(plays)).toBe("p0");
    expect(composeRules([spadesAlsoTrump]).trickWinner(plays)).toBe("p1");
  });

  it("a rankOf layer changes the composed trickWinner, folded in layer order", () => {
    const plays: TrickPlay[] = [
      { seatId: "p0", card: card("c0", HEARTS_5) },
      { seatId: "p1", card: card("c1", HEARTS_9) },
      { seatId: "p2", card: card("c2", HEARTS_2) },
    ];
    const twoUpFive: RuleModifier = { rankOf: (prev) => (c) => (c.id === "c2" ? prev(c) + 5 : prev(c)) };
    const twoUpThree: RuleModifier = { rankOf: (prev) => (c) => (c.id === "c2" ? prev(c) + 3 : prev(c)) };
    expect(composeRules([]).trickWinner(plays)).toBe("p1");
    expect(composeRules([twoUpFive]).trickWinner(plays)).toBe("p1"); // 7 < 9
    expect(composeRules([twoUpFive, twoUpThree]).trickWinner(plays)).toBe("p2"); // 10 > 9
  });

  it("an isTrump-only layer changes the composed legalPlays (WR-03)", () => {
    const hands: Hand[] = [{ seatId: "p0", cards: [card("c0", HEARTS_9), card("c1", MOON)] }];
    const currentTrickPlays: TrickPlay[] = [{ seatId: "p9", card: card("led", SPADES_7) }];
    const state = minimalCampStateFor(hands, currentTrickPlays);

    const defaultLegal = composeRules([]).legalPlays(state, "p0");
    expect(defaultLegal.map((c) => c.id).sort()).toEqual(["c0", "c1"]); // void of spades, whole hand legal

    const trumpLegal = composeRules([spadesAlsoTrump]).legalPlays(state, "p0");
    expect(trumpLegal.map((c) => c.id)).toEqual(["c1"]); // led is now trump; must play the joker
  });
});

describe("activeBossId", () => {
  it("is null at the fireside (attempt null)", () => {
    const run = makeRun({ campNumber: 3, bossTwists: { 3: "boss-x", 6: null }, attempt: null });
    expect(activeBossId(run)).toBeNull();
  });

  it("is null when bossCancelled is true", () => {
    const run = makeRun({
      campNumber: 3,
      bossTwists: { 3: "boss-x", 6: null },
      attempt: makeAttempt({ bossCancelled: true }),
    });
    expect(activeBossId(run)).toBeNull();
  });

  it("is null on a non-boss camp", () => {
    const run = makeRun({ campNumber: 2, bossTwists: { 3: "boss-x", 6: null }, attempt: makeAttempt() });
    expect(activeBossId(run)).toBeNull();
  });

  it("returns bossTwists[campNumber] on an active boss camp", () => {
    const run = makeRun({ campNumber: 3, bossTwists: { 3: "boss-x", 6: null }, attempt: makeAttempt() });
    expect(activeBossId(run)).toBe("boss-x");
  });
});

describe("rulesFor / ruleLayersFor", () => {
  const bossX: BossDef = { id: "boss-x", name: "X", text: "", modifiers: { whisperAllowed: () => () => false } };
  const capacityGear: GearDef = {
    id: "gear-cap2",
    name: "Cap+2",
    size: 1,
    window: "passive",
    text: "",
    targets: [],
    passiveModifier(ownerSeatId) {
      return {
        capacity: (prev) => (run, seatId) => (seatId === ownerSeatId ? prev(run, seatId) + 2 : prev(run, seatId)),
      };
    },
  };
  const effectGear: GearDef = {
    id: "gear-effect",
    name: "Effect+1",
    size: 1,
    window: "passive",
    text: "",
    targets: [],
    effectModifier() {
      return { whispersPerCamp: (prev) => (run, seatId) => prev(run, seatId) + 1 };
    },
  };
  const catalog: Catalog = { gear: { "gear-cap2": capacityGear, "gear-effect": effectGear }, bosses: { "boss-x": bossX } };

  it("applies the boss layer only while active", () => {
    const runBoss = makeRun({ campNumber: 3, bossTwists: { 3: "boss-x", 6: null }, attempt: makeAttempt() });
    expect(rulesFor(runBoss, catalog).whisperAllowed(runBoss, "p0")).toBe(false);

    const runFireside = makeRun({ campNumber: 3, bossTwists: { 3: "boss-x", 6: null }, attempt: null });
    expect(rulesFor(runFireside, catalog).whisperAllowed(runFireside, "p0")).toBe(true);
  });

  it("applies an equipped passive gear only for its owner", () => {
    const run = makeRun({
      campNumber: 4,
      seats: [seat("p0", { equippedGearIds: [] }), seat("p1", { equippedGearIds: ["gear-cap2"] }), seat("p2")],
      attempt: makeAttempt(),
    });
    const rules = rulesFor(run, catalog);
    expect(rules.capacity(run, "p1")).toBe(6); // campNumber(4) + 2
    expect(rules.capacity(run, "p0")).toBe(4);
  });

  it("applies effectModifier for attempt.effects", () => {
    const run = makeRun({
      campNumber: 2,
      attempt: makeAttempt({ effects: [{ gearId: "gear-effect", seatId: "p0", atTrick: 1 }] }),
    });
    expect(rulesFor(run, catalog).whispersPerCamp(run, "p0")).toBe(2);
  });

  it("capacity equals campNumber regardless of attemptNumber (RUN-03)", () => {
    const run1 = makeRun({ campNumber: 3, attempt: makeAttempt({ attemptNumber: 1 }) });
    const run3 = makeRun({ campNumber: 3, attempt: makeAttempt({ attemptNumber: 3 }) });
    expect(rulesFor(run1, catalog).capacity(run1, "p0")).toBe(3);
    expect(rulesFor(run3, catalog).capacity(run3, "p0")).toBe(3);
  });

  it("recomputes on every call — no cache (T-10-08)", () => {
    const withoutEffect = makeRun({ campNumber: 2, attempt: makeAttempt({ effects: [] }) });
    const withEffect = makeRun({
      campNumber: 2,
      attempt: makeAttempt({ effects: [{ gearId: "gear-effect", seatId: "p0", atTrick: 1 }] }),
    });
    expect(rulesFor(withoutEffect, catalog).whispersPerCamp(withoutEffect, "p0")).toBe(1);
    expect(rulesFor(withEffect, catalog).whispersPerCamp(withEffect, "p0")).toBe(2);
  });

  it("throws naming an equipped gear id missing from the catalog (POLICY A3)", () => {
    const run = makeRun({ seats: [seat("p0", { equippedGearIds: ["ghost-gear"] }), seat("p1"), seat("p2")] });
    expect(() => ruleLayersFor(run, catalog)).toThrow(/ghost-gear/);
  });

  it("throws naming an unknown boss id (POLICY A3)", () => {
    const run = makeRun({ campNumber: 3, bossTwists: { 3: "no-such-boss", 6: null }, attempt: makeAttempt() });
    expect(() => ruleLayersFor(run, catalog)).toThrow(/no-such-boss/);
  });
});

describe("composeRules([]) end-to-end against a createCamp fixture", () => {
  it("createCamp accepts composeRules([]) as a CoreRules", () => {
    const rules = composeRules([]);
    const camp = createCamp({ seatIds: ["p0", "p1", "p2"], seed: "fixture-seed", objectiveSlots: [{ kind: "win-card" }] }, rules);
    expect(camp.seatIds).toEqual(["p0", "p1", "p2"]);
  });
});
