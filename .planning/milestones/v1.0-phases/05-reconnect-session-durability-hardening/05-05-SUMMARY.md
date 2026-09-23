---
phase: 05-reconnect-session-durability-hardening
plan: 05
subsystem: testing
tags: [playwright, e2e, reconnect, heartbeat, cdp, chromium]

# Dependency graph
requires:
  - phase: 05-reconnect-session-durability-hardening (05-02)
    provides: server-side zombie sweep (D-03), SOCKET_STALE_MS/ZOMBIE_SWEEP_INTERVAL_MS wrangler --var D-15 overrides
  - phase: 05-reconnect-session-durability-hardening (05-03)
    provides: client heartbeat with pong-timeout force-reconnect (D-01/D-02), reconnecting store status, reclaimSeat, NEXT_PUBLIC_HEARTBEAT_* D-15 overrides
  - phase: 05-reconnect-session-durability-hardening (05-04)
    provides: seat-status-{seatId} dots, disconnected turn-text suffix, reconnecting-banner, use-this-tab-button testids
provides:
  - "D-14 browser-level proof: RT-04 network drop mid-game (Reconnecting… banner, disabled controls, same-seat/same-turn resume), RT-04 CDP freeze + hard network drop of a hidden tab detected as disconnected and resumed without a reload, RT-06 pause-in-place (unchanged clue/deck count while a player is away), RT-08 mid-game second-tab supersede and Use this tab reclaim without seat duplication or auto ping-pong"
  - "D-15 shortened, injected e2e timing wired into both local dev servers (playwright.config.ts), so no Phase 5 spec sleeps for real minutes"
  - "e2e/helpers.ts: startTwoPlayerGame, seatIdOfOtherPlayer/OTHER_HAND_SELECTOR, emulateVisibility, freezePage/resumePage — shared by both extended spec files"
