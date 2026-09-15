import { z } from "zod";

// D-05/D-06: strict, game-namespaced wire schema for the toy "forehead card"
// game's per-seat view. Every object schema here is z.strictObject, declared
// independently — never via `.omit()` — at EVERY nesting level, so a stray
// key on a nested card/entry cannot leak by default the way it could if a
// nested level used the looser z.object.
//
// This is the pre-stringify gate: Zod's strict mode checks Object.keys(input),
// which includes a key even when its value is `undefined` — a case
// JSON.stringify would otherwise silently hide from a browser inspecting the
// wire payload (see RESEARCH.md Pitfall 2).
//
// yourCard is typed as the hidden variant ONLY, so a visible own card is
// structurally unrepresentable — not merely disallowed by convention.
//
// This module is imported ONLY by apps/worker's game-registration/send path.
// It is never re-exported from packages/schema/src/index.ts (the generic
// barrel stays game-agnostic, per FDN-01/D-06), and packages/rules never
// imports it (packages/rules stays zero-dependency per FDN-02).

const HiddenCardViewSchema = z.strictObject({
  id: z.string().min(1),
  hidden: z.literal(true),
});

const VisibleCardViewSchema = z.strictObject({
  id: z.string().min(1),
  hidden: z.literal(false),
  value: z.string().min(1),
});

const CardViewSchema = z.discriminatedUnion("hidden", [HiddenCardViewSchema, VisibleCardViewSchema]);

const OtherCardEntrySchema = z.strictObject({
  seatId: z.string(),
  card: CardViewSchema,
});

const RevealedCardViewSchema = z.strictObject({
  id: z.string().min(1),
  seatId: z.string(),
  value: z.string().min(1),
  correct: z.boolean(),
});

export const ForeheadCardViewSchema = z.strictObject({
  yourCard: HiddenCardViewSchema,
  otherCards: z.array(OtherCardEntrySchema),
  revealed: z.array(RevealedCardViewSchema),
  deckCount: z.number().int().nonnegative(),
  activeSeatId: z.string(),
  isYourTurn: z.boolean(),
  score: z.number().int().nonnegative(),
});

export type ForeheadCardViewWire = z.infer<typeof ForeheadCardViewSchema>;

export const FOREHEAD_CARD_GAME_ID = "forehead-card" as const;
