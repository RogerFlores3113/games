---
phase: 05-reconnect-session-durability-hardening
plan: 01
subsystem: infra
tags: [cloudflare-durable-objects, websocket-hibernation, partyserver, vitest, wrangler]

# Dependency graph
requires:
  - phase: 04-wire-engine-into-room-actor
    provides: RoomDO's single #send chokepoint, source-structure.test.ts's A1-A10 structural audit, the wrangler-dev + raw-ws integration harness
provides:
  - Seven Phase 5 timing constants (HEARTBEAT_PING/PONG, HEARTBEAT_INTERVAL_MS, HEARTBEAT_PONG_TIMEOUT_MS, SOCKET_STALE_MS, ZOMBIE_SWEEP_INTERVAL_MS, STALE_SOCKET_CLOSE_CODE) in @games/schema
  - apps/worker/tsconfig.json typed against @cloudflare/workers-types/experimental (setWebSocketAutoResponse/getWebSocketAutoResponseTimestamp/WebSocketRequestResponsePair now type-check)
  - RoomDO registers a hibernation-safe ping/pong auto-response in onStart, proven against a live wrangler dev to bypass onMessage/#send entirely
  - Pong-tolerant, ping-by-default room-do.test.ts harness (openSocket({ heartbeat }), collectMessages().pongs) for 05-02/05-03 to build on
  - Structural P5-1/P5-2/P5-3 tests pinning the heartbeat outside #send/onMessage and confirming no resume-specific frame type exists
