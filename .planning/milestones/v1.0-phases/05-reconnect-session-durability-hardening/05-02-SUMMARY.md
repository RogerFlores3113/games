---
phase: 05-reconnect-session-durability-hardening
plan: 02
subsystem: infra
tags: [cloudflare-durable-objects, websocket-hibernation, partyserver, vitest, wrangler]

# Dependency graph
requires:
  - phase: 05-reconnect-session-durability-hardening (05-01)
    provides: Hibernation-safe heartbeat auto-response registered in onStart, D-04 timing constants in @games/schema, pong-tolerant openSocket({ heartbeat }) test harness
provides:
  - "D-03 zombie sweep: a grid-aligned zombie_sweep TimerType, folded into the existing single alarm, that closes seated sockets whose last auto-response is older than SOCKET_STALE_MS and flips their seat to disconnected through the same CR-01-guarded helper onClose uses"
  - "Pure heartbeat.ts helpers (resolveHeartbeatTiming, socketLastSeenAt, isSocketStale) with D-15 wrangler-var test overrides"
  - "RoomDO's #disconnectSeat: the single shared disconnect helper for onClose AND the zombie sweep, keeping markConnected( to one call site"
  - "In-memory #pendingZombieSweepAt stickiness in RoomDO#timers, closing a chatty-room scheduling race that grid alignment alone does not solve"
  - "7 new socket-level integration tests proving D-03/D-12/D-13/D-15 against a live wrangler dev, plus P5-4..P5-7 structural chokepoint tests"
