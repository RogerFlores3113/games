# Phase 8: Multi-Game Rooms - Pattern Map

**Mapped:** 2026-09-22
**Files analyzed:** 21 (new + modified, excluding fixture-rename-only test files)
**Analogs found:** 21 / 21 — this phase is 100% modification-of-existing-file work; there are no genuinely new files except the toy-game fixture and the root `tsconfig.json`, both of which have exact structural precedents already read in full above.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/worker/src/game-registration.ts` | config/registry | request-response (lookup) | itself (rewritten in place — current single-entry shape is the analog for the registry-entry shape) | exact (self) |
| `apps/worker/src/room-state.ts` (`joinRoom`, `startGame`, `setVariant`→`setConfig`, `toSeatView`, `mapAdapterError`, `applyGameAction`) | service (pure state machine) | CRUD + event-driven | itself (rewritten in place) | exact (self) |
| `apps/worker/src/seat-projection.ts` (`validateGameView`) | middleware (fail-closed gate) | transform | itself (rewritten in place) | exact (self) |
| `apps/worker/src/room-do.ts` (`onStart` default room, `set_variant`→`set_config` dispatch) | controller (DO message router) | event-driven | itself (rewritten in place) | exact (self) |
| `apps/worker/src/persistence.ts` / `persistence.test.ts` | model (versioned storage) | file-I/O (DO storage) | `persistence.test.ts`'s existing Phase 7 schema-bump describe block (lines 169–194 per RESEARCH.md) | exact |
| `packages/schema/src/room.ts` (`RoomStateSchema`/`RoomViewSchema` gain `gameId`, `config` replaces `variant`) | model/schema | transform (validation) | itself (rewritten in place) | exact (self) |
| `packages/schema/src/messages.ts` (`SetVariantMessageSchema`→`SetConfigMessageSchema`, `ErrorDetailSchema` restructure) | schema (wire contract) | request-response | itself (rewritten in place); `ClientMessageSchema`/`ServerMessageSchema` discriminated-union convention is the pattern for the new per-game error union | exact (self) |
| `packages/schema/src/constants.ts` (`ROOM_SCHEMA_VERSION` 4→5, `MIN_PLAYERS`/`MAX_PLAYERS` fate) | config | — | itself — three prior version-bump doc comments are the exact precedent for the new bump's comment | exact (self) |
| `packages/rules/src/adapter.ts` (`GameAdapter<TState, TAction, TConfig, TEndResult, TError>`) | interface/contract | — | itself (rewritten in place) | exact (self) |
| `apps/worker/src/test-fixtures/toy-game.ts` (new, D-10) | test fixture / adapter | CRUD (toy) | `apps/worker/src/game-registration.ts` (registry-entry shape) + `packages/rules/src/adapter.ts` (`GameAdapter` interface) | role-match (no prior toy-game file exists in-tree; deleted precedent `forehead-card.ts` referenced only in comments) |
| `apps/worker/src/source-structure.test.ts` (new A9-sibling assertion) | test | — | its own existing A9 assertion (`hanabiGame`/`@games/schema/games/` confinement) | exact |
| `apps/web/lib/pending-variant.ts` → generalized/sibling `pending-game.ts` | utility (localStorage bridge) | file-I/O (localStorage) | itself (`pending-variant.ts`, full file read above) | exact (self) |
| `apps/web/app/page.tsx` (game picker, per-game fieldset lookup, Create-room button ungated, D-17 progressive enhancement) | component (landing form) | request-response | itself (rewritten in place) | exact (self) |
| `apps/web/app/api/room/route.ts` → Server Action (D-17) | route/server-action | request-response | itself (`route.ts`, full file read above) — becomes the model for a Server Action's validate-then-mint body | exact (self) |
| `apps/web/app/room/[code]/RoomClient.tsx` (board component map keyed by `gameId`) | component (client router) | event-driven (WS) | itself (rewritten in place); `Lobby`/`HanabiBoard` conditional branch at line 236–263 is the existing "status-keyed switch" pattern to extend into a `gameId`-keyed map | exact (self) |
| `apps/web/components/Lobby.tsx` (drops `MIN_PLAYERS`/`MAX_PLAYERS` import, uses `view.limits`) | component | request-response | itself (rewritten in place) | exact (self) |
| `apps/web/lib/lobby-seats.ts` | utility | transform | itself — **no change needed**, already takes `maxPlayers` as a parameter | exact (self, unchanged) |
| `/tsconfig.json` (new, root) | config | build | `packages/schema/tsconfig.json` / `packages/rules/tsconfig.json` (extension pattern) + the verified structure in RESEARCH.md §"Root tsconfig.json" | exact (research-verified, not codebase-derived) |
| `packages/schema/tsconfig.json`, `packages/rules/tsconfig.json` (add `composite`/`noEmit: false`) | config | build | themselves (full files read above) | exact (self) |
| `apps/worker/tsconfig.json`, `apps/web/tsconfig.json` (add `references`) | config | build | themselves (full files read above) | exact (self) |
| `docs/deployment.md` (D-14 checklist item) | docs | — | not read (out of code-pattern scope; planner should append one bullet, no pattern extraction needed) | n/a |

## Pattern Assignments

### `apps/worker/src/game-registration.ts` (registry, D-08/D-09)

**Analog:** itself, current single-entry shape (`apps/worker/src/game-registration.ts`, full file, lines 1–47)

**Current shape to generalize** (lines 13–22):
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
```