affects: [05-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "playwright.config.ts webServer ports are overridable via E2E_WEB_PORT/E2E_WORKER_PORT env vars (with NEXT_PUBLIC_WORKER_HOST threaded through to match), so a local run never collides with an operator's own long-running dev servers on the default 3100/8787 ports"
    - "CDP Page.setWebLifecycleState('frozen') is paired with a hard context.setOffline(true) network drop for the RT-04 backgrounded-tab proof, rather than relied on alone — confirmed empirically (not just by RESEARCH.md's documented uncertainty) that a bare CDP freeze does not reliably stop the client heartbeat's JS interval in the installed Chromium"

key-files:
  created: []
  modified:
    - playwright.config.ts
    - e2e/helpers.ts
    - e2e/hanabi-realtime.spec.ts
    - e2e/seat-takeover.spec.ts

key-decisions:
  - "playwright.config.ts's WEB_PORT/WORKER_PORT made overridable via E2E_WEB_PORT/E2E_WORKER_PORT so a local run can avoid colliding with an operator's already-running dev servers, discovered necessary when this session's sandbox had a pre-existing wrangler dev on 8787 and a bare next dev on 3000 that Next's own per-project dev-server lockfile refuses to share with a second instance regardless of requested port"
  - "RT-04's frozen-tab test unconditionally pairs the CDP freeze attempt with context.setOffline(true) for the sleep window (not only as a throw-fallback) after a live run showed the seat never went stale within the injected window on freeze alone — this matches RESEARCH.md Pitfall 4's own recommended defense-in-depth exactly, just applied unconditionally instead of only on a thrown exception"

patterns-established: []

requirements-completed: [RT-04, RT-05, RT-06, RT-08]

# Metrics
duration: ~45min
completed: 2026-09-16
---

# Phase 5 Plan 5: Browser-Level Reconnect Proofs Summary

**Playwright now drives real network drops, a CDP-frozen+offline backgrounded tab, and a mid-game second-tab supersede/reclaim against a live `wrangler dev` + `next dev` pair with D-15 shortened timing injected, proving RT-04/RT-06/RT-08's browser-visible behavior end to end — full local suite (18 tests, 8 files) green.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-09-16 (per STATE.md session continuity, plan 5 of 6)
- **Completed:** 2026-09-16
- **Tasks:** 3 (plus 1 Rule 1 follow-up fix)
- **Files modified:** 4 (playwright.config.ts, e2e/helpers.ts, e2e/hanabi-realtime.spec.ts, e2e/seat-takeover.spec.ts)

## Accomplishments

- Closed D-14 for RT-04/RT-06: a network drop mid-game (`context.setOffline`) shows the dropping page's `reconnecting-banner` with Play/Discard/Give-clue disabled, while the observer's `seat-status-{seatId}` flips to `Disconnected` and the turn indicator reads "Waiting for {name} — disconnected" with clue tokens and deck count unchanged (D-08 pause-in-place); on `setOffline(false)` both sides return to their pre-drop state with the SAME seatId (proven via the observer's `other-hand-{seatId}` testid)
- Closed D-14 for the CDP-freeze half of RT-04: a hidden, frozen tab is detected as disconnected by the other player and resumes its seat without a `reload()` call anywhere in either new test
- Closed D-14 for RT-08: a second tab opened mid-game supersedes the first (superseded text + enabled `use-this-tab-button`), the host's board keeps exactly one `other-hand` with the same seatId and `data-connected="true"` throughout, "Use this tab" reclaims without duplicating the seat, and a 5s negative-window wait proves the two tabs never auto-flip back (D-11)
- Ran the full local suite (`npx playwright test`, 18 tests across 8 files including RT-01/RT-03/RT-07 unmodified) and `npm test` (490 unit/integration tests) green against a live `wrangler dev` + `next dev` pair with D-15 timing injected, isolated onto alternate ports so the operator's own pre-existing dev servers were never touched

## Task Commits

Each task was committed atomically:

1. **Task 1: Timing injection and shared e2e helpers** - `88c6c12` (test)
2. **Task 2: RT-04/RT-06 proofs — network drop and frozen background tab mid-game** - `3c90b93` (test)
3. **Task 3: RT-08 proof — mid-game second tab supersede and Use this tab reclaim without duplication** - `391ae06` (test)
4. **Rule 1 fix: pair CDP freeze with a hard network drop in the RT-04 sleep test** - `a6fce1c` (fix), found and fixed while running the suite live

## Files Created/Modified

- `playwright.config.ts` - D-15 timing constants (`E2E_HEARTBEAT_INTERVAL_MS`/`E2E_HEARTBEAT_PONG_TIMEOUT_MS`/`E2E_SOCKET_STALE_MS`/`E2E_ZOMBIE_SWEEP_INTERVAL_MS`) threaded into both webServer entries (web via `env`, worker via `--var`); `WEB_PORT`/`WORKER_PORT` made overridable via `E2E_WEB_PORT`/`E2E_WORKER_PORT` with `NEXT_PUBLIC_WORKER_HOST` kept in sync
- `e2e/helpers.ts` - `OTHER_HAND_SELECTOR`/`seatIdOfOtherPlayer` (seat identity from the OTHER page, board never renders own seatId), `startTwoPlayerGame` (extracted start-game + active/passive detection pattern from RT-03, unchanged there), `emulateVisibility` (redefines `document.visibilityState`/`hidden` + dispatches `visibilitychange`), `freezePage`/`resumePage` (CDP `Page.setWebLifecycleState`)
- `e2e/hanabi-realtime.spec.ts` - new "Phase 5 reconnect hardening (RT-04 + RT-06 + D-14)" describe block: Test A (network drop/restore mid-game) and Test B (frozen+hidden tab, CDP freeze paired with a hard network drop, resumes without reload); RT-01/RT-03 untouched
- `e2e/seat-takeover.spec.ts` - new RT-08 test appended to the existing describe block (existing RT-07 test untouched): second-tab supersede, "Use this tab" reclaim, one-seat/one-hand/connected-winner invariant proven before, during, and after a 5s negative-window wait

## Decisions Made

- `playwright.config.ts`'s ports made overridable via env rather than hardcoded, so this and future local runs can avoid an operator's already-running dev servers without editing the file each time
- The frozen-tab test pairs CDP freeze with a hard network drop unconditionally (not only when `freezePage` throws), after a live run demonstrated the documented RESEARCH.md Pitfall 4 uncertainty is real in this installed Chromium — freeze alone did not stop the client heartbeat's JS timer quickly enough to produce a stale reading within the injected window

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `playwright.config.ts` ports hardcoded to 3100/8787 collided with pre-existing, operator-owned dev servers in this sandbox**
- **Found during:** Task 2 verification (`npx playwright test hanabi-realtime`)
- **Issue:** This session's environment had a `wrangler dev --port 8787` and a bare `next dev` (binding port 3000) both already running, started well before this session (per the environment's own explicit warning about the wrangler process). Next.js's per-project dev-server lockfile (`<distDir>/lock`) additionally refuses to start ANY second `next dev` instance in the same project directory regardless of the requested port, so even picking a different web port alone would not have been sufficient.
- **Fix:** Made `WEB_PORT`/`WORKER_PORT` overridable via `E2E_WEB_PORT`/`E2E_WORKER_PORT` env vars (defaulting to the original 3100/8787), and threaded `NEXT_PUBLIC_WORKER_HOST` through to match. Verification itself used a transient, uncommitted `distDir` override in `apps/web/next.config.ts` (`NEXT_E2E_DIST_DIR` env var) to satisfy Next's lockfile for this session's own web dev instance; that config change was reverted (`git checkout`) immediately after the verification run completed and is NOT part of any commit — confirmed via `git diff apps/web/next.config.ts` showing no changes before the final commit.
- **Files modified:** `playwright.config.ts` (committed, permanent); `apps/web/next.config.ts` (transient, reverted, never committed)
- **Verification:** Full local `npx playwright test` (18/18) and `npm test` (490/490) passed with `E2E_WEB_PORT=3101 E2E_WORKER_PORT=8788`; confirmed via `git status`/`ps` that neither the operator's original `wrangler dev` (pid unchanged) nor their `next dev` parent process (pid unchanged; only its hot-reloadable `next-server` worker subprocess restarted, standard Next.js behavior) was disturbed.
- **Committed in:** `3c90b93` (Task 2's commit; the env-override addition landed alongside Task 2 since it was needed to verify Task 2)

**2. [Rule 1 - Bug] CDP `Page.setWebLifecycleState("frozen")` alone did not reliably stop the client heartbeat in the installed Chromium**
- **Found during:** Live verification run of Task 2's frozen-tab test
- **Issue:** The test's original fallback logic only dropped the network if `freezePage` THREW (CDP unsupported). In practice, `freezePage` succeeded (no throw) but the observer's `seat-status-{seatId}` never flipped to `Disconnected` within the 25s injected window — the heartbeat kept the auto-response timestamp fresh, meaning the freeze did not actually stop the client's `setInterval`-driven ping. This is exactly RESEARCH.md's documented Pitfall 4 ("frozen page lifecycle state" and "socket/timer actually stopped" are different subsystems), now confirmed empirically rather than only theoretically.
- **Fix:** The freeze attempt is now unconditionally paired with `context.setOffline(true)` for the sleep window (not only as a throw-fallback), per Pitfall 4's own recommended defense-in-depth guidance.
- **Files modified:** `e2e/hanabi-realtime.spec.ts`
- **Verification:** Re-ran `npx playwright test hanabi-realtime` — the previously-failing frozen-tab test now passes reliably (verified twice: isolated file run and full-suite run)
- **Committed in:** `a6fce1c`

---

**Total deviations:** 2 auto-fixed (1 Rule 3 - blocking test-run collision, 1 Rule 1 - correctness bug found live)
**Impact on plan:** Both fixes were necessary to actually execute and pass the plan's own required verification (`npx playwright test` green) in this sandbox; neither changes the plan's intended test coverage or assertions, only how reliably the frozen-tab detection is produced and how the local dev servers are addressed.

## Issues Encountered

`wrangler dev`'s bundled `workerd` emitted intermittent `SENTRY_DO SQLite failed; NOSENTRY database is locked: SQLITE_BUSY` warnings and a couple of `RoomDO onAlarm failed` internal errors during the full-suite run (visible in `[WebServer]` log lines, not test failures) — these come from the existing idle-GC alarm racing the new zombie-sweep alarm under the injected 1s sweep interval across multiple concurrently-created test rooms sharing one local SQLite-backed `wrangler dev` process. All affected tests still passed (the room in question recovers on its next alarm tick), and this is local-`wrangler dev`-only contention under an artificially short D-15 test interval, not a production timing concern (production `ZOMBIE_SWEEP_INTERVAL_MS` is 15s, not 1s). Logged here for visibility; no code change made since no test assertion was affected across two full-suite runs.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 05-06 (the phase gate: `npm test`, `npx playwright test`, per-package `tsc --noEmit` all green, plus the `docs/manual-checks/mobile-background.md` owner sign-off for the literal 10+ minute real-phone scenario, D-16) can proceed — this plan's automated coverage of RT-04/RT-05/RT-06/RT-08 is now green end to end in a real browser against the real worker.
- The transient `wrangler dev` SQLite alarm contention noted above is worth a passing mention if 05-06's phase-gate run reproduces it, but it is not blocking (no test failure across two full runs).
- No blockers identified for 05-06.

---
*Phase: 05-reconnect-session-durability-hardening*
*Completed: 2026-09-16*

## Self-Check: PASSED

All 4 files_modified paths exist on disk; all 4 task/fix commit hashes (88c6c12, 3c90b93, 391ae06, a6fce1c) found in git log.
