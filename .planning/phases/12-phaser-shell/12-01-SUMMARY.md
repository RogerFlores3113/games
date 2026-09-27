---
phase: 12-phaser-shell
plan: 01
subsystem: api
tags: [nextjs, zod, forms, expedition, playwright]

# Dependency graph
requires:
  - phase: 11-adapter-schemas-worker-wiring
    provides: CreateRoomRequestSchema's expedition member (config z.null()), "expedition" registered in GAME_REGISTRY
provides:
  - readCreateRoomForm returns config null (never undefined) for a game with no create-time settings panel
  - Request-level e2e proof that a no-JS native form POST can create and seat a host in an Expedition room
affects: [12-11 landing-picker-enable, phaser-shell]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: [apps/web/lib/create-room-form.test.ts, e2e/expedition-create.spec.ts]
  modified: [apps/web/lib/create-room-form.ts]

key-decisions:
  - "Config field defaults to null (not undefined) whenever selectedGame is a string, closing the D-17/WR-06 gap without importing LANDING_SETTINGS into the server route"

patterns-established: []

requirements-completed: [SCENE-01]

# Metrics
duration: ~8min
completed: 2026-09-27
---

# Phase 12 Plan 01: Fix Expedition native-form config gap (D-17/WR-06) Summary

**`readCreateRoomForm` returns `config: null` (not `undefined`) for a game with no settings panel, closing the bug that silently redirected a no-JS Expedition room creation to `/?error=create`**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-09-27T21:10:45Z
- **Completed:** 2026-09-27T21:16:21Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `readCreateRoomForm` now yields `config: null` when the selected game's namespaced `config.{gameId}` field is absent, satisfying `CreateRoomRequestSchema`'s `z.null()` branch for Expedition
- Hanabi's config-reading behaviour is unchanged (still reads `config.hanabi`, still rejects a missing variant)
- A request-level Playwright spec proves a JS-free native POST can create and seat a host in an Expedition room, and that an empty display name still bounces to `/?error=create`

## Task Commits

Each task was committed atomically:

1. **Task 1: Return config null for an absent namespaced config field (D-17/WR-06)** - `547d6a7` (fix, TDD)
2. **Task 2: Request-level native-form e2e for Expedition room creation** - `e0fc18d` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `apps/web/lib/create-room-form.ts` - `readCreateRoomForm`'s config read changed from `?? undefined` to `?? null`, doc comment updated
- `apps/web/lib/create-room-form.test.ts` - Unit tests: Expedition null config, Hanabi variant unchanged, missing Hanabi variant still invalid, another game's hidden field never leaks, missing gameId
- `e2e/expedition-create.spec.ts` - Request-level native-form POST proving Expedition room creation works without JavaScript; new file, extended later by Plan 12-11

## Decisions Made
- Kept the fix scoped to the `?? null` one-line change in `readCreateRoomForm`, per the plan's explicit instruction not to import `LANDING_SETTINGS` from `components/game-ui.tsx` into the server route (would pull React board components into a server-only module)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

A stale `wrangler dev --port 8787` process from a prior (Sep 25) session was still bound to port 8787 and being silently reused by Playwright's `reuseExistingServer` default, causing every WebSocket handshake (not just Expedition's) to fail with "WebSocket is closed before the connection is established." This was pre-existing environment drift, not caused by this plan's changes — confirmed by reproducing the identical failure against a plain Hanabi room through the same request-then-navigate pattern. Killed the stale `wrangler`/`workerd` processes (not part of any task's `files_modified`, no code change); Playwright's own `webServer` block then started a fresh worker and all specs passed. No deviation to the plan's files was needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The D-17/WR-06 gap is closed for both the native-form and JS create paths; Plan 12-11 can now safely enable the Expedition option on the landing picker without hitting this bug
- `e2e/expedition-create.spec.ts` is a new file Plan 12-11 is expected to extend, per this plan's objective

---
*Phase: 12-phaser-shell*
*Completed: 2026-09-27*

## Self-Check: PASSED

- FOUND: apps/web/lib/create-room-form.ts
- FOUND: apps/web/lib/create-room-form.test.ts
- FOUND: e2e/expedition-create.spec.ts
- FOUND commit: 547d6a7
- FOUND commit: e0fc18d