**What must be preserved verbatim:** the file-header comment's invariant ("This is the ONLY non-test worker file permitted to name a specific game") and the compile-time `_AssertViewAssignable`/`_AssertKeysMutuallyAssignable` contract checks at the bottom of the file (lines 36–47) — replicate this per-registry-entry, not just for Hanabi, if the toy game's view type also needs the same drift guard.

**Target shape** (per D-08, a `Record<GameId, GameRegistryEntry>` plus a `resolveGame(gameId)` reader): each entry needs `adapter`, `viewSchema`, `configSchema`, `defaultConfig`, `{min, max}`, an error mapper (see `mapAdapterError` pattern below), and `displayName` — construct this as a sibling object literal to the current `activeGame` const, keyed by `HANABI_GAME_ID`.

**Test-only injection point (D-10):** follow RESEARCH.md's recommended shape exactly — a `registerTestGame(entry)` function defined in this same file (keeps the "one file names a game" invariant on the *registration call site*, even though the toy entry's construction lives in a test fixture), pushing into a module-level mutable `Map` seeded from the frozen production `GAME_REGISTRY`. Guard it with the same environment-detection mechanism `apps/worker/src/origin.ts` already uses (read that file directly before implementing — flagged as Assumption A3 in RESEARCH.md, not independently verified in this pass).

---

### `apps/worker/src/room-state.ts` (pure state machine — `joinRoom`, `startGame`, `setVariant`→`setConfig`, `toSeatView`, `mapAdapterError`, `applyGameAction`)

**Analog:** itself (full file read, 505 lines)

**Module-level adapter access pattern to generalize** (lines 13–36):
```typescript
import { activeGame } from "./game-registration";
import type { ActiveGameState } from "./game-registration";
import { MAX_PLAYERS, MIN_PLAYERS } from "@games/schema";
// ...
const adapter = activeGame.adapter;
```
Becomes per-call `resolveGame(state.gameId).adapter` (D-08) — this is a bigger diff than it looks: every function below that references the module-level `adapter` constant (`startGame` line 370, `applyGameAction` line 456, `toSeatView` line 503) must switch to threading `state.gameId` through `resolveGame`.

**Seat-limit gate pattern to generalize** (`joinRoom`, lines 132–138):
```typescript
if (state.status !== "lobby") {
  return { ok: false, reason: "in_progress" };
}
if (state.seats.length >= MAX_PLAYERS) {
  return { ok: false, reason: "full" };
}
```
and (`startGame`, lines 362–368):
```typescript
if (
  state.status !== "lobby" ||
  state.seats.length < MIN_PLAYERS ||
  state.seats.length > MAX_PLAYERS
) {
  return { ok: false, reason: "bad_request" };
}
```
Both become `resolveGame(state.gameId).min`/`.max` reads instead of the global import — same `if`-shape, same refusal reasons, only the source of the numbers changes.

