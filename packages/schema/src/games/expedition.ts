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

const TrickPlayViewSchema = z.strictObject({
  seatId: z.string().min(1),
  card: CardViewSchema,
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
});

// Deliberately no `audience` key: `private` is the only trace of the
// original audience gate.
const LogEntryViewSchema = z.strictObject({
  event: z.string().min(1),
  actorSeatId: z.string().min(1),
  subjectSeatIds: z.array(z.string().min(1)),
  gearId: z.string().min(1).nullable(),
  private: z.boolean(),
});

const GearUseViewSchema = z.strictObject({
  seatId: z.string().min(1),
  gearId: z.string().min(1),
  kind: z.enum(["used", "skipped"]),
});

const EffectViewSchema = z.strictObject({
  gearId: z.string().min(1),
  seatId: z.string().min(1),
  atTrick: z.number().int().min(0),
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
  yourHand: z.array(CardViewSchema),
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
  gearWindow: z.enum(["pre-deal", "objective-pick", "between-tricks"]).nullable(),
  preDealPendingSeatIds: z.array(z.string().min(1)),
  gearUses: z.array(GearUseViewSchema),
  effects: z.array(EffectViewSchema),
  reveals: z.array(RevealViewSchema),
  log: z.array(LogEntryViewSchema),
  camp: CampViewSchema.nullable(),
});

// Deliberately no `draftOffer`/`ownedGearIds` keys for any OTHER seat: only
// the public loadout (`equippedGearIds`) and a boolean draft-pending flag are
// ever visible about a seat that is not the viewer.
const SeatViewSchema = z.strictObject({
  seatId: z.string().min(1),
  equippedGearIds: z.array(z.string().min(1)),
  ready: z.boolean(),
  draftPending: z.boolean(),
});

const GearStatusViewSchema = z.strictObject({
  gearId: z.string().min(1),
  spent: z.boolean(),
  usableNow: z.boolean(),
  reason: z.string().min(1).max(200).nullable(),
});

const CampResultViewSchema = z.strictObject({
  campNumber: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  attemptNumber: z.number().int().min(1),
  status: z.enum(["succeeded", "failed"]),
  suppliesSpent: z.number().int().min(0),
});

// Deliberately no `seed` key anywhere in this schema: the run's RNG root
// must never be projected to any client (T-11-03/T-11-09).
export const ExpeditionViewSchema = z.strictObject({
  yourSeatId: z.string().min(1).nullable(),
  runPhase: z.enum(["fireside", "pre-deal", "camp", "ended"]),
  runStatus: z.enum(["in_progress", "won", "lost"]),
  campNumber: z.number().int().min(1).max(6),
  supplies: z.number().int().min(0),
  bossTwists: z.strictObject({
    camp3: z.string().min(1).nullable(),
    camp6: z.string().min(1).nullable(),
  }),
  activeBossTwistId: z.string().min(1).nullable(),
  seats: z.array(SeatViewSchema),
  yourOwnedGearIds: z.array(z.string().min(1)),
  yourDraftOffer: z.array(z.string().min(1)).nullable(),
  yourCapacity: z.number().int().min(0).nullable(),
  yourGear: z.array(GearStatusViewSchema),
  history: z.array(CampResultViewSchema),
  attempt: AttemptViewSchema.nullable(),
});

export type ExpeditionViewWire = z.infer<typeof ExpeditionViewSchema>;

export const EXPEDITION_GAME_ID = "expedition" as const;

// MGR-03: Expedition has no settings in v2.0.
export const ExpeditionConfigSchema = z.null();
export type ExpeditionConfigWire = z.infer<typeof ExpeditionConfigSchema>;
