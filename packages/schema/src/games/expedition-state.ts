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
const ResolvedPlaySchema = z.strictObject({ seatId: z.string().min(1), card: CardSchema, countsAs: CardIdentitySchema.nullable(), burned: z.boolean() });

const ObjectiveSchema = z.discriminatedUnion("kind", [
  z.strictObject({ id: z.string().min(1), kind: z.literal("win-card"), target: CardIdentitySchema, ownerSeatId: z.string().nullable() }),
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
      plays: z.array(ResolvedPlaySchema),
      winnerSeatId: z.string().min(1),
    }),
  ),
  currentTrick: z.strictObject({ index: z.number().int().min(0), leaderSeatId: z.string().min(1), plays: z.array(PlaySchema) }),
  discards: z.array(z.strictObject({ card: CardSchema, afterTrick: z.number().int().min(0) })),
  voidedTricks: z.array(z.strictObject({ index: z.number().int().min(0), leaderSeatId: z.string().min(1), plays: z.array(PlaySchema) })),
});

const CampIndexSchema = z.number().int().min(1).transform((n) => n as number & { readonly __brand: "CampIndex" });
const StampSchema = z.strictObject({ camp: CampIndexSchema, attempt: z.number().int().min(1), trick: z.number().int().min(0) });

const LedgerEntrySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("used"), sourceKey: z.string().min(1), at: StampSchema, free: z.literal(true).optional() }),
  z.strictObject({ kind: z.literal("passed"), sourceKey: z.string().min(1), at: StampSchema, failedObjectiveIds: z.array(z.string()) }),
]);

const AudienceSchema = z.union([z.literal("public"), z.array(z.string().min(1))]);

const AttemptSchema = z.strictObject({
  attemptNumber: z.number().int().min(1),
  effects: z.array(
    z.strictObject({
      origin: z.discriminatedUnion("kind", [
        z.strictObject({ kind: z.literal("seat"), seatId: z.string().min(1), sourceKey: z.string().min(1), sourceId: z.string().min(1) }),
        z.strictObject({ kind: z.literal("mod"), modId: z.string().min(1), strength: z.enum(["full", "half"]) }),
      ]),
      atTrick: z.number().int().min(0),
      lasts: z.enum(["attempt", "trick"]),
      deferIfFatal: z.boolean(),
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
      actorSeatId: z.string().min(1).nullable(),
      subjectSeatIds: z.array(z.string()),
      sourceId: z.string().nullable(),
      audience: AudienceSchema,
    }),
  ),
  camp: CampStateSchema,
});

const RunLengthSchema = z.enum(["short", "standard", "long"]);

const ObjectiveSlotSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("win-card"), fixed: CardIdentitySchema.optional() }),
  z.strictObject({ kind: z.literal("ordered"), order: z.union([z.number().int().min(1), z.literal("last")]) }),
  z.strictObject({ kind: z.literal("no-tricks") }),
  z.strictObject({ kind: z.literal("exactly-n"), n: z.number().int().min(0) }),
  z.strictObject({ kind: z.literal("trick-count") }),
]);

const CampSpecSchema = z.strictObject({
  index: CampIndexSchema,
  location: z.string().min(1),
  weather: z.string().min(1),
  event: z.string().min(1).nullable(),
  slots: z.array(ObjectiveSlotSchema),
});

const RouteChoiceSchema = z.enum(["a", "b", "c"]);
const RouteOptionSchema = z.strictObject({
  id: RouteChoiceSchema,
  next: CampSpecSchema,
  reroll: z.number().int().min(0),
  swapBoss: z.strictObject({ at: CampIndexSchema, modId: z.string().min(1) }).nullable(),
});

const PerSeatSchema = <T extends z.ZodType>(value: T) => z.record(z.string().min(1), value);
const ReadySchema = PerSeatSchema(z.literal(true));

const StockEntrySchema = z.strictObject({
  stockId: z.string().min(1),
  what: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("supplies") }), z.strictObject({ kind: z.literal("item"), itemId: z.string().min(1) })]),
  price: z.number().int().min(0),
  soldTo: z.string().min(1).nullable(),
});

const StageSchema = z.discriminatedUnion("tag", [
  z.strictObject({ tag: z.literal("muster"), ballots: PerSeatSchema(RunLengthSchema.nullable()) }),
  z.strictObject({ tag: z.literal("loadout"), camp: CampSpecSchema, stock: z.array(StockEntrySchema).nullable(), ready: ReadySchema }),
  z.strictObject({ tag: z.literal("camp"), camp: CampSpecSchema, attempt: AttemptSchema }),
  z.strictObject({ tag: z.literal("draft"), cleared: CampIndexSchema, payout: z.number().int().min(0) }),
  z.strictObject({ tag: z.literal("route"), from: CampIndexSchema, options: z.array(RouteOptionSchema), ballots: PerSeatSchema(RouteChoiceSchema.nullable()) }),
  z.strictObject({ tag: z.literal("event"), route: RouteOptionSchema, ready: ReadySchema }),
  z.strictObject({ tag: z.literal("ended"), result: z.enum(["won", "lost"]) }),
]);

const VoteResultSchema = z.strictObject({
  tally: z.array(z.strictObject({ choice: z.string().min(1), votes: z.number().int().min(0) })),
  tied: z.array(z.string().min(1)).nullable(),
  winner: z.string().min(1),
});

export const ExpeditionRunStateSchema = z.strictObject({
  seed: z.string().min(1),
  seatIds: z.array(z.string().min(1)),
  seats: z.array(
    z.strictObject({
      seatId: z.string().min(1),
      characterId: z.string().min(1).nullable(),
      upgradeId: z.string().min(1).nullable(),
      items: z.array(z.strictObject({ uid: z.string().min(1), itemId: z.string().min(1) })),
      equipped: z.array(z.string().min(1)),
      offers: z.array(z.strictObject({ kind: z.enum(["standard", "special"]), bundles: z.array(z.array(z.string().min(1))) })),
      ledger: z.array(LedgerEntrySchema),
    }),
  ),
  purse: z.number().int().min(0),
  supplies: z.number().int().min(0),
  plan: z
    .strictObject({
      length: RunLengthSchema,
      bosses: z.array(z.strictObject({ at: CampIndexSchema, tier: z.enum(["animal", "disaster", "temple"]), modId: z.string().min(1).nullable() })),
    })
    .nullable(),
  history: z.array(
    z.strictObject({
      camp: CampIndexSchema,
      attempt: z.number().int().min(1),
      status: z.enum(["cleared", "failed"]),
      suppliesSpent: z.number().int().min(0),
      coins: z.number().int().min(0),
    }),
  ),
  lastVote: z.strictObject({ topic: z.enum(["length", "route"]), result: VoteResultSchema }).nullable(),
  itemSerial: z.number().int().min(0),
  stage: StageSchema,
});
export type ExpeditionRunStateWire = z.infer<typeof ExpeditionRunStateSchema>;
