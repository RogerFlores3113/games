import { z } from "zod";

// D-07 prep: re-exported so the worker keeps importing Expedition's schema
// only through this existing @games/schema/games/expedition subpath — no new
// package.json export, alias or tsconfig path is added for
// expedition-errors.ts (mirrors hanabi.ts's own re-export).
export { ExpeditionErrorCodeSchema } from "./expedition-errors";
export type { ExpeditionErrorCode } from "./expedition-errors";

// D-05/D-06: strict, game-namespaced wire schema for Expedition's per-seat
// view. Every object schema here is z.strictObject, declared independently —
// never derived from a looser base via a schema-narrowing or schema-widening
// helper — at EVERY nesting level, so a stray key on a nested
// card/objective/reveal/log entry cannot leak by default the way it could if
// a nested level used the looser z.object.
//
// This is the pre-stringify gate: Zod's strict mode checks Object.keys(input),
// which includes a key even when its value is `undefined` — a case
// JSON.stringify would otherwise silently hide from a browser inspecting the
// wire payload.
//
// A joker identity is typed via its own branch of a discriminated union that
// carries ONLY kind/joker, so a standard card's suit/rank cannot leak into a
// joker branch, and vice versa — not merely disallowed by convention.
//
// This module is imported ONLY by apps/worker's game-registration/send path.
// It is never re-exported from packages/schema/src/index.ts (the generic
// barrel stays game-agnostic, per FDN-01/D-06), and packages/rules never
// imports it (packages/rules stays zero-dependency per FDN-02).
//
// Field-for-field mirror of ExpeditionView
// (packages/rules/src/expedition/adapter/view-types.ts).

const SuitSchema = z.enum(["spades", "hearts", "diamonds", "clubs"]);

const StandardRankSchema = z.number().int().min(2).max(14);

const StandardIdentityViewSchema = z.strictObject({
  kind: z.literal("standard"),
  suit: SuitSchema,
  rank: StandardRankSchema,
});

const JokerIdentityViewSchema = z.strictObject({
  kind: z.literal("joker"),
  joker: z.enum(["sun", "moon"]),
});

const CardIdentityViewSchema = z.discriminatedUnion("kind", [
  StandardIdentityViewSchema,
  JokerIdentityViewSchema,
]);

const CardViewSchema = z.strictObject({
  id: z.string().min(1),
  identity: CardIdentityViewSchema,
});

// `effectiveRank` is set only when the composed rank differs from the
// printed one, and `countsAs` only when the composed identity does.
const EffectiveRankSchema = z.number().int().nullable();

const RankedCardViewSchema = z.strictObject({
  id: z.string().min(1),
  identity: CardIdentityViewSchema,
  effectiveRank: EffectiveRankSchema,
  countsAs: CardIdentityViewSchema.nullable(),
});

// A current-trick play: face up, or face down with only the suit it follows
// as ("joker" for the Sun or Moon).
const TrickPlayViewSchema = z.discriminatedUnion("hidden", [
  z.strictObject({
    seatId: z.string().min(1),
    hidden: z.literal(false),
    card: CardViewSchema,
    effectiveRank: EffectiveRankSchema,
    countsAs: CardIdentityViewSchema.nullable(),
  }),
  z.strictObject({
    seatId: z.string().min(1),
    hidden: z.literal(true),
    suit: z.union([SuitSchema, z.literal("joker")]),
  }),
]);

const CompletedPlayViewSchema = z.strictObject({
  seatId: z.string().min(1),
  card: CardViewSchema,
  effectiveRank: EffectiveRankSchema,
  countsAs: CardIdentityViewSchema.nullable(),
  burned: z.boolean(),
});

const CompletedTrickViewSchema = z.strictObject({
  index: z.number().int().min(0),
  leaderSeatId: z.string().min(1),
  plays: z.array(CompletedPlayViewSchema),
  winnerSeatId: z.string().min(1),
});

const CurrentTrickViewSchema = z.strictObject({
  index: z.number().int().min(0),
  leaderSeatId: z.string().min(1),
  plays: z.array(TrickPlayViewSchema),
});

const ObjectiveStatusSchema = z.enum(["pending", "done", "failed"]);

const WinCardObjectiveViewSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.literal("win-card"),
  target: CardIdentityViewSchema,
  ownerSeatId: z.string().min(1).nullable(),
  status: ObjectiveStatusSchema,
});

const OrderedObjectiveViewSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.literal("ordered"),
  target: StandardIdentityViewSchema,
  order: z.union([z.number().int().min(1), z.literal("last")]),
  ownerSeatId: z.string().min(1).nullable(),
  status: ObjectiveStatusSchema,
});

const NoTricksObjectiveViewSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.literal("no-tricks"),
  ownerSeatId: z.string().min(1).nullable(),
  status: ObjectiveStatusSchema,
});

const ExactlyNObjectiveViewSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.literal("exactly-n"),
  n: z.number().int().min(0),
  ownerSeatId: z.string().min(1).nullable(),
  status: ObjectiveStatusSchema,
});

// Face down (a Desert's mirage): its kind and target are kept.
const HiddenObjectiveViewSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.literal("hidden"),
  ownerSeatId: z.string().min(1).nullable(),
  status: ObjectiveStatusSchema,
});

const ObjectiveViewSchema = z.discriminatedUnion("kind", [
  WinCardObjectiveViewSchema,
  OrderedObjectiveViewSchema,
  NoTricksObjectiveViewSchema,
  ExactlyNObjectiveViewSchema,
  HiddenObjectiveViewSchema,
]);

const HandSizeViewSchema = z.strictObject({
  seatId: z.string().min(1),
  size: z.number().int().min(0),
});

const GoalViewSchema = z.strictObject({ id: z.string().min(1), status: ObjectiveStatusSchema });

const DiscardViewSchema = z.strictObject({ card: CardViewSchema, afterTrick: z.number().int().min(0) });

// A hallucination: the cards it showed, each back in its player's hand.
const VoidedTrickViewSchema = z.strictObject({
  index: z.number().int().min(0),
  leaderSeatId: z.string().min(1),
  plays: z.array(z.strictObject({ seatId: z.string().min(1), card: CardViewSchema })),
});

// Deliberately no `audience` key: a reveal's audience-gating already happened
// before this shape is ever populated (only reveals addressed to the viewer
// are mapped at all).
const RevealViewSchema = z.strictObject({
  cardId: z.string().min(1),
  fromSeatId: z.string().min(1),
  source: z.string().min(1),
  identity: CardIdentityViewSchema,
  toSeatId: z.string().min(1).nullable(),
});

// Deliberately no `audience` key: `private` is the only trace of the
// original audience gate.
const LogEntryViewSchema = z.strictObject({
  event: z.string().min(1),
  // null for a camp modifier.
  actorSeatId: z.string().min(1).nullable(),
  subjectSeatIds: z.array(z.string().min(1)),
  sourceId: z.string().min(1).nullable(),
  private: z.boolean(),
});

const ActiveWindowSchema = z.enum(["objective-pick", "between-tricks", "in-trick", "rescue", "loadout", "draft", "route"]);

const TargetKindSchema = z.enum([
  "self",
  "player",
  "hand",
  "card",
  "objective",
  "completed-objective",
  "failed-objective",
  "whisper",
  "won-trick",
  "card-value",
  "board",
  "supplies",
  "item",
  "route-option",
  "fanned-card",
  "objective-value",
  "option",
]);

const StrengthSchema = z.enum(["full", "half"]);

const EffectOriginViewSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("seat"), seatId: z.string().min(1), sourceId: z.string().min(1) }),
  z.strictObject({ kind: z.literal("mod"), modId: z.string().min(1), strength: StrengthSchema }),
]);

// `params` is null unless the effect is public or the viewer owns it.
const EffectViewSchema = z.strictObject({
  origin: EffectOriginViewSchema,
  atTrick: z.number().int().min(0),
  lasts: z.enum(["attempt", "trick"]),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).nullable(),
});

const CampViewSchema = z.strictObject({
  playerCount: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  expeditionLeaderSeatId: z.string().min(1),
  totalTricks: z.number().int().min(0),
  removedCards: z.array(CardIdentityViewSchema),
  // Deliberately no `objectiveDeck` key: the undrawn objective deck order
  // must never be projected.
  objectives: z.array(ObjectiveViewSchema),
  goals: z.array(GoalViewSchema),
  discards: z.array(DiscardViewSchema),
  voidedTricks: z.array(VoidedTrickViewSchema),
  yourHand: z.array(RankedCardViewSchema),
  yourLegalCardIds: z.array(z.string().min(1)),
  handSizes: z.array(HandSizeViewSchema),
  completedTricks: z.array(CompletedTrickViewSchema),
  currentTrick: CurrentTrickViewSchema,
  campPhase: z.enum(["objective-pick", "playing", "ended"]),
  currentActorSeatId: z.string().min(1).nullable(),
});

