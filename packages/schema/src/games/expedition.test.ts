import { describe, expect, it } from "vitest";
import {
  EXPEDITION_GAME_ID,
  ExpeditionConfigSchema,
  ExpeditionErrorCodeSchema,
  ExpeditionViewSchema,
} from "./expedition";

// The 29 RunError names: CampError's 7 members, then RunError's 22
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
  "wrong_stage",
  "not_a_choice",
  "unknown_character",
  "character_taken",
  "not_owned_item",
  "too_many_items",
  "sold_out",
  "supplies_full",
  "upgrade_owned",
  "not_your_upgrade",
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

const CAMP_MODS = [
  { id: "jungle", kind: "location", strength: "full", status: [] },
  { id: "thunderstorm", kind: "weather", strength: "full", status: [{ kind: "chance", percent: 30, strikesLeft: 1 }, { kind: "strike" }] },
  { id: "flooding", kind: "pairing", strength: "full", status: [{ kind: "meter", left: 3, of: 12 }] },
];
const preview = { index: 2, location: "jungle", weather: "fair", pairing: null, event: "event", slotKinds: ["win-card", "ordered", "ordered"], bossId: null, shop: false };
const noItems = { equipped: [], backpack: [], concealed: false };

const header = {
  yourSeatId: "seat-1",
  runStatus: "in_progress",
  length: "standard",
  campCount: 6,
  purse: 8,
  supplies: { count: 3, max: 4 },
  plan: [{ at: 3, tier: "animal", bossId: null }, { at: 6, tier: "temple", bossId: null }],
  lastVote: { topic: "length", tally: [{ choice: "short", votes: 1 }, { choice: "standard", votes: 1 }, { choice: "long", votes: 0 }], tied: ["short", "standard"], winner: "standard" },
};

const draftView = {
  ...header,
  seats: [
    {
      seatId: "seat-1",
      characterId: "botanist",
      upgradeId: "botanist.greenhouse",
      items: noItems,
      pool: { balance: 2, max: 3 },
      usage: [{ sourceKey: "botanist", remaining: { kind: "pool", balance: 2, max: 3, cost: 1 } }],
    },
    {
      seatId: "seat-2",
      characterId: "scout",
      upgradeId: null,
      items: {
        equipped: [
          { uid: "it0", itemId: "bait", remaining: { kind: "uses", left: 1, of: 1 } },
          { uid: "it1", itemId: "heavy-pack", remaining: null },
        ],
        backpack: [{ uid: "it2", itemId: "parrot", remaining: { kind: "uses", left: 1, of: 1 } }],
        concealed: false,
      },
      pool: null,
      usage: [
        { sourceKey: "scout", remaining: { kind: "uses", left: 1, of: 1 } },
        { sourceKey: "it0", remaining: { kind: "uses", left: 1, of: 1 } },
      ],
    },
  ],
  yourAbilities: [{ sourceKey: "botanist", usableNow: false, reason: "Usable between tricks", steps: [] }],
  history: [{ camp: 1, attempt: 1, status: "cleared", coins: 8 }],
  stage: {
    tag: "draft",
    cleared: 1,
    payout: 8,
    yourOffer: { bundles: [["bait", "parrot"], ["whetstone", "trail-map"], ["bait", "puffball"]] },
    pendingSeatIds: ["seat-1"],
  },
};

const campSeats = [
  { seatId: "seat-1", characterId: "guide", upgradeId: null, items: noItems, pool: null, usage: [] },
  { seatId: "seat-2", characterId: "medic", upgradeId: null, items: noItems, pool: null, usage: [] },
  { seatId: "seat-3", characterId: "signaller", upgradeId: null, items: noItems, pool: null, usage: [] },
];

const midCampFields = {
  yourAbilities: [
    {
      sourceKey: "guide",
      usableNow: true,
      reason: null,
      steps: [{ kind: "player", prompt: "Pick a player", choices: ["seat:seat-1", "seat:seat-2", "seat:seat-3"] }],
    },
  ],
  history: [{ camp: 1, attempt: 1, status: "cleared", coins: 8 }],
};

