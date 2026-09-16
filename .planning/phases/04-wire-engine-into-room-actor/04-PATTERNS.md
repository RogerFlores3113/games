# Phase 4: Wire Engine Into Room Actor - Pattern Map

**Mapped:** 2026-09-16
**Files analyzed:** 20 (modified/new) + 10 (deleted)
**Analogs found:** 20 / 20 (this is a SWAP phase — most "analogs" are the files' own current versions, or their Phase-2-toy equivalents)

## File Classification

| New/Modified/Deleted File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/worker/src/game-registration.ts` | config/registration | request-response | itself (current toy-wired version) | exact — same file, swap imports only |
| `packages/schema/src/games/hanabi.ts` (new) | model/schema | transform (view validation) | `packages/schema/src/games/forehead-card.ts` | exact — explicit template per CONTEXT D-05 |
| `packages/schema/src/games/subpath.test.ts` (extend, do not fork) | test | request-response | itself (currently tests forehead-card subpath) | exact |
| `packages/schema/src/messages.ts` | model/schema | request-response | itself (`GameActionMessageSchema`, `ErrorDetailSchema`) | exact — additive field + enum widening |
| `packages/schema/src/room.ts` | model/schema | CRUD (persisted state) | itself (`SeatSchema`, `seed` field's optional-migration precedent) | exact |
| `packages/schema/src/constants.ts` | config | — | itself (`ROOM_SCHEMA_VERSION`) | exact |
| `apps/worker/src/room-state.ts` | service (pure state machine) | CRUD / request-response | itself (`applyGameAction`, `mapAdapterError`, `startGame`) | exact |
| `apps/worker/src/room-do.ts` | controller (DO / WS glue) | event-driven | itself — verify unchanged beyond passing `actionId` through | exact (near-no-op) |
| `apps/worker/src/seat-projection.ts` | middleware (fail-closed gate) | transform | itself — unchanged per D-04 | exact (no-op) |
| `apps/worker/src/source-structure.test.ts` | test (structural/static) | — | itself (A9 assertion) | exact |
| `apps/worker/src/redaction-wire.test.ts` | test (property, wire-level) | — | itself, using `packages/rules` toy leak-check imports | exact — repoint to Hanabi leak-check exports |
| `apps/worker/src/room-do.test.ts` | test (integration, `wrangler dev` + raw `ws`) | event-driven | itself — existing D-17 eviction test + existing `game_action`/`guess` send sites (lines ~418, ~573, ~582) | exact |
| `apps/worker/src/room-state.test.ts` | test (unit) | — | itself, line 485 fixture | exact |
| `apps/worker/src/persistence.test.ts`, `scheduler.test.ts` | test (unit, fixtures) | — | itself, `adapterId: "counter"` fixtures | partial — confirm at plan time whether a 3rd `"forehead-card"`→`"hanabi"` fixture generation is needed |
| `packages/rules/src/index.ts` | barrel export | — | itself (toy export block, lines 18-30) | exact — delete block, keep Hanabi export block (already present, lines 32-39) |
| `apps/web/components/HanabiBoard.tsx` (+ subcomponents, new) | component | request-response (renders pushed view, sends actions) | `apps/web/components/ForeheadCardGame.tsx` | exact — explicit template per phase context |
| `apps/web/components/Button.tsx` | component (reused, unmodified) | — | itself | exact — reuse as-is for board controls |
| `apps/web/components/Lobby.tsx` | component (reused for conventions only) | — | itself | role-match — theme-token/testid conventions, not the swap target |
| `apps/web/app/room/[code]/RoomClient.tsx` | controller/glue (client) | request-response | itself, lines 18, 209-214 (the `ForeheadCardGame` import + render branch + `game_action` send site) | exact |
| `e2e/start-game.spec.ts`, `e2e/in-progress-arrival.spec.ts` | test (e2e) | event-driven | itself — toy `data-testid`s and `{type:"guess"}` action shape | exact |
| `e2e/hanabi-realtime.spec.ts` (new, discretion) | test (e2e) | event-driven | `e2e/start-game.spec.ts`'s two-browser-context setup | role-match |
| `apps/worker/src/room-do.test.ts` RT-09 case (new) | test (integration) | event-driven | the file's own existing D-17 kill/respawn harness + `game_action` send pattern | exact |

## Pattern Assignments

### `packages/schema/src/games/hanabi.ts` (model/schema, transform)

**Analog:** `packages/schema/src/games/forehead-card.ts` (full file, 59 lines — read in full above)

**File-level discipline to copy verbatim** (comment block, lines 1-20):
```typescript
import { z } from "zod";

// D-05/D-06: strict, game-namespaced wire schema ... Every object schema
// here is z.strictObject, declared independently — never via `.omit()` —
// at EVERY nesting level ...
// This module is imported ONLY by apps/worker's game-registration/send path.
// It is never re-exported from packages/schema/src/index.ts (the generic
// barrel stays game-agnostic, per FDN-01/D-06), and packages/rules never
// imports it (packages/rules stays zero-dependency per FDN-02).
```

**Hidden/visible discriminated union pattern** (lines 22-33, generalize to Hanabi's richer card — nested inside `facts`):
```typescript
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
```
For Hanabi, add `facts: ClueFactsViewSchema` to BOTH branches (hidden cards still carry clue facts — see `HanabiCardView` in `packages/rules/src/hanabi/state.ts:54-56`), and add `suit`/`rank` only to the visible branch.

**Top-level strict object pattern** (lines 47-57):
```typescript
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
```
The real `HanabiView` shape to mirror field-for-field is `packages/rules/src/hanabi/state.ts:103-118` — **do not guess the field list; copy it from that type directly.** Key facts confirmed by reading `state.ts` and `variant.ts` this session:
- `Suit` enum values (confirmed, not the illustrative placeholder in RESEARCH.md): `["red", "yellow", "green", "blue", "white", "rainbow", "black"]` — from `packages/rules/src/hanabi/variant.ts:28-36` (`ALL_SUITS`).
- `Rank` values: `[1,2,3,4,5]` — `variant.ts:39-40` (`RANKS`).
- `HanabiView` DOES include a `history: HistoryEntryView[]` field (`state.ts:117`) — **this contradicts RESEARCH.md's claim that history has no field in `HanabiView`.** Re-verify at plan/execution time by reading `state.ts:103-118` directly (already reproduced in full above) before deciding whether the RT-09 test can assert on history length. The `HistoryEntryView` union (lines 70-101) is a 4-member discriminated union on `type: "play"|"discard"|"clue"|"draw"` and must be schema'd as its own `z.discriminatedUnion("type", [...])`, same strict-per-branch discipline.
- `ClueFacts`/`ClueFactsView` (lines 18-23, 58-63): `possibleSuits: Suit[]`, `possibleRanks: Rank[]`, `positiveClues`/`negativeClues: Array<{type:"color"|"rank", value: Suit|Rank}>` — schema this as its own `ClueFactsViewSchema` reused inside both card branches, exactly as Pattern 2 in RESEARCH.md sketches.

**Adjacent files to touch identically to the toy's wiring** (grep-confirmed structure of the subpath trio — inspect `packages/schema/package.json`'s `exports` map and `tsconfig.base.json`'s `paths` entry for the existing `forehead-card` subpath before writing the `hanabi` one, and all four `vitest.config.ts` `projects` aliases, ordering the `@games/schema/games/hanabi` alias **before** the bare `@games/schema` alias per D-05).

---

### `packages/schema/src/games/subpath.test.ts` (test)

**Analog:** itself, current content (full file, 34 lines — reproduced above)

Copy the three-test structure verbatim, retargeted:
```typescript
import { FOREHEAD_CARD_GAME_ID, ForeheadCardViewSchema } from "@games/schema/games/forehead-card";
// becomes:
import { HANABI_GAME_ID, HanabiViewSchema } from "@games/schema/games/hanabi";
```
Test 2 (`"the generic barrel (index.ts) never mentions games/ or ForeheadCard"`, lines 15-20) must be updated to check `"Hanabi"` has zero occurrences in the barrel too — keep the same `readFileSync`/`toContain` structure.

---

### `apps/worker/src/game-registration.ts` (registration/config)

**Analog:** itself, current content (full file, 47 lines — reproduced above)

Exact target shape confirmed against real exports in `packages/rules/src/index.ts:32-39` (`hanabiGame`, `HanabiState`, `HanabiView` are already exported; no new rules-side export needed):
```typescript
import { hanabiGame } from "@games/rules";
import type { HanabiState, HanabiView } from "@games/rules";
import { HANABI_GAME_ID, HanabiViewSchema } from "@games/schema/games/hanabi";
import type { HanabiViewWire } from "@games/schema/games/hanabi";

export const activeGame = {
  adapter: hanabiGame,
  viewSchema: HanabiViewSchema,
  gameId: HANABI_GAME_ID,
} as const;

export type ActiveGameState = HanabiState;

type _AssertViewAssignable = [HanabiView] extends [HanabiViewWire] ? true : never;
const _assertViewAssignable: _AssertViewAssignable = true;

type _AssertKeysMutuallyAssignable = [keyof HanabiView] extends [keyof HanabiViewWire]
  ? [keyof HanabiViewWire] extends [keyof HanabiView] ? true : never
  : never;
const _assertKeysMutuallyAssignable: _AssertKeysMutuallyAssignable = true;
```
**Note:** `activeGame.gameId` — grep for `activeGame.gameId` before assuming it needs a value; RESEARCH.md's Assumption A2 flags it as possibly unused. Confirmed here: nothing in `room-state.ts`, `room-do.ts`, or `seat-projection.ts` (all three fully read this session) reads `activeGame.gameId` — only `activeGame.adapter` and `activeGame.viewSchema` are consumed (`room-state.ts:34`, `seat-projection.ts:14/51`). Keep the field only if the plan wants it for future debugging; it is not load-bearing.

---

### `packages/schema/src/messages.ts` (model/schema)

**Analog:** itself (relevant excerpt reproduced above, lines 30-99)

**GameActionMessageSchema, current shape (lines 30-36):**
```typescript
const GameActionMessageSchema = z.strictObject({
  type: z.literal("game_action"),
  request: z.unknown(),
});
```
**Target shape (D-07):**
```typescript
const ACTION_ID_MIN = 1;
const ACTION_ID_MAX = 64;

const GameActionMessageSchema = z.strictObject({
  type: z.literal("game_action"),
  actionId: z.string().min(ACTION_ID_MIN).max(ACTION_ID_MAX),
  request: z.unknown(),
});
```

**ErrorDetailSchema, current shape (line 83):**
```typescript
export const ErrorDetailSchema = z.enum(["view_unavailable"]);
```
**Target shape (D-10) — widen to a closed enum.** Confirmed `AdapterError` has 8 members (per RESEARCH.md's Open Question #1, sourced from `packages/rules/src/hanabi/legality.ts`/`actions.ts` — not independently re-read this session, verify member names at plan time): `not_your_turn`, `invalid_action`, `game_over`, `card_not_in_hand`, `no_clue_tokens`, `clue_touches_nothing`, `clue_target_invalid`, `discard_at_max_clues`. RESEARCH.md's recommendation (give every member a corresponding `ErrorDetail` entry, 1:1, no lossy collapsing) is the pattern to follow — same enum-widening style as the existing single-member enum.

---

### `packages/schema/src/room.ts` (model/schema, persisted state)

**Analog:** itself, `SeatSchema` (lines 74-88) and the `seed` field's optional-migration precedent (lines 104-109), both reproduced above.

The `seed` field is the exact precedent for adding `lastAppliedActionId`:
```typescript
/** WR-07: the secret, server-minted seed ... Optional so rooms persisted
 * before this field existed still parse. */
seed: z.string().optional(),
```
Apply the identical "optional/nullable so old persisted rows still parse" idiom to the new field on `SeatSchema`:
```typescript
lastAppliedActionId: z.string().nullable().optional(),
```
**Critical placement rule (confirmed by reading `PublicSeatSchema`, lines 125-131):** `PublicSeatSchema` is declared independently of `SeatSchema` (not via `.omit()`) specifically so a new `Seat` field does NOT leak by default — this is the established whitelist-serialize pattern. Do **not** add `lastAppliedActionId` to `PublicSeatSchema`, and do not touch `toSeatView`'s seat-mapping in `room-state.ts:337-342` (it already only copies `seatId`, `displayLabel`, `connected`, `isHost` — confirmed, no change needed there).

---

### `apps/worker/src/room-state.ts` (service, CRUD/request-response)

**Analog:** itself, full file (354 lines — reproduced in full above)

**`mapAdapterError`, current shape (lines 287-293):**
```typescript
function mapAdapterError(): RefusalReason {
  return "bad_request";
}
```
**Target shape (D-10) — takes the adapter's error, returns the widened enum member.** Exactly one call site today, confirmed inside `applyGameAction` (line 311: `return { ok: false, reason: mapAdapterError() };`) — grep for `mapAdapterError(` before considering the signature-change task done, per RESEARCH.md Pitfall 4.

**`applyGameAction`, current shape (lines 298-325) is the base to extend with the D-08 dedup check** (full function reproduced above). The dedup check must run **before** `adapter.applyAction` (D-09/Pitfall 2), reading/writing through `state.seats`, following the exact immutable-map style already used by `markConnected` (lines 192-205) and `transferHost` (lines 211-223) elsewhere in this same file:
```typescript
const seats = state.seats.map((seat) =>
  seat.seatId === actorSeatId ? { ...seat, lastAppliedActionId: actionId } : seat,
);
```
This is a direct copy of the `markConnected`/`transferHost` immutable-array-map idiom already established in this file — do not invent a new update style.

**`startGame`, unchanged (lines 256-285):** confirms A1 from RESEARCH — `adapter.createInitialState({ seatIds, variant, seed })` already matches `hanabiGame`'s signature exactly (`packages/rules/src/hanabi/adapter.ts:21`); no call-site change needed here.

**`toSeatView`, unchanged (lines 336-353):** confirms D-04 — this function stays entirely generic over `ActiveGameState`; only the type alias in `game-registration.ts` changes what `ActiveGameState` resolves to.

---

### `apps/worker/src/source-structure.test.ts` (test, structural)

**Analog:** itself, A9 test (lines 295-308, reproduced above)

Current A9 asserts `foreheadCardGame` and `@games/schema/games/` are confined to `game-registration.ts`. Target (D-03/Pitfall 5): rename the grep pattern from `/foreheadCardGame/g` to `/hanabiGame/g`, keep the `@games/schema/games/` pattern as-is (it's generic to the path prefix, matches `.../hanabi` automatically), and **add** a new, separate assertion that `foreheadCardGame` has **zero** occurrences anywhere post-deletion (a regression check distinct from the confinement check — see Pitfall 5's explicit warning that "relaxed to zero matches" is NOT the same claim as "confined to one file"). All other lettered assertions (A1-A8, A10) are unchanged — they test generic chokepoints (`.send(`, `toSeatView(`, etc.), not game-specific names.

---

### `apps/worker/src/redaction-wire.test.ts` (test, property + wire-level)

**Analog:** itself, full file (177 lines — reproduced above)

Current imports to replace (line 9):
```typescript
import { checkSeatViewForLeaks, FOREHEAD_CARD_VALUES, secretsForSeat } from "@games/rules";
```
Target (D-02), using the already-built Phase 3 exports confirmed in `packages/rules/src/index.ts:36, 39`:
```typescript
import { checkHanabiViewForLeaks, secretsForHanabiSeat } from "@games/rules";
import type { HanabiSeatSecrets } from "@games/rules";
```
The overall test structure (`buildStartedRoom`, `assertNoWireLeaksForEveryState`, the fast-check property over 2-5 seats/random seed/random action sequence, and the final "played to `ended`" test) carries over unchanged in shape — only the action-generation loop changes from `{ type: "guess", value: FOREHEAD_CARD_VALUES[index] }` (lines 106, 132) to legal Hanabi actions (play/discard/clue), and the leak-checker calls swap `checkSeatViewForLeaks`/`secretsForSeat` for `checkHanabiViewForLeaks`/`secretsForHanabiSeat`. The wire-canary test (lines 147-176, "a leaky view is rejected by validateGameView") is the most important one to preserve structurally verbatim — it proves the strict schema, not `RoomViewSchema`, is what blocks a leak; only the leaked-field example changes from `yourCard.value` to something in `HanabiCardView` (e.g. forcing `hidden: true` while adding `suit`/`rank`).

---

### `apps/worker/src/room-do.test.ts` (test, integration `wrangler dev` + raw `ws`)

**Analog:** itself, existing D-17 eviction harness (lines 1-120+ reproduced above) and the existing `game_action`/`guess` send sites at lines 418, 573, 582.

**Existing send-site pattern to copy for the RT-09 double-send test** (line 418 style):
```typescript
send(ws1, { type: "game_action", request: { type: "guess", value: "Altair" } });
```
Target (D-07/D-08/D-09/D-15), adding `actionId` and switching the payload to a `clue` (per D-09's mandate — a play/discard is NOT sufficient because it's naturally rejected on retry):
```typescript
const clueFrame = { type: "game_action", actionId: "test-fixed-action-id-1", request: { type: "clue", targetSeatId: seatB, clue: { type: "rank", value: 1 } } };
send(actorSocket, clueFrame);
await waitForStateFrame(actorSocket);
// capture clueTokens/activeSeatId/isYourTurn/deckCount from the "state" frame
send(actorSocket, clueFrame); // identical actionId, resend
await waitForStateFrame(actorSocket);
// assert those same fields are UNCHANGED by the second send
```
Reuse `collectMessages`/message-predicate-search helpers already defined in this file (lines 112-120+) rather than assuming positional ordering — the file's own comment already documents why (bursts of `joined` immediately followed by `state`).

**IMPORTANT correction the plan must resolve:** this session's direct read of `packages/rules/src/hanabi/state.ts:103-118` shows `HanabiView` DOES include a `history: HistoryEntryView[]` field — this differs from RESEARCH.md's claim (based on an assumption, not a direct read at that time) that history is absent from the wire view. Before writing the RT-09 assertions, re-confirm by reading `packages/rules/src/hanabi/state.ts` and `projection.ts`/`hanabi-leak-check.ts` directly: if `history` really is populated on the wire, the test MAY assert on `view.history.length` unchanged after the duplicate send (closer to CONTEXT.md's original D-15 wording); if it turns out `toHanabiPlayerView` deliberately empties/omits history per-seat (D-19's "no interface exposes history in v1" language, worth checking against `projection.ts`), then RESEARCH.md's fallback (assert on `clueTokens`/`activeSeatId`/`isYourTurn`/`deckCount` only) is correct. This is a genuine "verify before use" ambiguity — do not carry either claim into the plan without re-reading `projection.ts`.

---

### `apps/web/components/HanabiBoard.tsx` (+ subcomponents) (component)

**Analog:** `apps/web/components/ForeheadCardGame.tsx`, full file (208 lines — reproduced above)

**Type-guard-over-`view.game` pattern to copy** (lines 13-23):
```typescript
function isForeheadCardView(game: unknown): game is ForeheadCardView {
  return (
    typeof game === "object" && game !== null &&
    "yourCard" in game && "otherCards" in game &&
    Array.isArray((game as { otherCards: unknown[] }).otherCards) &&
    "revealed" in game && Array.isArray((game as { revealed: unknown[] }).revealed)
  );
}
```
Retarget the guard's key checks to `HanabiView`'s actual field set (`yourHand`, `otherHands`, `stacks`, `discard`, etc.) — same "duck-type before trusting" shape, since `view.game` is typed `unknown` at the wire-schema boundary (`RoomViewSchema.game` stays `z.unknown()`, confirmed by `subpath.test.ts`'s own third test, lines 22-33).

**Turn-indicator + theme-token styling pattern to copy exactly** (lines 48-59): the `data-testid="turn-indicator"`, conditional `color: isYourTurn ? "var(--color-accent)" : "var(--color-text-muted)"`, and `labelFor(seatId)` seat-label lookup via `view.seats.find(...)` — reuse verbatim; this is the established convention for showing whose turn it is anywhere in this app.

**Card-tile / hidden-vs-visible rendering pattern to copy** (lines 61-96, 98-110): the `!entry.card.hidden &&` conditional render for revealing a value, and the empty bordered div for an own hidden card (`data-testid="own-card"`, no children) — same structural idea generalizes to Hanabi's per-slot clue-fact display (D-11: "your own hand as face-down slots showing their accumulated clue facts" — render the slot's `facts` even though `suit`/`rank` stay absent, unlike the toy's fully-empty own-card tile).

**Action-button pattern to copy** (lines 124-136): map over a fixed value set into `<Button variant="primary" data-testid={...} disabled={!isYourTurn} onClick={...}>` — for Hanabi this becomes per-slot play/discard buttons plus a clue-target/clue-value control, with `disabled` widened per D-12 to also cover "no clue tokens," "discard at max," and "clue touches nothing" — all three are computable from the redacted `HanabiView` alone (confirmed: `clueTokens`, `otherHands[].cards` are all wire-visible fields).

**End-of-game branch pattern to copy** (lines 138-157, `isEnded` conditional + `data-testid="final-score"`): same shape, add the score band from `scoreBand`/`currentScore` (already exported from `packages/rules/src/index.ts:35`) per D-13.

**Reuse `Button.tsx` unmodified** (full file, 41 lines, reproduced above) — the `variant="primary"|"ghost"`, `disabled` styling (line 30, deliberately drops the accent fill rather than fading it), and `--size-touch-min` sizing are already the established control convention; do not reinvent a new button style for the interim board.

**Theme-token / layout conventions to copy from `Lobby.tsx`** (lines 1-60 reproduced above): `className`s built from `var(--space-*)`/`var(--text-*)` tokens, `style={{ backgroundColor: "var(--color-bg)" }}` on the outer `<main>`, and the "no readiness toggle, if you find yourself adding one it was cut" comment style for documenting deliberately-omitted scope inline — match this documentation convention in the new board's comments (D-11's "deliberately plain" boundary, D-12's "only unambiguous disabling" boundary).

---

### `apps/web/app/room/[code]/RoomClient.tsx` (controller/glue)

**Analog:** itself, current content (full file, 215 lines — reproduced above)

**Import + render-branch swap** (line 18 and lines 209-214):
```typescript
import { ForeheadCardGame } from "../../../components/ForeheadCardGame";
// ...
return (
  <ForeheadCardGame
    view={view}
    onGuess={(value) => send({ type: "game_action", request: { type: "guess", value } })}
  />
);
```
becomes:
```typescript
import { HanabiBoard } from "../../../components/HanabiBoard";
// ...
return (
  <HanabiBoard
    view={view}
    onAction={(request) => send({ type: "game_action", actionId: nanoid(), request })}
  />
);
```
The `actionId` must be minted **once per user intent** (D-07) — if the board's `onAction` callback itself calls `nanoid()` inline on every invocation, a retry (if the board ever resubmits the same click) would mint a NEW id and defeat dedup. Confirm at plan/execution time whether the mint happens in `RoomClient.tsx`'s `send` wrapper (mint once per call, simplest) or needs to be threaded from the board component (only if the board itself implements its own retry logic, which D-11/D-12's "deliberately plain" scope suggests it does not this phase). `nanoid` is already an exact-pinned dependency of `apps/web` (per RESEARCH.md's Standard Stack table) — import it the same way this file already imports other utilities (`../../../lib/...` relative style is used elsewhere here, but `nanoid` is an npm package, so a bare `import { nanoid } from "nanoid"` is correct).

The rest of the file — `useRoomSocket`, `useRoomStore`, the `status === "refused"|"superseded"|"abandoned"` branches, the `Lobby` branch (lines 199-207) — is confirmed unchanged; this is the "small and boring diff" CONTEXT.md's Specific Ideas section calls out.

---

### `e2e/start-game.spec.ts`, `e2e/in-progress-arrival.spec.ts` (e2e tests)

**Analog:** itself, confirmed toy-coupled selectors (grep-confirmed this session):
```
own-card, other-card, turn-indicator, revealed-entry, deck-count, guess-button-*
```
at `e2e/start-game.spec.ts` lines 44-101 and `e2e/in-progress-arrival.spec.ts` lines 23, 38.

The two-browser-context setup pattern (`hostPage`, `pageB`, `pageC` opened against the same room code, asserting on each other's rendered DOM without a `page.reload()` for RT-01, and a `page.reload()` mid-game for RT-03) is the exact harness `hanabi-realtime.spec.ts` (new, discretion) should extend rather than reinvent — copy the multi-context setup boilerplate from the top of `start-game.spec.ts` (not fully re-read this session; read in full at plan/execution time before writing the new spec) and swap only the `data-testid`s and action payload shape to match `HanabiBoard.tsx`'s actual rendered testids.

---

## Shared Patterns

### Whitelist-constructed views (never leak by default)
**Source:** `packages/schema/src/room.ts` — `PublicSeatSchema` declared independently of `SeatSchema` (lines 74-131); `apps/worker/src/room-state.ts` — `toSeatView`'s seat-mapping (lines 337-342)
**Apply to:** `hanabi.ts`'s new schema (every nesting level, `z.strictObject` never `.omit()`/`.extend()`), and the new `lastAppliedActionId` field on `Seat` (must never be added to `PublicSeatSchema`/`RoomViewSchema`).

### Fail-closed strict-schema gate before anything reaches a socket
**Source:** `apps/worker/src/seat-projection.ts` (full file, reproduced above), specifically `validateGameView` (lines 46-61)
**Apply to:** No changes needed to this file itself (D-04), but the new `hanabi.ts` schema is what this gate runs — every plan task touching the schema should re-read this file's docstring on why `null` (not a raw fallback) is returned on failure.

### Single registration point / structural confinement, enforced by grep-based test
**Source:** `apps/worker/src/game-registration.ts`'s header comment (lines 1-11) + `apps/worker/src/source-structure.test.ts`'s A9 test (lines 295-308)
**Apply to:** Every worker-side file in this phase — the discipline check is "does this diff teach `room-state.ts`/`room-do.ts`/`seat-projection.ts` the word 'hanabi'?" If yes, it's out of scope per D-04 and CONTEXT.md's own stated acceptance bar.

### Immutable per-seat state update via `.map()`
**Source:** `apps/worker/src/room-state.ts` — `markConnected` (lines 192-205), `transferHost` (lines 211-223)
**Apply to:** The new `applyGameAction` dedup branch's `lastAppliedActionId` update — copy this exact `.map()` idiom, do not introduce a different mutation style (e.g. `find`+mutate, or a `Map`/`Record` keyed structure).

### Optional/nullable field for backward-compatible persisted-state migration
**Source:** `packages/schema/src/room.ts` — `seed: z.string().optional()` (lines 104-109) and its docstring
**Apply to:** `Seat.lastAppliedActionId` — same rationale, same `.nullable().optional()` idiom, same "why" comment style referencing the version-bump/reset alternative in `constants.ts`.

### Theme-token-driven inline styling + `data-testid` convention for e2e hooks
**Source:** `apps/web/components/ForeheadCardGame.tsx` (every JSX block), `apps/web/components/Lobby.tsx` (lines 34-59), `apps/web/components/Button.tsx` (full file)
**Apply to:** `HanabiBoard.tsx` and all its subcomponents — every visible state distinction needs a stable `data-testid` for Playwright (RT-01/RT-03), and every color/spacing value must be a `var(--...)` token, never a literal hex/px value.

### Comment-documented deliberate scope cuts inline with the code
**Source:** `apps/web/components/Lobby.tsx`'s "There is deliberately no toggle... if you find yourself adding one, stop, it was cut" (lines 20-25); `apps/web/components/ForeheadCardGame.tsx`'s "This screen exists to prove HIDE-01/D-03... it is deleted in Phase 4" (lines 25-32)
**Apply to:** `HanabiBoard.tsx`'s file header — document D-11's "deliberately plain, cheap to throw away" boundary and D-12's disabling boundary the same way, so Phase 6's replacement has the same kind of guardrail comment this file already benefited from.

## No Analog Found

None. Every file in this phase's scope is either the same file being modified in place, or has an explicit, already-identified template (`forehead-card.ts` -> `hanabi.ts`, `ForeheadCardGame.tsx` -> `HanabiBoard.tsx`) per CONTEXT.md's own framing. The only genuinely new mechanism — the `actionId` idempotency dedup — has its full worked example already in RESEARCH.md's Pattern 3 (Section: "Persisted Per-Seat Idempotency Key"), which was cross-checked against real code this session (`room-state.ts`'s actual `applyGameAction`/`mapAdapterError` bodies) and found consistent except for the corrected call-site line numbers reflected above.

## Discrepancies Found vs. RESEARCH.md (flag for planner)

1. **`HanabiView.history` existence:** RESEARCH.md's "Code Examples" section asserts `HanabiView` has "no `history` field at all." A direct read of `packages/rules/src/hanabi/state.ts:103-118` this session shows `HanabiView` **does** declare `history: HistoryEntryView[]`. The planner must re-verify against `projection.ts`/`hanabi-leak-check.ts` (not read this session) whether `toHanabiPlayerView` actually populates this field per-seat or always emits an empty array, before deciding how the RT-09 test should assert. See the note under `room-do.test.ts` above.
2. **`AdapterError` member list:** RESEARCH.md lists 8 members but the file that declares `AdapterError` (`packages/rules/src/hanabi/legality.ts` or `actions.ts`) was not independently re-read this session — confirm the exact 8 names before writing `mapAdapterError`'s 1:1 mapping.
3. **`Suit` enum values:** confirmed exactly correct in RESEARCH.md's illustrative schema (`red, yellow, green, blue, white, rainbow, black`) against `variant.ts:28-36`'s real `ALL_SUITS` — no discrepancy here, safe to copy verbatim into `hanabi.ts`.

## Metadata

**Analog search scope:** `apps/worker/src/`, `packages/schema/src/`, `packages/rules/src/`, `apps/web/components/`, `apps/web/app/room/[code]/`, `e2e/`
**Files read in full this session:** `game-registration.ts`, `forehead-card.ts` (schema), `subpath.test.ts`, `seat-projection.ts`, `room-state.ts`, `constants.ts`, `source-structure.test.ts`, `redaction-wire.test.ts`, `packages/rules/src/index.ts`, `hanabi/state.ts`, `hanabi/adapter.ts`, `hanabi/variant.ts`, `ForeheadCardGame.tsx`, `RoomClient.tsx`, `Lobby.tsx` (partial), `Button.tsx`, `room-do.test.ts` (partial, harness + grep-located send sites)
**Pattern extraction date:** 2026-09-16
