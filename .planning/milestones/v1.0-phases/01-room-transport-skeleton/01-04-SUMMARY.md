---
phase: 01-room-transport-skeleton
plan: 04
subsystem: room-state
tags: [pure-functions, room-state-machine, hanabi, durable-objects, vitest]

# Dependency graph
requires:
  - phase: 01-room-transport-skeleton
    provides: "GameAdapter<TState, TAction> interface + counterGame D-15 placeholder (Plan 02); wire protocol, RoomState/RoomView/RefusalReason schemas (Plan 03)"
provides:
  - "apps/worker/src/room-state.ts: pure room state machine (createEmptyRoom, joinRoom, releaseSeat, markConnected, transferHost, setVariant, startGame, applyGameAction, toSeatView)"
  - "apps/worker/src/seat-naming.ts: deriveDisplayLabel — D-09 duplicate display-name disambiguation, isolated from seat identity"
  - "toSeatView as the sole outbound serializer — the HIDE-02 (Phase 2) chokepoint"
affects: [01-07-room-durable-object, 01-09-lobby-and-game-flow, 02-toy-game-redaction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Every room-state function that needs a timestamp takes `now: number` explicitly — no Date.now() reads anywhere in room-state.ts, so Plan 06/07's alarm and grace-period tests can drive time deterministically"
    - "Token minting is injected via mintSeatId/mintSeatToken callbacks so room-state.ts never imports nanoid and its tests are fully deterministic"
    - "The adapter is a single module-level constant (`const adapter = counterGame`), not threaded through every function signature — Phase 2's swap to the redaction toy is a one-line diff"
    - "Result discriminated unions on failure are exactly {ok:false, reason} — no room state fields ride along on a refusal (verified by exact-key assertions)"

key-files:
  created:
    - apps/worker/src/room-state.ts
    - apps/worker/src/room-state.test.ts
    - apps/worker/src/seat-naming.ts
    - apps/worker/src/seat-naming.test.ts
  modified:
    - packages/schema/src/room.ts

key-decisions:
  - "packages/schema/src/room.ts's hostSeatId widened from z.string() to z.string().nullable() on both RoomStateSchema and RoomViewSchema — the plan's createEmptyRoom contract requires representing the pre-first-seat state (hostSeatId: null) and the original schema had no way to express it (Rule 1 bug fix, not an architectural change)"
  - "AdapterError (not_your_turn/invalid_action/game_over) collapses onto RefusalReason's existing bad_request rather than widening the shared wire enum — Plan 09 can enrich in-game refusal messaging using the adapter's own view without touching this shared type"
  - "Seat array order IS join order and is used directly as the 'earliest joined' ordering for host reassignment (releaseSeat, transferHost) — no separate joinedAt sort needed since append order already encodes it"

patterns-established:
  - "Pure state-machine module with zero framework/runtime imports — grep-guarded (no ctx.storage/WebSocket/Date.now()/ready) as an acceptance criterion, not just a code-review convention"
  - "toSeatView is grep-provable as the only function returning RoomView — Phase 2's redaction hardening targets this exact chokepoint"

requirements-completed: [ROOM-03, ROOM-05, ROOM-06, ROOM-07, FDN-01]

# Metrics
duration: ~18min
completed: 2026-09-02
---

# Phase 1 Plan 4: Room & Transport Skeleton — Pure Room State Machine Summary

**Pure, storage-free room state machine (join/reclaim/release/host-transfer/variant-lock/start/game-action/toSeatView) covering ROOM-03/05/06/07 and FDN-01 with 25 named unit tests, zero ready-state, and a single grep-provable outbound serializer.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-09-02T08:24:00Z
- **Completed:** 2026-09-02T08:31:00Z
- **Tasks:** 3 (all auto)
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments
- `seat-naming.ts` isolates D-09's duplicate-display-name suffixing as a pure, seat-identity-free function, grep-guarded to prove it knows nothing about seat ids/tokens/status
- `room-state.ts` implements the full room lifecycle as pure functions over `RoomState` — no Durable Object, no storage, no WebSocket, no `Date.now()` — with the D-15 counter adapter wired in as the sole game-agnostic seam (FDN-01)
- `joinRoom`'s check ordering enforces the load-bearing D-06/D-14 semantics: token-match reclaim always wins (even mid-game), a stale token falls through to a fresh join, then status and capacity gates apply in that order
- `toSeatView` is the only function in the file whose return type is `RoomView`, proven both by grep and by a JSON-stringify token-leak scan across every minted seat token (HIDE-02 groundwork)
- 25 unit tests (6 in seat-naming, 19 in room-state) each named after the requirement/decision they cover, including a live-fire check that weakening `startGame`'s `MIN_PLAYERS` guard makes the suite fail

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement D-09 display-name disambiguation in isolation** — `54f7af5` (feat)
2. **Task 2: Implement the pure room state machine** — `a9d056a` (feat)
3. **Task 3: Unit-test the room state machine against ROOM-03/05/06/07** — `4d799ef` (test)

## Files Created/Modified
- `apps/worker/src/seat-naming.ts` — `deriveDisplayLabel(requestedName, existingLabels)`: case-insensitive collision detection, casing preserved in the returned label, bounded linear suffix probe
- `apps/worker/src/seat-naming.test.ts` — 6 tests: no collision, single/double collision, case-insensitive detection, whitespace trimming, a name already ending in `(2)`
- `apps/worker/src/room-state.ts` — `createEmptyRoom`, `joinRoom`, `releaseSeat`, `markConnected`, `transferHost`, `setVariant`, `startGame`, `applyGameAction`, `toSeatView`; module-level `const adapter = counterGame` as the D-15 swap site
- `apps/worker/src/room-state.test.ts` — 19 tests covering ROOM-03/05/06/07, D-06/D-07/D-12, D-15/FDN-01, and an HIDE-02 groundwork token-leak scan plus a purity suite (structuredClone before/after equality on every exported function)
- `packages/schema/src/room.ts` — `hostSeatId` widened to `z.string().nullable()` on `RoomStateSchema` and `RoomViewSchema` (see Deviations)

## Exact Exported Signatures (for Plan 07 wiring, Plan 09 UI)

```ts
function createEmptyRoom(code: RoomCode, variant: Variant, now: number): RoomState;

type JoinInput = { displayName: string; seatToken?: SeatToken; now: number;
  mintSeatId: () => string; mintSeatToken: () => SeatToken };
type JoinResult =
  | { ok: true; state: RoomState; seatId: string; seatToken: SeatToken; wasReclaim: boolean }
  | { ok: false; reason: RefusalReason };
function joinRoom(state: RoomState, input: JoinInput): JoinResult;

function releaseSeat(state: RoomState, seatId: string, now: number): RoomState;
function markConnected(state: RoomState, seatId: string, connected: boolean, now: number): RoomState;
function transferHost(state: RoomState, now: number): RoomState;

type RoomResult = { ok: true; state: RoomState } | { ok: false; reason: RefusalReason };
function setVariant(state: RoomState, actorSeatId: string, variant: Variant): RoomResult;
function startGame(state: RoomState, actorSeatId: string, now: number, seed: string): RoomResult;
function applyGameAction(state: RoomState, actorSeatId: string, request: unknown, now: number): RoomResult;

function toSeatView(state: RoomState, seatId: string): RoomView; // the ONLY serializer
```

## Decisions Made
- **`hostSeatId` widened to nullable in `packages/schema/src/room.ts`.** The plan's `createEmptyRoom` contract requires `hostSeatId: null` for the instant before the first seat joins; the Plan 03 schema had `z.string()` (non-nullable) on both `RoomStateSchema` and `RoomViewSchema`. No existing test asserted non-nullability; schema and messages test suites (25 tests) still pass unchanged. See Deviations below.
- **AdapterError collapses onto `bad_request`.** `RefusalReason` (from Plan 03) has no slots for `not_your_turn`/`invalid_action`/`game_over` — rather than widen a wire-protocol enum shared across the whole app for a placeholder game that Phase 2 deletes, `applyGameAction` maps every adapter error to the existing `bad_request` reason. Plan 09 can enrich in-game messaging from the adapter's own `toPlayerView` output without touching this enum.
- **Array order doubles as join order.** `releaseSeat`'s host-reassignment and `transferHost`'s "earliest-joined connected seat" both just take the first matching entry in `state.seats` (append order), avoiding a redundant `joinedAt` sort.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `packages/schema/src/room.ts`'s `hostSeatId` could not represent the pre-first-seat empty-room state**
- **Found during:** Task 2 (implementing `createEmptyRoom`)
- **Issue:** The plan's Task 2 explicitly specifies `createEmptyRoom(...)` sets `hostSeatId: null`, but Plan 03's `RoomStateSchema`/`RoomViewSchema` declared `hostSeatId: z.string()` (non-nullable) — a type error under `tsc --noEmit`, and a state genuinely un-representable by the schema as written.
- **Fix:** Widened `hostSeatId` to `z.string().nullable()` on both schemas, with a doc comment explaining the narrow window this represents (the in-process gap between `createEmptyRoom` and the first `joinRoom` call, which in practice never survives to a client since the creator joins in the same request per D-03).
- **Files modified:** `packages/schema/src/room.ts`
- **Verification:** `npx vitest run --project schema` (25/25 passing, unchanged), `npx tsc --noEmit -p packages/schema/tsconfig.json` clean, `npx tsc --noEmit -p apps/worker/tsconfig.json` clean.
- **Committed in:** `a9d056a` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (bug fix to a dependency's schema, required to satisfy this plan's own explicit contract).
**Impact on plan:** Minimal, necessary, and backward-compatible — no test in Plan 03's suite asserted non-nullability, and the change only widens what the type accepts.

## Issues Encountered

None beyond the schema nullability gap above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 07 (the real Durable Object) can wire these nine exported functions directly behind `partyserver`'s WebSocket lifecycle hooks — the only new work there is storage persistence, timers, and message parsing; the rules themselves are already tested here.
- Plan 09 (lobby/game-flow UI) can render `RoomView` and drive `set_variant`/`start_game`/`game_action`/`leave` messages against these exact result shapes.
- `toSeatView` is the single, grep-provable chokepoint Phase 2's HIDE-02 redaction work hardens next — no second serializer exists anywhere in the worker to find and fix later.
- `npx vitest run --project worker` now covers 3 test files, 26 tests, all green; `npx vitest run` (whole repo) is 10 files / 69 tests, all green.

---
*Phase: 01-room-transport-skeleton*
*Completed: 2026-09-02*

## Self-Check: PASSED
All 6 created/modified files verified present on disk. All 3 task commit hashes (54f7af5, a9d056a, 4d799ef) verified in git log.
