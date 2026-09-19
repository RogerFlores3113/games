---
phase: 07-variant-support-rainbow-black
plan: 07
subsystem: rules-engine
tags: [hanabi, variant, black, rainbow, clue-popover, e2e]

# Dependency graph
requires:
  - phase: 07-variant-support-rainbow-black
    provides: MAX_SUITS=7 layout budget (07-06), reserving the 7th Play-region suit column at unchanged 50x65 tile size
provides:
  - "BLACK_CONFIG is now 7 suits (5 colours + Rainbow + Black), 65 tiles, max score 35"
  - "Rainbow inside Black keeps its Rainbow-variant rule via a shared rainbowAwareColorClueTouches predicate — a Black colour clue touches rainbow tiles"
  - "A rainbow tile's popover in Black renders a six-entry colour row ending in Black, proven both by render test and live 5-seat e2e"
  - "e2e/variant-black.spec.ts: live proof of the six-colour row's on-screen fit at hand edges (BLACK-POPOVER-FIT), fixed board geometry, a Black clue ringing both rainbow and black tiles on the receiver, and 7 played-stack columns"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "rainbowAwareColorClueTouches hoisted as one shared module-level predicate reused by both RAINBOW_CONFIG and BLACK_CONFIG, instead of duplicating the 'every nameable colour touches rainbow' rule"

key-files:
  created: [e2e/variant-black.spec.ts]
  modified:
    - packages/rules/src/hanabi/variant.ts
    - packages/rules/src/hanabi/variant.test.ts
    - packages/rules/src/hanabi/variant-matrix.test.ts
    - packages/rules/src/hanabi/deck.test.ts
    - packages/rules/src/hanabi/clue-facts.test.ts
    - packages/rules/src/hanabi/legality.test.ts
    - packages/rules/src/hanabi/endgame.ts
    - packages/rules/src/hanabi/termination.property.test.ts
    - apps/web/lib/hanabi-visual-logic.test.ts
    - apps/web/lib/hanabi-discard-logic.test.ts
    - apps/web/lib/hanabi-board-logic.test.ts
    - e2e/start-game.spec.ts
    - e2e/board-fit-black.spec.ts
    - apps/web/lib/clue-popover-render.test.ts
    - apps/web/components/hanabi/CluePopover.tsx

key-decisions:
  - "BLACK_SUITS built as [...BASE_SUITS, \"rainbow\", \"black\"] (ALL_SUITS order); BLACK_CLUABLE = [...BASE_SUITS, \"black\"] so rainbow is excluded from cluableColors but present in suits"
  - "colorClueTouches for both RAINBOW_CONFIG and BLACK_CONFIG now delegate to one hoisted rainbowAwareColorClueTouches(suit, clueColor) function — no per-variant duplication of the 'every nameable colour touches rainbow' rule"
  - "playUntilGameEnds's UI-10 call site raised from 80 to 120 iterations for Black's larger 65-card deck; the shared helper's own default (used elsewhere, base-variant only) was left at 80"

patterns-established: []

requirements-completed: [RULES-02, RULES-03, RULES-14, UI-07]

# Metrics
duration: ~50min
completed: 2026-09-18
---

# Phase 07 Plan 07: Black becomes a 7-suit variant (5 colours + Rainbow + Black) Summary

**BLACK_CONFIG widened from 6 to 7 suits (65 tiles, max score 35) via a shared rainbow-aware colour-clue predicate, with every stale 6-suit/30-point Black assertion updated in the same task and a live 5-seat e2e proving the six-colour popover row and a Black clue ringing both rainbow and black tiles.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 2 completed
- **Files modified:** 16 (1 created, 15 modified)

