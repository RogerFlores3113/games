import { describe, expect, it } from "vitest";
import {
  EXPEDITION_GAME_ID,
  ExpeditionConfigSchema,
  ExpeditionErrorCodeSchema,
  ExpeditionViewSchema,
} from "./expedition";

// The 24 RunError names in the exact order the plan's <interfaces> lists
// them (CampError's 7 members, then RunError's 17 additional members).
const EXPEDITION_ERROR_CODES = [
  "not_your_turn",
  "wrong_phase",
  "camp_over",
  "card_not_in_hand",
  "must_follow_suit",
  "objective_not_available",
  "invalid_action",
  "not_a_seat",
  "run_over",
  "draft_pending",
  "no_draft_pending",
  "not_offered",
  "gear_not_owned",
  "duplicate_gear",
  "over_capacity",
  "already_ready",
  "gear_not_equipped",
  "gear_already_used",
  "wrong_window",
  "invalid_target",
  "gear_unavailable",
  "whisper_blocked",
  "no_whispers_left",
  "nothing_to_skip",
] as const;

const firesideView = {
  yourSeatId: "seat-1",
  runPhase: "fireside",
  runStatus: "in_progress",
  campNumber: 1,
  supplies: 3,
  bossTwists: { camp3: null, camp6: null },
  activeBossTwistId: null,
  seats: [
    { seatId: "seat-1", equippedGearIds: [], ready: true, draftPending: true },
    { seatId: "seat-2", equippedGearIds: ["compass"], ready: false, draftPending: false },
  ],
  yourOwnedGearIds: ["compass"],
  yourDraftOffer: ["compass", "map", "lantern"],
  yourCapacity: 1,
  yourBaseCapacity: 1,
  yourGear: [],
  history: [],
  attempt: null,
};

const midCampView = {
  yourSeatId: "seat-1",
  runPhase: "camp",
  runStatus: "in_progress",
  campNumber: 2,
  supplies: 5,
  bossTwists: { camp3: null, camp6: "eclipse" },
  activeBossTwistId: null,
  seats: [
    { seatId: "seat-1", equippedGearIds: ["compass"], ready: true, draftPending: false },
    { seatId: "seat-2", equippedGearIds: [], ready: true, draftPending: false },
    { seatId: "seat-3", equippedGearIds: ["map"], ready: false, draftPending: true },
  ],
  yourOwnedGearIds: ["compass"],
  yourDraftOffer: null,
  yourCapacity: 2,
  yourBaseCapacity: 2,
  yourGear: [
    { gearId: "compass", spent: false, usableNow: true, reason: null },
    { gearId: "map", spent: true, usableNow: false, reason: "already used this attempt" },
  ],
  history: [{ campNumber: 1, attemptNumber: 1, status: "succeeded", suppliesSpent: 2 }],
  attempt: {
    attemptNumber: 1,
    bossCancelled: false,
    gearWindow: "between-tricks",
    preDealPendingSeatIds: [],
    gearUses: [{ seatId: "seat-1", gearId: "compass", kind: "used" }],
    effects: [{ gearId: "map", seatId: "seat-2", atTrick: 1 }],
    reveals: [
      {
        cardId: "card-9",
        fromSeatId: "seat-2",
        source: "whisper",
        identity: { kind: "standard", suit: "hearts", rank: 10 },
      },
    ],
    log: [
      { event: "whisper", actorSeatId: "seat-1", subjectSeatIds: ["seat-2"], gearId: null, private: false },
      { event: "use-gear", actorSeatId: "seat-2", subjectSeatIds: [], gearId: "compass", private: true },
    ],
    camp: {
      playerCount: 3,
      expeditionLeaderSeatId: "seat-1",
      totalTricks: 8,
      removedCards: [{ kind: "standard", suit: "clubs", rank: 2 }],
      objectiveAssignment: "face-up",
      objectives: [
        {
          id: "o1",
          kind: "win-card",
          target: { kind: "standard", suit: "spades", rank: 14 },
          ownerSeatId: "seat-1",
          status: "pending",
        },
        {
          id: "o2",
          kind: "ordered",
          target: { kind: "standard", suit: "hearts", rank: 10 },
          order: 1,
          ownerSeatId: null,
          status: "pending",
        },
        { id: "o3", kind: "no-tricks", ownerSeatId: "seat-2", status: "done" },
        { id: "o4", kind: "exactly-n", n: 2, ownerSeatId: "seat-3", status: "failed" },
      ],
      yourHand: [
        { id: "card-1", identity: { kind: "standard", suit: "spades", rank: 14 } },
        { id: "card-2", identity: { kind: "joker", joker: "sun" } },
      ],
      yourLegalCardIds: ["card-1"],
      handSizes: [
        { seatId: "seat-1", size: 2 },
        { seatId: "seat-2", size: 3 },
        { seatId: "seat-3", size: 3 },
      ],
      completedTricks: [
        {
          index: 0,
          leaderSeatId: "seat-1",
          plays: [{ seatId: "seat-1", card: { id: "card-3", identity: { kind: "standard", suit: "clubs", rank: 5 } } }],
          winnerSeatId: "seat-1",
        },
      ],
      currentTrick: {
        index: 1,
        leaderSeatId: "seat-1",
        plays: [{ seatId: "seat-1", card: { id: "card-4", identity: { kind: "standard", suit: "hearts", rank: 9 } } }],
      },
      campPhase: "playing",
      currentActorSeatId: "seat-2",
    },
  },
};

