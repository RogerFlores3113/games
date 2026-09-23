---
phase: 05-reconnect-session-durability-hardening
fixed_at: 2026-09-16T15:45:00Z
review_path: .planning/phases/05-reconnect-session-durability-hardening/05-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-09-16T15:45:00Z
**Source review:** .planning/phases/05-reconnect-session-durability-hardening/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (2 critical, 6 warning; Info findings were out of scope)
- Fixed: 8. WR-06 is only partly fixed; see its section.
- Skipped: 0

**Verification after all fixes:** `npx tsc -b apps/worker apps/web` passed. `npx vitest run --project worker` passed (201 tests). `npx vitest run --project web` passed (99 tests). The full `npx playwright test` run passed (18 tests) on E2E_WEB_PORT=3101 / E2E_WORKER_PORT=8788, with Next started using `--webpack` because the fix worktree used symlinked node_modules.

## Fixed Issues

### CR-01 + WR-01: Alarm set from in-memory timers while events came from persisted timers, and `#pendingZombieSweepAt` was lost on hibernation

These two share one commit because they touch the same mechanism. Removing the memo (CR-01) is only safe together with the overdue-alarm guard (WR-01).

**Files modified:** `apps/worker/src/room-do.ts`, `apps/worker/src/heartbeat.ts`, `apps/worker/src/heartbeat.test.ts`
**Commit:** b660ae7
**Status:** fixed: requires human verification (logic change)
**Applied fix:**
- `onAlarm` runs the zombie sweep first on every alarm firing. It no longer depends on a stored `zombie_sweep` entry, which is missing in pre-Phase-5 rooms and goes stale after a sweep that changes nothing. The sweep is idempotent, and a sweep that changes nothing still writes nothing. Stored `idle_gc`/`host_transfer`/`seat_release` events are processed as before.
- Removed the in-memory `#pendingZombieSweepAt` memo. `#timers` is now just `computeRoomTimers`, whose grid-aligned sweep target is always in the future. It can no longer return a past target, including from the `catch` path. IN-01 no longer applies.
- `#syncAlarm` now goes through a new pure function, `resolveAlarmWrite`. Outside the alarm handler, an alarm that is already overdue is never replaced. This closes the Pitfall 3 race across hibernation wakes as well as in memory. Inside the handler (`inAlarmHandler: true`) the next target is always written if it differs, so the alarm is never lost whatever `getAlarm()` returns.
- Unit tests cover `resolveAlarmWrite`: delete, keep an unchanged target, the overdue guard, and re-arming inside the handler.
- No `ROOM_SCHEMA_VERSION` bump was needed. Rooms saved before Phase 5 are handled because the sweep no longer reads the stored entry.
- Structural counts are unchanged: 1 `setAlarm(`, 1 `computeRoomTimers(` inside `#timers`, 1 `markConnected(`, 2 `this.#disconnectSeat(`.

### CR-02: The zombie sweep never cleared `connected: true` on seats with no socket

**Files modified:** `apps/worker/src/room-do.ts`, `apps/worker/src/heartbeat.ts`, `apps/worker/src/heartbeat.test.ts`, `apps/worker/src/room-do.test.ts`
**Commit:** a6681b8
**Status:** fixed: requires human verification (logic change)
**Applied fix:**
- The sweep now also collects seats that are `connected: true` in storage but have no live binding, using the new pure `orphanedConnectedSeatIds`. It reads bindings before any stale socket is detached, so no seat is listed twice.
- Stale sockets and orphaned seats go through a single `this.#disconnectSeat(...)` call site, so P5-5 still counts 2. `#disconnectSeat` now accepts `closingConnectionId: string | null`.
- There is no extra grace period. A join binds its socket (`setState`) before it saves `connected: true`, and the check reads bindings and seats in one synchronous section, so a seat that is still joining is never reported.
- New integration test: kill wrangler without closing sockets, respawn, reconnect only Alice, and assert Alice sees Bob flip to `connected: false`. The test fails without the fix.