affects: [05-02, 05-03, 05-04, 05-05, 05-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "setWebSocketAutoResponse registered once in onStart (re-armed every hibernation wake), a deliberate documented exception to the #send single-writer invariant"
    - "Integration test harness sockets send a heartbeat by default (opt out via { heartbeat: false }) so later zombie-sweep tests don't reap ordinary test sockets"

key-files:
  created:
    - packages/schema/src/constants.test.ts
  modified:
    - apps/worker/tsconfig.json
    - packages/schema/src/constants.ts
    - apps/worker/src/room-do.ts
    - apps/worker/src/room-do.test.ts
    - apps/worker/src/source-structure.test.ts

key-decisions:
  - "apps/worker/tsconfig.json types array changed to @cloudflare/workers-types/experimental (superset of the base subpath) to expose the auto-response API to the type checker, per RESEARCH.md Pitfall 1"
  - "RESEARCH.md Open Question 1 / Assumption A3 resolved TRUE: wrangler dev's local workerd honors setWebSocketAutoResponse — a raw ping is answered with a raw pong within 3s, produces zero error/state/joined frames, and the socket remains usable for a subsequent legal action"
  - "room-do.test.ts's collectMessages is now pong-tolerant (never throws on a raw non-JSON frame) and openSocket defaults to sending a heartbeat, matching a real client, with heartbeat: false as the explicit opt-out for tests simulating a half-open peer"

patterns-established:
  - "Phase 5 tuning constants (D-04) live in packages/schema/src/constants.ts alongside the existing Phase 1 grace-period constants, each with a /** D-xx: ... */ rationale comment"

requirements-completed: [RT-04, RT-05]

# Metrics
duration: ~35min
completed: 2026-09-16
---

# Phase 5 Plan 1: Wave 0 Heartbeat Foundation Summary

**Hibernation-safe ping/pong auto-response registered in RoomDO's onStart and spike-proven against a live wrangler dev, with all D-04 timing constants locked in @games/schema before any dependent plan builds on them.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-16T21:02:56Z (approx, per STATE.md)
- **Completed:** 2026-09-16
- **Tasks:** 3
- **Files modified:** 6 (1 created: constants.test.ts; 5 modified: tsconfig.json, constants.ts, room-do.ts, room-do.test.ts, source-structure.test.ts)

## Accomplishments
- Closed RESEARCH.md's Pitfall 1 (experimental workers-types) and Open Question 1 (auto-response fidelity under wrangler dev) before any later Phase 5 plan builds on either assumption
- Locked all seven D-04 heartbeat/zombie-sweep timing constants as named, documented exports so 05-02 through 05-06 import rather than re-decide them
- Proved via a live `wrangler dev` spike that `setWebSocketAutoResponse` answers `__ping__` with `__pong__` without ever invoking `onMessage`, satisfying D-02's "never wakes the DO" requirement
- Extended the structural audit (source-structure.test.ts) so a future regression that routes the heartbeat through `#send`/`onMessage`, or reintroduces it as a second call site, fails the build

## Task Commits

Each task was committed atomically:

1. **Task 1: Expose experimental workers-types and lock D-04 heartbeat constants** - `336b16d` (test)
2. **Task 2: Register auto-response in onStart and spike-prove it against wrangler dev** - `87d4c75` (feat)
3. **Task 3: Structural proof that the heartbeat bypasses the #send chokepoint (D-13)** - `1998b51` (test)

_Note: Task 1 is tagged `test` because it is TDD (RED constants.test.ts, then GREEN constants.ts); Task 2 is `feat` (the RED assertions live inside the existing room-do.test.ts file, not a separate commit, per the plan's single-task TDD flow)._

## Files Created/Modified
- `apps/worker/tsconfig.json` - `types` array now includes `@cloudflare/workers-types/experimental` instead of the base subpath
- `packages/schema/src/constants.ts` - adds HEARTBEAT_PING, HEARTBEAT_PONG, HEARTBEAT_INTERVAL_MS, HEARTBEAT_PONG_TIMEOUT_MS, SOCKET_STALE_MS, ZOMBIE_SWEEP_INTERVAL_MS, STALE_SOCKET_CLOSE_CODE
- `packages/schema/src/constants.test.ts` - invariant tests for the six D-04 behavior bullets
- `apps/worker/src/room-do.ts` - `onStart` now registers `setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT_PING, HEARTBEAT_PONG))`; file header gains a 4th structural invariant documenting the exception
- `apps/worker/src/room-do.test.ts` - `collectMessages` is pong-tolerant with a new `pongs` counter; `openSocket` gained a `{ heartbeat?: boolean }` option (default true); new "Phase 5 heartbeat spike" describe block with 3 tests
- `apps/worker/src/source-structure.test.ts` - new "Phase 5 heartbeat / RT-05 structural audit" describe block with P5-1/P5-2/P5-3 tests

## Decisions Made
- Followed RESEARCH.md's Pitfall 1 fix exactly: swapped to the experimental workers-types subpath rather than hand-declaring the auto-response API as an ambient module augmentation.
- Followed the plan's STOP CONDITION instruction literally — since the spike passed on the first GREEN attempt, no workaround or re-plan was needed; Assumption A3 in RESEARCH.md is now confirmed true, not merely assumed.
- Chose to slice `room-do.ts` for the P5-2 structural test using the literal method signature `#send(connection: Connection, frame: OutboundFrame)` (not just `#send(`) to unambiguously locate the definition rather than a call site, matching the plan's own instruction.

## Deviations from Plan

None - plan executed exactly as written. The STOP CONDITION in Task 2 was not triggered; the spike passed on the first attempt.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 05-02 (zombie sweep in `computeRoomTimers`/`onAlarm`) can now import `SOCKET_STALE_MS`, `ZOMBIE_SWEEP_INTERVAL_MS`, and `STALE_SOCKET_CLOSE_CODE` directly and rely on `getWebSocketAutoResponseTimestamp` type-checking.
- The `openSocket(code, { heartbeat: false })` test harness option is ready for 05-02's zombie-sweep integration tests to simulate a half-open peer.
- No blockers identified for 05-02/05-03.

---
*Phase: 05-reconnect-session-durability-hardening*
*Completed: 2026-09-16*

## Self-Check: PASSED

All 6 files_modified paths exist on disk; all 3 task commit hashes (336b16d, 87d4c75, 1998b51) found in git log.