const midAttempt = {
    attemptNumber: 1,
    window: "between-tricks",
    pendingSeatIds: [],
    rescue: null,
    effects: [
      { origin: { kind: "seat", seatId: "seat-2", sourceId: "bait" }, atTrick: 1, lasts: "trick", params: { cardId: "card-4" } },
      { origin: { kind: "seat", seatId: "seat-3", sourceId: "botanist" }, atTrick: 1, lasts: "attempt", params: null },
      { origin: { kind: "mod", modId: "thunderstorm", strength: "full" }, atTrick: 1, lasts: "trick", params: { strike: true } },
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
      { event: "blew", actorSeatId: null, subjectSeatIds: [], sourceId: "tornado", private: false },
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
        { id: "o6", kind: "hidden", ownerSeatId: null, status: "pending" },
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
        plays: [
          { seatId: "seat-1", hidden: false, card: { id: "card-4", identity: { kind: "standard", suit: "hearts", rank: 9 } }, effectiveRank: null },
          { seatId: "seat-2", hidden: true, suit: "joker" },
        ],
      },
      campPhase: "playing",
      currentActorSeatId: "seat-2",
    },
};

function campWith(attempt: unknown) {
  return { ...header, seats: campSeats, ...midCampFields, stage: { tag: "camp", camp: preview, mods: CAMP_MODS, attempt } };
}

const midCampView = campWith(midAttempt);

