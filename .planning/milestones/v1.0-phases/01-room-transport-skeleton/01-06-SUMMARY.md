---
phase: 01-room-transport-skeleton
plan: 06
subsystem: infra
tags: [durable-objects, alarm-api, hibernation, persistence, scheduler, zod]

# Dependency graph
requires:
  - phase: 01-room-transport-skeleton
    provides: "packages/schema/src/constants.ts (IDLE_GC_LOBBY_MS/IDLE_GC_IN_PROGRESS_MS/HOST_TRANSFER_GRACE_MS/LOBBY_SEAT_RELEASE_GRACE_MS/ROOM_SCHEMA_VERSION), packages/schema/src/room.ts (RoomState/Seat/RoomStateSchema with persisted disconnectedAt), apps/worker/src/room-state.ts pure state machine"
provides:
  - "apps/worker/src/scheduler.ts: pure single-slot unified timer scheduler (upsertTimer, cancelTimer, nextDueAt, dueTimers, computeRoomTimers) over a plain {type,dueAt,seatId?} table, recomputed from RoomState on every call"
  - "apps/worker/src/persistence.ts: versioned load/save of RoomState (loadRoom, saveRoom, loadTimers, STORAGE_KEYS) against an injected RoomStorage interface, with D-17 reset-on-mismatch that never parses an old-shaped blob"
affects: [01-07-room-durable-object]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "computeRoomTimers derives the WHOLE timer table from persisted RoomState on every call rather than incrementally mutating a stored table — a recomputed table cannot drift across hibernation wakes or clobber another timer's deadline (RESEARCH.md Pitfall 1)"
    - "scheduler.ts is grep-guarded to contain no setAlarm/ctx.storage/Date.now() — it decides, it never schedules; Plan 07 is the sole caller that wires nextDueAt's result to the real Alarm API"
    - "persistence.ts takes an injected RoomStorage interface (get/put/delete/deleteAll) rather than importing anything Cloudflare-specific, so tests use a Map-backed fake and Plan 07 passes ctx.storage unchanged"
    - "schemaVersion is read from its own top-level storage key BEFORE the room blob is ever touched — a version mismatch resets via deleteAll() without deserializing the old blob at all (RESEARCH.md Pitfall 3, D-17)"

key-files:
  created:
    - apps/worker/src/scheduler.ts
    - apps/worker/src/scheduler.test.ts
    - apps/worker/src/persistence.ts
    - apps/worker/src/persistence.test.ts
  modified: []

key-decisions:
  - "nextDueAt reduces over Number.POSITIVE_INFINITY rather than timers[0].dueAt to satisfy TypeScript strict noUncheckedIndexedAccess without a redundant length check inside the reducer"
  - "The Pitfall-1 regression test's disconnected-lobby-host fixture legitimately produces THREE coexisting timers (idle_gc, host_transfer, AND seat_release — a disconnected host is also a disconnected lobby seat), not two; the test asserts all three coexist and that the soonest (seat_release here, not host_transfer) is what nextDueAt returns, which is a stronger proof of the no-clobber property than the plan's literal two-timer framing"

requirements-completed: [ROOM-08]

# Metrics
duration: ~6min
completed: 2026-09-02
---

# Phase 1 Plan 6: Unified Alarm Scheduler & Versioned Persistence Summary

**Pure, offline-testable single-slot timer scheduler (`computeRoomTimers`/`nextDueAt`/`dueTimers`) that derives the full idle-GC/host-transfer/seat-release timer table from `RoomState` on every call, plus a versioned `RoomStorage`-backed persistence layer that resets to an empty lobby on schema mismatch without ever deserializing the old blob (D-17).**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-09-02T08:46:00Z
- **Completed:** 2026-09-02T08:47:58Z
- **Tasks:** 2 (both auto)
- **Files modified:** 4 (all created)

## Accomplishments
- `scheduler.ts` implements the RESEARCH.md-mandated defense against Pitfall 1 (single alarm slot collision): `computeRoomTimers` recomputes the entire timer table from `RoomState` rather than mutating timers incrementally, so scheduling one timer structurally cannot clobber another
- The named regression test "unified scheduler: host transfer does not clobber idle GC (RESEARCH Pitfall 1)" passes, and goes further than the plan's literal framing by proving THREE timers (idle_gc, host_transfer, seat_release) coexist correctly for a disconnected lobby host, since that seat is simultaneously subject to both D-07 and D-12
- An idempotency test proves `computeRoomTimers` and `nextDueAt` are stable across repeated calls on the same state — the structural fix for Pitfall 2 (constructor re-run on hibernation wake never pushes a deadline forward)
- `persistence.ts` reads `schemaVersion` from its own top-level storage key before ever touching the room blob; the named test "D-17: version mismatch resets without reading the old blob" instruments the fake storage's `get` calls and asserts zero reads of the `room` key on the mismatch path
- Both modules are grep-proven free of `setAlarm`/`ctx.storage`/`Date.now()` (scheduler) and free of any `cloudflare:`/`DurableObject` import (persistence) — Plan 07 is the only place that touches the real Alarm/Storage APIs
- 25 new tests (19 scheduler, 6 persistence); full repo suite is 108/108 passing; `npx tsc --noEmit -p apps/worker/tsconfig.json` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement the single-slot unified timer scheduler** — `68dd98b` (feat)
2. **Task 2: Implement versioned persistence with D-17 reset-on-mismatch** — `14c5219` (feat)

