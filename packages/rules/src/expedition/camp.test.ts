// Camp setup, derived phase/actor, and outcome tests (Phase 9, Plan 04).
// See camp.ts's header for the derive-fresh-every-call discipline this
// suite exercises.

import { describe, expect, it } from "vitest";
import { baseDeckFor, buildFullDeck, buildObjectiveDeck, identitiesEqual } from "./deck";
import { baseRules, type CoreRules } from "./rules";
import { campPhase, checkCampOutcome, createCamp, currentActorSeatId } from "./camp";
import type { CampState, CompletedTrick, ObjectiveSlot, StandardIdentity } from "./state";

const SEATS_3 = ["a", "b", "c"] as const;
const SEATS_4 = ["a", "b", "c", "d"] as const;
const SEATS_5 = ["a", "b", "c", "d", "e"] as const;
const SEED = "camp-seed-1";

function std(suit: StandardIdentity["suit"], rank: StandardIdentity["rank"]): StandardIdentity {
  return { kind: "standard", suit, rank };
}

describe("createCamp — hand sizes, removed cards, trick shell", () => {
  it("3 players: hand size 18, totalTricks 18, no removed cards", () => {
    const camp = createCamp({ seatIds: SEATS_3, seed: SEED, objectiveSlots: [{ kind: "no-tricks" }] });
    expect(camp.totalTricks).toBe(18);
    expect(camp.hands.every((h) => h.cards.length === 18)).toBe(true);
    expect(camp.removedCards).toHaveLength(0);
    expect(camp.completedTricks).toEqual([]);
    expect(camp.currentTrick).toEqual({ index: 0, leaderSeatId: camp.expeditionLeaderSeatId, plays: [] });
  });

  it("4 players: hand size 13, totalTricks 13, 2 removed cards", () => {
    const camp = createCamp({ seatIds: SEATS_4, seed: SEED, objectiveSlots: [{ kind: "no-tricks" }] });
    expect(camp.totalTricks).toBe(13);
    expect(camp.hands.every((h) => h.cards.length === 13)).toBe(true);
    expect(camp.removedCards).toHaveLength(2);
  });

  it("5 players: hand size 10, totalTricks 10, 4 removed cards", () => {
    const camp = createCamp({ seatIds: SEATS_5, seed: SEED, objectiveSlots: [{ kind: "no-tricks" }] });
    expect(camp.totalTricks).toBe(10);
    expect(camp.hands.every((h) => h.cards.length === 10)).toBe(true);
    expect(camp.removedCards).toHaveLength(4);
  });
});

