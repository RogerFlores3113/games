# Phase 2: Per-Seat Redaction Contract - Pattern Map

**Mapped:** 2026-09-15
**Files analyzed:** 14 (create/modify/delete)
**Analogs found:** 12 / 14 (2 have no direct analog — genuinely new test-tooling shapes)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/rules/src/forehead-card.ts` (new, replaces `counter-game.ts`) | model/service (game adapter) | CRUD + transform | `packages/rules/src/counter-game.ts` | exact |
| `packages/rules/src/shuffle.ts` (new) | utility | transform | none in-repo (new deterministic PRNG) | no analog — see below |
| `packages/rules/src/forehead-card.test.ts` (new) | test | unit + property | `packages/rules/src/counter-game.test.ts` (unit shape) + RESEARCH.md Pattern 4 (fast-check shape) | role-match |
| `packages/rules/src/index.ts` (modify) | config/barrel | — | itself (current version) | exact (edit in place) |
| `packages/schema/src/games/forehead-card.ts` (new) | model (Zod view schema) | request-response (outbound validation) | `packages/schema/src/room.ts` (`PublicSeatSchema`/`RoomViewSchema` whitelist-declare pattern) | exact |
| `packages/schema/src/games/forehead-card.test.ts` (new) | test | unit (schema rejection) | `packages/schema/src/room.test.ts` (not read but same package convention) / `packages/schema/src/messages.test.ts` | role-match |
| `apps/worker/src/room-state.ts` (modify) | service (pure state machine) | CRUD | itself (current version) — one-line adapter swap + `toSeatView`/`applyGameAction` cast changes | exact (edit in place) |
| `apps/worker/src/room-do.ts` (modify) | controller (Durable Object / WebSocket handler) | event-driven + request-response | itself (current version) — consolidate `connection.send` call sites into `#send`, add schema-gate in `#viewFor` | exact (edit in place) |
| `apps/worker/src/leak-check.ts` (new) | utility (test helper, used by prod-adjacent test suites) | transform | RESEARCH.md Code Examples (concrete implementation given); `apps/worker/src/seat-identity.ts`'s `timingSafeEqual`-style small pure-function module style | role-match |
| `apps/worker/src/leak-check.test.ts` (new) | test | unit + canary | `packages/rules/src/adapter.test.ts` (unit test style) | role-match |
| `apps/worker/src/source-structure.test.ts` (new) | test | structural/static | RESEARCH.md Code Examples (concrete implementation given); no in-repo analog for source-grepping tests | no close analog — see below |
| `apps/worker/src/room-do.test.ts` (modify — extend) | test | integration (wrangler dev, WebSocket) | itself (current version) — the `spawnWrangler`/`waitForReady`/`killAndWait` harness already present | exact (edit in place) |
| `apps/worker/src/persistence.ts` (modify, via `packages/schema/src/constants.ts` bump) | config | — | itself (`ROOM_SCHEMA_VERSION` bump only, no logic change) | exact (edit in place) |
| `apps/web/components/ForeheadCardGame.tsx` (new, replaces `CounterGame.tsx`) | component | request-response (render of server-pushed view) | `apps/web/components/CounterGame.tsx` | exact |
| `apps/web/app/room/[code]/RoomClient.tsx` (modify) | component (container) | event-driven (socket-driven render switch) | itself (current version) — swap `CounterGame` import/usage for `ForeheadCardGame` | exact (edit in place) |
| `e2e/start-game.spec.ts`, `e2e/in-progress-arrival.spec.ts` (modify) | test (E2E) | event-driven | themselves (current versions) + `e2e/helpers.ts` | exact (edit in place) |

**Deleted, not created:** `packages/rules/src/counter-game.ts`, `packages/rules/src/counter-game.test.ts`, `apps/web/components/CounterGame.tsx` (D-02).

## Pattern Assignments

### `packages/rules/src/forehead-card.ts` (model/service, CRUD+transform)

**Analog:** `packages/rules/src/counter-game.ts` (full file read above — reproduce its shape, not its rules)

