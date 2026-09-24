// Tests for legality.ts (Phase 9, Plan 05). One test per CampError reason
// the predicates can return, plus the own-hand-only and camp_over-wins-over
// -everything guarantees (T-09-11, T-09-12, T-09-13).

import { describe, expect, it } from "vitest";
import { createCamp } from "./camp";
import { canPickObjective, canPlayCard, findOwnCard } from "./legality";
import type { CampState, CompletedTrick, ExpeditionCard, Objective } from "./state";

function pickedState(state: CampState, objectiveId: string, seatId: string): CampState {
  return {
    ...state,
    objectives: state.objectives.map((o) =>
      o.id === objectiveId ? { ...o, ownerSeatId: seatId } : o,
    ),
  };
}

describe("findOwnCard", () => {
  it("finds a card only inside the named seat's own hand", () => {
    const state = createCamp({
      seatIds: ["a", "b", "c"],
      seed: "legality-seed-1",
      objectiveSlots: [{ kind: "no-tricks" }],
    });
    const aHand = state.hands.find((h) => h.seatId === "a")!;
    const bHand = state.hands.find((h) => h.seatId === "b")!;
    const aCardId = aHand.cards[0]!.id;
    const bCardId = bHand.cards[0]!.id;

    expect(findOwnCard(state, "a", aCardId)).not.toBeNull();
    // Another seat's card id, searched under seat "a", must miss.
    expect(findOwnCard(state, "a", bCardId)).toBeNull();
    expect(findOwnCard(state, "b", bCardId)).not.toBeNull();
    expect(findOwnCard(state, "a", "unknown-card-id")).toBeNull();
  });
});

describe("canPickObjective", () => {
  it("is legal for the leader picking any face-up objective", () => {
    const state = createCamp({
      seatIds: ["a", "b", "c"],
      seed: "legality-seed-2",
      objectiveSlots: [{ kind: "win-card" }, { kind: "win-card" }],
    });
    const leader = state.expeditionLeaderSeatId;
    const objectiveId = state.objectives[0]!.id;

    expect(canPickObjective(state, leader, objectiveId)).toEqual({ legal: true });
  });

  it("rejects any seat other than the leader with not_your_turn", () => {
    const state = createCamp({
      seatIds: ["a", "b", "c"],
      seed: "legality-seed-2",
      objectiveSlots: [{ kind: "win-card" }, { kind: "win-card" }],
    });
    const leader = state.expeditionLeaderSeatId;
    const other = state.seatIds.find((s) => s !== leader)!;
    const objectiveId = state.objectives[0]!.id;

    expect(canPickObjective(state, other, objectiveId)).toEqual({
      legal: false,
      reason: "not_your_turn",
    });
  });

  it("rejects the leader picking an unknown objective id with objective_not_available", () => {
    const state = createCamp({
      seatIds: ["a", "b", "c"],
      seed: "legality-seed-2",
      objectiveSlots: [{ kind: "win-card" }, { kind: "win-card" }],
    });
    const leader = state.expeditionLeaderSeatId;

    expect(canPickObjective(state, leader, "no-such-objective")).toEqual({
      legal: false,
      reason: "objective_not_available",
    });
  });

  it("after the leader picks, the leader picking again is not_your_turn", () => {
    const state = createCamp({
      seatIds: ["a", "b", "c"],
      seed: "legality-seed-2",
      objectiveSlots: [{ kind: "win-card" }, { kind: "win-card" }],
    });
    const leader = state.expeditionLeaderSeatId;
    const firstObjectiveId = state.objectives[0]!.id;
    const afterPick = pickedState(state, firstObjectiveId, leader);
    const secondObjectiveId = state.objectives[1]!.id;

    expect(canPickObjective(afterPick, leader, secondObjectiveId)).toEqual({
      legal: false,
      reason: "not_your_turn",
    });
  });

  it("the next clockwise seat picking the already-taken objective is objective_not_available", () => {
    const state = createCamp({
      seatIds: ["a", "b", "c"],
      seed: "legality-seed-2",
      objectiveSlots: [{ kind: "win-card" }, { kind: "win-card" }],
    });
    const leader = state.expeditionLeaderSeatId;
    const firstObjectiveId = state.objectives[0]!.id;
    const afterPick = pickedState(state, firstObjectiveId, leader);
    const leaderIndex = afterPick.seatIds.indexOf(leader);
    const nextPicker = afterPick.seatIds[(leaderIndex + 1) % afterPick.seatIds.length]!;

    expect(canPickObjective(afterPick, nextPicker, firstObjectiveId)).toEqual({
      legal: false,
      reason: "objective_not_available",
    });
  });

  it("is wrong_phase once the camp has moved into playing", () => {
    const playing = buildPlayingState();
    expect(canPickObjective(playing, "b", "obj1")).toEqual({
      legal: false,
      reason: "wrong_phase",
    });
  });

  it("is camp_over once the camp outcome is decided, regardless of seat", () => {
    const failed = buildFailedState();
    expect(canPickObjective(failed, failed.expeditionLeaderSeatId, failed.objectives[0]!.id)).toEqual({
      legal: false,
      reason: "camp_over",
    });
    const other = failed.seatIds.find((s) => s !== failed.expeditionLeaderSeatId)!;
    expect(canPickObjective(failed, other, failed.objectives[0]!.id)).toEqual({
      legal: false,
      reason: "camp_over",
    });
  });
});