## Accomplishments
- `BLACK_CONFIG.suits` is now `[red, yellow, green, blue, white, rainbow, black]` (7 suits); `cluableColors` stays 6 entries (excludes rainbow, includes black)
- Hoisted `rainbowAwareColorClueTouches` as one shared predicate used by both `RAINBOW_CONFIG` and `BLACK_CONFIG` — no `variant === "black"` special-casing added anywhere
- Rainbow inside Black keeps its unchanged 10-card (3/2/2/2/1) distribution; Black stays single-copy per rank (5 cards); deck totals 65
- `maxScoreFor` naturally scales to 35 via `config.suits.length * 5` — no code change needed beyond the suit list
- Updated every stale rules/web unit test asserting the old 6-suit/30-point/55-card Black shape, plus `e2e/start-game.spec.ts` (`toHaveCount(7)`, `UI10_VARIANTS` black `{maxScore: 35, columns: 7}`) and `e2e/board-fit-black.spec.ts` (`EXPECTED_BLACK_COLUMNS = 7`)
- Raised `playUntilGameEnds`'s UI-10 call site from 80 to 120 iterations so Black's larger deck can't exhaust the bounded retry loop
- Added a render test proving a rainbow card in Black gets the six-entry colour row (red/yellow/green/blue/white/black), no Rainbow entry
- Corrected `CluePopover.tsx`'s doc comments (no behaviour change) which previously claimed row mode was Rainbow-only
- Added `e2e/variant-black.spec.ts`: a 5-seat live Black game proving the six-colour row's shape/hue/on-screen fit at every visible rainbow tile, an arithmetic edge-fit proof (`BLACK-POPOVER-FIT`), fixed tableau geometry across popover open/close, a black tile's unchanged single-button popover, a live Black clue ringing both rainbow and black tiles on the receiver (and nothing else), 7 ordered played-stack columns, and a discard overlay that fits with no page scroll

## Board and popover measurements

**7-column Black board fit, real browser, 1280x720, 5 seats** (`BOARD-FIT-BLACK`, from `e2e/board-fit-black.spec.ts`):

| Metric | Value |
|---|---|
| Play region width | 382px |
| Rank slot size | 50 x 65px (unchanged) |
| Suit columns rendered | 7 (red, yellow, green, blue, white, rainbow, black) |
| Tableau width | 673px |
| Free horizontal space (1280 - tableau width) | 607px |
| scrollWidth / innerWidth | 1280 / 1280 |
| scrollHeight / innerHeight | 720 / 720 |
| Horizontal or vertical scroll | none |

Raw JSON:
```json
{"viewport":{"width":1280,"height":720},"tableau":{"x":303.5,"y":116,"width":673,"height":399},"playRegion":{"x":312.5,"width":382},"columns":[{"suit":"red","x":317.5,"width":50},{"suit":"yellow","x":371.5,"width":50},{"suit":"green","x":425.5,"width":50},{"suit":"blue","x":479.5,"width":50},{"suit":"white","x":533.5,"width":50},{"suit":"rainbow","x":587.5,"width":50},{"suit":"black","x":641.5,"width":50}],"slot":{"width":50,"height":65},"tokens":{"clueWidth":58,"fuseWidth":27,"deckWidth":55,"discardWidth":130,"turnSignWidth":257},"scrollWidth":1280,"scrollHeight":720,"innerWidth":1280,"innerHeight":720,"freeHorizontalSpacePx":607}
```

This is unchanged from 07-06's AFTER measurement except the `columns` array now genuinely lists all 7 suits (07-06 had already reserved the space but the engine still dealt only 6). The STOP condition (tile shrink, clipping, overflow past 1280, or page scroll) never triggered.

**Six-colour popover fit at hand edges** (`BLACK-POPOVER-FIT`, from `e2e/variant-black.spec.ts`, 1280x720, 5 seats):

```
width=272 leftmostTile.x=89 rightmostTile.x=1127 rightmostTile.width=64 leftFit=true rightFit=true
```

- Popover row width: **272px**
- Leftmost teammate tile x: **89px** → left-anchored flip fits (`272 <= 1280 - 89 = 1191`)
- Rightmost teammate tile x + width: **1127 + 64 = 1191px** → right-anchored flip fits (`272 <= 1191`)
- Both arithmetic checks and the live boundingBox in-viewport assertion passed on every visible rainbow tile popover, across two `--repeat-each=2` runs

No black tile happened to be visible in either measured run (deterministic per-seed content), so the single-button-popover assertion for a black tile fell back to the always-covering unit render test (`clue-popover-render.test.ts`), noted in the e2e's own console output.

