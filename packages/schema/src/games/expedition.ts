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
// printed one.
const EffectiveRankSchema = z.number().int().nullable();

const RankedCardViewSchema = z.strictObject({
  id: z.string().min(1),
  identity: CardIdentityViewSchema,
  effectiveRank: EffectiveRankSchema,
});

const TrickPlayViewSchema = z.strictObject({
  seatId: z.string().min(1),
  card: CardViewSchema,
  effectiveRank: EffectiveRankSchema,
});

const CompletedTrickViewSchema = z.strictObject({
  index: z.number().int().min(0),
  leaderSeatId: z.string().min(1),
  plays: z.array(TrickPlayViewSchema),
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
  target: StandardIdentityViewSchema,
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

const ObjectiveViewSchema = z.discriminatedUnion("kind", [
  WinCardObjectiveViewSchema,
  OrderedObjectiveViewSchema,
  NoTricksObjectiveViewSchema,
  ExactlyNObjectiveViewSchema,
]);

const HandSizeViewSchema = z.strictObject({
  seatId: z.string().min(1),
  size: z.number().int().min(0),
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
  actorSeatId: z.string().min(1),
  subjectSeatIds: z.array(z.string().min(1)),
  sourceId: z.string().min(1).nullable(),
  private: z.boolean(),
});

const ActiveWindowSchema = z.enum(["pre-deal", "objective-pick", "between-tricks", "in-trick", "rescue"]);

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
]);

// `params` is null unless the effect is public or the viewer owns it.
const EffectViewSchema = z.strictObject({
  sourceId: z.string().min(1),
  seatId: z.string().min(1),
  atTrick: z.number().int().min(0),
  lasts: z.enum(["attempt", "trick"]),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).nullable(),
});

const CampViewSchema = z.strictObject({
  playerCount: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  expeditionLeaderSeatId: z.string().min(1),
  totalTricks: z.number().int().min(0),
  removedCards: z.array(CardIdentityViewSchema),
  objectiveAssignment: z.enum(["face-up", "face-down"]),
  // Deliberately no `objectiveDeck` key: the undrawn objective deck order
  // must never be projected.
  objectives: z.array(ObjectiveViewSchema),
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
  bossCancelled: z.boolean(),
  window: ActiveWindowSchema.nullable(),
  pendingSeatIds: z.array(z.string().min(1)),
  rescue: z.strictObject({ failedObjectiveIds: z.array(z.string().min(1)) }).nullable(),
  effects: z.array(EffectViewSchema),
  reveals: z.array(RevealViewSchema),
  log: z.array(LogEntryViewSchema),
  camp: CampViewSchema.nullable(),
  yourWhisper: z.strictObject({ allowed: z.boolean(), left: z.number().int().min(0) }).nullable(),
});

const RemainingViewSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("uses"), left: z.number().int().min(0), of: z.number().int().min(1) }),
  z.strictObject({ kind: z.literal("single-use") }),
  z.strictObject({ kind: z.literal("pool"), balance: z.number().int(), max: z.number().int().min(0), cost: z.number().int().min(0) }),
  z.strictObject({ kind: z.literal("supplies"), cost: z.number().int().min(0) }),
]);

// Deliberately no `draftOffer`/`ledger` keys for any seat: character, kit,
// pool and per-source usage are public; a seat's draft is a boolean here.
const SeatViewSchema = z.strictObject({
  seatId: z.string().min(1),
  characterId: z.string().min(1).nullable(),
  kit: z.array(z.string().min(1)),
  ready: z.boolean(),
  draftPending: z.boolean(),
  pool: z.strictObject({ balance: z.number().int(), max: z.number().int().min(0) }).nullable(),
  usage: z.array(z.strictObject({ sourceId: z.string().min(1), remaining: RemainingViewSchema })),
});

const AbilityStepViewSchema = z.strictObject({
  kind: TargetKindSchema,
  prompt: z.string().min(1).max(200),
  choices: z.array(z.string().min(1)),
});

// The viewer's own abilities; `steps` is [] unless usableNow.
const AbilityViewSchema = z.strictObject({
  sourceId: z.string().min(1),
  usableNow: z.boolean(),
  reason: z.string().min(1).max(200).nullable(),
  steps: z.array(AbilityStepViewSchema),
});

const CampResultViewSchema = z.strictObject({
  // Plain ranged number (not a union of literals), matching the top-level
  // `campNumber` field's convention below and `ExpeditionCampResultView`'s
  // `campNumber: number` — a literal-union inferred type here would make
  // `ExpeditionView` (whose history entries carry plain `number`) fail the
  // compile-time `[ExpeditionView] extends [ExpeditionViewWire]` assertion
  // in game-registration.ts (found via that assertion, Plan 11-06).
  campNumber: z.number().int().min(1).max(6),
  attemptNumber: z.number().int().min(1),
  status: z.enum(["succeeded", "failed"]),
  suppliesSpent: z.number().int().min(0),
});

// Deliberately no `seed` key anywhere in this schema: the run's RNG root
// must never be projected to any client (T-11-03/T-11-09).
export const ExpeditionViewSchema = z.strictObject({
  yourSeatId: z.string().min(1).nullable(),
  runPhase: z.enum(["muster", "fireside", "pre-deal", "camp", "ended"]),
  runStatus: z.enum(["in_progress", "won", "lost"]),
  campNumber: z.number().int().min(1).max(6),
  supplies: z.number().int().min(0),
  bossTwists: z.strictObject({
    camp3: z.string().min(1).nullable(),
    camp6: z.string().min(1).nullable(),
  }),
  activeBossTwistId: z.string().min(1).nullable(),
  seats: z.array(SeatViewSchema),
  yourDraftOffer: z.array(z.string().min(1)).nullable(),
  yourAbilities: z.array(AbilityViewSchema),
  history: z.array(CampResultViewSchema),
  attempt: AttemptViewSchema.nullable(),
});

export type ExpeditionViewWire = z.infer<typeof ExpeditionViewSchema>;

export const EXPEDITION_GAME_ID = "expedition" as const;

// MGR-03: Expedition has no settings in v2.0.
export const ExpeditionConfigSchema = z.null();
export type ExpeditionConfigWire = z.infer<typeof ExpeditionConfigSchema>;