describe("canPlayCard", () => {
  it("is wrong_phase during objective-pick", () => {
    const state = createCamp({
      seatIds: ["a", "b", "c"],
      seed: "legality-seed-2",
      objectiveSlots: [{ kind: "win-card" }, { kind: "win-card" }],
    });
    const leader = state.expeditionLeaderSeatId;
    const leaderHand = state.hands.find((h) => h.seatId === leader)!;
    const cardId = leaderHand.cards[0]!.id;

    expect(canPlayCard(state, leader, cardId)).toEqual({ legal: false, reason: "wrong_phase" });
  });

  it("is legal for the current actor playing an own card that is in rules.legalPlays", () => {
    const playing = buildPlayingState();
    // "b" is the current actor (leaderSeatId "a" led one play; next is "b").
    expect(canPlayCard(playing, "b", "b1")).toEqual({ legal: true });
  });

  it("rejects a non-actor with not_your_turn", () => {
    const playing = buildPlayingState();
    expect(canPlayCard(playing, "c", "c1")).toEqual({ legal: false, reason: "not_your_turn" });
  });

  it("rejects the actor naming another seat's card id with card_not_in_hand", () => {
    const playing = buildPlayingState();
    // "a2" is in seat a's hand, not seat b's.
    expect(canPlayCard(playing, "b", "a2")).toEqual({ legal: false, reason: "card_not_in_hand" });
  });

  it("rejects the actor naming an off-suit card while holding the led suit with must_follow_suit", () => {
    const playing = buildPlayingState();
    // "b2" is hearts; the led suit is spades and b holds a spade (b1).
    expect(canPlayCard(playing, "b", "b2")).toEqual({ legal: false, reason: "must_follow_suit" });
  });

  it("is camp_over once the camp outcome is decided, regardless of seat", () => {
    const failed = buildFailedState();
    const owner = failed.expeditionLeaderSeatId;
    const ownerCardId = failed.hands.find((h) => h.seatId === owner)!.cards[0]!.id;
    expect(canPlayCard(failed, owner, ownerCardId)).toEqual({ legal: false, reason: "camp_over" });
  });
});

/** A hand-built playing-phase CampState with full control over hand
 * contents, so follow-suit and own-hand-only rejections are deterministic.
 * Seat "a" led a spade; seat "b" (the current actor) holds one spade (b1)
 * and one heart (b2); seat "c" is untouched. */
function buildPlayingState(): CampState {
  const a1: ExpeditionCard = { id: "a1", identity: { kind: "standard", suit: "spades", rank: 5 } };
  const a2: ExpeditionCard = { id: "a2", identity: { kind: "standard", suit: "hearts", rank: 7 } };
  const b1: ExpeditionCard = { id: "b1", identity: { kind: "standard", suit: "spades", rank: 9 } };
  const b2: ExpeditionCard = { id: "b2", identity: { kind: "standard", suit: "hearts", rank: 2 } };
  const c1: ExpeditionCard = { id: "c1", identity: { kind: "standard", suit: "spades", rank: 3 } };

  const objectives: Objective[] = [{ id: "obj1", kind: "no-tricks", ownerSeatId: "a" }];

  return {
    seatIds: ["a", "b", "c"],
    playerCount: 3,
    removedCards: [],
    totalTricks: 2,
    hands: [
      { seatId: "a", cards: [a2] },
      { seatId: "b", cards: [b1, b2] },
      { seatId: "c", cards: [c1] },
    ],
    expeditionLeaderSeatId: "a",
    objectives,
    objectiveDeck: [],
    completedTricks: [],
    currentTrick: { index: 0, leaderSeatId: "a", plays: [{ seatId: "a", card: a1 }] },
  };
}

/** A hand-built camp state whose sole win-card objective has already
 * failed (won by a seat other than its owner), so checkCampOutcome reads
 * "failed" and every predicate must return camp_over. */
function buildFailedState(): CampState {
  const state = createCamp({
    seatIds: ["a", "b", "c"],
    seed: "legality-seed-3",
    objectiveSlots: [{ kind: "win-card" }],
  });
  const owner = state.expeditionLeaderSeatId;
  const otherSeat = state.seatIds.find((s) => s !== owner)!;
  const objective = state.objectives[0]!;
  const target = objective.kind === "win-card" ? objective.target : (() => {
    throw new Error("expected a win-card objective");
  })();

  const losingTrick: CompletedTrick = {
    index: 0,
    leaderSeatId: owner,
    plays: [{ seatId: otherSeat, card: { id: "fake-winning-card", identity: target } }],
    winnerSeatId: otherSeat,
  };

  return {
    ...state,
    objectives: [{ ...objective, ownerSeatId: owner }],
    completedTricks: [losingTrick],
    currentTrick: { index: 1, leaderSeatId: otherSeat, plays: [] },
  };
}
