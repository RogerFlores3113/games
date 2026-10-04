import { z } from "zod";

// The WHOLE Expedition RunState, seed and every hand included. Dev mode
// only: the worker parses an edited state with this before handing it to
// the rules engine's own invariant check. It never validates anything sent
// to a player. A field-for-field mirror of packages/rules's RunState
// (run/types.ts, state.ts); apps/worker/src/game-registration.ts asserts at
// compile time that a parsed value is a RunState, so a redesign of RunState
// fails to compile until this schema follows it.

const SuitSchema = z.enum(["spades", "hearts", "diamonds", "clubs"]);
const StandardRankSchema = z.literal([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
const StandardIdentitySchema = z.strictObject({ kind: z.literal("standard"), suit: SuitSchema, rank: StandardRankSchema });
const CardIdentitySchema = z.discriminatedUnion("kind", [
  StandardIdentitySchema,
  z.strictObject({ kind: z.literal("joker"), joker: z.enum(["sun", "moon"]) }),
]);
const CardSchema = z.strictObject({ id: z.string().min(1), identity: CardIdentitySchema });
const PlaySchema = z.strictObject({ seatId: z.string().min(1), card: CardSchema });

const ObjectiveSchema = z.discriminatedUnion("kind", [
  z.strictObject({ id: z.string().min(1), kind: z.literal("win-card"), target: StandardIdentitySchema, ownerSeatId: z.string().nullable() }),
  z.strictObject({
    id: z.string().min(1),
    kind: z.literal("ordered"),
    target: StandardIdentitySchema,
    order: z.union([z.number().int().min(1), z.literal("last")]),
    ownerSeatId: z.string().nullable(),
  }),
  z.strictObject({ id: z.string().min(1), kind: z.literal("no-tricks"), ownerSeatId: z.string().nullable() }),
  z.strictObject({ id: z.string().min(1), kind: z.literal("exactly-n"), n: z.number().int().min(0), ownerSeatId: z.string().nullable() }),
]);

const CampStateSchema = z.strictObject({
  seatIds: z.array(z.string().min(1)),
  playerCount: z.literal([3, 4, 5]),
  removedCards: z.array(CardIdentitySchema),
  totalTricks: z.number().int().min(0),
  hands: z.array(z.strictObject({ seatId: z.string().min(1), cards: z.array(CardSchema) })),
  expeditionLeaderSeatId: z.string().min(1),
  objectives: z.array(ObjectiveSchema),
  objectiveDeck: z.array(StandardIdentitySchema),
  completedTricks: z.array(
    z.strictObject({
      index: z.number().int().min(0),
      leaderSeatId: z.string().min(1),
      plays: z.array(PlaySchema),
      winnerSeatId: z.string().min(1),
    }),
  ),
  currentTrick: z.strictObject({ index: z.number().int().min(0), leaderSeatId: z.string().min(1), plays: z.array(PlaySchema) }),
});

const CampNumberSchema = z.literal([1, 2, 3, 4, 5, 6]);
const StampSchema = z.strictObject({ camp: CampNumberSchema, attempt: z.number().int().min(1), trick: z.number().int().min(0).nullable() });

const LedgerEntrySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("used"), sourceId: z.string().min(1), at: StampSchema, poolCost: z.number().int().min(0) }),
  z.strictObject({ kind: z.literal("passed"), sourceId: z.string().min(1), at: StampSchema, failedObjectiveIds: z.array(z.string()) }),
  z.strictObject({ kind: z.literal("regained"), amount: z.number().int(), at: StampSchema }),
]);

const AudienceSchema = z.union([z.literal("public"), z.array(z.string().min(1))]);

const AttemptSchema = z.strictObject({
  attemptNumber: z.number().int().min(1),
  bossCancelled: z.boolean(),
  effects: z.array(
    z.strictObject({
      sourceId: z.string().min(1),
      seatId: z.string().min(1),
      atTrick: z.number().int().min(0),
      lasts: z.enum(["attempt", "trick"]),
      params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
      audience: z.enum(["public", "owner"]),
    }),
  ),
  reveals: z.array(
    z.strictObject({
      cardId: z.string().min(1),
      fromSeatId: z.string().min(1),
      audience: z.array(z.string().min(1)),
      source: z.string().min(1),
      targetSeatId: z.string().min(1).optional(),
    }),
  ),
  log: z.array(
    z.strictObject({
      event: z.string(),
      actorSeatId: z.string().min(1),
      subjectSeatIds: z.array(z.string()),
      sourceId: z.string().nullable(),
      audience: AudienceSchema,
    }),
  ),
  camp: CampStateSchema.nullable(),
});

export const ExpeditionRunStateSchema = z.strictObject({
  seed: z.string().min(1),
  seatIds: z.array(z.string().min(1)),
  campNumber: CampNumberSchema,
  supplies: z.number().int().min(0),
  seats: z.array(
    z.strictObject({
      seatId: z.string().min(1),
      characterId: z.string().min(1).nullable(),
      kit: z.array(z.string().min(1)),
      draftOffer: z.array(z.string().min(1)).nullable(),
      ledger: z.array(LedgerEntrySchema),
    }),
  ),
  bossTwists: z.strictObject({ 3: z.string().min(1).nullable(), 6: z.string().min(1).nullable() }),
  readySeatIds: z.array(z.string().min(1)),
  attempt: AttemptSchema.nullable(),
  history: z.array(
    z.strictObject({
      campNumber: CampNumberSchema,
      attemptNumber: z.number().int().min(1),
      status: z.enum(["succeeded", "failed"]),
      suppliesSpent: z.number().int().min(0),
    }),
  ),
});
export type ExpeditionRunStateWire = z.infer<typeof ExpeditionRunStateSchema>;