**Adapter object shape to copy exactly** (whole file is the template — `id`, `createInitialState`, `applyAction`, `toPlayerView`, `checkGameEnd` as one object literal implementing `GameAdapter<TState, TAction>`):
```typescript
// packages/rules/src/counter-game.ts:36-79 — copy this SHAPE, not these rules
export const counterGame: GameAdapter<CounterState, CounterAction> = {
  id: "counter",
  createInitialState({ seatIds }) { /* ... */ },
  applyAction(state, actorSeatId, request) {
    if (!isIncrementRequest(request)) return { ok: false, error: "invalid_action" };
    if (actorSeatId !== state.seatIds[state.turnIndex]) return { ok: false, error: "not_your_turn" };
    return { ok: true, state: { /* new object, never mutated input */ } };
  },
  toPlayerView(state, seatId): CounterView { /* whitelist-construct return object */ },
  checkGameEnd() { return null; },
};
```

**Hostile-input validation pattern** (`counter-game.ts:24-34`): a type guard that checks `Object.keys(request).length` before checking values — this is the "state-assertion structurally impossible" pattern D-05 extends. Reuse this shape for the toy's `guess` action:
```typescript
function isIncrementRequest(request: unknown): request is CounterAction {
  if (typeof request !== "object" || request === null) return false;
  const keys = Object.keys(request);
  if (keys.length !== 1 || keys[0] !== "type") return false;
  return (request as { type: unknown }).type === "increment";
}
```

**Non-mutation pattern**: `applyAction`'s accepted branch always returns a brand-new object literal (`{ count: state.count + 1, seatIds: state.seatIds, ... }`), never `{ ...state, count: state.count + 1 }` — this is deliberate given `counter-game.test.ts:85-90`'s "does not mutate the input state" test, which snapshots via `structuredClone` before the call and diffs after. Copy this discipline; the toy's own test file should include the equivalent snapshot-diff test.

**New requirement beyond the analog — whitelist discriminated-union projection (D-05)**, sourced from RESEARCH.md Pattern 1 (illustrative, adapt field names to the toy's actual state):
```typescript
type HiddenCard = { readonly id: string; readonly hidden: true };
type VisibleCard = { readonly id: string; readonly hidden: false; readonly value: number };
type ProjectedCard = HiddenCard | VisibleCard;

function projectCard(card: { id: string; value: number }, viewerCanSee: boolean): ProjectedCard {
  if (!viewerCanSee) {
    return { id: card.id, hidden: true }; // object literal never mentions `value`
  }
  return { id: card.id, hidden: false, value: card.value };
}
```
Use this inside `toPlayerView`, never `{ ...card, value: viewerCanSee ? card.value : undefined }`.

**Card id generation (D-04):** `apps/worker/src/seat-identity.ts:55-57`'s `mintSeatId` is the project's existing "short opaque id, not derived from anything sensitive" convention:
```typescript
export function mintSeatId(): string {
  return nanoid(10);
}
```
Since `packages/rules` is zero-dependency (cannot import `nanoid`), the toy's card-id minting must live in `packages/rules` using a simple in-package counter/string composition seeded from the deck-build step — NOT importing `nanoid` there. If a `nanoid`-quality id is wanted, mint it in `apps/worker` at deal time and pass it in, but the simpler and self-contained option (deterministic zero-dep composition, e.g. draw-order counter concatenated with a per-game random salt derived from `seed` via `shuffle.ts`'s PRNG, never the pre-shuffle deck index) satisfies D-04's actual constraint ("not correlated with identity/deck composition," not "cryptographically unguessable" — see RESEARCH.md Assumptions Log A4).

---

### `packages/rules/src/shuffle.ts` (utility, transform) — no analog