describe("createCamp — leader and objectives", () => {
  it("expeditionLeaderSeatId is the seat holding the Sun", () => {
    const camp = createCamp({ seatIds: SEATS_4, seed: SEED, objectiveSlots: [{ kind: "no-tricks" }] });
    const sunHolder = camp.hands.find((h) =>
      h.cards.some((c) => c.identity.kind === "joker" && c.identity.joker === "sun"),
    );
    expect(sunHolder).toBeDefined();
    expect(camp.expeditionLeaderSeatId).toBe(sunHolder!.seatId);
  });

  it("flips objectives in slot order, all face-up, card-bearing ones from the top of the objective deck", () => {
    const objectiveSlots: ObjectiveSlot[] = [
      { kind: "win-card" },
      { kind: "ordered", order: 1 },
      { kind: "ordered", order: "last" },
      { kind: "no-tricks" },
      { kind: "exactly-n", n: 2 },
    ];
    const camp = createCamp({ seatIds: SEATS_3, seed: SEED, objectiveSlots });
    expect(camp.objectives).toHaveLength(5);
    expect(camp.objectives.map((o) => o.kind)).toEqual(["win-card", "ordered", "ordered", "no-tricks", "exactly-n"]);
    expect(camp.objectives.every((o) => o.ownerSeatId === null)).toBe(true);

    const fullObjectiveDeck = buildObjectiveDeck({ deck: baseDeckFor(3), seed: SEED });
    const [first, second, third] = fullObjectiveDeck;
    const winCard = camp.objectives[0]!;
    const ordered1 = camp.objectives[1]!;
    const orderedLast = camp.objectives[2]!;
    expect(winCard.kind).toBe("win-card");
    expect(ordered1.kind).toBe("ordered");
    expect(orderedLast.kind).toBe("ordered");
    if (winCard.kind === "win-card") expect(identitiesEqual(winCard.target, first!)).toBe(true);
    if (ordered1.kind === "ordered") {
      expect(identitiesEqual(ordered1.target, second!)).toBe(true);
      expect(ordered1.order).toBe(1);
    }
    if (orderedLast.kind === "ordered") {
      expect(identitiesEqual(orderedLast.target, third!)).toBe(true);
      expect(orderedLast.order).toBe("last");
    }

    // The undrawn remainder stays in objectiveDeck: objectives + objectiveDeck
    // together are the full standard-identity pool.
    expect(camp.objectiveDeck).toHaveLength(fullObjectiveDeck.length - 3);
  });

  it("objective ids are 8-letter minted ids, unique, and never equal to any card id", () => {
    const objectiveSlots: ObjectiveSlot[] = [
      { kind: "win-card" },
      { kind: "ordered", order: 1 },
      { kind: "no-tricks" },
    ];
    const camp = createCamp({ seatIds: SEATS_3, seed: SEED, objectiveSlots });
    const objectiveIds = camp.objectives.map((o) => o.id);
    expect(objectiveIds.every((id) => /^[a-z]{8}$/.test(id))).toBe(true);
    expect(new Set(objectiveIds).size).toBe(objectiveIds.length);

    const cardIds = camp.hands.flatMap((h) => h.cards.map((c) => c.id));
    for (const objectiveId of objectiveIds) {
      expect(cardIds).not.toContain(objectiveId);
    }
  });
});

describe("createCamp — determinism", () => {
  it("same inputs produce a deep-equal camp", () => {
    const objectiveSlots: ObjectiveSlot[] = [{ kind: "no-tricks" }];
    const a = createCamp({ seatIds: SEATS_3, seed: SEED, objectiveSlots });
    const b = createCamp({ seatIds: SEATS_3, seed: SEED, objectiveSlots });
    expect(a).toEqual(b);
  });

  it("a different seed produces different hands", () => {
    const objectiveSlots: ObjectiveSlot[] = [{ kind: "no-tricks" }];
    const a = createCamp({ seatIds: SEATS_3, seed: SEED, objectiveSlots });
    const b = createCamp({ seatIds: SEATS_3, seed: "a-different-seed", objectiveSlots });
    expect(a.hands).not.toEqual(b.hands);
  });
});

describe("createCamp — rejects malformed setup input", () => {
  it("throws for 2 seats", () => {
    expect(() =>
      createCamp({ seatIds: ["a", "b"], seed: SEED, objectiveSlots: [{ kind: "no-tricks" }] }),
    ).toThrow();
  });

  it("throws for 6 seats", () => {
    expect(() =>
      createCamp({
        seatIds: ["a", "b", "c", "d", "e", "f"],
        seed: SEED,
        objectiveSlots: [{ kind: "no-tricks" }],
      }),
    ).toThrow();
  });

  it("throws for duplicate seat ids", () => {
    expect(() =>
      createCamp({ seatIds: ["a", "a", "b"], seed: SEED, objectiveSlots: [{ kind: "no-tricks" }] }),
    ).toThrow();
  });

  it("throws for empty objectiveSlots", () => {
    expect(() => createCamp({ seatIds: SEATS_3, seed: SEED, objectiveSlots: [] })).toThrow();
  });

  it("throws when more card-bearing slots are requested than the objective deck holds", () => {
    const tooManySlots: ObjectiveSlot[] = Array.from({ length: 53 }, () => ({ kind: "win-card" as const }));
    expect(() => createCamp({ seatIds: SEATS_3, seed: SEED, objectiveSlots: tooManySlots })).toThrow();
  });

  it("throws for exactly-n with n not an integer in [0, totalTricks]", () => {
    expect(() =>
      createCamp({ seatIds: SEATS_3, seed: SEED, objectiveSlots: [{ kind: "exactly-n", n: 1.5 }] }),
    ).toThrow();
    expect(() =>
      createCamp({ seatIds: SEATS_3, seed: SEED, objectiveSlots: [{ kind: "exactly-n", n: -1 }] }),
    ).toThrow();
    expect(() =>
      // totalTricks is 18 for 3 seats
      createCamp({ seatIds: SEATS_3, seed: SEED, objectiveSlots: [{ kind: "exactly-n", n: 19 }] }),
    ).toThrow();
  });

  it("throws for ordered with a non-positive-integer number", () => {
    expect(() =>
      createCamp({ seatIds: SEATS_3, seed: SEED, objectiveSlots: [{ kind: "ordered", order: 0 }] }),
    ).toThrow();
    expect(() =>
      createCamp({ seatIds: SEATS_3, seed: SEED, objectiveSlots: [{ kind: "ordered", order: 1.5 }] }),
    ).toThrow();
    expect(() =>
      createCamp({ seatIds: SEATS_3, seed: SEED, objectiveSlots: [{ kind: "ordered", order: -2 }] }),
    ).toThrow();
  });

  it("throws for duplicate ordered numbers", () => {
    const objectiveSlots: ObjectiveSlot[] = [
      { kind: "ordered", order: 1 },
      { kind: "ordered", order: 1 },
    ];
    expect(() => createCamp({ seatIds: SEATS_3, seed: SEED, objectiveSlots })).toThrow();
  });

  it("throws for more than one 'last'", () => {
    const objectiveSlots: ObjectiveSlot[] = [
      { kind: "ordered", order: "last" },
      { kind: "ordered", order: "last" },
    ];
    expect(() => createCamp({ seatIds: SEATS_3, seed: SEED, objectiveSlots })).toThrow();
  });
});