describe("ExpeditionViewSchema", () => {
  it("accepts a full fireside fixture", () => {
    expect(ExpeditionViewSchema.safeParse(firesideView).success).toBe(true);
  });

  it("accepts a full mid-camp fixture", () => {
    const result = ExpeditionViewSchema.safeParse(midCampView);
    expect(result.success).toBe(true);
  });

  // A worker deployed before yourBaseCapacity existed still sends valid views.
  it("accepts a view without yourBaseCapacity", () => {
    const { yourBaseCapacity: _omitted, ...olderView } = firesideView;
    expect(ExpeditionViewSchema.safeParse(olderView).success).toBe(true);
  });

  it.each([
    ["extra top-level key seed", { ...firesideView, seed: "abc123" }],
    [
      "extra key objectiveDeck on camp",
      {
        ...midCampView,
        attempt: {
          ...midCampView.attempt,
          camp: { ...midCampView.attempt.camp, objectiveDeck: [] },
        },
      },
    ],
    [
      "handSizes entry carrying cards",
      {
        ...midCampView,
        attempt: {
          ...midCampView.attempt,
          camp: {
            ...midCampView.attempt.camp,
            handSizes: [{ seatId: "seat-1", size: 2, cards: [] }],
          },
        },
      },
    ],
    [
      "yourHand card with an extra key",
      {
        ...midCampView,
        attempt: {
          ...midCampView.attempt,
          camp: {
            ...midCampView.attempt.camp,
            yourHand: [{ id: "card-1", identity: { kind: "standard", suit: "spades", rank: 14 }, faceUp: true }],
          },
        },
      },
    ],
    [
      "log entry carrying audience",
      {
        ...midCampView,
        attempt: {
          ...midCampView.attempt,
          log: [{ event: "whisper", actorSeatId: "seat-1", subjectSeatIds: [], gearId: null, private: false, audience: "public" }],
        },
      },
    ],
    [
      "seats entry carrying draftOffer",
      {
        ...firesideView,
        seats: [{ seatId: "seat-1", equippedGearIds: [], ready: true, draftPending: true, draftOffer: ["compass"] }],
      },
    ],
    [
      "joker identity carrying suit",
      {
        ...midCampView,
        attempt: {
          ...midCampView.attempt,
          camp: {
            ...midCampView.attempt.camp,
            yourHand: [{ id: "card-2", identity: { kind: "joker", joker: "sun", suit: "spades" } }],
          },
        },
      },
    ],
    [
      "rank 15",
      {
        ...midCampView,
        attempt: {
          ...midCampView.attempt,
          camp: {
            ...midCampView.attempt.camp,
            yourHand: [{ id: "card-1", identity: { kind: "standard", suit: "spades", rank: 15 } }],
          },
        },
      },
    ],
    [
      "rank 1",
      {
        ...midCampView,
        attempt: {
          ...midCampView.attempt,
          camp: {
            ...midCampView.attempt.camp,
            yourHand: [{ id: "card-1", identity: { kind: "standard", suit: "spades", rank: 1 } }],
          },
        },
      },
    ],
    [
      "playerCount 6",
      {
        ...midCampView,
        attempt: {
          ...midCampView.attempt,
          camp: { ...midCampView.attempt.camp, playerCount: 6 },
        },
      },
    ],
    [
      "gearWindow passive",
      {
        ...midCampView,
        attempt: { ...midCampView.attempt, gearWindow: "passive" },
      },
    ],
    [
      "win-card objective missing target",
      {
        ...midCampView,
        attempt: {
          ...midCampView.attempt,
          camp: {
            ...midCampView.attempt.camp,
            objectives: [{ id: "o1", kind: "win-card", ownerSeatId: "seat-1", status: "pending" }],
          },
        },
      },
    ],
    [
      "no-tricks objective carrying target",
      {
        ...midCampView,
        attempt: {
          ...midCampView.attempt,
          camp: {
            ...midCampView.attempt.camp,
            objectives: [
              {
                id: "o3",
                kind: "no-tricks",
                ownerSeatId: "seat-2",
                status: "done",
                target: { kind: "standard", suit: "clubs", rank: 2 },
              },
            ],
          },
        },
      },
    ],
    ["campNumber 7", { ...midCampView, campNumber: 7 }],
    ["yourCapacity -1", { ...midCampView, yourCapacity: -1 }],
  ])("rejects: %s", (_name, input) => {
    expect(ExpeditionViewSchema.safeParse(input).success).toBe(false);
  });
});

describe("ExpeditionErrorCodeSchema", () => {
  it.each(EXPEDITION_ERROR_CODES)("accepts %s", (code) => {
    expect(ExpeditionErrorCodeSchema.safeParse(code).success).toBe(true);
  });

  it.each(["x", "", "view_unavailable"])("rejects %s", (code) => {
    expect(ExpeditionErrorCodeSchema.safeParse(code).success).toBe(false);
  });

  it("has exactly 24 members", () => {
    expect(ExpeditionErrorCodeSchema.options.length).toBe(24);
  });
});

describe("ExpeditionConfigSchema", () => {
  it("accepts null", () => {
    expect(ExpeditionConfigSchema.safeParse(null).success).toBe(true);
  });

  it.each([undefined, {}, "base"])("rejects %j", (value) => {
    expect(ExpeditionConfigSchema.safeParse(value).success).toBe(false);
  });
});

describe("EXPEDITION_GAME_ID", () => {
  it("equals expedition", () => {
    expect(EXPEDITION_GAME_ID).toBe("expedition");
  });
});