No existing seeded-PRNG or shuffle utility exists anywhere in the repo (`grep -r "shuffle\|mulberry\|splitmix" packages/` returns nothing). This is genuinely new code. RESEARCH.md's Recommended Project Structure names it explicitly: a zero-dependency mulberry32/splitmix32-style PRNG seeded from the `seed: string` parameter `createInitialState` already receives (same seed threading convention as `packages/rules/src/adapter.ts:40-47`'s `createInitialState` signature comment: "the same seatIds/variant/seed always produces a deep-equal initial state"). Build this from the well-known public-domain mulberry32 algorithm (a few lines: 32-bit state, one multiply-xor step per draw) — do not reach for an npm dependency (FDN-02 zero-dependency constraint forbids it in `packages/rules`).

---

### `packages/schema/src/games/forehead-card.ts` (model, Zod view schema)

**Analog:** `packages/schema/src/room.ts` — specifically the "declare view independently, never `.omit()`" convention and `z.strictObject`-adjacent patterns already used in `packages/schema/src/messages.ts`.

**Whitelist-declaration precedent** (`room.ts:125-131`):
```typescript
// PublicSeatSchema is declared independently of SeatSchema (which has
// seatToken), never via `.omit()` — so a future field on SeatSchema cannot
// leak by default. This IS the pattern D-05/D-06 extend to game views.
export const PublicSeatSchema = z.object({
  seatId: z.string(),
  displayLabel: z.string(),
  connected: z.boolean(),
  isHost: z.boolean(),
});
```

**Discriminated-union + `z.strictObject` pattern**, sourced from `messages.ts:13-48`'s `ClientMessageSchema` (already uses exactly `z.discriminatedUnion("type", [...])` over multiple `z.strictObject`s) — apply the identical technique keyed on `hidden` instead of `type`:
```typescript
// packages/schema/src/messages.ts:13-48 — copy the discriminatedUnion-over-
// strictObject shape, not its message types
export const ClientMessageSchema = z.discriminatedUnion("type", [
  JoinMessageSchema,      // each member is z.strictObject({ type: z.literal(...), ... })
  SetVariantMessageSchema,
  StartGameMessageSchema,
  GameActionMessageSchema,
  LeaveMessageSchema,
]);
```
For the toy (per RESEARCH.md Pattern 2, already concretely specified):
```typescript
const HiddenCardSchema = z.strictObject({ id: z.string(), hidden: z.literal(true) });
const VisibleCardSchema = z.strictObject({ id: z.string(), hidden: z.literal(false), value: z.number() });
export const ForeheadCardSchema = z.discriminatedUnion("hidden", [HiddenCardSchema, VisibleCardSchema]);

export const ForeheadCardViewSchema = z.strictObject({
  yourCard: HiddenCardSchema, // structurally cannot be a VisibleCard — your own view's own card is always the hidden variant
  otherCards: z.array(z.object({ seatId: z.string(), card: ForeheadCardSchema })),
  revealed: z.array(z.object({ id: z.string(), value: z.number(), seatId: z.string() })),
  deckCount: z.number(),
  activeSeatId: z.string(),
  score: z.number(),
});
```

**Placement:** `packages/schema/src/games/forehead-card.ts`, a NEW subfolder under `packages/schema/src/`, imported ONLY by `apps/worker`'s send path — never re-exported from `packages/schema/src/index.ts`'s generic barrel (RESEARCH.md Open Question 1's recommendation; keeps `RoomViewSchema.game` staying `z.unknown()` in `room.ts` untouched, preserving FDN-01).

---

### `apps/worker/src/room-state.ts` (service, CRUD) — edit in place

**Analog:** itself, current version (full file read above).

**One-line adapter swap** (`room-state.ts:35`):
```typescript
const adapter = counterGame; // becomes: const adapter = foreheadCardGame;
```
Update the import on line 13-14 (`import { counterGame } from "@games/rules"; import type { CounterAction, CounterState } from "@games/rules";`) to import the toy adapter and its state/action types instead.

**Cast sites to update** (`room-state.ts:309-310` in `applyGameAction`, `room-state.ts:352` in `toSeatView`):
```typescript
// line 309-310 — CounterState/CounterAction casts become the toy's types
const gameState = state.game as CounterState;
const result = adapter.applyAction(gameState, actorSeatId, request as CounterAction);
// line 352
game: state.game === null ? null : adapter.toPlayerView(state.game as CounterState, seatId),
```
CONTEXT.md's Claude's Discretion flags whether to generify this typing (remove the `as CounterState` cast pattern entirely via a generic `GameAdapter<unknown, unknown>` module-level constant) or keep the same cast-per-callsite convention with the toy's types substituted — either is acceptable; the existing file already establishes the cast-per-callsite convention as this phase's baseline.

**Do not touch** `toSeatView`'s outer shape (`room-state.ts:337-354`) beyond the one cast site — it remains the sole serializer, room-agnostic of the schema-gate validation that D-06/D-07 add (that gate belongs in `room-do.ts`'s `#viewFor`, per Pattern 2's placement in room-do.ts, not here — keeps FDN-01's "room layer holds no game logic" line intact, since `packages/schema`-dependent validation code has no reason to live in this zero-`zod`-aware pure module).

