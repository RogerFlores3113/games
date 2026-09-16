---
phase: 05-reconnect-session-durability-hardening
plan: 03
subsystem: web
tags: [partysocket, zustand, reconnect, heartbeat, vitest]

# Dependency graph
requires:
  - phase: 05-reconnect-session-durability-hardening (05-01)
    provides: HEARTBEAT_PING/PONG, HEARTBEAT_INTERVAL_MS, HEARTBEAT_PONG_TIMEOUT_MS, STALE_SOCKET_CLOSE_CODE in @games/schema
provides:
  - "apps/web/lib/heartbeat.ts: pure, framework-free resolveClientHeartbeatTiming/resumeAction/isPongOverdue (D-01/D-02/D-15), unit-proven before any DOM wiring"
  - "apps/web/lib/room-store.ts: new `reconnecting` RoomConnectionStatus (D-05) that keeps the last view and seatId; WR-05 error-while-joining latch extended to reconnecting"
  - "apps/web/lib/room-socket.ts: RoomSocketHandle { socket, reclaimSeat } — raw-literal heartbeat with pong-timeout force-reconnect (D-02), visibilitychange/online fast-resume (D-01), maxEnqueuedMessages: 0 (D-06), reclaimSeat as the sole non-effect latch-clear entry point (D-11)"