**First-join-locks-the-game pattern (D-01) — model this exactly on the existing host-write-once pattern** (line 161):
```typescript
hostSeatId: state.hostSeatId ?? seatId,
```
`gameId` should follow the identical `??`-first-write-wins idiom: `gameId: state.gameId ?? input.gameId ?? DEFAULT_GAME_ID` inside the new-join branch only (never the reclaim branch, lines 112–130, which must not read `input.gameId` at all).

**Host-only config-change gate pattern (D-04), directly copy `setVariant`** (lines 239–252):
```typescript
export function setVariant(
  state: RoomState,
  actorSeatId: string,
  variant: Variant,
  now: number,
): RoomResult {
  if (actorSeatId !== state.hostSeatId) {
    return { ok: false, reason: "not_host" };
  }
  if (state.status !== "lobby") {
    return { ok: false, reason: "bad_request" };
  }
  return { ok: true, state: { ...state, variant, lastActivityAt: now } };
}
```
`setConfig` is this function with `config: unknown` in place of `variant: Variant`, plus a `resolveGame(state.gameId).configSchema.safeParse(config)` fail-closed check inserted between the two existing guards (per the Threat Model Input table in RESEARCH.md).

**Exhaustive-switch error-mapping pattern (D-07) — copy `mapAdapterError` verbatim as the per-game template** (lines 396–421):
```typescript
function mapAdapterError(error: AdapterError): ErrorDetail {
  switch (error) {
    case "not_your_turn":
      return "not_your_turn";
    // ...
    default: {
      const exhaustiveCheck: never = error;
      throw new Error(`Unrecognized AdapterError: ${String(exhaustiveCheck)}`);
    }
  }
}
```
Each registry entry's error mapper must replicate this exact `switch` + `never`-typed-default shape — RESEARCH.md's Pitfall 3 explicitly warns against a `code: z.string()` shortcut that would reopen the D-08 free-text leak this pattern closes.

