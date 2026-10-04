import { describe, expect, it } from "vitest";
import {
  EXPEDITION_GAME_ID,
  ExpeditionConfigSchema,
  ExpeditionErrorCodeSchema,
  ExpeditionViewSchema,
} from "./expedition";

// The 25 RunError names: CampError's 7 members, then RunError's 18
// additional members.
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
  "unknown_character",
  "character_taken",
  "character_pending",
  "draft_pending",
  "no_draft_pending",
  "not_offered",
  "already_ready",
  "not_owned",
  "wrong_window",
  "ability_spent",
  "cannot_afford",
  "ability_unavailable",
  "invalid_target",
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
  seats: [
    {
      seatId: "seat-1",
      characterId: "botanist",
      kit: [],
      ready: true,
      draftPending: true,
      pool: { balance: 2, max: 3 },
      usage: [{ sourceId: "botanist", remaining: { kind: "pool", balance: 2, max: 3, cost: 1 } }],
    },
    {
      seatId: "seat-2",
      characterId: "scout",
      kit: ["bait"],
      ready: false,
      draftPending: false,
      pool: null,
      usage: [
        { sourceId: "scout", remaining: { kind: "uses", left: 1, of: 1 } },
        { sourceId: "bait", remaining: { kind: "single-use" } },
      ],
    },
  ],
  yourDraftOffer: ["botanist.greenhouse", "bait", "parrot"],
  yourAbilities: [{ sourceId: "botanist", usableNow: false, reason: "Usable between tricks", steps: [] }],
  history: [],
  attempt: null,
};

const midCampView = {
  yourSeatId: "seat-1",
  runPhase: "camp",
  runStatus: "in_progress",
  campNumber: 2,
  supplies: 5,
  seats: [
    { seatId: "seat-1", characterId: "guide", kit: [], ready: true, draftPending: false, pool: null, usage: [] },
    { seatId: "seat-2", characterId: "medic", kit: [], ready: true, draftPending: false, pool: null, usage: [] },
    { seatId: "seat-3", characterId: "signaller", kit: [], ready: false, draftPending: true, pool: null, usage: [] },
  ],
  yourDraftOffer: null,
  yourAbilities: [
    {
      sourceId: "guide",
      usableNow: true,
      reason: null,
      steps: [{ kind: "player", prompt: "Pick a player", choices: ["seat:seat-1", "seat:seat-2", "seat:seat-3"] }],
    },
  ],
  history: [{ campNumber: 1, attemptNumber: 1, status: "succeeded", suppliesSpent: 2 }],
  attempt: {
    attemptNumber: 1,
    window: "between-tricks",
    pendingSeatIds: [],
    rescue: null,
    effects: [
      { sourceId: "bait", seatId: "seat-2", atTrick: 1, lasts: "trick", params: { cardId: "card-4" } },
      { sourceId: "botanist", seatId: "seat-3", atTrick: 1, lasts: "attempt", params: null },
    ],
    reveals: [
      {
        cardId: "card-9",
        fromSeatId: "seat-2",
        source: "whisper",
        identity: { kind: "standard", suit: "hearts", rank: 10 },
        toSeatId: "seat-1",
      },
    ],
    log: [
      { event: "whisper", actorSeatId: "seat-1", subjectSeatIds: ["seat-2"], sourceId: null, private: false },
      { event: "use-ability", actorSeatId: "seat-2", subjectSeatIds: [], sourceId: "bait", private: true },
    ],
    yourWhisper: { allowed: true, left: 1 },
    camp: {
      playerCount: 3,
      expeditionLeaderSeatId: "seat-1",
      totalTricks: 8,
      removedCards: [{ kind: "standard", suit: "clubs", rank: 2 }],
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
        { id: "o5", kind: "win-card", target: { kind: "joker", joker: "sun" }, ownerSeatId: "seat-2", status: "pending" },
      ],
      goals: [{ id: "camouflage:seat-2", status: "done" }],
      discards: [{ card: { id: "card-9", identity: { kind: "standard", suit: "diamonds", rank: 4 } }, afterTrick: 1 }],
      yourHand: [
        { id: "card-1", identity: { kind: "standard", suit: "spades", rank: 14 }, effectiveRank: null, countsAs: null },
        { id: "card-2", identity: { kind: "joker", joker: "sun" }, effectiveRank: null, countsAs: { kind: "standard", suit: "hearts", rank: 9 } },
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
          plays: [{ seatId: "seat-1", card: { id: "card-3", identity: { kind: "standard", suit: "clubs", rank: 5 } }, effectiveRank: 6, countsAs: null, burned: true }],
          winnerSeatId: "seat-1",
        },
      ],
      currentTrick: {
        index: 1,
        leaderSeatId: "seat-1",
        plays: [{ seatId: "seat-1", card: { id: "card-4", identity: { kind: "standard", suit: "hearts", rank: 9 } }, effectiveRank: null }],
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

  it("accepts a muster view and a rescue pause", () => {
    const muster = { ...firesideView, runPhase: "muster", seats: [{ ...firesideView.seats[0], characterId: null, pool: null, usage: [] }] };
    expect(ExpeditionViewSchema.safeParse(muster).success).toBe(true);
    const rescue = { ...midCampView, attempt: { ...midCampView.attempt, window: "rescue", pendingSeatIds: ["seat-2"], rescue: { failedObjectiveIds: ["o4"] } } };
    expect(ExpeditionViewSchema.safeParse(rescue).success).toBe(true);
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
            yourHand: [{ id: "card-1", identity: { kind: "standard", suit: "spades", rank: 14 }, effectiveRank: null, faceUp: true }],
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
          log: [{ event: "whisper", actorSeatId: "seat-1", subjectSeatIds: [], sourceId: null, private: false, audience: "public" }],
        },
      },
    ],
    [
      "seats entry carrying draftOffer",
      {
        ...firesideView,
        seats: [{ ...firesideView.seats[0], draftOffer: ["bait"] }],
      },
    ],
    ["seats entry carrying ledger", { ...firesideView, seats: [{ ...firesideView.seats[0], ledger: [] }] }],
    ["yourGear from the gear era", { ...firesideView, yourGear: [] }],
    [
      "ability step of an unknown kind",
      { ...firesideView, yourAbilities: [{ sourceId: "x", usableNow: true, reason: null, steps: [{ kind: "teammate", prompt: "p", choices: [] }] }] },
    ],
    [
      "joker identity carrying suit",
      {
        ...midCampView,
        attempt: {
          ...midCampView.attempt,
          camp: {
            ...midCampView.attempt.camp,
            yourHand: [{ id: "card-2", identity: { kind: "joker", joker: "sun", suit: "spades" }, effectiveRank: null }],
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
            yourHand: [{ id: "card-1", identity: { kind: "standard", suit: "spades", rank: 15 }, effectiveRank: null }],
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
            yourHand: [{ id: "card-1", identity: { kind: "standard", suit: "spades", rank: 1 }, effectiveRank: null }],
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
      "window passive",
      {
        ...midCampView,
        attempt: { ...midCampView.attempt, window: "passive" },
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
    ["supplies -1", { ...midCampView, supplies: -1 }],
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

  it("has exactly 25 members", () => {
    expect(ExpeditionErrorCodeSchema.options.length).toBe(25);
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