const AttemptViewSchema = z.strictObject({
  attemptNumber: z.number().int().min(1),
  window: ActiveWindowSchema.nullable(),
  pendingSeatIds: z.array(z.string().min(1)),
  rescue: z.strictObject({ failedObjectiveIds: z.array(z.string().min(1)) }).nullable(),
  effects: z.array(EffectViewSchema),
  reveals: z.array(RevealViewSchema),
  log: z.array(LogEntryViewSchema),
  camp: CampViewSchema,
  yourWhisper: z.strictObject({ allowed: z.boolean(), left: z.number().int().min(0) }).nullable(),
});

const RemainingViewSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("uses"), left: z.number().int().min(0), of: z.number().int().min(1) }),
  z.strictObject({ kind: z.literal("supplies"), cost: z.number().int().min(0) }),
  z.strictObject({ kind: z.literal("crew"), left: z.number().int().min(0), earned: z.number().int().min(0) }),
  z.strictObject({ kind: z.literal("coins"), cost: z.number().int().min(0) }),
  z.strictObject({ kind: z.literal("unlimited") }),
  z.strictObject({ kind: z.literal("whispers"), left: z.number().int().min(0) }),
]);

// `remaining` is null for a passive item.
const ItemViewSchema = z.strictObject({
  uid: z.string().min(1),
  itemId: z.string().min(1),
  remaining: RemainingViewSchema.nullable(),
});

// Deliberately no `offers`/`ledger` keys for any seat: character, upgrade,
// items and per-source usage are public; the viewer's own draft offer
// is the draft stage's `yourOffer`.
const SeatViewSchema = z.strictObject({
  seatId: z.string().min(1),
  characterId: z.string().min(1).nullable(),
  upgradeId: z.string().min(1).nullable(),
  items: z.strictObject({
    equipped: z.array(ItemViewSchema),
    backpack: z.array(ItemViewSchema).nullable(),
    concealed: z.boolean(),
  }),
  usage: z.array(z.strictObject({ sourceKey: z.string().min(1), remaining: RemainingViewSchema })),
});

const AbilityStepViewSchema = z.strictObject({
  kind: TargetKindSchema,
  prompt: z.string().min(1).max(200),
  choices: z.array(z.string().min(1)),
});

// The viewer's own abilities, by source key; `steps` is [] unless usableNow.
const AbilityViewSchema = z.strictObject({
  sourceKey: z.string().min(1),
  usableNow: z.boolean(),
  reason: z.string().min(1).max(200).nullable(),
  steps: z.array(AbilityStepViewSchema),
});

const CampIndexSchema = z.number().int().min(1);

const CampResultViewSchema = z.strictObject({
  camp: CampIndexSchema,
  attempt: z.number().int().min(1),
  status: z.enum(["cleared", "failed"]),
  coins: z.number().int().min(0),
});

const RunLengthSchema = z.enum(["short", "standard", "long"]);

// An objective a coming camp will deal, shown only to a seat that surveys.
const SurveyedObjectiveViewSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("win-card"), target: CardIdentityViewSchema }),
  z.strictObject({ kind: z.literal("ordered"), target: CardIdentityViewSchema, order: z.union([z.number().int().min(1), z.literal("last")]) }),
  z.strictObject({ kind: z.literal("no-tricks") }),
  z.strictObject({ kind: z.literal("exactly-n"), n: z.number().int().min(0) }),
]);

const CampPreviewViewSchema = z.strictObject({
  index: CampIndexSchema,
  location: z.string().min(1),
  weather: z.string().min(1),
  pairing: z.string().min(1).nullable(),
  event: z.string().min(1).nullable(),
  slotKinds: z.array(z.enum(["win-card", "ordered", "no-tricks", "exactly-n", "trick-count"])),
  bossId: z.string().min(1).nullable(),
  shop: z.boolean(),
  survey: z.array(SurveyedObjectiveViewSchema).nullable(),
});

const StockViewSchema = z.strictObject({
  stockId: z.string().min(1),
  what: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("supplies") }), z.strictObject({ kind: z.literal("item"), itemId: z.string().min(1) })]),
  price: z.number().int().min(0),
  soldTo: z.string().min(1).nullable(),
});

const ShopViewSchema = z.strictObject({
  stock: z.array(StockViewSchema),
  yourUpgrades: z.array(z.strictObject({ stockId: z.string().min(1), upgradeId: z.string().min(1), price: z.number().int().min(0) })),
});

const BallotViewSchema = z.strictObject({ seatId: z.string().min(1), choice: z.string().min(1).nullable() });

const VoteViewSchema = z.strictObject({
  topic: z.enum(["length", "route"]),
  tally: z.array(z.strictObject({ choice: z.string().min(1), votes: z.number().int().min(0) })),
  tied: z.array(z.string().min(1)).nullable(),
  winner: z.string().min(1),
});