---

### `apps/worker/src/room-do.ts` (controller, event-driven) — edit in place

**Analog:** itself, current version (full file read above) — this is the file D-08/D-09/D-10 harden, not replace.

**Current scattered `connection.send` call sites to consolidate** (6 sites total, all reproduced above): `onMessage` bad_request (line 125), 4x `error` sends inside the `set_variant`/`start_game`/`game_action`/`leave` branches (lines 149, 161, 172, 184), `not_seated` error (line 142), `#handleJoin`'s bad_request/refused/joined sends (lines 329, 342, 368-375), the `superseded` send inside `#handleJoin`'s rebind block (line 359), and `#pushState`'s state send (line 401).

**Target shape — single `#send` chokepoint**, exactly as specified in RESEARCH.md Pattern 3:
```typescript
#send(connection: Connection, msg: ServerMessage): void {
  connection.send(encodeServerMessage(msg));
}
// every existing `connection.send(encodeServerMessage({...}))` becomes:
// `this.#send(connection, {...})`
```

**Existing chokepoint comments to preserve and extend** — `room-do.ts:1-17` (file header) and `room-do.ts:381-389` (`#viewFor` docstring) and `room-do.ts:391-403` (`#pushState` docstring) already state the grep-verifiable invariants in prose; D-09's `source-structure.test.ts` turns these prose claims into an enforced test. Update these comments to describe `#send` as the new single call site once the refactor lands, keeping the doc-comment-as-contract convention this file already uses throughout (see also the `#syncAlarm` comment at `room-do.ts:416-424` for the same "structural invariant documented in prose right above the code that upholds it" convention).

**Schema-gate insertion point — inside `#viewFor`** (`room-do.ts:387-389`), per RESEARCH.md Pattern 2's concrete example:
```typescript
#viewFor(room: RoomState, seatId: string) {
  const rawView = toSeatView(room, seatId);
  const gameCheck = ForeheadCardViewSchema.safeParse(rawView.game);
  if (!gameCheck.success) {
    console.error("HIDE-03 validation failure:", gameCheck.error);
    return { failed: true } as const;
  }
  return { failed: false, view: rawView } as const;
}
```
Both call sites of `#viewFor` (`#handleJoin` line 373, `#pushState` line 401) need updating to handle the new `{failed, view}` result shape and route a failure to an `error` frame with no view (D-07 fail-closed), through the same `#send` chokepoint.

**Reconnect/join/live-update convergence (D-10):** already satisfied structurally — `onConnect` (`room-do.ts:111-120`) deliberately does no seat assignment, and `onMessage`'s `join` branch (`room-do.ts:132-135`) routes both first-join and reconnect through the identical `#handleJoin` (which itself calls `joinRoom` in `room-state.ts`, whose reclaim-vs-new-join branching at `room-state.ts:98-155` is what makes a stale-token reclaim structurally indistinguishable from first join at this layer). No new resume-serializer code path should be introduced — this is a "do not regress" constraint, not new code.

---