affects: [05-03, 05-04, 05-05, 05-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "zombie_sweep timer scheduled only while >=1 seat is connected, grid-aligned via (floor(now/interval)+1)*interval inside computeRoomTimers, but STICKY at the room-do.ts call-site layer (#pendingZombieSweepAt) — the pure scheduler function alone is only stable within one interval window, not across a window boundary raced against real alarm latency"
    - "#disconnectSeat(room, seatId, closingConnectionId, now) returns the SAME object reference when the disconnect should be a no-op (CR-01/WR-01 guards), letting callers cheaply detect nothing-to-commit via `next === room`"
    - "D-15 timing overrides: HeartbeatEnv-shaped wrangler --var strings, parsed by a shared resolveOverride (finite integer >= 500 wins, else falls back to the packages/schema constant)"

key-files:
  created:
    - apps/worker/src/heartbeat.ts
    - apps/worker/src/heartbeat.test.ts
  modified:
    - apps/worker/src/scheduler.ts
    - apps/worker/src/scheduler.test.ts
    - apps/worker/src/room-do.ts
    - apps/worker/src/source-structure.test.ts
    - apps/worker/src/room-do.test.ts

key-decisions:
  - "computeRoomTimers gained an optional third `options: { zombieSweepIntervalMs? }` parameter rather than a new exported constant-override mechanism, keeping the D-15 override plumbed through the same pure function signature the rest of the module already uses"
  - "RoomDO#timers memoizes the armed zombie_sweep target in-memory (#pendingZombieSweepAt), advanced ONLY by onAlarm's own zombie_sweep branch once it has genuinely run — ordinary #commit calls (from any game action) always reuse the existing target rather than recomputing one from the current `now`"
  - "SeatAttachment.boundAt (epoch ms at join) exempts a just-joined socket from the sweep until its first heartbeat lands, per the locked interfaces design"
  - "onAlarm's zombie_sweep branch detaches (connection.setState(null)) before closing with the non-terminal STALE_SOCKET_CLOSE_CODE, then flips the seat via #disconnectSeat — no second state-mutation call site, no turn skip/seat release (D-08)"

patterns-established:
  - "A DO instance field that is deliberately NOT persisted and resets to null on every hibernation wake (matching onStart's established re-arm pattern for the heartbeat auto-response) is the sanctioned way to add call-scoped stickiness on top of an otherwise-pure derive-whole-table scheduler function, without breaking scheduler.ts's 'never touches ctx.storage, never reads Date.now()' purity constraint"

requirements-completed: [RT-04, RT-05, RT-06, RT-08]

# Metrics
duration: ~19min
completed: 2026-09-16
---

# Phase 5 Plan 2: Dead-Socket Detection (Zombie Sweep) Summary

**Server-side zombie-socket detection folded into RoomDO's existing single alarm, with a Rule-1 fix for a chatty-room scheduling race that the plan's own grid-alignment design left unclosed, proven against a live `wrangler dev` under D-03/D-12/D-13/D-15.**

## Performance

- **Duration:** ~19 min
- **Started:** 2026-09-16T14:10:57-07:00 (approx, first task commit at 14:13:19)
- **Completed:** 2026-09-16T14:29:51-07:00
- **Tasks:** 3
- **Files modified:** 7 (2 created: heartbeat.ts, heartbeat.test.ts; 5 modified: scheduler.ts, scheduler.test.ts, room-do.ts, source-structure.test.ts, room-do.test.ts)

## Accomplishments
- Closed D-03: a half-open seated socket (mobile suspend, dead wifi) is now detected and its seat flipped to `connected: false` for teammates, through the SAME CR-01-guarded helper `onClose` already used — no second state-mutation path
- Discovered and fixed a real scheduling race (not merely a theoretical Pitfall 3 concern): grid-aligning `zombie_sweep.dueAt` inside `computeRoomTimers` is stable *within* one interval window but not *across* a window boundary raced against real Durable Object alarm latency — a chatty room's own traffic could silently defer detection forever. Fixed with an in-memory sticky target (`#pendingZombieSweepAt`) that only the alarm itself (never an ordinary `#commit`) can advance
- Proved D-08 "pauses in place": sweeping the ACTIVE seat changes only `connected`, leaving turn, clue tokens, deck count, and room status untouched
- Proved D-12 (CR-01) and D-13 (schema-identical reconnect) both hold under the NEW zombie-close path, not just the pre-existing supersede path
- Proved D-15 end-to-end: reconnect after a forced `wrangler dev` process eviction mid-game returns both seats to their original seatId with identical game state

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure heartbeat helpers and grid-aligned zombie_sweep timer** - `506a94b` (test, TDD)
2. **Task 2: Wire the zombie sweep into RoomDO through the shared onClose disconnect path** - `3c35d09` (feat)
3. **Task 3: Socket-level proofs of D-03, D-12, D-13 and D-15 against wrangler dev** - `544fc57` (test, includes the Rule 1 scheduling-race fix)

## Files Created/Modified
- `apps/worker/src/heartbeat.ts` - `resolveHeartbeatTiming(env)` (D-15 wrangler-var overrides), `socketLastSeenAt(autoResponseAt, boundAt)`, `isSocketStale(lastSeenAt, now, staleMs)` — pure, no `Date.now()`/ctx/socket I/O
- `apps/worker/src/heartbeat.test.ts` - unit tests for all three helpers, including every invalid-override case
- `apps/worker/src/scheduler.ts` - `"zombie_sweep"` added to `TimerType`; `computeRoomTimers` gains an `options.zombieSweepIntervalMs` parameter and derives one grid-aligned `zombie_sweep` timer whenever `>=1` seat is connected
- `apps/worker/src/scheduler.test.ts` - new `D-03: zombie_sweep timer` describe block (grid alignment, connected-seat gating, Pitfall 3 same-window stability, options override, D-08 in-progress coexistence)
- `apps/worker/src/room-do.ts` - `#timing()`/`#timers()` centralize D-15 overrides and the new sticky-target logic; `#disconnectSeat` extracted from `onClose` (shared by `onClose` and the new `onAlarm` zombie_sweep branch); `SeatAttachment.boundAt` set at join; `onAlarm` gains the zombie_sweep branch (detach → non-terminal close → `#disconnectSeat`); no-op sweeps skip `saveRoom`/`#pushState`; `#pendingZombieSweepAt` instance field added
- `apps/worker/src/source-structure.test.ts` - P5-4..P5-7: single `computeRoomTimers(`/`setAlarm(`/`markConnected(` call-site counts, `this.#disconnectSeat(` used by both `onClose` and `onAlarm`, single `getWebSocketAutoResponseTimestamp(` call site, and D-08's "no transferHost/releaseSeat/applyGameAction inside the zombie_sweep branch" proof
- `apps/worker/src/room-do.test.ts` - `spawnWrangler` now passes `SOCKET_STALE_MS:4000`/`ZOMBIE_SWEEP_INTERVAL_MS:1000`; new `stopHeartbeat(ws)` helper (WeakMap-tracked interval handle); new "Phase 5 dead-socket detection and reconnect (D-03, D-12, D-13, D-15)" describe block with 7 tests

## Decisions Made
- Kept `computeRoomTimers` itself pure and unchanged in spirit (still never touches `ctx.storage`/`Date.now()`); the sticky-target fix for the chatty-room race lives entirely in `room-do.ts`'s `#timers` wrapper, not in `scheduler.ts` — this keeps Task 1's unit tests (which exercise `computeRoomTimers` directly and correctly assert per-call grid stability) valid without modification
- `#pendingZombieSweepAt` is deliberately NOT persisted — it resets to `null` on every hibernation wake, matching the established `onStart`-reruns-on-every-wake pattern already used for the heartbeat auto-response registration, so a fresh wake always re-derives a correct near-term target rather than trusting stale in-memory state across an eviction
- `onAlarm`'s zombie_sweep branch clears `#pendingZombieSweepAt` unconditionally (whether or not any socket was actually found stale), so a genuinely no-op sweep still correctly advances the schedule to the next window

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Grid-aligned zombie_sweep scheduling could be deferred indefinitely by chatty-room traffic**
- **Found during:** Task 3, writing the "Pitfall 3: chatty room" socket-level test
- **Issue:** The plan's locked design (`dueAt = (floor(now/interval)+1)*interval`, computed fresh on every `computeRoomTimers` call) is stable *within* a single interval window, but NOT across a window boundary: if an ordinary `#commit` (triggered by any game action, e.g. `set_variant`) lands at or after a boundary before the real Durable Object alarm has actually fired for that boundary, the fresh recompute derives the NEXT (later) window's target, and `#syncAlarm`'s existing "reschedule if different" guard then calls `setAlarm` with that later time — cancelling the still-pending, not-yet-fired alarm. Under a 500ms chat cadence against a 1000ms sweep interval, this reproduced consistently, and the D-03 zombie was never detected within the test's 9s budget.
- **Fix:** Added an in-memory `#pendingZombieSweepAt` field on `RoomDO`. `#timers()` now reuses this memoized target on every call once one is armed, rather than trusting a fresh `computeRoomTimers` derivation; only `onAlarm`'s own `zombie_sweep` branch (after it has genuinely executed) clears the field so the next `#timers()` call adopts a new grid-aligned target. Ordinary game actions can therefore never push the schedule later — only the alarm firing can.
- **Files modified:** `apps/worker/src/room-do.ts`
- **Verification:** The "Pitfall 3: a chatty host acting every 500ms does not defer detecting a genuinely stale seat" test, which failed deterministically before the fix (timed out at 9000ms with zero disconnect observed), passes reliably after it. Full `npx vitest run --project worker` (191 tests) and `npx tsc -b apps/worker` both green after the fix.
- **Committed in:** `544fc57` (part of Task 3's commit, documented in the commit message body)

---

**Total deviations:** 1 auto-fixed (Rule 1 - correctness bug)
**Impact on plan:** Necessary for D-03 to actually satisfy its own stated Pitfall 3 guarantee under realistic multiplayer traffic; no scope creep — the fix is scoped entirely to `room-do.ts`'s existing `#timers` wrapper and does not touch `scheduler.ts`'s pure `computeRoomTimers`, `heartbeat.ts`, or any test file's assertions about `computeRoomTimers` in isolation.

## Issues Encountered

Two structural-test slice anchors initially referenced the comment `// Private helpers`, which `source-structure.test.ts`'s `stripComments` correctly strips before scanning (by design, per HIDE-02's own documented rationale) — the anchor never matched. Replaced with the literal `async #ensureRoom(` method signature, which survives comment-stripping. Caught immediately by the first structural-test run; no behavioral risk, test-authoring only.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 05-03 (client-side heartbeat/visibility reconnect, D-01/D-02/D-11) can rely on the server now truthfully reporting `connected: false` for a half-open socket within `SOCKET_STALE_MS + ZOMBIE_SWEEP_INTERVAL_MS` of it actually going dead, including under concurrent game-action traffic.
- The `#pendingZombieSweepAt` stickiness pattern (memoized-in-memory, reset only by the mechanism that "owns" the schedule) is available as a precedent if a future timer type needs the same "derive-from-`now`" hazard closed.
- No blockers identified for 05-03/05-04.

---
*Phase: 05-reconnect-session-durability-hardening*
*Completed: 2026-09-16*

## Self-Check: PASSED

All 7 files_modified paths exist on disk; all 3 task commit hashes (506a94b, 3c35d09, 544fc57) found in git log.
