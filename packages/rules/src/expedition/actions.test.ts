// Tests for actions.ts (Phase 9, Plan 05): pick-objective/play-card
// transitions, trick completion, the hook seam, XRULE-07's play-stops
// guarantee, XRULE-08's no-undo/no-auto-play guarantee, and immutability.

import { describe, expect, it } from "vitest";
import { applyCampAction } from "./actions";
import { campPhase, checkCampOutcome, createCamp, currentActorSeatId } from "./camp";
import { baseRules, type CoreRules } from "./rules";
import { driveCamp } from "./test-support";
import type { CampAction, CampState, ExpeditionCard } from "./state";

/** Drives every seat's pick-objective action (first available objective, by
 * the currently-named picker) until campPhase leaves objective-pick. Throws
 * if a pick is unexpectedly rejected — that would mean the picking flow
 * itself is broken, not something under test in these tests. */
function driveObjectivePicks(state: CampState, rules: CoreRules = baseRules): CampState {
  let current = state;
  while (campPhase(current, rules) === "objective-pick") {
    const actor = currentActorSeatId(current, rules)!;
    const objective = current.objectives.find((o) => o.ownerSeatId === null)!;
    const result = applyCampAction(
      current,
      actor,
      { type: "pick-objective", objectiveId: objective.id },
      rules,
    );
    if (!result.ok) throw new Error(`unexpected pick rejection: ${result.error}`);
    current = result.state;
  }
  return current;
}

/** A hand-built playing-phase CampState one play away from a no-tricks
 * objective failing: "y" and "z" have already played a spade into the
 * current trick, and "x" (the no-tricks objective's owner) holds the only
 * higher spade, so x's play both completes the trick AND wins it,
 * flipping checkCampOutcome from in_progress to failed on that one action. */
function buildAboutToFailState(): CampState {
  const x1: ExpeditionCard = { id: "x1", identity: { kind: "standard", suit: "spades", rank: 9 } };
  const y1: ExpeditionCard = { id: "y1", identity: { kind: "standard", suit: "spades", rank: 5 } };
  const z1: ExpeditionCard = { id: "z1", identity: { kind: "standard", suit: "spades", rank: 7 } };

  return {
    seatIds: ["x", "y", "z"],
    playerCount: 3,
    removedCards: [],
    totalTricks: 1,
    hands: [
      { seatId: "x", cards: [x1] },
      { seatId: "y", cards: [] },
      { seatId: "z", cards: [] },
    ],
    expeditionLeaderSeatId: "y",
    objectives: [{ id: "obj1", kind: "no-tricks", ownerSeatId: "x" }],
    objectiveDeck: [],
    discards: [],
    completedTricks: [],
    currentTrick: {
      index: 0,
      leaderSeatId: "y",
      plays: [
        { seatId: "y", card: y1 },
        { seatId: "z", card: z1 },
      ],
    },
  };
}