### `apps/worker/src/leak-check.ts` + `.test.ts` (utility + test) — no direct in-repo analog, but RESEARCH.md supplies the exact implementation

RESEARCH.md's Code Examples section already contains the complete, ready-to-use implementation for both the checker (`hasKeyRecursive` + `checkForLeak`) and its D-13 canary test suite — reproduced verbatim there (lines 408-477 of `02-RESEARCH.md`). Copy that code directly; do not re-derive it. Style-wise, match `apps/worker/src/seat-identity.ts`'s convention of small, pure, well-commented exported functions with a file-level comment block explaining WHY the function exists before the function itself (see `seat-identity.ts:83-94`'s `timingSafeEqual` comment as the nearest in-repo tone/format match for a small security-adjacent pure helper).

---

### `apps/worker/src/source-structure.test.ts` (test, structural) — no in-repo analog, RESEARCH.md supplies the implementation

RESEARCH.md's Code Examples section (lines 370-406 of `02-RESEARCH.md`) has the complete, ready-to-use structural test including the `stripComments` helper needed to avoid Pitfall 3 (comment-text false-positives against `room-do.ts`'s own existing prose mentioning `toSeatView(`/`connection.send`). Copy directly. Pattern-match the `describe`/`it` structure against any existing `apps/worker/src/*.test.ts` file (e.g. `seat-identity.test.ts` or `scheduler.test.ts`, not read in full this session but confirmed present) for Vitest import conventions (`import { describe, expect, it } from "vitest";`) — already the exact import line RESEARCH.md's example uses.

---

### `apps/worker/src/room-do.test.ts` (test, integration) — extend in place

**Analog:** itself, current version (harness reproduced above, lines 1-90 of the current file read this session).

**Harness to reuse unchanged:** `spawnWrangler`, `waitForReady`, `killAndWait`, the `PORT`/`BASE_URL`/`WS_URL` constants, and the `--persist-to` temp-dir pattern (`persistDir = mkdtempSync(...)`) are all already fit for purpose — D-11 layer 3 needs no new harness, only new test bodies that: (1) connect 2+ real WebSocket clients against the spawned `wrangler dev` instance, (2) capture the raw frame strings received by each seat on `joined`, a live `state` push after a `game_action`, and a reconnect via `seatToken`, and (3) run `checkForLeak` (from the new `leak-check.ts`) over each captured frame. This directly extends the existing D-17 restart test's pattern of driving real WebSocket clients against the spawned process (read the file's later sections during implementation for the exact WebSocket client helper already in use, if one exists past line 90 — not fully read in this pass, but the harness setup already confirms the pattern is established).

---

### `apps/worker/src/persistence.ts` (config change only) — no logic edit, verify via `constants.ts`

**Analog:** itself, current version (full file read above) + `packages/schema/src/constants.ts` (full file read above).

**The only change**: bump `ROOM_SCHEMA_VERSION` in `packages/schema/src/constants.ts:10` from `1` to `2`. `persistence.ts` itself needs NO code change — its `loadRoom` function (lines 60-86) already compares `storedVersion !== ROOM_SCHEMA_VERSION` and resets unconditionally on mismatch (lines 71-75), which is exactly the reset path Pitfall 1 in RESEARCH.md relies on. Do not add a second reset trigger (e.g. an `adapterId` equality check) per RESEARCH.md's explicit recommendation — the module's own doc comment (`persistence.ts:6-12`) already documents "a version mismatch means the room resets... WITHOUT deserializing the old blob at all" as its one reset condition; preserve that invariant.

---

### `apps/web/components/ForeheadCardGame.tsx` (component, request-response render)

**Analog:** `apps/web/components/CounterGame.tsx` (full file read above).