describe("ExpeditionViewSchema", () => {
  it("accepts a full draft fixture", () => {
    expect(ExpeditionViewSchema.safeParse(draftView).success).toBe(true);
  });

  it("accepts a full mid-camp fixture", () => {
    const result = ExpeditionViewSchema.safeParse(midCampView);
    expect(result.success).toBe(true);
  });

  it.each([
    ["loadout", { tag: "loadout", camp: { ...preview, pairing: "steam" }, mods: CAMP_MODS, yourSlots: 2, shop: null, readySeatIds: ["seat-2"] }],
    [
      "loadout with the shop",
      {
        tag: "loadout",
        camp: { ...preview, index: 3, shop: true },
        mods: [],
        yourSlots: 2,
        shop: {
          stock: [
            { stockId: "supplies", what: { kind: "supplies" }, price: 6, soldTo: null },
            { stockId: "item0", what: { kind: "item", itemId: "bait" }, price: 2, soldTo: "seat-2" },
          ],
          yourUpgrades: [{ stockId: "upgrade:guide.pathfinder", upgradeId: "guide.pathfinder", price: 8 }],
        },
        readySeatIds: [],
      },
    ],
    ["route", { tag: "route", options: [{ id: "a", next: preview }, { id: "b", next: { ...preview, slotKinds: ["win-card", "trick-count"] } }], ballots: [{ seatId: "seat-1", choice: "b" }] }],
    ["event", { tag: "event", event: "event", next: preview, readySeatIds: [] }],
    ["ended", { tag: "ended", result: "won" }],
  ])("accepts a %s stage", (_name, stage) => {
    expect(ExpeditionViewSchema.safeParse({ ...draftView, stage }).success).toBe(true);
  });

  it("accepts a muster view and a rescue pause", () => {
    const muster = {
      ...draftView,
      length: null,
      campCount: null,
      plan: [],
      lastVote: null,
      seats: [{ ...draftView.seats[0], characterId: null, pool: null, usage: [] }],
      stage: { tag: "muster", ballots: [{ seatId: "seat-1", choice: "long" }, { seatId: "seat-2", choice: null }] },
    };
    expect(ExpeditionViewSchema.safeParse(muster).success).toBe(true);
    const rescue = campWith({ ...midAttempt, window: "rescue", pendingSeatIds: ["seat-2"], rescue: { failedObjectiveIds: ["o4"] } } );
    expect(ExpeditionViewSchema.safeParse(rescue).success).toBe(true);
  });

  it.each([
    ["extra top-level key seed", { ...draftView, seed: "abc123" }],
    [
      "extra key objectiveDeck on camp",
      {
        ...midCampView,
        attempt: {
          ...midAttempt,
          camp: { ...midAttempt.camp, objectiveDeck: [] },
        },
      },
    ],
    [
      "handSizes entry carrying cards",
      {
        ...midCampView,
        attempt: {
          ...midAttempt,
          camp: {
            ...midAttempt.camp,
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
          ...midAttempt,
          camp: {
            ...midAttempt.camp,
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
          ...midAttempt,
          log: [{ event: "whisper", actorSeatId: "seat-1", subjectSeatIds: [], sourceId: null, private: false, audience: "public" }],
        },
      },
    ],
    ["top-level itemSerial", { ...draftView, itemSerial: 3 }],
    [
      "a remaining of the removed single-use kind",
      { ...draftView, seats: [{ ...draftView.seats[1], usage: [{ sourceKey: "it0", remaining: { kind: "single-use" } }] }] },
    ],
    ["a bare list as the draft offer", { ...draftView, stage: { ...draftView.stage, yourOffer: ["bait", "parrot"] } }],
    [
      "seats entry carrying offers",
      {
        ...draftView,
        seats: [{ ...draftView.seats[0], offers: [] }],
      },
    ],
    ["seats entry carrying ledger", { ...draftView, seats: [{ ...draftView.seats[0], ledger: [] }] }],
    ["yourGear from the gear era", { ...draftView, yourGear: [] }],
    [
      "ability step of an unknown kind",
      { ...draftView, yourAbilities: [{ sourceKey: "x", usableNow: true, reason: null, steps: [{ kind: "teammate", prompt: "p", choices: [] }] }] },
    ],
    [
      "joker identity carrying suit",
      {
        ...midCampView,
        attempt: {
          ...midAttempt,
          camp: {
            ...midAttempt.camp,
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
          ...midAttempt,
          camp: {
            ...midAttempt.camp,
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
          ...midAttempt,
          camp: {
            ...midAttempt.camp,
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
          ...midAttempt,
          camp: { ...midAttempt.camp, playerCount: 6 },
        },
      },
    ],
    [
      "window passive",
      {
        ...midCampView,
        attempt: { ...midAttempt, window: "passive" },
      },
    ],
    [
      "win-card objective missing target",
      {
        ...midCampView,
        attempt: {
          ...midAttempt,
          camp: {
            ...midAttempt.camp,
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
          ...midAttempt,
          camp: {
            ...midAttempt.camp,
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
    ["camp index 0", { ...midCampView, stage: { ...midCampView.stage, camp: { ...preview, index: 0 } } }],
    ["supplies -1", { ...midCampView, supplies: { count: -1, max: 4 } }],
    ["a stage tag that does not exist", { ...midCampView, stage: { tag: "fireside" } }],
    ["a modifier status carrying a card", { ...midCampView, stage: { ...midCampView.stage, mods: [{ id: "thunderstorm", kind: "weather", strength: "full", status: [{ kind: "strike", cardId: "card-1" }] }] } }],
    [
      "a face-down play carrying its card",
      {
        ...midCampView,
        stage: {
          ...midCampView.stage,
          attempt: { ...midAttempt, camp: { ...midAttempt.camp, currentTrick: { index: 1, leaderSeatId: "seat-1", plays: [{ seatId: "seat-1", hidden: true, suit: "hearts", card: { id: "card-4", identity: { kind: "standard", suit: "hearts", rank: 9 } } }] } } },
        },
      },
    ],
    [
      "a hidden objective carrying its target",
      {
        ...midCampView,
        stage: {
          ...midCampView.stage,
          attempt: { ...midAttempt, camp: { ...midAttempt.camp, objectives: [{ id: "o6", kind: "hidden", ownerSeatId: null, status: "pending", target: { kind: "joker", joker: "sun" } }] } },
        },
      },
    ],
    ["a modifier of an unknown kind", { ...midCampView, stage: { ...midCampView.stage, mods: [{ id: "x", kind: "volcano", strength: "full", status: [] }] } }],
    ["an effect with no origin", { ...midCampView, stage: { ...midCampView.stage, attempt: { ...midAttempt, effects: [{ sourceId: "bait", seatId: "seat-2", atTrick: 1, lasts: "trick", params: null }] } } }],
    ["a route option with a bad slot kind", { ...draftView, stage: { tag: "route", options: [{ id: "a", next: { ...preview, slotKinds: ["boss"] } }], ballots: [] } }],
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

  it("has exactly 29 members", () => {
    expect(ExpeditionErrorCodeSchema.options.length).toBe(29);
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
