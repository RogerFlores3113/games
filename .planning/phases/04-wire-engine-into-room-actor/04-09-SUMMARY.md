---
phase: 04-wire-engine-into-room-actor
plan: 09
subsystem: ui
tags: [hanabi, display-derivation, gap-closure, vitest]

# Dependency graph
requires:
  - phase: 04-wire-engine-into-room-actor
    provides: HanabiBoard.tsx and hanabi-board-logic.ts view-derived display helpers (bandForView pattern) from earlier 04 plans
provides:
  - MAX_FUSES re-exported from @games/rules barrel (packages/rules/src/index.ts)
  - fusesRemainingForView(view) display helper in apps/web/lib/hanabi-board-logic.ts
  - HanabiBoard fuse counter now renders remaining fuses, not fuses used
affects: [04-UAT, phase-06-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "View-derived display values (bandForView, fusesRemainingForView) live in hanabi-board-logic.ts and only call/derive from engine-exported constants/functions, never re-implement engine thresholds client-side"

key-files:
  created: []
  modified:
    - packages/rules/src/index.ts
    - apps/web/lib/hanabi-board-logic.ts
    - apps/web/lib/hanabi-board-logic.test.ts
    - apps/web/components/HanabiBoard.tsx

key-decisions:
  - "fusesRemainingForView added alongside bandForView in hanabi-board-logic.ts (not a new file) since both are view-derived display-only values reading from the same HanabiView"
  - "MAX_FUSES added to the existing legality re-export line in the rules barrel rather than a new export line, keeping the barrel's existing grouping"

patterns-established: []

requirements-completed: [RT-01]

# Metrics
duration: 12min
completed: 2026-09-16
---

# Phase 04 Plan 09: Fuse Counter Display Direction Fix Summary

**Fixed the Hanabi board's "fuses left" counter to count down from 3 to 0 instead of up from 0 to 3, via a new `fusesRemainingForView` display helper and a `MAX_FUSES` barrel export — engine/wire `fuses` semantics (fuses USED) untouched.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-16T20:04:00Z
- **Completed:** 2026-09-16T20:16:00Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments

- Closed the single UAT gap (test 10, minor) from `04-UAT.md`: the fuse counter now reads correctly as fuses remaining
- `MAX_FUSES` is now part of `@games/rules`'s public surface, available to any future client-side display derivation without hardcoding `3`
- Regression tests lock in the display value for fresh game (3), one misplay (2), and fuse game over (0), including one case importing `MAX_FUSES` from `@games/rules` directly to prove the barrel export

## Task Commits

Each task was committed atomically:

1. **Task 1: Export MAX_FUSES and add fusesRemainingForView with regression tests** - `f13af78` (feat, TDD RED→GREEN)
2. **Task 2: Render remaining fuses on the board and run the gate** - `3670ce2` (fix)

**Plan metadata:** (this commit, docs)

_Note: Task 1 was TDD (`tdd="true"`) — the failing tests were written and confirmed to fail (RED) before implementing `MAX_FUSES` export and `fusesRemainingForView` (GREEN) in the same commit per the plan's action instructions._

## Files Created/Modified

- `packages/rules/src/index.ts` - Added `MAX_FUSES` to the existing legality re-export line
- `apps/web/lib/hanabi-board-logic.ts` - Added `fusesRemainingForView(view)` helper (`MAX_FUSES - view.fuses`), doc comment clarifies `view.fuses` counts fuses used on the wire
- `apps/web/lib/hanabi-board-logic.test.ts` - Added `describe("fusesRemainingForView", ...)` with 4 cases (fresh game=3, one misplay=2, fuse game over=3 used=0, `MAX_FUSES`-based case=0)
- `apps/web/components/HanabiBoard.tsx` - Fuse-tokens paragraph now renders `{fusesRemainingForView(game)} fuses left` instead of `{game.fuses} fuses left`; `data-testid="fuse-tokens"` and styling unchanged

## Decisions Made

- `fusesRemainingForView` was added to the existing `hanabi-board-logic.ts` module (which already hosts `bandForView`) rather than a new file, keeping all view-derived display helpers in one place
- No clamping added in `fusesRemainingForView` — the engine guarantees `fuses` never exceeds `MAX_FUSES`, so `MAX_FUSES - view.fuses` cannot go negative in practice; adding a defensive `Math.max(0, ...)` was considered and rejected as unnecessary per the plan's explicit "do not clamp" instruction

## Deviations from Plan

None - plan executed exactly as written. One out-of-scope pre-existing issue was discovered and logged (not fixed) per the scope boundary rule — see below.

### Out-of-Scope Discovery (logged, not fixed)

`npx tsc -b` (and `npm run typecheck`) fails at the repo root with `TS5083: Cannot read file '/home/rflor/games/tsconfig.json'` — no root composite `tsconfig.json` exists in this repo (confirmed via `git log` that it has never existed; not caused by this plan's changes). Verification was completed instead via `npx tsc -b apps/web packages/rules packages/schema apps/worker`, which type-checked clean. Logged with a suggested fix in `.planning/phases/04-wire-engine-into-room-actor/deferred-items.md`.

## Issues Encountered

None beyond the out-of-scope `tsc -b` root-config gap noted above, which did not block verification.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- UAT gap for the fuse counter direction is closed; `04-UAT.md`'s test 10 can be re-verified as passing
- `MAX_FUSES` being part of the public `@games/rules` barrel is available for Phase 6's designed UI work if it needs the same constant
- The logged root-`tsconfig.json` gap does not block this plan's completion but should be picked up before any future plan or CI step relies on a bare `npm run typecheck` / `tsc -b` succeeding

---
*Phase: 04-wire-engine-into-room-actor*
*Completed: 2026-09-16*

## Self-Check: PASSED

All created/modified files confirmed on disk; both task commits (`f13af78`, `3670ce2`) confirmed in `git log`.