**Structure to copy:**
```typescript
// apps/web/components/CounterGame.tsx:1-20 — copy the shape: "use client",
// import RoomView from @games/schema, import the game's View type from
// @games/rules, a type-guard function, and a Props interface taking
// { view: RoomView, on<Action>: () => void }
"use client";
import type { RoomView } from "@games/schema";
import type { CounterView } from "@games/rules"; // becomes ForeheadCardView
import { Button } from "./Button";

export interface CounterGameProps {
  view: RoomView;
  onIncrement: () => void; // becomes onGuess: (value: number) => void, etc.
}

function isCounterView(game: unknown): game is CounterView {
  return (
    typeof game === "object" && game !== null &&
    "count" in game && "activeSeatId" in game && "isYourTurn" in game
  );
}
```
Per RESEARCH.md Open Question 2's recommendation: keep this pattern exactly — a plain exported TS type from `packages/rules` (mirroring `CounterView`), NOT the Zod-inferred type from the new `packages/schema/src/games/forehead-card.ts` module, to avoid coupling the client bundle's rendering types to the validation-schema module.

**Styling convention to copy** (`CounterGame.tsx:33-64`): Tailwind utility classes combined with inline `style={{ color: "var(--color-...)" }}` referencing Phase 1's theme tokens (`--color-bg`, `--color-text`, `--color-text-muted`, `--color-accent`, `--space-md`, `--space-xl`, `--text-display`, `--text-body`), plus `data-testid` attributes on every element a Playwright spec will target (`data-testid="counter-value"` → e.g. `data-testid="score"`/`data-testid="your-card"`, `data-testid="turn-indicator"` reused as-is since the toy keeps a turn indicator per D-01/D-03).

