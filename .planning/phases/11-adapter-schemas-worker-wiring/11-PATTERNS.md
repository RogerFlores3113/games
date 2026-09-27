# Phase 11: Adapter, Schemas & Worker Wiring - Pattern Map

**Mapped:** 2026-09-27
**Files analyzed:** 9 new + 3 edited (per RESEARCH.md Wave 0 Gaps / Recommended Project Structure)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/rules/src/expedition/adapter.ts` | service (adapter, thin delegation) | request-response | `packages/rules/src/hanabi/adapter.ts` | exact |
| `packages/rules/src/expedition/request-guards.ts` | utility (type guards) | transform | `packages/rules/src/hanabi/actions.ts` (`isPlayRequest` etc., lines 60-77) | exact |
| `packages/rules/src/expedition/view.ts` (`toExpeditionPlayerView`) | transform (per-seat projection) | transform | `packages/rules/src/hanabi/projection.ts` | exact |
| `packages/rules/src/expedition/view-leak-check.ts` (or similar; leak-checker helper) | utility (security check) | transform | `packages/rules/src/hanabi/hanabi-leak-check.ts` | exact |
| `packages/rules/src/expedition/view.property.test.ts` (or extend `run/run.property.test.ts`) | test (property) | batch | `packages/rules/src/hanabi/redaction.property.test.ts` | exact |
| `packages/schema/src/games/expedition-errors.ts` | config (Zod enum) | transform | `packages/schema/src/games/hanabi-errors.ts` | exact |
| `packages/schema/src/games/expedition.ts` | config (Zod wire schema) | transform | `packages/schema/src/games/hanabi.ts` | exact |
| `packages/schema/src/room.ts` (EDIT: `GameIdSchema`) | config | transform | same file, `GameIdSchema` (line 24) | exact (self-edit) |
| `packages/schema/src/create-room.ts` (EDIT: add union member) | config | request-response | same file, `CreateRoomRequestSchema` (lines 13-19) | exact (self-edit) |
| `apps/worker/src/game-registration.ts` (EDIT: registry entry + assertions) | config / registry | request-response | same file, Hanabi's `mapError`/assertions/`GAME_REGISTRY` entry (lines 24-49, 58-86, 135-146) | exact (self-edit) |

## Pattern Assignments

### `packages/rules/src/expedition/adapter.ts` (service, request-response)

**Analog:** `packages/rules/src/hanabi/adapter.ts` (53 lines, full file read)

**Imports pattern** (lines 1-16):
```typescript
import type { AdapterError, GameAdapter, GameEndResult, Variant } from "../adapter";
import { applyHanabiAction } from "./actions";
import { checkHanabiGameEnd } from "./endgame";
import { dealInitialHands } from "./deck";
import { toHanabiPlayerView } from "./projection";
import { MAX_CLUE_TOKENS } from "./legality";
import { variantConfig } from "./variant";
import type { HanabiAction, HanabiState, StackEntry } from "./state";
```
For Expedition, mirror as: `import type { AdapterResult, GameAdapter } from "../adapter"`, plus
`createRun`/`runStatus` from `./run/lifecycle`, `applyRunAction` from `./run/run-actions`,
`CATALOG` from `./run/catalog`, `toExpeditionPlayerView` from `./view`, `parseRunAction` from
`./request-guards`, and `RunAction`/`RunError`/`RunState` types from `./run/types`.

**Core delegation pattern** (whole file, lines 18-53):
```typescript
export const hanabiGame: GameAdapter<HanabiState, HanabiAction, Variant, GameEndResult, AdapterError> = {
  id: "hanabi",
  createInitialState({ seatIds, config: variant, seed }): HanabiState { /* delegates to deck.ts */ },
  applyAction(state, actorSeatId, request) {
    return applyHanabiAction(state, actorSeatId, request);
  },
  toPlayerView(state, seatId) {
    return toHanabiPlayerView(state, seatId);
  },
  checkGameEnd(state) {
    return checkHanabiGameEnd(state);
  },
};
```
Every method is a one-line delegation — no rule logic inline. `applyAction`'s hostile-input
narrowing (`request: unknown` → typed action) happens INSIDE the delegated function
(`applyHanabiAction`, itself calling `isPlayRequest`-style guards) — for Expedition, do the same:
`applyAction` calls `parseRunAction(request)` first (see request-guards.ts pattern below), then
delegates to `applyRunAction`. RESEARCH.md's own sketch (lines 189-233) already gives a
near-final version of this file — treat it as the primary template alongside this analog.

**File-level invariants to preserve** (from `packages/rules/src/adapter.ts`, full file, 87 lines):
1. `applyAction` never mutates `state` — returns new object or unchanged reference on rejection.
2. `applyAction` treats `request` as hostile and never throws.
3. `toPlayerView` is the ONLY exit point from state (no whole-state serializer).

---

### `packages/rules/src/expedition/request-guards.ts` (utility, transform)

**Analog:** `packages/rules/src/hanabi/actions.ts` lines 55-77 (`isPlayRequest`, `isDiscardRequest`)

**Exact-own-key guard pattern**:
```typescript
export function isPlayRequest(request: unknown): request is { type: "play"; cardId: string } {
  if (typeof request !== "object" || request === null) return false;
  const keys = Object.keys(request);
  if (keys.length !== 2 || !keys.includes("type") || !keys.includes("cardId")) return false;
  const r = request as { type: unknown; cardId: unknown };
  return r.type === "play" && typeof r.cardId === "string";
}
```
Write one such guard per `RunAction` variant (`Object.keys(request).length` must equal the exact
expected key count — extra keys, e.g. a spoofed `resultingState`, must fail). Compose them into a
single `parseRunAction(request: unknown): RunAction | null` that tries each guard in turn and
returns `null` on no match (mirrors Hanabi's `actions.ts` line ~157 dispatcher: `if
(isPlayRequest(request)) return request;` chain). Never cast `unknown` to `RunAction` directly —
this is the adapter boundary's hostile-input validation (invariant #2).

---

### `packages/rules/src/expedition/view.ts` (transform, per-seat projection)

**Analog:** `packages/rules/src/hanabi/projection.ts` (175 lines, full file read)

**File-level discipline** (header comment, lines 1-21): spread operator, `delete`,
`Object.assign`, any omit helper, and assigning `null`/`undefined` to a hidden identity key are
ALL FORBIDDEN. Every returned object is built field-by-field from named values.

**Own-hand vs other-hand pattern** (lines 45-60):
```typescript
function toOwnCardView(slot: HandSlot): HanabiCardView {
  return { id: slot.card.id, hidden: true, facts: toClueFactsView(slot.facts) };
}
function toOtherCardView(slot: HandSlot): HanabiCardView {
  return { id: slot.card.id, hidden: false, suit: slot.card.suit, rank: slot.card.rank, facts: toClueFactsView(slot.facts) };
}
```
For Expedition (RESEARCH.md Pattern 2/3/4/5): own hand gets full card identity; other hands get
`{ seatId, size }` only (no `cards` key at all — not an empty array); reveal-gated visibility is
an ADDITIVE allowlist layered on top (Pattern 3); Thick Fog objective omission filters the array
rather than masking entries (Pattern 4); `draftOffer` is a plain per-seat conditional field
lookup, `seed` must never be written as a key anywhere (Pattern 5).

**Three-part structure** (header comment, lines 11-21, and body lines 105-175):
1. Compute public fields ONCE before any branch (identical for every seat).
2. FAIL-CLOSED branch for unseated/unknown viewer — every hand (including what would be the
   viewer's own) renders hidden, `yourSeatId`/equivalent is `null`.
   ```typescript
   // lines 126-151
   if (ownHand === undefined) {
     const otherHands = state.hands.map((h) => ({ seatId: h.seatId, cards: h.slots.map(toOwnCardView) }));
     return { /* ...all-hidden literal... */ yourSeatId: null, yourHand: [], otherHands, /* public fields */ };
   }
   ```
3. SEATED branch: viewer's own slot maps to full-identity view; every other seat's slot maps to
   size/hidden view (inverse of Hanabi's own/other split, per Expedition's own-hand-visible
   contract — same discipline, opposite direction).

**Pure function contract** (lines 102-104): calling `toExpeditionPlayerView` twice for the same
`(state, seatId)` must return deep-equal views and never return `state` or its nested arrays by
reference.

---

### `packages/rules/src/expedition/view-leak-check.ts` (utility, security check — test-only helper)

**Analog:** `packages/rules/src/hanabi/hanabi-leak-check.ts` (189 lines, full file read)

**Interface shape** (lines 21-31):
```typescript
export interface HanabiSeatSecrets {
  readonly ownCards: readonly { readonly id: string; readonly suit: Suit; readonly rank: Rank }[];
  readonly allowedIdentityCounts: Readonly<Record<string, number>>;
  readonly forbiddenTokens: readonly string[];
}
```
For Expedition: `ExpeditionSeatSecrets` needs `ownHandCardIds` (own hand, always visible),
`allowedCardIdentities` = own hand ∪ revealed-to-this-seat cards ∪ every card in
`completedTricks`/`currentTrick` (public, per Pitfall 3) ∪ `removedCards` (public per XRULE-01),
and `forbiddenTokens = [state.seed]`.

**Three detection layers** (lines 95-189): (1) structural walk (`walkStructural`) checking key
presence via the `in` operator — never truthiness, since `JSON.stringify` drops
`undefined`-valued keys; (2) typed multiset comparison (`collectIdentityCounts`) — an observed
count EXCEEDING the allowed count proves a leak, since duplicate identities can legitimately
recur; (3) raw substring scan of the serialized JSON for forbidden tokens (the seed). Compose the
same three layers for Expedition's card-identity leak surface. Per RESEARCH.md Pitfall 2/3, the
Expedition version's "allowed" set must be built as an explicit union (own hand ∪ revealed ∪
public trick/removed cards) — get this set arithmetic right in both directions or risk false
positives/negatives.

**Entry point signature** (lines 164-189):
```typescript
export function checkHanabiViewForLeaks(input: {
  view: unknown;
  serialized: string;
  secrets: HanabiSeatSecrets;
}): string[] { /* returns [] when clean, deduped reasons otherwise */ }
```

---

### `packages/rules/src/expedition/view.property.test.ts` (test, property/batch)

**Analog:** `packages/rules/src/hanabi/redaction.property.test.ts` (first ~80 lines read; full
pattern established)

**Per-seat leak assertion helper** (lines 20-38):
```typescript
function assertNoLeaksForEverySeat(state: HanabiState, seed: string): number {
  let seatsChecked = 0;
  for (const seatId of state.seatIds) {
    const view = hanabiGame.toPlayerView(state, seatId);
    const secrets = secretsForHanabiSeat(state, seatId, seed);
    const reasons = checkHanabiViewForLeaks({ view, serialized: JSON.stringify(view), secrets });
    expect(reasons).toEqual([]);
    seatsChecked++;
  }
  return seatsChecked;
}
```

**Whole-run fast-check property structure** (lines 40-56, pattern continues through the file):
seed a run, call the leak-assertion helper on the INITIAL state, then drive random actions in a
loop, calling the leak-assertion helper again after EVERY step (not just after reveals — Pitfall
1 in RESEARCH.md is exactly this file's own established discipline already). For Expedition, wire
this into (or alongside) `run.property.test.ts`'s existing `setupRun`/`driveRun`/`states` array
from `run-test-support.ts` per RESEARCH.md's "Don't Hand-Roll" table — call
`assertNoLeaksForEverySeat` at every index of `driveRun`'s returned `states` array, replacing the
"interim" structural checks that file's own header comments flag for Phase 11 replacement.
Non-vacuousness discipline: return/assert a checked-count > 0 so the property can't pass
trivially by skipping all seats.

---

### `packages/schema/src/games/expedition-errors.ts` (config, transform)

**Analog:** `packages/schema/src/games/hanabi-errors.ts` (28 lines, full file read)

```typescript
import { z } from "zod";

