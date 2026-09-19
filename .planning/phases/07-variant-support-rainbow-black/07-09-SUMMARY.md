---
phase: 07-variant-support-rainbow-black
plan: 09
subsystem: ui

# Dependency graph
requires:
  - phase: 07-variant-support-rainbow-black
    provides: variantConfig/colorClueTouches (07-07), which 07-09 reworks internally without changing its public signatures
provides:
  - "Per-suit SuitRule table (colorTouch: named/every/never) in variant.ts, the single source of every suit's colour-clue behaviour"
  - "cluableColors, colorClueTouches, rankCountsFor derived generically from SuitRule -- no more black-specific string comparisons"
  - "colorClueOptionsFor(view, suit) client helper -- the single source of which colour buttons a tile offers"
  - "Black tile popover reduced to rank-only; rainbow tile popover in Black shows exactly the five nameable colours"
  - "Server-side refusal of a colour clue naming black, proven through the worker room-action path"
affects: [07-10 (Black direction/counts), any future Hanabi UI touching colour clue legality or the popover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Suit behaviour declared once per-suit in a frozen SUIT_RULES table (colorTouch: named/every/never) rather than as per-variant special-cased predicates"
    - "colorClueOptionsFor(view, suit) as the one client-side function deriving which colour buttons a tile offers, filtering cluableColors through the engine's own colorClueTouches"

key-files:
  created: []
  modified:
    - packages/rules/src/hanabi/variant.ts
    - packages/rules/src/index.ts
    - packages/rules/src/hanabi/variant.test.ts
    - packages/rules/src/hanabi/variant-matrix.test.ts
    - packages/rules/src/hanabi/legality.test.ts
    - packages/rules/src/hanabi/clue-facts.test.ts
    - apps/worker/src/room-state.test.ts
    - apps/web/lib/hanabi-board-logic.ts
    - apps/web/lib/hanabi-board-logic.test.ts
    - apps/web/components/hanabi/TeammateCard.tsx
    - apps/web/components/hanabi/CluePopover.tsx
    - apps/web/lib/clue-popover-render.test.ts
    - e2e/variant-black.spec.ts
    - e2e/helpers.ts

key-decisions:
  - "Black is never a nameable colour clue and no colour clue ever touches a Black tile, in any variant -- reverses plan 07-07's opposite behaviour per the owner's explicit UAT correction, and supersedes 07-CONTEXT.md D-08"
  - "Rainbow is unchanged: every nameable colour touches it, it is never nameable itself, and a black clue (being illegal) never touches it either"
  - "variant.ts's three hand-written VariantConfig objects were replaced by one generic buildVariantConfig(variant, suits) driven by a single per-suit SUIT_RULES table, eliminating every suit === \"black\" string comparison in the module's logic"
  - "Black's rank counts (SINGLE_RANK_COUNTS, one of each rank) were left untouched in this plan -- 07-10 is explicitly the plan that changes Black's counts and adds play direction"

patterns-established:
  - "A variant's colour-clue behaviour for a suit is a data-table lookup (colorTouch: named/every/never), not a code branch on the suit's literal name"
  - "colorClueOptionsFor is the one place the UI derives which colour buttons a tile offers -- TeammateCard/CluePopover never re-derive nameability themselves"

requirements-completed: [RULES-03, RULES-14, UI-07]

duration: ~55min
completed: 2026-09-19
---

# Phase 7 Plan 09: Black is never colour-cluable Summary

**Reversed plan 07-07's "Black is nameable" mistake: Black is now never a nameable colour clue and no colour clue ever touches a Black tile, anywhere in the engine, worker, or UI, proven by rewritten unit/render tests and a live Playwright e2e spec.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-09-18T19:39:00Z (approx, first file read)
- **Completed:** 2026-09-19T02:46:00Z
- **Tasks:** 2/2 completed
- **Files modified:** 14

## Accomplishments
- `packages/rules/src/hanabi/variant.ts` restructured around one frozen per-suit `SUIT_RULES` table (`colorTouch: "named" | "every" | "never"`), replacing three hand-written `VariantConfig` objects and deleting `rainbowAwareColorClueTouches`/`BLACK_CLUABLE` entirely — no `=== "black"` comparison remains anywhere in the file's logic.
- `canClue`/`applyHanabiAction`/the worker's `applyGameAction` all refuse `{type:"color", value:"black"}` in the Black variant with `clue_color_not_nameable`, even when the target holds a Black tile — proven at the engine, action, and worker-room levels.
- `colorClueOptionsFor(view, suit)` added to `hanabi-board-logic.ts` as the single, variant-agnostic source of which colour buttons a tile offers; `TeammateCard`/`CluePopover` now derive `colorOffered`/`colorRow` from it instead of the old `cluableColorsForView(game).includes(card.suit)` check.
- A Black tile's popover renders only the number button — no `tile-clue-color`, no `clue-color-row`. A rainbow tile's popover in Black renders exactly the five nameable colours (no Black entry), matching Rainbow's own popover.
- `e2e/variant-black.spec.ts` rewritten: live proof of the five-colour row, the rank-only Black popover, and that giving a nameable colour clue from a rainbow tile rings the rainbow tile and the named suit's tiles on the receiver but never a Black tile.

## Task Commits

Each task was committed atomically:

1. **Task 1: Engine and server — Black is never nameable and never touched by a colour clue** - `5adef27` (fix)
2. **Task 2: Popover — five-colour rainbow row, number-only Black tile, live e2e proof** - `1f490b6` (fix)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `packages/rules/src/hanabi/variant.ts` - Per-suit `SuitRule`/`ColorTouch` table drives `cluableColors`, `colorClueTouches`, `rankCountsFor` generically
- `packages/rules/src/index.ts` - Exports `ColorTouch`, `SuitRule` types
- `packages/rules/src/hanabi/variant.test.ts`, `variant-matrix.test.ts`, `legality.test.ts`, `clue-facts.test.ts` - Rewritten to assert Black is never nameable/never touched
- `apps/worker/src/room-state.test.ts` - New Black-variant case: colour clue naming "black" against a hand holding a Black tile is refused
- `apps/web/lib/hanabi-board-logic.ts` - Adds `colorClueOptionsFor(view, suit)`
- `apps/web/lib/hanabi-board-logic.test.ts`, `clue-popover-render.test.ts` - New/rewritten cases for the five-colour row and rank-only Black popover
- `apps/web/components/hanabi/TeammateCard.tsx` - Colour gating derived from `colorClueOptionsFor`; adds `colorOffered`
- `apps/web/components/hanabi/CluePopover.tsx` - New `colorOffered` prop gates colour rendering entirely off
- `e2e/variant-black.spec.ts` - Live proof rewritten for the reversed behaviour; retry helper now waits for both a visible rainbow tile and a visible Black tile
- `e2e/helpers.ts` - Doc comments updated to name the third popover shape (Black: rank only); no logic change (existing count-guards already handle it)

## Decisions Made
- Black keeps its silver colour/art, no variant label, no ruled-out clue information, no rank numerals on card faces (owner binding decisions, unaffected by this plan's changes).
- Black's rank distribution (`SINGLE_RANK_COUNTS`) and deck size (65 cards, max score 35) were deliberately left unchanged — that is explicitly plan 07-10's scope (Black becomes a reversed suit: three 5s, two each of 4/3/2, one 1).

## Deviations from Plan

**1. [Rule 1 - Bug] Fixed a vacuously-failing sanity assertion in the new e2e test**
- **Found during:** Task 2, first e2e run
- **Issue:** A sanity check written as `expect(expectedTouched).toEqual(expect.not.arrayContaining(blackIds))` is vacuously false whenever `blackIds` is empty (an empty array is always a subset, so `not.arrayContaining([])` never passes) — this failed the very first e2e run even though the actual behaviour under test (no Black tile ever rings) was correct.
- **Fix:** Replaced with an explicit per-id `expect(expectedTouched).not.toContain(id)` loop over any Black tile ids found on the target.
- **Files modified:** `e2e/variant-black.spec.ts`
- **Verification:** `npx playwright test e2e/variant-black.spec.ts e2e/variant-rainbow.spec.ts` — all 4 tests pass.
- **Committed in:** `1f490b6` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug, self-authored in this same plan's execution)
**Impact on plan:** No scope creep — fixed a test-authoring bug in code written for this task, before committing.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Engine, worker, and UI all agree: Black is never colour-cluable, in every code path that was touched by 07-07's original (incorrect) implementation.
- Plan 07-10 (Black becomes a reversed suit: 3x5s down to 1x1, direction-aware play order, 70-card deck, discard/turn-sign swap) can build directly on this plan's `SUIT_RULES`/`SuitRule.colorTouch` table — the table's `rankCounts` field is exactly where 07-10 should introduce Black's new distribution, and a `direction` field can be added to `SuitRule` alongside it without touching `colorTouch` again.
- No blockers. Dev servers were restarted per executor_rules after the last task (see below) and confirmed listening.

---
*Phase: 07-variant-support-rainbow-black*
*Completed: 2026-09-19*

## Self-Check: PASSED

All created/modified key files and both task commits (`5adef27`, `1f490b6`) verified present on disk / in git log.