**Deliberate bareness note** (`CounterGame.tsx:22-27`'s comment) — copy this exact framing in the new file's own header comment, updated for D-03's "exists to be deleted in Phase 4" framing instead of Phase 2's.

---

### `apps/web/app/room/[code]/RoomClient.tsx` (modify in place)

**Analog:** itself, current version (full file read above).

**Only change needed**: swap the import (`RoomClient.tsx:18`, `import { CounterGame } from "../../../components/CounterGame";` → `ForeheadCardGame`) and the render call (`RoomClient.tsx:209-213`):
```typescript
return (
  <CounterGame
    view={view}
    onIncrement={() => send({ type: "game_action", request: { type: "increment" } })}
  />
);
```
becomes the equivalent `ForeheadCardGame` invocation with `request: { type: "guess", value }` (or whatever the toy's action shape ends up being). No other change to this file — the `status === "lobby"` branch (lines 199-207), the `useRoomSocket`/`useRoomStore` wiring, and all the refusal/superseded/abandoned/connecting branches are untouched by this phase.

---

### `e2e/start-game.spec.ts`, `e2e/in-progress-arrival.spec.ts` (modify in place)

**Analog:** themselves, current versions (both fully read above) + `e2e/helpers.ts` (referenced, not read this session — exports `createRoom`, `expectSeatCount`, `joinAs`, reused unchanged).

**Selectors that must change** because they target counter-specific UI: `getByTestId("counter-value")` (start-game.spec.ts:44-45,74-75; in-progress-arrival.spec.ts:23,38) and `getByRole("button", { name: "+1" })` (start-game.spec.ts:66-67) become the toy's equivalent `data-testid`s and control labels — whatever `ForeheadCardGame.tsx` actually renders (e.g. a guess button per value, per D-03). `getByTestId("turn-indicator")` (start-game.spec.ts:48-49) is reused as-is since D-03 keeps a turn indicator.

**Unchanged assertions**: everything about the lobby/variant-picker/start-button gating (start-game.spec.ts:13-42) and the refusal-card assertions (in-progress-arrival.spec.ts:22-39, 60-67) — these test the room layer, not the game, and this phase does not touch that behavior.

## Shared Patterns

### Whitelist-declare, never `.omit()`
**Source:** `packages/schema/src/room.ts:125-131` (`PublicSeatSchema`), `packages/schema/src/messages.ts:13-48` (discriminated union of strict objects)
**Apply to:** `packages/rules/src/forehead-card.ts`'s `toPlayerView`/`projectCard`, `packages/schema/src/games/forehead-card.ts`'s schema declarations. This is the single most load-bearing pattern in the phase — every new projection or schema file must construct object literals field-by-field, never spread/omit/delete.

### Hostile-input validation with exact-key-count checks
**Source:** `packages/rules/src/counter-game.ts:24-34` (`isIncrementRequest`)
**Apply to:** the toy's `guess` action validator inside `forehead-card.ts`'s `applyAction`.

### Non-mutating state transitions verified by `structuredClone` snapshot-diff tests
**Source:** `packages/rules/src/counter-game.test.ts:26-32,85-90`
**Apply to:** `forehead-card.test.ts`'s rejected-action and accepted-action tests.

### Single-call-site chokepoints documented in prose directly above the enforcing code
**Source:** `apps/worker/src/room-do.ts:1-17` (file header), `:381-403` (`#viewFor`/`#pushState` docstrings), `:416-424` (`#syncAlarm` comment)
**Apply to:** the new `#send` method's docstring, and to `source-structure.test.ts`'s own header comment explaining what it enforces and why (mirrors this file's existing self-documentation style).

### `console.error` + fail-closed on a validation failure, never a silent fallback
**Source:** `apps/worker/src/room-do.ts:284-289` (`onAlarm`'s catch block: `console.error(...)`, never rethrow, always re-syncs to a safe state) and `:223-227` (`onError`: "Never rethrow — an exception escaping a handler tears down the room for every seat")
**Apply to:** the D-07 fail-closed schema-validation branch inside `#viewFor` — log via `console.error`, return a safe "failed" signal, never let the raw unvalidated view leak through as a fallback.

### `wrangler dev` child-process integration harness
**Source:** `apps/worker/src/room-do.test.ts:1-90` (`spawnWrangler`, `waitForReady`, `killAndWait`, `mkdtempSync`/`--persist-to`)
**Apply to:** D-11 layer 3's frame-capture tests — reuse the exact same spawned-process harness, do not build a second one.

### Theme-token + `data-testid` UI convention
**Source:** `apps/web/components/CounterGame.tsx:33-64`, cross-checked against `apps/web/app/room/[code]/RoomClient.tsx`'s other branches (`RefusalCard`, connecting state) which use the identical `var(--color-*)`/`var(--space-*)`/`var(--text-*)` token references
**Apply to:** `ForeheadCardGame.tsx` — every visual state needs a `data-testid` for the E2E specs to target, and every color/spacing/type value must reference an existing Phase 1 CSS variable, never a hardcoded value.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `packages/rules/src/shuffle.ts` | utility | transform | No seeded-PRNG or shuffle code exists anywhere in the repo yet (verified via grep). RESEARCH.md names the exact algorithm family (mulberry32/splitmix32-style) to hand-write — treat RESEARCH.md's guidance as the source of truth, not an in-repo file. |
| `apps/worker/src/source-structure.test.ts` | test (structural/static) | — | No source-grepping/structural test exists in the repo yet. RESEARCH.md's Code Examples section (lines 370-406) already contains a complete, ready-to-copy implementation — use it directly rather than searching further. |

Note: `apps/worker/src/leak-check.ts`/`.test.ts` also have no true in-repo behavioral analog, but are not listed above because RESEARCH.md supplies a complete implementation (not just guidance), making further analog search unnecessary — copy directly.

## Metadata

**Analog search scope:** `packages/rules/src`, `packages/schema/src`, `apps/worker/src`, `apps/web/app`, `apps/web/components`, `apps/web/lib`, `e2e/`
**Files scanned:** 14 read in full this session (`adapter.ts`, `counter-game.ts`, `counter-game.test.ts`, `index.ts` [rules], `room-state.ts`, `room-do.ts`, `room-do.test.ts` [partial, lines 1-90], `messages.ts`, `room.ts`, `constants.ts`, `seat-identity.ts`, `persistence.ts`, `CounterGame.tsx`, `RoomClient.tsx`) plus directory listings of all four source trees and both target e2e specs
**Pattern extraction date:** 2026-09-15