describe("createCamp — hook seam proven overridable", () => {
  it("with 4 seats, a custom deckFor with no jokers records exactly the Sun and Moon as removed and picks the A of spades holder as leader", () => {
    const noJokerRules: CoreRules = {
      ...baseRules,
      deckFor: () => buildFullDeck().filter((c) => c.kind === "standard"),
    };
    const camp = createCamp(
      { seatIds: SEATS_4, seed: SEED, objectiveSlots: [{ kind: "no-tricks" }] },
      noJokerRules,
    );
    expect(camp.removedCards).toHaveLength(2);
    expect(camp.removedCards.every((c) => c.kind === "joker")).toBe(true);
    const jokerNames = camp.removedCards.map((c) => (c.kind === "joker" ? c.joker : null)).sort();
    expect(jokerNames).toEqual(["moon", "sun"]);

    const aceOfSpadesHolder = camp.hands.find((h) =>
      h.cards.some((c) => c.identity.kind === "standard" && c.identity.suit === "spades" && c.identity.rank === 14),
    );
    expect(aceOfSpadesHolder).toBeDefined();
    expect(camp.expeditionLeaderSeatId).toBe(aceOfSpadesHolder!.seatId);
  });
});

// --- Derived phase / actor / outcome ---------------------------------

function baseCamp(): CampState {
  const objectiveSlots: ObjectiveSlot[] = [{ kind: "no-tricks" }, { kind: "exactly-n", n: 1 }];
  return createCamp({ seatIds: SEATS_3, seed: SEED, objectiveSlots });
}

function trick(index: number, leaderSeatId: string, winnerSeatId: string): CompletedTrick {
  return {
    index,
    leaderSeatId,
    winnerSeatId,
    plays: SEATS_3.map((seatId) => ({
      seatId,
      card: { id: `dummy-${index}-${seatId}`, identity: std("clubs", 5) },
    })),
  };
}