### WR-02 + WR-05: Resume tore down a healthy socket after an alt-tab, and reconnected while still CONNECTING

**Files modified:** `apps/web/lib/heartbeat.ts`, `apps/web/lib/heartbeat.test.ts`
**Commit:** f47f34a
**Status:** fixed: requires human verification (logic change)
**Applied fix:** `resumeAction` now returns:
- `"none"` for CONNECTING.
- `"reconnect"` for CLOSING/CLOSED. partysocket reports the previous CLOSED socket while it waits out its backoff, so resume during that wait still reconnects immediately.
- `"ping"` for OPEN, which lets the pong timeout decide.
- `"reconnect"` for OPEN only when the silence is longer than `SOCKET_STALE_MS`, the point after which the server has already closed the socket. This can be overridden with the new optional `socketStaleMs` input.

Tests were updated to match.

### WR-03: The superseded latch depended on the parsed frame, not the close code

**Files modified:** `apps/web/lib/room-socket.ts`
**Commit:** 3a7758a
**Applied fix:** `onClose` now sets `stopReconnectingRef` and the `"superseded"` status directly from `SUPERSEDED_CLOSE_CODE` (4001). A dropped or unparseable `superseded` frame can no longer leave the tab unlatched.

### WR-04: An unrelated `error` frame while reconnecting counted as a failed join

**Files modified:** `apps/web/lib/room-socket.ts`, `apps/worker/src/heartbeat.ts`, `apps/worker/src/heartbeat.test.ts`, `apps/worker/src/room-do.ts`
**Commit:** 7beea7d
**Status:** fixed: requires human verification (logic change)
**Applied fix:**
- Client: a new `joinReplyPendingRef` is set when `onOpen` sends `join` and cleared on `joined`/`refused`/`error`. An `error` frame that arrives while no join reply is pending is dropped. For a seated player the store ignored such frames anyway, so nothing is lost. There are no hook-level tests for this; it was checked with tsc and e2e.
- Worker: `onMessage` returns early without replying when `isHeartbeatPing(raw)` matches, via a new helper in `heartbeat.ts`. P5-2 still passes because the literal never appears in the `onMessage` body.
- Side effect: the spike test "zero error frames within 1500ms after a ping" no longer tells an auto-response apart from `onMessage`. The pong-received test still proves the auto-response path.
- No schema change (`inReplyTo`) was made.

### WR-06: Tests did not exercise the paths their titles claim

**Files modified:** `e2e/hanabi-realtime.spec.ts` (and `apps/worker/src/room-do.test.ts` in a6681b8)
**Commit:** 972c41b
**Status:** only partly fixed
**Applied fix:**
- RT-04 frozen-tab e2e: the test now blocks the page's `online` event with a capture listener that calls `stopImmediatePropagation`. It stays offline for another 15s so partysocket's backoff grows, checks the banner is still showing after the network comes back, then requires recovery within 4s of the visibility change. The test fails when the visibility handler is disabled.
- CR-02: covered by the new no-clean-close worker test above.
- CR-01: covered by `resolveAlarmWrite` unit tests. There is no integration test, because the worker harness cannot seed an old stored timer table.
- **Not added:** a worker integration test that lets the DO hibernate across a sweep boundary (WR-01). It needs gaps of 10s or more, and with the 4s stale window a half-open seat would be caught before the gap. Whether local wrangler really hibernates is also uncertain. The overdue-alarm guard is covered at the unit level only.

## Notes for the developer

- **Out of scope, not fixed:** a separate alarm loop can happen in a lobby where the host is disconnected and no seat is connected. `transferHost` then does nothing, the recomputed `host_transfer` due time (disconnectedAt + 20s) is already past, and `onAlarm` re-arms it in the past. That can loop until `seat_release` (+30s) runs. This existed before the review and was not flagged by it.
- Info findings IN-02..IN-05 were out of scope (`critical_warning`). IN-01 no longer applies because the memo was removed.

---

_Fixed: 2026-09-16T15:45:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
