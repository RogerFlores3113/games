---
phase: 07-variant-support-rainbow-black
plan: 12
subsystem: board-layout

# Dependency graph
requires:
  - phase: 07-variant-support-rainbow-black
    provides: "playedRanks/data-played-count/data-next-rank DOM contract and the 383px BOARD_INNER_PX ledger (07-11)"
provides:
  - "layout-budget.ts: TURN_SIGN_WIDTH_PX/HEIGHT_PX (140x156, the old compact-Discard reservation), DISCARD_AREA_WIDTH_PX/HEIGHT_PX (257x223, the old turn-sign leftover-space reservation), discardTileSizeFor(innerWidth, innerHeight, minVisibleTiles) and DISCARD_MIN_VISIBLE_TILES (24) -- DISCARD_TILE_WIDTH_PX/HEIGHT_PX are now derived (33x45), not hardcoded"
  - "Table.tsx: the discard box and the turn sign have swapped screen positions -- Discard is the large region below the token+turn-sign row (full right-hand-column width), the turn sign is the small region beside the token column"
affects: ["07-13 -- any further board-layout work reads DISCARD_AREA_*/TURN_SIGN_* from layout-budget.ts, not the removed DISCARD_COMPACT_*/DISCARD_ROWS constants"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A board region's tile size can be DERIVED from its own fixed area reservation via a pure sizing function (discardTileSizeFor) rather than hardcoded, so a future area resize automatically re-derives a correctly-fitting tile size"

key-files:
  created:
    - e2e/discard-layout.spec.ts
  modified:
    - apps/web/lib/layout-budget.ts
    - apps/web/lib/layout-budget.test.ts
    - apps/web/components/hanabi/Table.tsx
    - apps/web/lib/table-render.test.ts
    - e2e/start-game.spec.ts
    - e2e/board-fit-black.spec.ts
    - e2e/hanabi-table-polish.spec.ts

key-decisions:
  - "TURN_SIGN_WIDTH_PX/HEIGHT_PX and DISCARD_AREA_WIDTH_PX/HEIGHT_PX are literal constants (140/156/257/223), not re-derived formulas disguising the same numbers -- chosen because the swap is a literal 1:1 reservation exchange (each region takes over the OTHER's exact old box), and the real pre-swap measurement (Task 1's BEFORE line: turnSign=257x223, box=140x156) confirms the formula-derived values match the live render byte-for-byte"
  - "discardTileSizeFor is a pure, unit-testable function of (innerWidth, innerHeight, minVisibleTiles) rather than a Table.tsx-local calculation -- keeps layout-budget.ts the single source of truth for every board-region size, consistent with the file's existing playGridHeightPx/tokenRunHeightPx pattern"
  - "DISCARD_MIN_VISIBLE_TILES=24 (not a smaller number that would allow an even larger tile) -- keeps a realistic early/mid-game pile (a 2-player game's max discard count is well under 24 before the deck runs out) fully visible without wrapping/clipping before the fixed box's own overflow-hidden takes over; discard-toggle's DiscardOverlay is still the escape hatch for a genuinely deep pile"

requirements-completed: [BOARD-01, UI-11]

duration: ~90min
completed: 2026-09-18
---

# Phase 7 Plan 12: Swap discard area and turn sign; larger discard tiles (owner gap 4) Summary

**The compact Discard box and the "X's turn" sign swap screen positions -- Discard now fills the large lower area of the board's right-hand side at markedly bigger tiles (16x22 -> 33x45, more than double the old width), and the turn sign moves into the small top-right spot Discard used to occupy -- with every fixed-geometry, 1280x720-fit, drag, group-by-suit, overlay and hover-highlight proof updated to the new arrangement and still passing.**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-09-18 (approx, first file read)
- **Completed:** 2026-09-18
- **Tasks:** 2/2 completed
- **Files modified:** 8 (1 created, 7 modified)

## Discard tile size -- before and after

Real-browser measurement at 1280x720, a live 2-player game, one clue given and one real discard (`e2e/discard-layout.spec.ts`'s `DISCARD_TILE_MEASURE` line):

- **Before** (Task 1 commit `db375e4`, pre-swap): `DISCARD_TILE_MEASURE tile=16x22 area=130x121 box=140x156 turnSign=257x223`
- **After** (Task 2 commit `e5978c6`, post-swap): `DISCARD_TILE_MEASURE tile=33x45 area=247x188 box=257x223 turnSign=140x156`

The discard tile grew from 16x22 to 33x45 (more than 2x wider), the bordered Discard box grew from 140x156 to 257x223 (the exact box the turn sign used to occupy), and the turn sign shrank from 257x223 to 140x156 (the exact box Discard used to occupy) -- a literal 1:1 swap, confirmed live.

## Accomplishments

- `apps/web/lib/layout-budget.ts`: `BOARD_INNER_PX` is now `max(PLAY_AREA_HEIGHT_PX, TOKEN_COLUMN_TOTAL_HEIGHT_PX)` (Discard no longer competes for this ceiling since it moved off the three-side-by-side-regions row); new `RIGHT_ROW_GAP_PX` (16), `TURN_SIGN_WIDTH_PX`/`TURN_SIGN_HEIGHT_PX` (140/156, the old compact-Discard box's own reservation), `DISCARD_AREA_WIDTH_PX`/`DISCARD_AREA_HEIGHT_PX` (257/223, the old turn-sign leftover-space reservation), `DISCARD_MIN_VISIBLE_TILES` (24), and `discardTileSizeFor(innerWidth, innerHeight, minVisibleTiles)` -- a pure function returning the largest aspect-locked (16:22) tile width that still fits at least `minVisibleTiles` tiles, with `DISCARD_TILE_WIDTH_PX`/`DISCARD_TILE_HEIGHT_PX` now derived from it (33/45) instead of hardcoded. `DISCARD_COMPACT_WIDTH_PX`, `DISCARD_COMPACT_PX`, `DISCARD_ROWS` and `discardCompactHeightPx` are removed (grep-clean, confirmed).
- `apps/web/components/hanabi/Table.tsx`: the top row (token column + sibling) now holds the token column and the turn sign (fixed `TURN_SIGN_WIDTH_PX`/`HEIGHT_PX`, `break-words` so a long "{name}'s turn" wraps instead of overflowing); the bordered Discard box (unchanged header/buttons/drop-zone/tile-rendering internals) moved below that row at fixed `DISCARD_AREA_WIDTH_PX`/`HEIGHT_PX`, spanning the full right-hand-column width. All existing behavior -- drag reordering, group-by-suit, the expand-to-overlay button, the drop-zone hover highlight (gap 31's outer-non-clipping/inner-clipping split), the sr-only empty-state copy (gap 24) -- is untouched, just repositioned.
- `apps/web/lib/layout-budget.test.ts`: replaced every `DISCARD_COMPACT_*`/`DISCARD_ROWS`/`discardCompactHeightPx` assertion with `TURN_SIGN_*`/`DISCARD_AREA_*` identity checks (including the literal byte-for-byte 257x223/140x156 swap values) and three new `discardTileSizeFor` unit cases (derives >=24px width from the real area, keeps the aspect ratio, falls back safely on a too-small box).
- `apps/web/lib/table-render.test.ts`: new describe block asserts `turn-sign`'s inline style reserves `TURN_SIGN_WIDTH_PX`/`HEIGHT_PX`, the Discard bordered ancestor reserves `DISCARD_AREA_WIDTH_PX`/`HEIGHT_PX`, and `turn-sign` renders before `discard-pile` in document order.
- `e2e/start-game.spec.ts`: BOARD-01..05 now asserts the turn sign sits right of the clue/fuse column (the old Discard-position assertion) and Discard sits below the deck-count/turn-sign row (the old turn-sign-fills-leftover assertion). The UAT-gap-1 fixed-geometry test adds `turn-sign` to its four-region byte-identical-box proof and adds a fifth proof: the first discard tile's own rendered box is byte-identical measured at pile-count 1 and again at pile-count >=8 (`TARGET_DISCARD_COUNT`).
- `e2e/board-fit-black.spec.ts`: the 5-seat Black worst-case measurement now also records `discardHeight`/`turnSignHeight` in the attached JSON, and asserts the Discard box's bordered ancestor and the turn sign both land on `DISCARD_AREA_*`/`TURN_SIGN_*` exactly (within 1px) at this worst case too.
- `e2e/hanabi-table-polish.spec.ts`: the UAT-gap-37 turn-sign test adds "turn-sign sits above discard-pile" (the sign's bottom edge is at or above the Discard box's top edge).
- `e2e/discard-layout.spec.ts` (new, Task 1, tightened in Task 2): the live `DISCARD_TILE_MEASURE` proof above, plus post-swap assertions (tile width >=1.5x the recorded 16px before-width, Discard's bordered box >=200px wide, Discard sits below deck-count, the turn sign sits right of clue-tokens).

## Task Commits

Each task was committed atomically:

1. **Task 1: Live discard/turn-sign measurement spec (BEFORE layout)** - `db375e4` (test)
2. **Task 2: Swap discard and turn sign; derive a larger discard tile; update every layout test** - `e5978c6` (fix)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `e2e/discard-layout.spec.ts` (new) - Live measurement + post-swap layout proof, `DISCARD_TILE_MEASURE` log line
- `apps/web/lib/layout-budget.ts` - `TURN_SIGN_*`/`DISCARD_AREA_*`/`discardTileSizeFor`/`DISCARD_MIN_VISIBLE_TILES` replace `DISCARD_COMPACT_*`/`DISCARD_ROWS`/`discardCompactHeightPx`
- `apps/web/lib/layout-budget.test.ts` - Updated/new unit tests for the swapped constants and `discardTileSizeFor`
- `apps/web/components/hanabi/Table.tsx` - Discard box and turn sign swap positions in the JSX
- `apps/web/lib/table-render.test.ts` - New render-contract assertions for the swapped reservations
- `e2e/start-game.spec.ts` - BOARD-01..05 position asserts updated; UAT-gap-1 fixed-geometry test covers `turn-sign` and a discard tile's own box
- `e2e/board-fit-black.spec.ts` - Records/asserts `discardHeight`/`turnSignHeight` at the 5-seat Black worst case
- `e2e/hanabi-table-polish.spec.ts` - Turn-sign test adds "sits above discard-pile"

## Decisions Made

See `key-decisions` in frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `e2e/discard-layout.spec.ts`'s drag-then-poll was flaky under the full 15-worker parallel Playwright run**
- **Found during:** the mandated full `npx playwright test` run at the end of Task 2 — the spec passed reliably alone but failed once (then again on a repeat full run) under full-suite CPU contention: the drag's pointer-move sequence occasionally landed short of the app's own drag threshold and the discard never registered within the 10s poll.
- **Fix:** wrapped the drag in a bounded retry (up to 5 attempts, each with its own 5s poll) — the same defensive pattern `e2e/helpers.ts`'s `actWhenConnected` already uses for reconnect-sensitive actions, just applied to a plain drag rather than a click.
- **Verification:** `npx playwright test` (full suite, 67 tests) passed twice in a row after the fix, including the previously-flaky spec.
- **Files modified:** `e2e/discard-layout.spec.ts`
- **Committed in:** `e5978c6` (Task 2)

**2. [Rule 3 - Blocking issue] `e2e/board-fit-black.spec.ts`'s new `DISCARD_AREA_*` assertion initially compared the wrong element**
- **Found during:** first run of the updated spec — `discard-pile` itself is the INNER (padding-excluded, un-bordered) zone per the gap-31 comment in Table.tsx, not the bordered Discard box; comparing its own bounding box to `DISCARD_AREA_WIDTH_PX` failed by exactly the box's own padding (10px).
- **Fix:** measured `discard-pile`'s direct parent (the bordered box) via `.locator("..")`, matching the existing `play-zone`-vs-`playRegionBox` pattern already used earlier in the same file.
- **Verification:** the corrected assertion passes within 1px at the 5-seat Black worst case.
- **Files modified:** `e2e/board-fit-black.spec.ts`
- **Committed in:** `e5978c6` (Task 2)

---

**Total deviations:** 2 auto-fixed (both Rule 3, blocking test-correctness issues discovered while running the plan's own mandated verification). No architectural changes, no user decision required.

## Issues Encountered

None beyond the deviations above. `npm test` (1010/1010), `npx tsc -b apps/web packages/rules packages/schema apps/worker` (clean), and `npx playwright test` (full suite, 67/67, run twice for stability) all passed after Task 2.

## Screenshot verification

A live 5-seat Black game in progress (one clue given, four discards) was driven via a throwaway Playwright script (not committed — ad hoc verification only) against the manually-started dev servers, and screenshotted at 1280x720: **`/tmp/07-12-after.png`**. Visual confirmation: Discard fills the large lower area with substantially bigger tiles (grouped-by-suit-sized, legible identities), the turn sign ("Eli's turn") sits in the small top-right spot beside the tokens, no clipping or overlap anywhere, deck counter and tokens unchanged.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `layout-budget.ts`'s stable board-region contract for any future work: `TURN_SIGN_WIDTH_PX`/`HEIGHT_PX` (the small top-right spot) and `DISCARD_AREA_WIDTH_PX`/`HEIGHT_PX` (the large lower area) are the two constants to read — `DISCARD_COMPACT_*`/`DISCARD_ROWS` no longer exist.
- `discardTileSizeFor` is available for any future board-region that wants a self-sizing tile derived from its own reserved area, rather than a hardcoded pixel size.
- Both dev servers (web :3100, worker :8787) were restarted in the background after Task 2's full Playwright run per executor rules and confirmed listening.

---
*Phase: 07-variant-support-rainbow-black*
*Completed: 2026-09-18*

## Self-Check: PASSED
All claimed files (`e2e/discard-layout.spec.ts`, `apps/web/lib/layout-budget.ts`, `apps/web/lib/layout-budget.test.ts`, `apps/web/components/hanabi/Table.tsx`, `apps/web/lib/table-render.test.ts`, `e2e/start-game.spec.ts`, `e2e/board-fit-black.spec.ts`, `e2e/hanabi-table-polish.spec.ts`) and commits (`db375e4`, `e5978c6`) verified present on disk / in git log.