## Task Commits

1. **Task 1: Make Black 7 suits in BLACK_CONFIG and update every 6-suit/30-point Black assertion in the same change** - `2a4cc4c` (feat)
2. **Task 2: Six-colour row on a rainbow tile in Black — render test, live e2e** - `ca255ee` (test)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `packages/rules/src/hanabi/variant.ts` — `BLACK_SUITS`/`BLACK_CLUABLE` redefined for 7 suits; `rainbowAwareColorClueTouches` hoisted and shared by `RAINBOW_CONFIG`/`BLACK_CONFIG`; header/config comments updated
- `packages/rules/src/hanabi/variant.test.ts`, `variant-matrix.test.ts`, `deck.test.ts`, `clue-facts.test.ts`, `legality.test.ts` — every 6-suit/30/55-card Black assertion updated to 7/35/65; new assertions for rainbow-inside-Black behaviour
- `packages/rules/src/hanabi/endgame.ts`, `termination.property.test.ts` — comment-only updates (30-point → "Rainbow's 30 / Black's 35-point"; "55-60 cards" → "60-65 cards")
- `apps/web/lib/hanabi-visual-logic.test.ts`, `hanabi-discard-logic.test.ts`, `hanabi-board-logic.test.ts` — updated to 35-point end condition, 7-suit discard order, 6-entry cluableColors excluding rainbow
- `e2e/start-game.spec.ts` — 7 played stacks, `UI10_VARIANTS` black `{maxScore:35, columns:7}`, raised `playUntilGameEnds` cap to 120
- `e2e/board-fit-black.spec.ts` — `EXPECTED_BLACK_COLUMNS = 7`
- `apps/web/lib/clue-popover-render.test.ts` — new six-colour-row render test for Black
- `apps/web/components/hanabi/CluePopover.tsx` — doc comments corrected (no behaviour change)
- `e2e/variant-black.spec.ts` (new) — live 5-seat Black e2e: six-colour row shape/hue/fit, arithmetic edge-fit proof, fixed geometry, black-tile single button, live ring proof, 7 columns, discard overlay fit

## Decisions Made
- `rainbowAwareColorClueTouches` hoisted as a single shared predicate rather than duplicating the "every nameable colour touches rainbow" rule inside `BLACK_CONFIG` — keeps the engine parametrized with zero `variant === "black"` branches outside `variant.ts`
- `playUntilGameEnds`'s shared default (80) was left untouched since `e2e/host-room-controls.spec.ts` calls it with base-variant games only; only the Black-inclusive `UI10_VARIANTS` loop in `start-game.spec.ts` needed the raise to 120

## Deviations from Plan

None - plan executed exactly as written. The STOP condition for the board-fit measurement never triggered (tile size, tableau width, and no-scroll all held). `TeammateCard.tsx`'s doc comment near line 89 (mentioned in the plan's read-list) was already variant-agnostic (`cluableColorsForView(game).includes(card.suit)`) and needed no edit — noted here per the plan's own instruction to just note it if the claim is not false.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Black now plays end to end as the owner specified: 7 suits, 65 tiles, max score 35, Rainbow following its own Rainbow-variant rule inside Black (a Black clue touches rainbow tiles), and the popover correctly offering all 6 nameable colours from a rainbow tile with no Rainbow option ever offered. Base and Rainbow remain byte-identical to their pre-07-07 behaviour (both regression suites, `variant-rainbow.spec.ts` and the base/rainbow rows of `start-game.spec.ts`'s UI-10, stayed green). This closes owner gap 1 for the 07-variant-support-rainbow-black phase.

---
*Phase: 07-variant-support-rainbow-black*
*Completed: 2026-09-18*

## Self-Check: PASSED

- FOUND: packages/rules/src/hanabi/variant.ts
- FOUND: e2e/variant-black.spec.ts
- FOUND: .planning/phases/07-variant-support-rainbow-black/07-07-SUMMARY.md
- FOUND commit: 2a4cc4c
- FOUND commit: ca255ee