export const HanabiErrorCodeSchema = z.enum([
  "not_your_turn", "invalid_action", "game_over", "card_not_in_hand",
  "no_clue_tokens", "clue_touches_nothing", "clue_target_invalid",
  "discard_at_max_clues", "clue_color_not_nameable",
]);
export type HanabiErrorCode = z.infer<typeof HanabiErrorCodeSchema>;
```
Mirror 1:1 by name with `RunError`'s member names in `packages/rules/src/expedition/run/types.ts`
(so `mapExpeditionError` in `game-registration.ts` stays lossless, per the header comment's
warning about `AdapterError`/`HanabiErrorCode` 1:1 naming). This module imports ONLY `zod` — never
`@games/rules` (zero tolerance for free text, closed enum only).

---

### `packages/schema/src/games/expedition.ts` (config, transform)

**Analog:** `packages/schema/src/games/hanabi.ts` (164 lines, full file read)

**File header discipline** (lines 1-31): every object schema is `z.strictObject`, declared
independently at every nesting level (never via `.omit()`/`.extend()`/`.partial()`) so a stray
key on a nested object can't leak by default. This module is imported ONLY by the worker's
registry/send path — never re-exported from `packages/schema/src/index.ts`'s generic barrel, and
never imported by `packages/rules` (zero-dependency).

**Re-export pattern for error codes** (lines 3-7):
```typescript
export { HanabiErrorCodeSchema } from "./hanabi-errors";
export type { HanabiErrorCode } from "./hanabi-errors";
```
Mirror this same re-export line for `ExpeditionErrorCodeSchema`/`ExpeditionErrorCode` from
`./expedition-errors`.

**Discriminated-union-for-hidden-vs-visible pattern** (lines 67-84):
```typescript
const HiddenCardViewSchema = z.strictObject({ id: z.string().min(1), hidden: z.literal(true), facts: ClueFactsViewSchema });
const VisibleCardViewSchema = z.strictObject({ id: z.string().min(1), hidden: z.literal(false), suit: SuitSchema, rank: RankSchema, facts: ClueFactsViewSchema });
const HanabiCardViewSchema = z.discriminatedUnion("hidden", [HiddenCardViewSchema, VisibleCardViewSchema]);
```
A visible card's suit/rank fields are structurally unrepresentable in the hidden branch, not just
disallowed by convention. Use the same construction for Expedition's own-hand-full-identity vs.
other-hand-size-only split, and for any reveal-gated card shape.

**Top-level view schema + wire-type export** (lines 144-164):
```typescript
export const HanabiViewSchema = z.strictObject({ /* every field, field-for-field */ });
export type HanabiViewWire = z.infer<typeof HanabiViewSchema>;
export const HANABI_GAME_ID = "hanabi" as const;
```
Mirror as `ExpeditionViewSchema`, `ExpeditionViewWire`, `EXPEDITION_GAME_ID = "expedition" as
const`. Derive exact field names directly from `RunState`/`CampState` in
`packages/rules/src/expedition/run/types.ts` and `state.ts` (RESEARCH.md Open Question 2 — no
prior wire shape to mirror field-for-field, unlike Hanabi).

**Config schema note (A2 from RESEARCH.md):** `ExpeditionConfigSchema` should be `z.null()` (MGR-03:
no settings in v2.0), paired with `ExpeditionConfig = null` on the adapter side.

---

### `packages/schema/src/room.ts` (EDIT — config)

**Current state** (line 24):
```typescript
export const GameIdSchema = z.enum(["hanabi"]);
```
**Change to:**
```typescript
export const GameIdSchema = z.enum(["hanabi", "expedition"]);
```
This is the widening RESEARCH.md's Code Examples section and D-09's own forward-pointer comment
(lines 18-23) both call out explicitly as Phase 11's job — do not add a game id here without a
matching `GAME_REGISTRY` entry (the `satisfies Readonly<Record<GameId, GameRegistryEntry>>`
assertion on `GAME_REGISTRY` will fail to compile otherwise).

---

### `packages/schema/src/create-room.ts` (EDIT — config, request-response)

**Current state** (full file, 20 lines):
```typescript
export const CreateRoomRequestSchema = z.discriminatedUnion("gameId", [
  z.strictObject({
    gameId: z.literal(GameIdSchema.enum.hanabi),
    displayName: DisplayNameSchema,
    config: VariantSchema,
  }),
]);
```
Add a second `z.strictObject` union member for Expedition:
```typescript
z.strictObject({
  gameId: z.literal(GameIdSchema.enum.expedition),
  displayName: DisplayNameSchema,
  config: z.null(), // MGR-03: no settings in v2.0 (A2)
}),
```
The discriminated union + `z.strictObject` combination fail-closed on an unknown gameId, missing
config, or extra key — same discipline as the existing Hanabi member.

---

### `apps/worker/src/game-registration.ts` (EDIT — registry/config, request-response)

**Analog:** same file's own Hanabi entry (full file read, 171 lines)

**Error mapper pattern** (lines 19-49): an exhaustive `switch` over the adapter's own error union,
with a `never`-typed default that throws — never a `String(error)` fallback.
```typescript
function mapError(error: AdapterError): GameErrorDetail {
  switch (error) {
    case "not_your_turn": return { gameId: HANABI_GAME_ID, code: "not_your_turn" };
    /* ...one case per AdapterError member... */
    default: {
      const exhaustiveCheck: never = error;
      throw new Error(`Unrecognized AdapterError: ${String(exhaustiveCheck)}`);
    }
  }
}
```
Write `mapExpeditionError(error: RunError): GameErrorDetail` the same way, one case per `RunError`
member, `gameId: EXPEDITION_GAME_ID`.

**Compile-time mutual-assignability assertions** (lines 51-86) — REQUIRED per RESEARCH.md
Pitfall 4:
```typescript
type _AssertErrorMutuallyAssignable = [AdapterError] extends [HanabiErrorCode]
  ? [HanabiErrorCode] extends [AdapterError] ? true : never : never;