**Sole-serializer pattern to generalize (`toSeatView`, lines 488–505):**
```typescript
return {
  code: state.code,
  variant: state.variant,
  status: state.status,
  hostSeatId: state.hostSeatId,
  youSeatId: seatId,
  seats,
  game: state.game === null ? null : adapter.toPlayerView(state.game as ActiveGameState, seatId),
};
```
`variant: state.variant` becomes `gameId: state.gameId, config: state.config`; also add the D-05 `limits: resolveGame(state.gameId).limits` and display-name fields here, in the same object-literal-return style (no new function, no second serializer — FDN-01's "one serializer" invariant stays intact).

---

### `apps/worker/src/seat-projection.ts` (`validateGameView`, fail-closed dispatch)

**Analog:** itself (full file, 69 lines)

**Fail-closed pattern to generalize** (lines 46–61):
```typescript
export function validateGameView(view: RoomView): ProjectedRoomView | null {
  if (view.game === null) {
    return view as ProjectedRoomView;
  }
  const result = activeGame.viewSchema.safeParse(view.game);
  if (result.success) {
    return view as ProjectedRoomView;
  }
  console.error("HIDE-03: projected game view failed strict schema validation", {
    seatId: view.youSeatId,
    issues: result.error.issues.map((issue) => ({ code: issue.code, path: issue.path })),
  });
  return null;
}
```
One-line change per RESEARCH.md: `activeGame.viewSchema` → `resolveGame(view.gameId).viewSchema`. Keep everything else — the `null`-game short-circuit, the redacted `console.error` (seatId + code/path only, never the raw view), and the branded return type — byte-identical.

---

### `apps/worker/src/persistence.ts` / `persistence.test.ts` (D-13 schema-version reset)

**Analog:** `persistence.ts`'s existing `loadRoom` (lines 60–86) — **zero code changes required**, confirmed by direct read; only `constants.ts`'s `ROOM_SCHEMA_VERSION` value changes. Copy the version-mismatch branch as documentation of *why* no code change is needed:
```typescript
if (storedVersion !== ROOM_SCHEMA_VERSION) {
  // Mismatched (old deploy's shape) — do NOT read or parse the room blob
  // at all. Reset unconditionally.
  return resetRoom(storage, fallback);
}
```

**New test to add** — RESEARCH.md's D-13 Test Pattern section gives the exact template (reproduced there in full); the load-bearing assertion is:
```typescript
expect(result.wasReset).toBe(true);
expect(getCalls).not.toContain(STORAGE_KEYS.room);
```
Do not weaken this to `wasReset === true` alone — that would also pass via the corrupt-blob fallback path and mask a forgotten version bump (Pitfall 1 in RESEARCH.md).

---

### `packages/schema/src/room.ts` (`RoomStateSchema`/`RoomViewSchema`)

**Analog:** itself (full file, 166 lines)

**Current `variant` field placement to replace** (lines 110–132, `RoomStateSchema`):
```typescript
export const RoomStateSchema = z.object({
  code: RoomCodeSchema,
  variant: VariantSchema,
  status: RoomStatusSchema,
  hostSeatId: z.string().nullable(),
  seats: z.array(SeatSchema),
  adapterId: z.string(),
  game: z.unknown(),
  seed: z.string().optional(),
  createdAt: z.number(),
  lastActivityAt: z.number(),
});
```
and `RoomViewSchema` (lines 156–166) — same shape, client-facing. Per D-04: `variant: VariantSchema` is replaced by `gameId: GameIdSchema` + `config: z.unknown()` (opaque, validated per-game by the registry's `configSchema` at the room-state.ts boundary, never by this package — mirrors the existing `game: z.unknown()` "opaque to this package" comment convention already used at line 122 for exactly this reason). `RoomViewSchema` additionally gains `limits: z.object({ min: z.number(), max: z.number() })` per D-05 — follow the existing "declared independently, never `.omit()`" discipline documented at lines 134–142 so nothing server-only leaks by accident.

**`GameIdSchema` (new export, D-09):** follow the exact `z.enum([...])` + `z.infer` pattern already used for `VariantSchema` (line 15) and `RoomStatusSchema` (line 18) — a closed enum, `["hanabi"]` only in production.

---

### `packages/schema/src/messages.ts` (`SetVariantMessageSchema`→`SetConfigMessageSchema`, `ErrorDetailSchema` restructure)

**Analog:** itself (full file, 209 lines)

**Message-schema pattern to copy verbatim for `set_config`** (lines 34–37):
```typescript
const SetVariantMessageSchema = z.strictObject({
  type: z.literal("set_variant"),
  variant: VariantSchema,
});
```
→ `SetConfigMessageSchema` with `config: z.unknown()` (validated downstream by the registry, same "deliberately unknown here" comment convention already used for `GameActionMessageSchema.request` at lines 59–62).

**`join`'s optional-field pattern to copy for the new optional `gameId`** (lines 19–32): `JoinMessageSchema` already has an `.optional()` field (`seatToken`) with a doc comment explaining exactly when presence/absence matters — model the new `gameId: GameIdSchema.optional()` field's doc comment on that same style, explaining D-01's "only the very first join's value is honored" semantics.

**Discriminated-union error restructuring (D-07) — copy the existing `ClientMessageSchema`/`ServerMessageSchema` pattern** (lines 90–98, 167–175):
```typescript
export const ClientMessageSchema = z.discriminatedUnion("type", [
  JoinMessageSchema,
  SetVariantMessageSchema,
  // ...
]);
```
Use `z.discriminatedUnion("gameId", [...])` for the new `ErrorDetailSchema`, each member a `z.object({ gameId: z.literal("hanabi"), code: HanabiErrorCodeSchema })`-shaped entry — this is the SAME discriminated-union idiom already used twice in this file, not a new pattern. The current flat enum to replace (lines 147–158):
```typescript
export const ErrorDetailSchema = z.enum([
  "view_unavailable",
  "not_your_turn",
  // ...9 members total
]);
```

---

### `packages/schema/src/constants.ts` (`ROOM_SCHEMA_VERSION`, `MIN_PLAYERS`/`MAX_PLAYERS`)

**Analog:** itself — the doc-comment convention for every prior version bump (lines 10–29) is the exact template for the new bump:
```typescript
/** D-17: persisted room state carries this version. On mismatch, reset to an
 * empty lobby rather than deserializing state written by an incompatible
 * deploy...
 *
 * Bumped to 2 in Phase 2 when...
 * Bumped to 3 in Phase 4 when...
 * Bumped to 4 in Phase 7 plan 10 when... */
export const ROOM_SCHEMA_VERSION = 4;
```
Append a "Bumped to 5 in Phase 8 when the top-level `variant` field was replaced by `gameId`+`config` (D-04)..." paragraph in the same style before changing the value.

`MIN_PLAYERS`/`MAX_PLAYERS` (lines 44–46): CONTEXT.md leaves their fate to discretion — RESEARCH.md confirms `apps/web/lib/lobby-seats.ts`'s `lobbySlots` already takes `maxPlayers` as a parameter, so deleting these exports (moving the numbers into the Hanabi registry entry's `min`/`max`) is lower-risk than keeping them as unused dead exports.

---

### `packages/rules/src/adapter.ts` (`GameAdapter` generics, D-06)

**Analog:** itself (full file, 82 lines)

**Current 2-type-param interface to generalize** (lines 49–81):
```typescript
export interface GameAdapter<TState, TAction> {
  readonly id: string;
  createInitialState(input: {
    seatIds: readonly string[];
    variant: Variant;
    seed: string;
  }): TState;
  applyAction(
    state: TState,
    actorSeatId: string,
    request: unknown,
  ): AdapterResult<TState>;
  toPlayerView(state: TState, seatId: string): unknown;
  checkGameEnd(state: TState): GameEndResult | null;
}
```
Per D-06, add `TConfig`, `TEndResult`, `TError` type parameters — `variant: Variant` in `createInitialState`'s input becomes `config: TConfig`; `GameEndResult` becomes the generic `TEndResult`; `AdapterError`/`AdapterResult<TState>` becomes parameterized by `TError`. **Preserve the file-header three-invariant comment (lines 5–11) verbatim** — it documents the seam's non-negotiable contract, unrelated to the generics widening. Also preserve the "exactly five members, no others" comment (lines 45–48) — the generics change adds type parameters, not new interface members.

**Confirmed single call site (D-06):** `checkGameEnd(...) !== null` at `room-state.ts:461` (inside `applyGameAction`) — the room layer's generic-erasure boundary; do not add a second call site anywhere else.

---

### `apps/worker/src/test-fixtures/toy-game.ts` (new, D-10)

**No direct in-tree analog** (the historical `forehead-card.ts` precedent was deleted; do not resurrect its filename per `source-structure.test.ts`'s D-01/D-03 checks). Build the toy `GameAdapter` implementation by directly implementing the interface from `packages/rules/src/adapter.ts` (see excerpt above) with trivial bodies, and register it via the `registerTestGame` injection point described in the `game-registration.ts` section above. Distinguish it with different seat limits (e.g. 3–4 per D-10), its own config/view schemas, and its own error codes — none of which need real game logic.

**Recommended location (RESEARCH.md, MEDIUM confidence):** co-located with `apps/worker/src/room-state.test.ts`, or a small sibling fixture file in `apps/worker/src/`, since D-10's five required behaviors are all worker-layer (registry dispatch) concerns, not rules-engine ones.

---

### `apps/web/lib/pending-variant.ts` → `pending-game.ts` (D-02)

**Analog:** itself (full file, 76 lines) — this is the exact pattern to mirror for carrying the landing page's chosen game.

**localStorage read/write/clear pattern to copy verbatim** (lines 19–65):
```typescript
function getLocalStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readPendingVariant(code: string): Variant | undefined {
  const storage = getLocalStorage();
  if (!storage) {
    return undefined;
  }
  try {
    const parsed = VariantSchema.safeParse(storage.getItem(pendingVariantKey(code)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function writePendingVariant(code: string, variant: Variant): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(pendingVariantKey(code), variant);
  } catch {
    // Degrade to the default variant — the host can still pick in the lobby.
  }
}
```

**Apply-once-if-host-and-lobby gate to copy verbatim** (lines 67–76):
```typescript
export function variantToApply(view: RoomView, pending: Variant | undefined): Variant | null {
  if (pending === undefined) return null;
  if (view.status !== "lobby") return null;
  if (view.youSeatId !== view.hostSeatId) return null;
  if (view.variant === pending) return null;
  return pending;
}
```
A new `gameToApply`-equivalent is NOT needed per D-01 — `gameId` is set once at first join server-side, unlike `variant`/`config`, which the host can still change in the lobby. Only the KEY-NAMING pattern (`pendingVariantKey` → sibling `pendingGameKey`, both built from `seatTokenKey`) and the try/catch-everywhere discipline need to be replicated for the new `pending-game.ts` (or generalized in place, per Claude's Discretion on file naming).

---

### `apps/web/app/page.tsx` (landing form: game picker, per-game fieldset, D-17 button)

**Analog:** itself (full file, 213 lines)

**Hydration-gate pattern being replaced (D-17)** (lines 20–27, 204):
```typescript
const noopSubscribe = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
// ...
<Button type="submit" variant="primary" disabled={submitting || !hydrated}>
```
Per D-17/UI-SPEC: this gate must be REMOVED (not kept) — the button must be enabled and clickable pre-hydration. Follow RESEARCH.md's Server Action recommendation (`<form action={createRoomAction}>`), which per the installed Next.js 16 docs progressively enhances into a working native form submit with zero hydration dependency.

**`isHanabi`-gated button to un-gate (MGR-08 root cause #2, UI-SPEC Component Note 3)** (lines 172–208): the button and its pending state must render UNCONDITIONALLY, outside the `{isHanabi && (...)}` block; only the settings fieldset content stays inside a per-game lookup, per UI-SPEC Component Note 2 — replace the `isHanabi` boolean with a small lookup keyed by `game` (e.g. `GAME_SETTINGS_FIELDSETS[game]`), mirroring `RoomClient.tsx`'s planned `gameId`-keyed board-component map (D-11) rather than another boolean branch.

**Game-picker `<select>` pattern — copy the disabled-option markup exactly (D-12, UI-SPEC)** (lines 125–133):
```typescript
<option value="" disabled>
  Choose a game…
</option>
<option value="hanabi">Hanabi</option>
<option value="innovation" disabled>
  Innovation - WIP
</option>
```
Swap the `innovation` option for `<option value="expedition" disabled>Expedition - coming soon</option>` — UI-SPEC mandates byte-identical treatment (plain disabled `<option>`, spaced hyphen, no badge/icon).

**Error-copy pattern — unchanged, copy verbatim** (lines 61–79): both error strings (`"Couldn't create a room — check your name and try again."` / `"...check your connection..."`) stay exactly as shown; a per-game config-validation failure reuses the first string unchanged (UI-SPEC Copywriting Contract).

---

### `apps/web/app/api/room/route.ts` → Server Action (D-17)

**Analog:** itself (full file, 33 lines)

**Validate-then-mint body to preserve, restructured as a Server Action:**
```typescript
const CreateRoomBodySchema = z.object({
  displayName: DisplayNameSchema,
  variant: VariantSchema,
});

export async function POST(request: Request) {
  // ... JSON.parse guard, safeParse guard ...
  const code = mintRoomCode();
  return NextResponse.json({ code, path: `/room/${code}` }, { status: 200 });
}
```
Becomes a Server Action (`"use server"`, exported function taking `FormData`) per RESEARCH.md's verified Next.js 16 mechanism: same `DisplayNameSchema`/`GameIdSchema`+per-game-`configSchema` validation, same `mintRoomCode()` call, but `redirect(path)` (Next.js's `redirect()`, per `forms.md`) instead of `NextResponse.json`. Whether the existing `route.ts` file is kept as a fallback JSON endpoint or fully replaced is a planner decision — RESEARCH.md recommends the Server Action be the sole mechanism (form `action={...}` progressively enhances on its own, no separate client `fetch` handler needed).

**Carrying values without leaking into the shareable link (D-17):** RESEARCH.md recommends the query-param + `history.replaceState` approach (lower implementation risk for this codebase's current all-client `RoomClient.tsx` architecture) over a cookie — see RESEARCH.md §"MGR-08 Root Cause and Fix" for the full tradeoff; this is explicitly left to planner discretion by D-17's own text.

---

### `apps/web/app/room/[code]/RoomClient.tsx` (board component map, D-11)

**Analog:** itself (full file, 264 lines)

**Existing status-keyed conditional to use as the map-lookup precedent** (lines 236–263):
```typescript
if (view.status === "lobby") {
  return (
    <Lobby
      view={view}
      onSetVariant={(variant: Variant) => send({ type: "set_variant", variant })}
      onStartGame={() => send({ type: "start_game" })}
      reconnecting={status === "reconnecting"}
    />
  );
}

return (
  <HanabiBoard
    view={view}
    onAction={(request) => send({ type: "game_action", actionId: nanoid(), request })}
    reconnecting={status === "reconnecting"}
    onDeleteRoom={() => send({ type: "delete_room", actionId: nanoid() })}
    onRestartLobby={() => send({ type: "restart_lobby", actionId: nanoid() })}
  />
);
```
Per D-11: replace the bare `return <HanabiBoard ... />` fallback with a small `gameId`-keyed component map (`{ hanabi: HanabiBoard }`), so a future game's board is added by inserting one map entry, never an `if`/`else` branch. `onSetVariant`→`onSetConfig`'s message type also changes from `set_variant` to `set_config` here, mirroring the `messages.ts` rename.

**Pending-config apply-once effect to generalize** (lines 136–149):
```typescript
useEffect(() => {
  if (!view) return;
  if (status === "reconnecting") return;
  const target = variantToApply(view, readPendingVariant(code));
  clearPendingVariant(code);
  if (target !== null) {
    socket.send(JSON.stringify({ type: "set_variant", variant: target } satisfies ClientMessage));
  }
}, [view, code, socket, status]);
```
Same effect shape, `readPendingVariant`/`variantToApply`/`clearPendingVariant` renamed to their config-generic equivalents; `type: "set_variant"` → `type: "set_config"`.

---

### `apps/web/components/Lobby.tsx` (D-05: `view.limits` instead of global constants)

**Analog:** itself (full file, 274 lines)

**Import to remove** (line 3):
```typescript
import { MAX_PLAYERS, MIN_PLAYERS, type RoomView, type Variant } from "@games/schema";
```

**Every read site to redirect to `view.limits`:**
- `canStart` (line 51): `seatCount >= MIN_PLAYERS && seatCount <= MAX_PLAYERS` → `seatCount >= view.limits.min && seatCount <= view.limits.max`
- `lobbySlots(view.seats, MAX_PLAYERS)` (line 54) → `lobbySlots(view.seats, view.limits.max)` — `lobbySlots` itself needs no change (already parameterized, confirmed above)
- Seat-count display `{seatCount} / {MAX_PLAYERS}` (line 114) → `{seatCount} / {view.limits.max}`
- Waiting-for-players copy (line 151, UI-SPEC-mandated new copy): `Hanabi needs {MIN_PLAYERS} to {MAX_PLAYERS} players — share the code above.` → `{view.gameDisplayName} needs {view.limits.min} to {view.limits.max} players — share the code above.` (exact string per UI-SPEC's Copywriting Contract table)
- Can't-start copy (line 249): `Need {MIN_PLAYERS}–{MAX_PLAYERS} players` → `Need {view.limits.min}–{view.limits.max} players`
- Non-host waiting copy (line 264): `${MIN_PLAYERS} are seated` → `${view.limits.min} are seated`

**Variant picker (segmented control, lines 161–232) stays Hanabi-specific and UNCHANGED** — UI-SPEC Component Note 4 is explicit that Phase 8 does not generalize this control to other games' settings shapes; only the seat-limit/display-name sourcing changes.

---

## Shared Patterns

### Fail-closed Zod validation at every wire/config boundary
**Source:** `packages/schema/src/messages.ts`'s `parseClientMessage` (lines 188–201) and `apps/worker/src/seat-projection.ts`'s `validateGameView` (lines 46–61)
**Apply to:** every new/changed validation point this phase touches — `set_config`'s `configSchema.safeParse`, the per-game view-schema dispatch, `POST /api/room`'s `gameId`+config validation
```typescript
const result = SomeSchema.safeParse(input);
if (!result.success) {
  return { ok: false, reason: "bad_request" }; // never coerce, never fall through to a default
}
```

### Host-only mutation gate
**Source:** `apps/worker/src/room-state.ts`'s `setVariant` (lines 245–247), reused identically by `deleteRoom` (lines 285–287) and `restartLobby` (lines 321–323)
**Apply to:** `setConfig` (D-04)
```typescript
if (actorSeatId !== state.hostSeatId) {
  return { ok: false, reason: "not_host" };
}
```

### First-write-wins field (never overwritten by a later message)
**Source:** `apps/worker/src/room-state.ts`'s `hostSeatId: state.hostSeatId ?? seatId` (line 161)
**Apply to:** `gameId: state.gameId ?? input.gameId ?? DEFAULT_GAME_ID` (D-01) — same nullish-coalescing idiom, same "only in the new-join branch, never the reclaim branch" placement

### Exhaustive switch + `never`-typed default for closed error vocabularies
**Source:** `apps/worker/src/room-state.ts`'s `mapAdapterError` (lines 396–421)
**Apply to:** every per-game error mapper the registry now needs (D-07)

### Single-call-site chokepoints enforced by `source-structure.test.ts`
**Source:** `apps/worker/src/source-structure.test.ts`'s A9 assertion (confirmed by RESEARCH.md, not independently re-read here — read directly at implementation time)
**Apply to:** `game-registration.ts` must stay the only non-test file naming a specific game; add a sibling assertion confining `registerTestGame(` to the same file (D-10)

### SSR-safe localStorage helper with try/catch degradation
**Source:** `apps/web/lib/pending-variant.ts`'s `getLocalStorage()` (lines 19–28) and every read/write function's try/catch wrapping
**Apply to:** the new `pending-game.ts` (or generalized `pending-variant.ts`) module (D-02)

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `docs/deployment.md` D-14 checklist bullet | docs | — | Not a code pattern; append one bullet in the existing checklist's style (not read in this pass — low risk, single-line addition) |
| `apps/worker/src/seat-naming.ts` `MAX_PLAYERS` usage | utility | — | RESEARCH.md's Assumption A2 flags this file as not independently read; planner must open it directly before deciding whether it needs `resolveGame(...)` treatment or is purely cosmetic |

## Metadata

**Analog search scope:** `apps/worker/src/`, `apps/web/{app,components,lib}/`, `packages/schema/src/`, `packages/rules/src/`, root config files (`tsconfig.base.json`, package tsconfigs, `package.json`)
**Files scanned (full read):** `game-registration.ts`, `adapter.ts`, `seat-projection.ts`, `room-state.ts`, `room.ts`, `messages.ts`, `constants.ts`, `page.tsx`, `pending-variant.ts`, `route.ts`, `RoomClient.tsx`, `Lobby.tsx`, `persistence.ts`, `lobby-seats.ts`, all four package `tsconfig.json` files, `tsconfig.base.json`, root `package.json`; targeted reads of `room-do.ts` (`onStart`, message-dispatch header)
**Pattern extraction date:** 2026-09-22