describe("campPhase / currentActorSeatId", () => {
  it("objective-pick while any objective is unowned", () => {
    const camp = baseCamp();
    expect(camp.objectives.some((o) => o.ownerSeatId === null)).toBe(true);
    expect(campPhase(camp)).toBe("objective-pick");
  });

  it("currentActorSeatId in objective-pick follows nextObjectivePicker", () => {
    const camp = baseCamp();
    expect(currentActorSeatId(camp)).toBe(camp.expeditionLeaderSeatId);

    const oneOwned: CampState = {
      ...camp,
      objectives: [{ ...camp.objectives[0]!, ownerSeatId: camp.expeditionLeaderSeatId }, camp.objectives[1]!],
    };
    const leaderIndex = camp.seatIds.indexOf(camp.expeditionLeaderSeatId);
    const expectedNext = camp.seatIds[(leaderIndex + 1) % camp.seatIds.length]!;
    expect(currentActorSeatId(oneOwned)).toBe(expectedNext);
  });

  it("playing once all objectives are owned and outcome is in_progress", () => {
    const camp = baseCamp();
    const allOwned: CampState = {
      ...camp,
      objectives: camp.objectives.map((o) => ({ ...o, ownerSeatId: camp.expeditionLeaderSeatId })),
    };
    expect(campPhase(allOwned)).toBe("playing");
  });

  it("currentActorSeatId in playing derives from currentTrick.leaderSeatId and plays.length", () => {
    const camp = baseCamp();
    const allOwned: CampState = {
      ...camp,
      objectives: camp.objectives.map((o) => ({ ...o, ownerSeatId: camp.expeditionLeaderSeatId })),
      currentTrick: {
        index: 0,
        leaderSeatId: camp.expeditionLeaderSeatId,
        plays: [{ seatId: camp.expeditionLeaderSeatId, card: { id: "x", identity: std("clubs", 5) } }],
      },
    };
    const leaderIndex = camp.seatIds.indexOf(camp.expeditionLeaderSeatId);
    const expected = camp.seatIds[(leaderIndex + 1) % camp.seatIds.length]!;
    expect(currentActorSeatId(allOwned)).toBe(expected);
  });

  it("ended, and currentActorSeatId is null, once the outcome is decided", () => {
    const camp = baseCamp();
    // Give the no-tricks objective's owner a trick so it fails immediately.
    const owner = camp.expeditionLeaderSeatId;
    const failed: CampState = {
      ...camp,
      objectives: camp.objectives.map((o) => ({ ...o, ownerSeatId: owner })),
      completedTricks: [trick(0, owner, owner)],
    };
    expect(campPhase(failed)).toBe("ended");
    expect(currentActorSeatId(failed)).toBeNull();
  });
});

describe("checkCampOutcome", () => {
  it("any failed objective yields status failed with failedObjectiveIds", () => {
    const camp = baseCamp();
    const owner = camp.expeditionLeaderSeatId;
    const failed: CampState = {
      ...camp,
      objectives: camp.objectives.map((o) => ({ ...o, ownerSeatId: owner })),
      completedTricks: [trick(0, owner, owner)],
    };
    const outcome = checkCampOutcome(failed);
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") {
      expect(outcome.failedObjectiveIds).toContain(camp.objectives[0]!.id);
      expect(outcome.firedFailureCheckIds).toEqual([]);
    }
  });

  it("a fired custom failureChecks yields failed even with every objective still pending", () => {
    const camp = baseCamp();
    const firingRules: CoreRules = {
      ...baseRules,
      failureChecks: () => ["test-check"],
    };
    const outcome = checkCampOutcome(camp, firingRules);
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") {
      expect(outcome.failedObjectiveIds).toEqual([]);
      expect(outcome.firedFailureCheckIds).toEqual(["test-check"]);
    }
  });

  it("every objective done yields succeeded", () => {
    const objectiveSlots: ObjectiveSlot[] = [{ kind: "exactly-n", n: 3 }];
    const camp = createCamp({ seatIds: SEATS_3, seed: SEED, objectiveSlots });
    const owner = camp.expeditionLeaderSeatId;
    const others = camp.seatIds.filter((s) => s !== owner);
    const tricks: CompletedTrick[] = [];
    for (let i = 0; i < camp.totalTricks; i++) {
      const winner = i < 3 ? owner : others[0]!;
      tricks.push(trick(i, owner, winner));
    }
    const done: CampState = {
      ...camp,
      objectives: camp.objectives.map((o) => ({ ...o, ownerSeatId: owner })),
      completedTricks: tricks,
    };
    const outcome = checkCampOutcome(done);
    expect(outcome.status).toBe("succeeded");
  });

  it("otherwise in_progress", () => {
    const camp = baseCamp();
    const outcome = checkCampOutcome(camp);
    expect(outcome.status).toBe("in_progress");
  });
});