affects: [05-04, 05-05, 05-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "heartbeat.ts stays framework-free (no window/document, OPEN readyState as the literal 1) so D-01/D-02 decision logic is unit-proven before any React/DOM wiring exists"
    - "D-15 NEXT_PUBLIC_HEARTBEAT_INTERVAL_MS/NEXT_PUBLIC_HEARTBEAT_PONG_TIMEOUT_MS resolved once at module scope via literal process.env property access, matching the existing NEXT_PUBLIC_WORKER_HOST pattern so Next.js can inline the reads"

key-files:
  created:
    - apps/web/lib/heartbeat.ts
    - apps/web/lib/heartbeat.test.ts
  modified:
    - apps/web/lib/room-store.ts
    - apps/web/lib/room-store.test.ts
    - apps/web/lib/close-codes.test.ts
    - apps/web/lib/room-socket.ts
    - apps/web/app/room/[code]/RoomClient.tsx

key-decisions:
  - "resumeAction/isPongOverdue import nothing from partysocket — OPEN readyState is the literal 1, keeping heartbeat.ts's framework-free purity constraint intact per the plan's locked interfaces"
  - "The heartbeat interval keeps running regardless of tab visibility (Claude's discretion, documented inline): an alt-tabbed desktop player stays 'Connected' for teammates; the server's SOCKET_STALE_MS threshold already absorbs Chrome's ~60s hidden-tab timer throttle, and D-01's resume handling is what actually matters for a genuinely suspended phone"
  - "onClose's D-05 status transition only fires when not latched and the close code is non-terminal, and only overwrites seated/joining/reconnecting/connecting — never superseded/abandoned/refused/join_failed — matching the locked interfaces exactly"

patterns-established: []

requirements-completed: [RT-04, RT-08]

# Metrics
duration: ~20min
completed: 2026-09-16
---

# Phase 5 Plan 3: Client Reconnect Hardening Summary

**A raw-literal client heartbeat with pong-timeout force-reconnect, immediate resume on tab visibility/network return, a `reconnecting` store status that keeps the last view, no queued/replayed sends, and a latch-respecting `reclaimSeat` entry point — all decision logic unit-proven in a framework-free module before any DOM wiring.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-16 (approx, per STATE.md session continuity)
- **Completed:** 2026-09-16
- **Tasks:** 2
- **Files modified:** 7 (2 created: heartbeat.ts, heartbeat.test.ts; 5 modified: room-store.ts, room-store.test.ts, close-codes.test.ts, room-socket.ts, RoomClient.tsx)

## Accomplishments
- Closed D-01: a socket that isn't OPEN or hasn't heard from the server for longer than one full heartbeat cycle is force-reconnected the instant the tab becomes visible or the network returns — never waiting out partysocket's up-to-30s backoff
- Closed D-02: a raw `__ping__`/`__pong__` literal heartbeat (never `JSON.stringify`'d) runs on `HEARTBEAT_INTERVAL_MS` while the socket is OPEN, and a missing pong (or any other frame) within `HEARTBEAT_PONG_TIMEOUT_MS` triggers `socket.reconnect()`
- Closed D-05: the store gained a `reconnecting` status that keeps `view`/`seatId` untouched (proven directly in room-store.test.ts), so a non-terminal close renders the last board with a "reconnecting" banner instead of dropping back to a full-screen "Connecting…" page; the next `joined`/`state` frame clears it back to `seated` for free through the existing reducer cases
- Closed D-06: `maxEnqueuedMessages: 0` on the partysocket config means nothing sent while disconnected is queued and replayed on the new socket ahead of `join`
- Closed D-11: `reclaimSeat` is the only latch-clear entry point outside the `[code]` reset effect; every automatic reconnect trigger (visibility, online, pong-timeout) checks `stopReconnectingRef` first, so two tabs can never auto-supersede each other in a loop
- Confirmed `STALE_SOCKET_CLOSE_CODE` (4003) stays non-terminal on the client (`isTerminalCloseCode(4003) === false`), matching D-03's server-side zombie-sweep design

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure client heartbeat decisions, `reconnecting` store status, non-terminal 4003** - `ebece2d` (test, TDD)
2. **Task 2: Wire heartbeat, resume listeners, no-queue, and reclaimSeat into useRoomSocket** - `59cb8fa` (feat)

## Files Created/Modified
- `apps/web/lib/heartbeat.ts` - `resolveClientHeartbeatTiming` (D-15 override parsing, floors at 250ms), `resumeAction` (D-01 decision: none/ping/reconnect), `isPongOverdue` (D-02 timeout check) — framework-free, zero `window`/`document` references
- `apps/web/lib/heartbeat.test.ts` - unit tests for all three exports, including every override fallback case (`""`, `"x"`, `"0"`, `"-1"`, `"1.5"`, `"249"`)
- `apps/web/lib/room-store.ts` - `"reconnecting"` added to `RoomConnectionStatus` with a `/** D-05: ... */` comment; the WR-05 `error`-while-joining latch condition extended to `|| get().status === "reconnecting"`
- `apps/web/lib/room-store.test.ts` - new "D-05: reconnecting keeps the last view" describe block (4 tests) plus an `error`-while-reconnecting case in the existing WR-05 block
- `apps/web/lib/close-codes.test.ts` - new case asserting `STALE_SOCKET_CLOSE_CODE` (4003) is non-terminal
- `apps/web/lib/room-socket.ts` - return type changed to `RoomSocketHandle { socket, reclaimSeat }`; `HEARTBEAT_TIMING` resolved once at module scope; `lastHeardAtRef`/`pingSentAtRef`/`pongCheckTimeoutsRef` added; `maxEnqueuedMessages: 0`; `onMessage` records `lastHeardAtRef` first and early-returns on the raw pong; `onOpen` preserves `"reconnecting"` status instead of resetting to `"joining"`; `onClose` sets `"reconnecting"`/`"connecting"` for non-terminal, non-latched closes; `sendPing`/heartbeat interval effect; `visibilitychange`/`online` resume effect; `reclaimSeat` callback
- `apps/web/app/room/[code]/RoomClient.tsx` - `ConnectedRoom` destructures only `{ socket }` from the new handle (05-04 will add `reclaimSeat` when it renders the superseded-screen button)

## Decisions Made
- Kept `heartbeat.ts` completely framework-free per the plan's locked interfaces — `OPEN` is hardcoded as the literal `1` rather than imported from `partysocket`, so the module has zero coupling to the transport library and stays trivially unit-testable
- Heartbeat pinging runs regardless of tab visibility (documented inline as Claude's discretion) — this keeps an alt-tabbed desktop player showing "Connected" to teammates; the server's `SOCKET_STALE_MS` threshold (75s) already absorbs Chrome's hidden-tab timer throttling, and D-01's resume handling is what matters for an actually-suspended phone
- `onClose`'s D-05 status transition is scoped narrowly: only fires when not latched and the close code is non-terminal, and only overwrites `seated`/`joining`/`reconnecting`/`connecting` — terminal statuses (`superseded`/`abandoned`/`refused`/`join_failed`) are never touched by this bookkeeping, matching the plan's locked interfaces exactly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] heartbeat.ts's doc comment tripped its own `grep -c "window\|document"` acceptance check**
- **Found during:** Task 1 self-verification
- **Issue:** The module header comment originally read "no `window`/`document` access", which is itself a textual match for the acceptance criterion's `grep -c "window\|document" apps/web/lib/heartbeat.ts` check (expected `0`, got `1` — a comment mentioning the forbidden words by name, not an actual usage)
- **Fix:** Reworded the comment to "no browser globals" — same meaning, no longer matches the literal grep
- **Files modified:** `apps/web/lib/heartbeat.ts`
- **Verification:** `grep -c "window\|document" apps/web/lib/heartbeat.ts` now outputs `0`; tests still pass
- **Committed in:** `ebece2d` (part of Task 1's commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking acceptance-criteria check)
**Impact on plan:** Purely cosmetic wording fix; no behavioral change.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 05-04 can destructure `reclaimSeat` from `useRoomSocket`'s returned `RoomSocketHandle` to wire the "Use this tab" button on the superseded screen, and can read the store's `"reconnecting"` status to render the banner and disable board controls
- `apps/web/lib/heartbeat.ts`'s pure exports (`resolveClientHeartbeatTiming`, `resumeAction`, `isPongOverdue`) are available for any future client-side timing logic without re-deriving the decision rules
- No blockers identified for 05-04/05-05.

---
*Phase: 05-reconnect-session-durability-hardening*
*Completed: 2026-09-16*

## Self-Check: PASSED

All 7 files_modified paths exist on disk; both task commit hashes (ebece2d, 59cb8fa) found in git log.