## Files Created/Modified
- `apps/worker/src/scheduler.ts` — `TimerType`, `TimerEvent`, `upsertTimer`, `cancelTimer`, `nextDueAt`, `dueTimers`, `computeRoomTimers`; zero `ctx.storage`/`setAlarm`/`Date.now()` references
- `apps/worker/src/scheduler.test.ts` — 19 tests: primitive mechanics (upsert/cancel/nextDueAt/dueTimers), the named Pitfall-1 regression, D-02/D-07/D-12 threshold boundary tests against imported constants (not hardcoded literals), and two idempotency tests
- `apps/worker/src/persistence.ts` — `RoomStorage` interface, `STORAGE_KEYS`, `loadRoom`, `saveRoom`, `loadTimers`; no Cloudflare-specific imports
- `apps/worker/src/persistence.test.ts` — 6 tests: fresh-storage reset, save/load round trip, the named D-17 mismatch test with `get` call instrumentation, corrupt-but-versioned blob, idempotent triple-load, and malformed-room-throws-before-writing

## Exact Exports (for Plan 07 wiring)

```ts
// scheduler.ts
type TimerType = "idle_gc" | "host_transfer" | "seat_release";
type TimerEvent = { type: TimerType; dueAt: number; seatId?: string };
function upsertTimer(timers: TimerEvent[], event: TimerEvent): TimerEvent[];
function cancelTimer(timers: TimerEvent[], type: TimerType, seatId?: string): TimerEvent[];
function nextDueAt(timers: TimerEvent[]): number | null; // null => delete the alarm
function dueTimers(timers: TimerEvent[], now: number): { due: TimerEvent[]; remaining: TimerEvent[] };
function computeRoomTimers(state: RoomState, now: number): TimerEvent[];

// persistence.ts
type RoomStorage = {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  deleteAll(): Promise<void>;
};
const STORAGE_KEYS = { schemaVersion: "schemaVersion", room: "room", timers: "timers" } as const;
function loadRoom(storage: RoomStorage, fallback: () => RoomState): Promise<{ room: RoomState; wasReset: boolean }>;
function saveRoom(storage: RoomStorage, room: RoomState, timers: TimerEvent[]): Promise<void>;
function loadTimers(storage: RoomStorage): Promise<TimerEvent[]>;
```

Plan 07's `onStart` calls `loadRoom(this.ctx.storage, () => createEmptyRoom(...))` (safe on every wake, never arms an alarm), then `computeRoomTimers(room, Date.now())` to get the timer table, then `nextDueAt(timers)` to decide whether/when to call `this.ctx.storage.setAlarm(...)`. `onAlarm` calls `dueTimers` to find what fired, processes each via the room-state functions (`transferHost`, `releaseSeat`), re-derives timers with `computeRoomTimers`, persists via `saveRoom`, and reschedules via `nextDueAt`.

## Decisions Made
- **`nextDueAt` reduces from `Number.POSITIVE_INFINITY`, not `timers[0].dueAt`.** Avoids a `noUncheckedIndexedAccess` strict-mode error on `timers[0]` inside the reducer while keeping the empty-array early-return separate and explicit.
- **The Pitfall-1 test's fixture legitimately yields three coexisting timers, not two.** A disconnected lobby host is simultaneously a disconnected lobby seat (D-12 applies) and the disconnected host (D-07 applies), plus the room's standing idle_gc timer (D-02) — all three must coexist without clobbering. The test asserts exactly this and that `nextDueAt` correctly picks the soonest of the three (seat_release, in the chosen fixture timings), which is a stronger proof of the no-clobber property than a two-timer scenario would have been.

## Deviations from Plan

None — plan executed exactly as written. The three-timer vs. two-timer detail above is a fixture-accuracy note, not a deviation: the plan's described scenario (disconnected lobby host + idle activity) produces `host_transfer` and `idle_gc` as the plan states, plus `seat_release` as an unavoidable consequence of the same seat also being a disconnected lobby seat under the D-12 rule as written in this same plan's task description. The test asserts everything the plan asked for and one additional, correct fact.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 07 (the real Durable Object) can import `scheduler.ts` and `persistence.ts` directly: wire `loadRoom`/`saveRoom` to `this.ctx.storage`, and `nextDueAt`'s result to `this.ctx.storage.setAlarm`/clear, with zero additional logic needed to avoid the single-alarm-slot and constructor-re-run pitfalls — both are already structurally prevented here.
- `npx vitest run --project worker` covers 6 test files (65 tests); full repo `npx vitest run` is 13 files / 108 tests, all green.
- `RoomStorage`'s `get<T>` signature matches Cloudflare's `DurableObjectStorage.get<T>` shape closely enough that Plan 07 should be able to pass `this.ctx.storage` with no adapter shim, but this was not verified against `@cloudflare/workers-types` in this plan — worth a quick `tsc` check as the first step of Plan 07.

---
*Phase: 01-room-transport-skeleton*
*Completed: 2026-09-02*