const _assertErrorMutuallyAssignable: _AssertErrorMutuallyAssignable = true;

type _AssertViewAssignable = [HanabiView] extends [HanabiViewWire] ? true : never;
const _assertViewAssignable: _AssertViewAssignable = true;

type _AssertKeysMutuallyAssignable = [keyof HanabiView] extends [keyof HanabiViewWire]
  ? [keyof HanabiViewWire] extends [keyof HanabiView] ? true : never : never;
const _assertKeysMutuallyAssignable: _AssertKeysMutuallyAssignable = true;
```
Add the same three assertions for Expedition's `RunError`/`ExpeditionErrorCode` and
`ExpeditionView`/`ExpeditionViewWire` pairs, immediately after the Hanabi block.

**Registry entry pattern** (lines 135-146, via `defineGame`, signature at lines 116-127):
```typescript
export const GAME_REGISTRY = Object.freeze({
  [HANABI_GAME_ID]: defineGame<HanabiState, HanabiAction, Variant, GameEndResult, AdapterError>({
    gameId: HANABI_GAME_ID,
    displayName: "Hanabi",
    adapter: hanabiGame,
    viewSchema: HanabiViewSchema,
    configSchema: VariantSchema,
    defaultConfig: "base",
    limits: { min: 2, max: 5 }, // ROOM-06, D-10
    mapError,
  }),
}) satisfies Readonly<Record<GameId, GameRegistryEntry>>;
```
Add a sibling `[EXPEDITION_GAME_ID]: defineGame<RunState, RunAction, ExpeditionConfig,
ExpeditionEndResult, RunError>({ ... limits: { min: 3, max: 5 } /* MGR-02 */, mapError:
mapExpeditionError })` entry — RESEARCH.md's own "Code Examples" section (lines 419-437) already
gives the exact target shape for this addition, matching this analog precisely.

**Imports to add** at the top of the file (mirroring lines 12-17's Hanabi import block):
`expeditionGame` from `@games/rules`; `RunAction`/`RunError`/`RunState`/`ExpeditionConfig`/
`ExpeditionEndResult` types from `@games/rules`; `EXPEDITION_GAME_ID`, `ExpeditionViewSchema`,
`ExpeditionConfigSchema` from `@games/schema/games/expedition`; `ExpeditionViewWire`,
`ExpeditionErrorCode` types from the same subpath.

## Shared Patterns

### Adapter thin-delegation discipline
**Source:** `packages/rules/src/hanabi/adapter.ts` (whole file), `packages/rules/src/adapter.ts`
(interface + 3 invariants)
**Apply to:** `packages/rules/src/expedition/adapter.ts`
No rule logic inline in the adapter object literal — every method is a one-line call into an
existing module (`run/lifecycle.ts`, `run/run-actions.ts`, `view.ts`).

### Own-hand-literal, no-spread projection discipline
**Source:** `packages/rules/src/hanabi/projection.ts` header comment (lines 1-21) and body
**Apply to:** `packages/rules/src/expedition/view.ts`, every nested view object (hands,
objectives, reveals, log entries, draft offers)
No spread/`delete`/`Object.assign`/omit-helper anywhere in this file — a hidden field must be
structurally absent from the object literal, not merely stripped, so a future `RunState` field
addition produces a compile signal (unused variable) rather than a silent leak.

### Exact-own-key request validation
**Source:** `packages/rules/src/hanabi/actions.ts` lines 55-77 (`isPlayRequest`,
`isDiscardRequest`)
**Apply to:** `packages/rules/src/expedition/request-guards.ts`, every `RunAction` variant guard
`Object.keys(request).length !== N` check rejects any payload with extra/spoofed keys before
narrowing `unknown` to a typed action. Never cast directly.

### Structural + typed-multiset + raw-token leak detection
**Source:** `packages/rules/src/hanabi/hanabi-leak-check.ts` (whole file)
**Apply to:** the new Expedition leak-check helper and its property test
Three independent detection layers (key-presence structural walk, excess-count multiset, raw
seed substring scan) rather than one generic redaction diff — catches both "structurally present"
and "present with a re-encoded identity" leak shapes.

### Compile-time view/error mutual-assignability assertions
**Source:** `apps/worker/src/game-registration.ts` lines 51-86 (Hanabi's own assertions)
**Apply to:** the Expedition registry addition in the same file
Prevents the adapter's TS view/error types from silently drifting from the Zod wire schema across
the `packages/rules`/`packages/schema` package boundary (no runtime dependency enforces this
otherwise).

### `z.strictObject` at every nesting level, declared independently
**Source:** `packages/schema/src/games/hanabi.ts` header (lines 1-31) and every schema
declaration in the file
**Apply to:** `packages/schema/src/games/expedition.ts`, all nested view schemas
Never `.omit()`/`.extend()`/`.partial()` from a persisted-state schema — declare the wire shape
independently so a new persisted field can't leak into the wire view by default.

## No Analog Found

None — every file in RESEARCH.md's Wave 0 Gaps list has a direct, current, production analog in
the Hanabi conformance (adapter, projection, leak-checker, property test, schema, errors,
registry entry). This phase is explicitly a "mirror an existing pattern" wiring phase, not
greenfield design.

## Metadata

**Analog search scope:** `packages/rules/src/hanabi/`, `packages/rules/src/adapter.ts`,
`packages/schema/src/games/`, `packages/schema/src/room.ts`, `packages/schema/src/create-room.ts`,
`apps/worker/src/game-registration.ts`, `packages/rules/src/expedition/run/types.ts` (target-side
context)
**Files scanned:** 12 read in full or targeted range (adapter.ts, hanabi/adapter.ts,
hanabi/projection.ts, hanabi/actions.ts [range], hanabi/hanabi-leak-check.ts,
hanabi/redaction.property.test.ts [range], schema/games/hanabi.ts, schema/games/hanabi-errors.ts,
schema/room.ts, schema/create-room.ts, apps/worker/src/game-registration.ts, expedition/run/types.ts
[range]); directory listings of `packages/rules/src/hanabi/`, `packages/schema/src/games/`,
`packages/rules/src/expedition/`
**Pattern extraction date:** 2026-09-27