const PlanBossViewSchema = z.strictObject({
  at: CampIndexSchema,
  tier: z.enum(["animal", "disaster", "temple"]),
  bossId: z.string().min(1).nullable(),
});

// Public table state of a camp modifier; carries no card.
const StatusPartViewSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("chance"), percent: z.number().int().min(0).max(100), strikesLeft: z.number().int().min(0) }),
  z.strictObject({ kind: z.literal("strike") }),
  z.strictObject({ kind: z.literal("meter"), left: z.number().int().min(0), of: z.number().int().min(0) }),
  z.strictObject({ kind: z.literal("facing"), seatId: z.string().min(1) }),
  z.strictObject({ kind: z.literal("dam"), suit: SuitSchema }),
  z.strictObject({ kind: z.literal("streak"), seatId: z.string().min(1), count: z.number().int().min(1) }),
  z.strictObject({ kind: z.literal("bitten"), seatId: z.string().min(1), tricksLeft: z.number().int().min(1) }),
  z.strictObject({ kind: z.literal("countdown"), tricks: z.number().int().min(1) }),
  z.strictObject({ kind: z.literal("alternating"), activeNow: z.boolean() }),
  z.strictObject({ kind: z.literal("swarm"), seatId: z.string().min(1).nullable() }),
  z.strictObject({ kind: z.literal("path"), plates: z.array(z.union([SuitSchema, z.literal("sun")])).min(1), pressed: z.number().int().min(0) }),
]);

const ModViewSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(["location", "weather", "pairing", "animal", "disaster", "temple"]),
  strength: StrengthSchema,
  status: z.array(StatusPartViewSchema),
});

const StageViewSchema = z.discriminatedUnion("tag", [
  z.strictObject({ tag: z.literal("muster"), ballots: z.array(BallotViewSchema) }),
  z.strictObject({
    tag: z.literal("loadout"),
    camp: CampPreviewViewSchema,
    mods: z.array(ModViewSchema),
    yourSlots: z.number().int().min(0),
    shop: ShopViewSchema.nullable(),
    readySeatIds: z.array(z.string().min(1)),
  }),
  z.strictObject({ tag: z.literal("camp"), camp: CampPreviewViewSchema, mods: z.array(ModViewSchema), attempt: AttemptViewSchema }),
  z.strictObject({
    tag: z.literal("draft"),
    cleared: CampIndexSchema,
    payout: z.number().int().min(0),
    yourOffer: z.strictObject({ kind: z.enum(["standard", "special"]), bundles: z.array(z.array(z.string().min(1))) }).nullable(),
    pendingSeatIds: z.array(z.string().min(1)),
  }),
  z.strictObject({
    tag: z.literal("route"),
    options: z.array(z.strictObject({ id: z.string().min(1), next: CampPreviewViewSchema, swapsBoss: z.boolean() })),
    ballots: z.array(BallotViewSchema),
  }),
  z.strictObject({ tag: z.literal("event"), event: z.string().min(1), next: CampPreviewViewSchema, readySeatIds: z.array(z.string().min(1)) }),
  z.strictObject({ tag: z.literal("ended"), result: z.enum(["won", "lost"]) }),
]);

// Deliberately no `seed` key anywhere in this schema: the run's RNG root
// must never be projected to any client (T-11-03/T-11-09).
export const ExpeditionViewSchema = z.strictObject({
  yourSeatId: z.string().min(1).nullable(),
  runStatus: z.enum(["in_progress", "won", "lost"]),
  length: RunLengthSchema.nullable(),
  campCount: z.number().int().min(1).nullable(),
  purse: z.number().int().min(0),
  supplies: z.strictObject({ count: z.number().int().min(0), max: z.number().int().min(1) }),
  plan: z.array(PlanBossViewSchema),
  seats: z.array(SeatViewSchema),
  yourAbilities: z.array(AbilityViewSchema),
  history: z.array(CampResultViewSchema),
  lastVote: VoteViewSchema.nullable(),
  stage: StageViewSchema,
});

export type ExpeditionViewWire = z.infer<typeof ExpeditionViewSchema>;

export const EXPEDITION_GAME_ID = "expedition" as const;

// MGR-03: Expedition has no settings in v2.0.
export const ExpeditionConfigSchema = z.null();
export type ExpeditionConfigWire = z.infer<typeof ExpeditionConfigSchema>;

export { ExpeditionRunStateSchema } from "./expedition-state";
export type { ExpeditionRunStateWire } from "./expedition-state";