describe("applyCampAction — pick-objective", () => {
  it("picks in leader-first clockwise order, the k-th pick from seatIds[(leaderIndex+k)%seatCount]", () => {
    const state = createCamp({
      seatIds: ["p0", "p1", "p2"],
      seed: "actions-seed-pick-order",
      objectiveSlots: [
        { kind: "win-card" },
        { kind: "win-card" },
        { kind: "win-card" },
        { kind: "win-card" },
      ],
    });
    const leaderIndex = state.seatIds.indexOf(state.expeditionLeaderSeatId);
    let current = state;
    for (let k = 0; k < state.objectives.length; k++) {
      const expectedPicker = state.seatIds[(leaderIndex + k) % state.seatIds.length]!;
      expect(currentActorSeatId(current)).toBe(expectedPicker);
      const objective = current.objectives.find((o) => o.ownerSeatId === null)!;
      const result = applyCampAction(current, expectedPicker, {
        type: "pick-objective",
        objectiveId: objective.id,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      current = result.state;
    }
  });

  it("after the last pick, campPhase is playing and currentActorSeatId is the leader", () => {
    const state = createCamp({
      seatIds: ["p0", "p1", "p2"],
      seed: "actions-seed-last-pick",
      objectiveSlots: [{ kind: "win-card" }],
    });
    const leader = state.expeditionLeaderSeatId;
    const objective = state.objectives[0]!;

    const result = applyCampAction(state, leader, {
      type: "pick-objective",
      objectiveId: objective.id,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(campPhase(result.state)).toBe("playing");
    expect(currentActorSeatId(result.state)).toBe(leader);
  });
});

describe("applyCampAction — play-card", () => {
  it("removes the card from the actor's hand and appends it to currentTrick.plays, leaving other hands unchanged", () => {
    const state = driveObjectivePicks(
      createCamp({
        seatIds: ["p0", "p1", "p2"],
        seed: "actions-seed-play-1",
        objectiveSlots: [{ kind: "no-tricks" }],
      }),
    );
    const leader = state.expeditionLeaderSeatId;
    const leaderHandBefore = state.hands.find((h) => h.seatId === leader)!;
    const otherHandsBefore = state.hands.filter((h) => h.seatId !== leader);
    const cardId = baseRules.legalPlays(state, leader)[0]!.id;
    const playedCard = leaderHandBefore.cards.find((c) => c.id === cardId)!;

    const result = applyCampAction(state, leader, { type: "play-card", cardId });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const leaderHandAfter = result.state.hands.find((h) => h.seatId === leader)!;
    expect(leaderHandAfter.cards.map((c) => c.id)).toEqual(
      leaderHandBefore.cards.filter((c) => c.id !== cardId).map((c) => c.id),
    );
    expect(result.state.currentTrick.plays).toEqual([{ seatId: leader, card: playedCard }]);
    for (const before of otherHandsBefore) {
      const after = result.state.hands.find((h) => h.seatId === before.seatId)!;
      expect(after).toEqual(before);
    }
  });

  it("trick completion records completedTricks and starts the next trick led by the winner", () => {
    let state = driveObjectivePicks(
      createCamp({
        seatIds: ["p0", "p1", "p2"],
        seed: "actions-seed-trick-1",
        objectiveSlots: [{ kind: "no-tricks" }],
      }),
    );
    for (let i = 0; i < state.seatIds.length; i++) {
      const actor = currentActorSeatId(state)!;
      const cardId = baseRules.legalPlays(state, actor)[0]!.id;
      const result = applyCampAction(state, actor, { type: "play-card", cardId });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      state = result.state;
    }

    expect(state.completedTricks).toHaveLength(1);
    const completed = state.completedTricks[0]!;
    expect(completed.index).toBe(0);
    expect(completed.plays).toHaveLength(3);
    const expectedWinner = baseRules.trickWinner(completed.plays, completed.plays[0]!.card.identity);
    expect(completed.winnerSeatId).toBe(expectedWinner);
    expect(state.currentTrick).toEqual({ index: 1, leaderSeatId: expectedWinner, plays: [] });
  });

  it("a custom CoreRules nextLeader determines who leads the next trick", () => {
    let state = driveObjectivePicks(
      createCamp({
        seatIds: ["p0", "p1", "p2"],
        seed: "actions-seed-custom-rules",
        objectiveSlots: [{ kind: "no-tricks" }],
      }),
    );
    const customRules: CoreRules = { ...baseRules, nextLeader: () => "p0" };

    for (let i = 0; i < state.seatIds.length; i++) {
      const actor = currentActorSeatId(state, customRules)!;
      const cardId = customRules.legalPlays(state, actor)[0]!.id;
      const result = applyCampAction(state, actor, { type: "play-card", cardId }, customRules);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      state = result.state;
    }

    expect(state.currentTrick.leaderSeatId).toBe("p0");
  });

  it("play stops: the failing action completes the trick that decides checkCampOutcome, and every further action returns camp_over", () => {
    const state = buildAboutToFailState();
    expect(checkCampOutcome(state).status).toBe("in_progress");

    const result = applyCampAction(state, "x", { type: "play-card", cardId: "x1" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(checkCampOutcome(result.state).status).toBe("failed");

    for (const seatId of result.state.seatIds) {
      const rejected = applyCampAction(result.state, seatId, {
        type: "play-card",
        cardId: "does-not-matter",
      });
      expect(rejected).toEqual({ ok: false, error: "camp_over" });
    }
  });

  it("a bad nextLeader hook result (a seat not in seatIds) throws (A3, reversal of 09-08), leaving state unchanged, once the completing play would build the next trick", () => {
    let state = driveObjectivePicks(
      createCamp({
        seatIds: ["p0", "p1", "p2"],
        seed: "actions-seed-bad-next-leader",
        objectiveSlots: [{ kind: "no-tricks" }],
      }),
    );
    const badRules: CoreRules = { ...baseRules, nextLeader: () => "ghost" };

    // Play the first two cards of trick 0 — these do not complete the trick,
    // so nextLeader is never consulted and both succeed.
    for (let i = 0; i < 2; i++) {
      const actor = currentActorSeatId(state, badRules)!;
      const cardId = badRules.legalPlays(state, actor)[0]!.id;
      const result = applyCampAction(state, actor, { type: "play-card", cardId }, badRules);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      state = result.state;
    }

    const before = structuredClone(state);
    const thirdActor = currentActorSeatId(state, badRules)!;
    const thirdHandBefore = state.hands.find((h) => h.seatId === thirdActor)!;
    const thirdCardId = badRules.legalPlays(state, thirdActor)[0]!.id;

    expect(() =>
      applyCampAction(state, thirdActor, { type: "play-card", cardId: thirdCardId }, badRules),
    ).toThrow(/nextLeader/);

    expect(state).toEqual(before);
    expect(state.completedTricks).toHaveLength(0);
    const thirdHandAfter = state.hands.find((h) => h.seatId === thirdActor)!;
    expect(thirdHandAfter).toEqual(thirdHandBefore);
    expect(thirdHandAfter.cards.some((c) => c.id === thirdCardId)).toBe(true);
  });

  it("a bad trickWinner hook result (a seat that did not play) throws (WR-05)", () => {
    let state = driveObjectivePicks(
      createCamp({
        seatIds: ["p0", "p1", "p2"],
        seed: "actions-seed-bad-trick-winner",
        objectiveSlots: [{ kind: "no-tricks" }],
      }),
    );
    const badRules: CoreRules = { ...baseRules, trickWinner: () => "ghost", nextLeader: () => "p0" };

    for (let i = 0; i < 2; i++) {
      const actor = currentActorSeatId(state, badRules)!;
      const cardId = badRules.legalPlays(state, actor)[0]!.id;
      const result = applyCampAction(state, actor, { type: "play-card", cardId }, badRules);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      state = result.state;
    }

    const before = structuredClone(state);
    const thirdActor = currentActorSeatId(state, badRules)!;
    const thirdCardId = badRules.legalPlays(state, thirdActor)[0]!.id;

    expect(() =>
      applyCampAction(state, thirdActor, { type: "play-card", cardId: thirdCardId }, badRules),
    ).toThrow(/trickWinner/);

    expect(state).toEqual(before);
    expect(state.completedTricks).toHaveLength(0);
  });

  it("nextLeader is skipped after the final trick (WR-06/IN-01): a sentinel-returning nextLeader never blocks camp end", () => {
    // A hand-built one-trick camp (mirrors buildAboutToFailState above):
    // y and z have already played, x's is the completing (and, since
    // totalTricks === 1, also the FINAL) play. y's 9♠ beats z's 7♠ and
    // x's 2♠, so y wins — x's no-tricks objective is unaffected either way
    // since x is not its owner.
    const x1: ExpeditionCard = { id: "x1", identity: { kind: "standard", suit: "spades", rank: 2 } };
    const y1: ExpeditionCard = { id: "y1", identity: { kind: "standard", suit: "spades", rank: 9 } };
    const z1: ExpeditionCard = { id: "z1", identity: { kind: "standard", suit: "spades", rank: 7 } };

    const state: CampState = {
      seatIds: ["x", "y", "z"],
      playerCount: 3,
      removedCards: [],
      totalTricks: 1,
      hands: [
        { seatId: "x", cards: [x1] },
        { seatId: "y", cards: [] },
        { seatId: "z", cards: [] },
      ],
      expeditionLeaderSeatId: "y",
      objectives: [{ id: "obj1", kind: "no-tricks", ownerSeatId: "z" }],
      objectiveDeck: [],
      discards: [],
      completedTricks: [],
      currentTrick: {
        index: 0,
        leaderSeatId: "y",
        plays: [
          { seatId: "y", card: y1 },
          { seatId: "z", card: z1 },
        ],
      },
    };
    const sentinelRules: CoreRules = {
      ...baseRules,
      // Only matters if consulted; a real boss/gear layer might return this
      // for a real trick index, but the final trick must never call it.
      nextLeader: (s, trick) => (trick.index === s.totalTricks - 1 ? "ghost" : trick.winnerSeatId),
    };

    const result = applyCampAction(state, "x", { type: "play-card", cardId: "x1" }, sentinelRules);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(result.state.completedTricks).toHaveLength(1);
    expect(result.state.completedTricks[0]!.winnerSeatId).toBe("y");
    expect(result.state.currentTrick).toEqual({ index: 1, leaderSeatId: "y", plays: [] });
  });

  it("a full camp driven with a fixed first-legal-play policy always reaches a decided outcome no later than the last trick", () => {
    let state = driveObjectivePicks(
      createCamp({
        seatIds: ["p0", "p1", "p2"],
        seed: "actions-seed-full-camp",
        objectiveSlots: [{ kind: "no-tricks" }, { kind: "exactly-n", n: 0 }],
      }),
    );
    const totalTricks = state.totalTricks;
    let guard = 0;
    const maxSteps = totalTricks * state.seatIds.length + 1;

    while (checkCampOutcome(state).status === "in_progress" && guard < maxSteps) {
      const actor = currentActorSeatId(state)!;
      const cardId = baseRules.legalPlays(state, actor)[0]!.id;
      const result = applyCampAction(state, actor, { type: "play-card", cardId });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      state = result.state;
      guard++;
    }

    expect(checkCampOutcome(state).status).not.toBe("in_progress");
    expect(state.completedTricks.length).toBeLessThanOrEqual(totalTricks);
  });
});

describe("applyCampAction — XRULE-08 (no undo, no auto-play)", () => {
  it("an unknown action type such as undo returns invalid_action and changes nothing", () => {
    const state = createCamp({
      seatIds: ["p0", "p1", "p2"],
      seed: "actions-seed-undo",
      objectiveSlots: [{ kind: "win-card" }],
    });
    const forged = { type: "undo" } as unknown as CampAction;

    const result = applyCampAction(state, state.expeditionLeaderSeatId, forged);

    expect(result).toEqual({ ok: false, error: "invalid_action" });
  });

  it("a null action returns invalid_action instead of throwing (IN-06)", () => {
    const state = createCamp({
      seatIds: ["p0", "p1", "p2"],
      seed: "actions-seed-null-action",
      objectiveSlots: [{ kind: "win-card" }],
    });
    const forged = null as unknown as CampAction;

    const result = applyCampAction(state, state.expeditionLeaderSeatId, forged);

    expect(result).toEqual({ ok: false, error: "invalid_action" });
  });

  it("a non-object action such as a bare string returns invalid_action instead of throwing (IN-06)", () => {
    const state = createCamp({
      seatIds: ["p0", "p1", "p2"],
      seed: "actions-seed-string-action",
      objectiveSlots: [{ kind: "win-card" }],
    });
    const forged = "undo" as unknown as CampAction;

    const result = applyCampAction(state, state.expeditionLeaderSeatId, forged);

    expect(result).toEqual({ ok: false, error: "invalid_action" });
  });

  it("there is no auto-play: after a trick completes, no card is played on anyone's behalf and the next actor's card stays in hand until they play it", () => {
    let state = driveObjectivePicks(
      createCamp({
        seatIds: ["p0", "p1", "p2"],
        seed: "actions-seed-no-auto-play",
        objectiveSlots: [{ kind: "no-tricks" }],
      }),
    );
    for (let i = 0; i < state.seatIds.length; i++) {
      const actor = currentActorSeatId(state)!;
      const cardId = baseRules.legalPlays(state, actor)[0]!.id;
      const result = applyCampAction(state, actor, { type: "play-card", cardId });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      state = result.state;
    }

    expect(state.currentTrick.plays).toEqual([]);
    const nextActor = currentActorSeatId(state)!;
    const nextActorHand = state.hands.find((h) => h.seatId === nextActor)!;
    const nextLegalCardId = baseRules.legalPlays(state, nextActor)[0]!.id;
    expect(nextActorHand.cards.some((c) => c.id === nextLegalCardId)).toBe(true);
  });
});

describe("applyCampAction — immutability", () => {
  it("does not mutate its input state, for both accepted and rejected actions", () => {
    const state = driveObjectivePicks(
      createCamp({
        seatIds: ["p0", "p1", "p2"],
        seed: "actions-seed-immutable",
        objectiveSlots: [{ kind: "no-tricks" }],
      }),
    );
    const before = structuredClone(state);

    const actor = currentActorSeatId(state)!;
    const cardId = baseRules.legalPlays(state, actor)[0]!.id;
    const accepted = applyCampAction(state, actor, { type: "play-card", cardId });
    expect(accepted.ok).toBe(true);
    expect(state).toEqual(before);

    const nonActor = state.seatIds.find((s) => s !== actor)!;
    const rejected = applyCampAction(state, nonActor, { type: "play-card", cardId });
    expect(rejected.ok).toBe(false);
    expect(state).toEqual(before);
  });
});

describe("camp events", () => {
  it("a full two-trick camp reports every pick, play, completion and start in order", () => {
    const card = (id: string, suit: "spades" | "hearts", rank: 2 | 3 | 5 | 7 | 13 | 14): ExpeditionCard => ({ id, identity: { kind: "standard", suit, rank } });
    const camp: CampState = {
      seatIds: ["a", "b", "c"],
      playerCount: 3,
      removedCards: [],
      totalTricks: 2,
      hands: [
        { seatId: "a", cards: [card("a1", "spades", 14), card("a2", "hearts", 2)] },
        { seatId: "b", cards: [card("b1", "spades", 5), card("b2", "hearts", 3)] },
        { seatId: "c", cards: [card("c1", "spades", 7), card("c2", "hearts", 13)] },
      ],
      expeditionLeaderSeatId: "a",
      objectives: [{ id: "o", kind: "win-card", target: { kind: "standard", suit: "hearts", rank: 13 }, ownerSeatId: null }],
      objectiveDeck: [],
      completedTricks: [],
      currentTrick: { index: 0, leaderSeatId: "a", plays: [] },
      discards: [],
    };
    const { events, states } = driveCamp(camp, [0]);
    expect(events).toEqual([
      { type: "objective-picked", seatId: "a", objectiveId: "o" },
      { type: "trick-started", trickIndex: 0, leaderSeatId: "a" },
      { type: "card-played", trickIndex: 0, position: 0, seatId: "a", cardId: "a1" },
      { type: "card-played", trickIndex: 0, position: 1, seatId: "b", cardId: "b1" },
      { type: "card-played", trickIndex: 0, position: 2, seatId: "c", cardId: "c1" },
      { type: "trick-completed", trickIndex: 0, winnerSeatId: "a", burnedCardIds: [] },
      { type: "trick-started", trickIndex: 1, leaderSeatId: "a" },
      { type: "card-played", trickIndex: 1, position: 0, seatId: "a", cardId: "a2" },
      { type: "card-played", trickIndex: 1, position: 1, seatId: "b", cardId: "b2" },
      { type: "card-played", trickIndex: 1, position: 2, seatId: "c", cardId: "c2" },
      { type: "trick-completed", trickIndex: 1, winnerSeatId: "c", burnedCardIds: [] },
    ]);
    expect(checkCampOutcome(states[states.length - 1]!).status).toBe("failed");
  });

  it("a burning rule names the burned cards on trick-completed", () => {
    const burnLowest: CoreRules = { ...baseRules, burns: (plays) => [plays[plays.length - 1]!.card.id] };
    let state = driveObjectivePicks(createCamp({ seatIds: ["p0", "p1", "p2"], seed: "burn-events", objectiveSlots: [{ kind: "no-tricks" }] }), burnLowest);
    const played: string[] = [];
    let last: ReturnType<typeof applyCampAction> | null = null;
    for (let i = 0; i < 3; i++) {
      const actor = currentActorSeatId(state, burnLowest)!;
      const cardId = burnLowest.legalPlays(state, actor)[0]!.id;
      played.push(cardId);
      last = applyCampAction(state, actor, { type: "play-card", cardId }, burnLowest);
      if (!last.ok) throw new Error(last.error);
      state = last.state;
    }
    if (last === null || !last.ok) throw new Error("no play");
    expect(last.events.find((e) => e.type === "trick-completed")).toMatchObject({ trickIndex: 0, burnedCardIds: [played[2]] });
    expect(state.completedTricks[0]!.plays.map((p) => p.burned)).toEqual([false, false, true]);
  });
});
