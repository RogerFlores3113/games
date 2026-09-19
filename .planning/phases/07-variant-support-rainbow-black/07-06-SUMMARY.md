---
phase: 07-variant-support-rainbow-black
plan: 06
subsystem: ui
tags: [layout-budget, playwright, e2e, board-fit, hanabi]

# Dependency graph
requires:
  - phase: 07-variant-support-rainbow-black
    provides: MAX_SUITS=6 layout budget from 06.2, Black variant selectable end to end
provides:
  - "e2e/board-fit-black.spec.ts: a permanent real-browser measurement of the Black board's suit-column fit at 1280x720/1024 wide, 5 seats"
  - "layout-budget.ts MAX_SUITS widened 6 -> 7 (width-only), reserving a 7th Play-region column ahead of 07-07's engine change"
  - "07-UI-SPEC.md addendum recording the MAX_SUITS supersession and the rainbow-row-in-Black consequence"
affects: [07-07 (7-suit Black engine change lands into an already-widened board)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "layout-budget.ts's own rule: 'the ledger holds measured numbers... if the render disagrees with the ledger, the ledger is corrected to the render' extended to width, not just height"

key-files:
  created: [e2e/board-fit-black.spec.ts]
  modified: [apps/web/lib/layout-budget.ts, apps/web/lib/layout-budget.test.ts, apps/web/lib/table-render.test.ts, .planning/phases/07-variant-support-rainbow-black/07-UI-SPEC.md]

key-decisions:
  - "MAX_SUITS widened 6 -> 7 by spending WIDTH only (PLAY_AREA_WIDTH_PX 328 -> 382, +54px); no height constant changed, rank slots stay 50x65 per owner's binding decision"
  - "e2e/start-game.spec.ts required no edits — it pins only heights (TABLE_BAND_MIN_PX), never the Play/tableau width, so the widening did not touch any existing e2e width assertion"

patterns-established: []

requirements-completed: [RULES-03, UI-07]

# Metrics
duration: ~25min
completed: 2026-09-18
---

# Phase 07 Plan 06: Widen the board for a 7th suit column Summary

**MAX_SUITS widened 6 -> 7 in layout-budget.ts (width-only, +54px), proven fitting 1280x720/1024 wide in a real browser before the engine starts dealing 7 suits in Black.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 completed
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- Added `e2e/board-fit-black.spec.ts`, a permanent real-browser measurement spec (column-inside-Play-region containment, slot size, tableau/scroll fit) at 1280x720 and 1024 wide
- Recorded the BEFORE (MAX_SUITS=6) and AFTER (MAX_SUITS=7) board geometry from real browser runs
- Widened `PLAY_AREA_WIDTH_PX` from 328px to 382px by bumping `MAX_SUITS` 6 -> 7, at unchanged 50x65 rank-slot size
- Proved the widened board still fits 1280x720 and 1024 wide with no scroll, via the new spec plus the existing UI-11/gap-11/"UAT gap 1 fixed geometry" e2e proofs
- Appended a dated addendum to `07-UI-SPEC.md` superseding its stale "no change to `MAX_SUITS`" line

## Before/After Board-Fit Measurements (real browser, 1280x720, 5 seats, Black variant)

| Metric | Before (MAX_SUITS=6) | After (MAX_SUITS=7) |
|---|---|---|
| Play region width | 328px | 382px |
| Rank slot size | 50 x 65px | 50 x 65px (unchanged) |
| Suit columns rendered | 6 (red, yellow, green, blue, white, black) | 6 (unchanged — engine still deals 6; 07-07 makes it 7) |
| Tableau width | 619px | 673px |
| Free horizontal space (1280 - tableau width) | 661px | 607px |
| scrollWidth / innerWidth | 1280 / 1280 | 1280 / 1280 |
| scrollHeight / innerHeight | 720 / 720 | 720 / 720 |
| Horizontal or vertical scroll | none | none |
| Fit at 1024 wide | no horizontal overflow, all columns inside Play region | no horizontal overflow, all columns inside Play region |

Raw baseline JSON (`BOARD-FIT-BLACK`, before, MAX_SUITS=6):
```json
{"viewport":{"width":1280,"height":720},"tableau":{"x":330.5,"y":116,"width":619,"height":399},"playRegion":{"x":339.5,"width":328},"columns":[{"suit":"red","x":344.5,"width":50},{"suit":"yellow","x":398.5,"width":50},{"suit":"green","x":452.5,"width":50},{"suit":"blue","x":506.5,"width":50},{"suit":"white","x":560.5,"width":50},{"suit":"black","x":614.5,"width":50}],"slot":{"width":50,"height":65},"tokens":{"clueWidth":58,"fuseWidth":27,"deckWidth":54,"discardWidth":130,"turnSignWidth":257},"scrollWidth":1280,"scrollHeight":720,"innerWidth":1280,"innerHeight":720,"freeHorizontalSpacePx":661}
```

Raw after JSON (`BOARD-FIT-BLACK`, after, MAX_SUITS=7, engine still dealing 6 suits — 07-07 adds the 7th):
```json
{"viewport":{"width":1280,"height":720},"tableau":{"x":303.5,"y":116,"width":673,"height":399},"playRegion":{"x":312.5,"width":382},"columns":[{"suit":"red","x":317.5,"width":50},{"suit":"yellow","x":371.5,"width":50},{"suit":"green","x":425.5,"width":50},{"suit":"blue","x":479.5,"width":50},{"suit":"white","x":533.5,"width":50},{"suit":"black","x":587.5,"width":50}],"slot":{"width":50,"height":65},"tokens":{"clueWidth":58,"fuseWidth":27,"deckWidth":54,"discardWidth":130,"turnSignWidth":257},"scrollWidth":1280,"scrollHeight":720,"innerWidth":1280,"innerHeight":720,"freeHorizontalSpacePx":607}
```

Board arithmetic held exactly as the plan predicted: `playColumnWidthPx(6)` = 328 -> `playColumnWidthPx(7)` = 382 (+54px = one 50px rank slot + one 4px `SUIT_COLUMN_GAP_PX`). Tableau grew by the same +54px (619 -> 673), confirming the tableau has no fixed width of its own and widens automatically as `<section data-testid="tableau">`'s flex-row content grows. Heights were byte-identical before/after (399px tableau height, `TABLE_BAND_MIN_PX` unchanged) — the STOP condition never triggered.

Also captured at the UI-11 worst case (5 seats, Black variant, deep discard pile): `teammates-band` 114px, `tableau` 399px, `bottomRow` 193px — matches the existing ledger (`TEAMMATE_BAND_PX`/`TABLE_BAND_MIN_PX`/`OWN_BAND_PX`) exactly, confirming the width change had zero effect on any height-based band.

## Task Commits

1. **Task 1: Real-browser BASELINE measurement of the Black board at 1280x720, 5 seats (before any change)** - `eee6c79` (test)
2. **Task 2: Reserve seven suit columns (MAX_SUITS = 7) at unchanged tile size and prove the fit** - `f9c4224` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `e2e/board-fit-black.spec.ts` - permanent Black board-fit measurement spec (5 seats, 1280x720 + 1024 wide, column-inside-Play-region containment, slot size, scroll/overflow)
- `apps/web/lib/layout-budget.ts` - `MAX_SUITS` 6 -> 7, `PLAY_AREA_WIDTH_PX` comment updated, file-header ledger gained a gap-closure entry
- `apps/web/lib/layout-budget.test.ts` - `playColumnWidthPx(MAX_SUITS)` expectation updated to 382, added `MAX_SUITS`/rank-slot-unshrunk guard, added a 1024px tableau-width-fit test at 7 columns
- `apps/web/lib/table-render.test.ts` - added a `SEVEN_SUIT_GAME` fixture, extended the Play-region-width assertion to 5/6/7 suits
- `.planning/phases/07-variant-support-rainbow-black/07-UI-SPEC.md` - appended a dated addendum superseding the stale "no change to `MAX_SUITS`" line

## Decisions Made
- MAX_SUITS widened by spending WIDTH only per the owner's binding decision ("just widen the board a bit"); no height constant, no tile-size constant touched
- `e2e/start-game.spec.ts` needed no edits: a grep across the file confirmed it pins only `TABLE_BAND_MIN_PX` (a height), never `PLAY_AREA_WIDTH_PX` or any tableau-width literal, so nothing in it referenced the old 328px/619px values

## Deviations from Plan

None - plan executed exactly as written. The STOP condition (board cannot fit 1280 without shrinking) never triggered; both the predicted arithmetic and the real-browser measurement matched exactly (328 -> 382, tableau 619 -> 673, 607px of free horizontal space remaining against the 1280px floor).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The Play region now reserves a 7th suit column at full 50x65 tile size, proven fitting 1280x720 and 1024 wide with no scroll in a real browser. Plan 07-07 can now widen the Black variant's engine to deal 7 suits (five colours + Rainbow + Black) without needing any board-layout change of its own — the reservation is already in place. `EXPECTED_BLACK_COLUMNS` in `e2e/board-fit-black.spec.ts` is intentionally still 6 (the engine has not yet changed); 07-07 bumps it to 7 in the same task that changes the engine, per this plan's own header comment.

---
*Phase: 07-variant-support-rainbow-black*
*Completed: 2026-09-18*

## Self-Check: PASSED

- FOUND: e2e/board-fit-black.spec.ts
- FOUND: apps/web/lib/layout-budget.ts
- FOUND: .planning/phases/07-variant-support-rainbow-black/07-06-SUMMARY.md
- FOUND commit: eee6c79
- FOUND commit: f9c4224
