import { z } from "zod";

// D-05/D-06: strict, game-namespaced wire schema for Hanabi's per-seat view.
// Every object schema here is z.strictObject, declared independently — never
// via `.omit()`/`.extend()`/`.partial()` — at EVERY nesting level, so a stray
// key on a nested card/history entry cannot leak by default the way it could
// if a nested level used the looser z.object.
//
// This is the pre-stringify gate: Zod's strict mode checks Object.keys(input),
// which includes a key even when its value is `undefined` — a case
// JSON.stringify would otherwise silently hide from a browser inspecting the
// wire payload.
//
// A hidden own-hand card is typed via its own branch of a discriminated union
// that carries ONLY id/hidden/facts, so a visible own card (one that carries
// suit/rank) is structurally unrepresentable in that branch — not merely
// disallowed by convention.
//
// This module is imported ONLY by apps/worker's game-registration/send path.
// It is never re-exported from packages/schema/src/index.ts (the generic
// barrel stays game-agnostic, per FDN-01/D-06), and packages/rules never
// imports it (packages/rules stays zero-dependency per FDN-02).
//
// Field-for-field mirror of HanabiView (packages/rules/src/hanabi/state.ts:103-118).
// Suit vocabulary from packages/rules/src/hanabi/variant.ts:28-36 (ALL_SUITS).

const SuitSchema = z.enum(["red", "yellow", "green", "blue", "white", "rainbow", "black"]);

const RankSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

// ClueValueSchema is deliberately a single z.strictObject, NOT a
// z.discriminatedUnion("type", ...). ClueFactsView.positiveClues/negativeClues
// and HistoryEntryView's clue branch are declared in state.ts as the loose
// shape `{ type: "color" | "rank"; value: Suit | Rank }`, which is not
// assignable to a narrower discriminated union (a "color" branch narrowed to
// `value: Suit` and a "rank" branch narrowed to `value: Rank` cannot absorb
// the wider `Suit | Rank` union the engine actually declares). A
// discriminated union here would make game-registration.ts's
// `[HanabiView] extends [HanabiViewWire]` assertion evaluate to `never` and
// fail to compile. This is a view-shape concession only and does not weaken
// redaction — the own-hand boundary is carried by the `hidden` discriminant
// below, not by this shape.
const ClueValueSchema = z.strictObject({
  type: z.enum(["color", "rank"]),
  value: z.union([SuitSchema, RankSchema]),
});

const ClueFactsViewSchema = z.strictObject({
  possibleSuits: z.array(SuitSchema),
  possibleRanks: z.array(RankSchema),
  positiveClues: z.array(ClueValueSchema),
  negativeClues: z.array(ClueValueSchema),
});

const HiddenCardViewSchema = z.strictObject({
  id: z.string().min(1),
  hidden: z.literal(true),
  facts: ClueFactsViewSchema,
});

const VisibleCardViewSchema = z.strictObject({
  id: z.string().min(1),
  hidden: z.literal(false),
  suit: SuitSchema,
  rank: RankSchema,
  facts: ClueFactsViewSchema,
});

const HanabiCardViewSchema = z.discriminatedUnion("hidden", [
  HiddenCardViewSchema,
  VisibleCardViewSchema,
]);

const OtherHandSchema = z.strictObject({
  seatId: z.string(),
  cards: z.array(HanabiCardViewSchema),
});

const StackViewSchema = z.strictObject({
  suit: SuitSchema,
  topRank: z.number().int().min(0).max(5),
});

const DiscardCardSchema = z.strictObject({
  id: z.string().min(1),
  suit: SuitSchema,
  rank: RankSchema,
});

const HistoryPlaySchema = z.strictObject({
  turn: z.number().int().nonnegative(),
  type: z.literal("play"),
  seatId: z.string(),
  cardId: z.string().min(1),
  suit: SuitSchema,
  rank: RankSchema,
  success: z.boolean(),
});

const HistoryDiscardSchema = z.strictObject({
  turn: z.number().int().nonnegative(),
  type: z.literal("discard"),
  seatId: z.string(),
  cardId: z.string().min(1),
  suit: SuitSchema,
  rank: RankSchema,
});

const HistoryClueSchema = z.strictObject({
  turn: z.number().int().nonnegative(),
  type: z.literal("clue"),
  seatId: z.string(),
  targetSeatId: z.string(),
  clue: ClueValueSchema,
  touchedCardIds: z.array(z.string().min(1)),
});

const HistoryDrawSchema = z.strictObject({
  turn: z.number().int().nonnegative(),
  type: z.literal("draw"),
  seatId: z.string(),
  cardId: z.string().min(1),
});

const HistoryEntryViewSchema = z.discriminatedUnion("type", [
  HistoryPlaySchema,
  HistoryDiscardSchema,
  HistoryClueSchema,
  HistoryDrawSchema,
]);

export const HanabiViewSchema = z.strictObject({
  variant: z.enum(["base", "rainbow", "black"]),
  yourSeatId: z.string().nullable(),
  yourHand: z.array(HanabiCardViewSchema),
  otherHands: z.array(OtherHandSchema),
  stacks: z.array(StackViewSchema),
  discard: z.array(DiscardCardSchema),
  clueTokens: z.number().int().min(0).max(8),
  fuses: z.number().int().min(0).max(3),
  deckCount: z.number().int().nonnegative(),
  finalTurnsRemaining: z.number().int().nonnegative().nullable(),
  activeSeatId: z.string(),
  isYourTurn: z.boolean(),
  score: z.number().int().nonnegative(),
  history: z.array(HistoryEntryViewSchema),
});

export type HanabiViewWire = z.infer<typeof HanabiViewSchema>;

export const HANABI_GAME_ID = "hanabi" as const;
