---
phase: 06-game-interface
plan: 01
subsystem: ui
tags: [typescript, vitest, hanabi, derivation-layer, redaction]

# Dependency graph
requires:
  - phase: 04-live-hanabi-table
    provides: HanabiView wire contract, hanabi-board-logic.ts's D-12 client-safe disable predicates
  - phase: 03-hanabi-rules-engine
    provides: variantConfig, maxScoreFor, MAX_FUSES, checkHanabiGameEnd's fixed evaluation order
provides:
  - luminosityStepFor, candidateDisplayFor (D-08/D-12/D-15 own-hand-safe clue-memory display)
  - touchedCardIdsFromLatestClue, newlyCompletedStacks (D-14/D-11 transient-highlight triggers)
  - clueTouchIdsForTarget (D-17, added to hanabi-board-logic.ts)
  - disabledReasonFor, endReasonForView, END_REASON_COPY, deckCountText, teammatesInTurnOrder (D-18/D-20/D-04/D-01)
  - CLUE_HIGHLIGHT_MS, STACK_FLASH_MS constants
affects: [06-02, 06-03, 06-04, 06-05, 06-06, 06-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Own-hand helpers typed to CardFacts only (HanabiCardView['facts']), never a card type with suit/rank — D-15 identity boundary is now compile-time, not just discipline"
    - "clueTouchCountForTarget reimplemented as clueTouchIdsForTarget(...).length so there is exactly one touch rule shared by count and id call sites"
    - "disabledReasonFor/endReasonForView dispatch through the engine's own exported constants (MAX_FUSES, maxScoreFor, variantConfig) and hanabi-board-logic's existing client-safe predicates, never re-deriving legality"

key-files:
  created:
    - apps/web/lib/hanabi-visual-logic.ts
    - apps/web/lib/hanabi-visual-logic.test.ts
  modified:
    - apps/web/lib/hanabi-board-logic.ts
    - apps/web/lib/hanabi-board-logic.test.ts

key-decisions:
  - "CardFacts/HistoryEntry type aliases derived via indexed-access types (HanabiCardView['facts'], HanabiView['history'][number]) inside hanabi-visual-logic.ts rather than exported from packages/rules, keeping the wire contract frozen per the plan's Interfaces block"
  - "clueTouchCountForTarget's body replaced with a one-line delegation to the new clueTouchIdsForTarget so the touch rule has a single source of truth"
  - "disabledReasonFor's identity-tripwire-adjacent design: never imports or calls canPlay/canDiscard/canClue, verified by a zero-count grep in acceptance criteria"

patterns-established:
  - "D-15 own-hand identity boundary enforced by two mechanisms simultaneously: type signature (CardFacts has no suit/rank fields) and a runtime Proxy tripwire test that throws on any out-of-set key access"

requirements-completed: [UI-01, UI-04, UI-05, UI-08, UI-10, RULES-11]

# Metrics
duration: ~20min
completed: 2026-09-17
---

# Phase 6 Plan 1: Pure Derivation Layer Summary

**Ten pure, unit-tested functions in `apps/web/lib` (luminosity steps, candidate/confirmed display, clue-touch ids, disabled reasons, end reason, deck text, teammate turn order, stack-completion diff) that every later Phase 6 component will render from, with the D-15 own-hand identity boundary enforced at both the type level and by a runtime Proxy tripwire test.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-17T18:30:00Z (session-local)
- **Completed:** 2026-09-17T18:34:37Z (session-local)
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- Built the entire D-23 pure derivation layer the web Vitest project can actually unit-test (no DOM environment available)
- Proved D-15 (own-hand identity never leaks) with both a type-level guarantee (`CardFacts` has no `suit`/`rank` fields) and a runtime Proxy identity tripwire test
- Consolidated the clue-touch rule: `clueTouchCountForTarget` is now defined in terms of the new `clueTouchIdsForTarget`, so there is one touch predicate instead of two independently-maintained ones
- Preserved all three Phase 4 disabled-reason copy strings verbatim (`"No clue tokens left"`, `"Clue tokens are full — you can't discard"`, `"That clue wouldn't touch any of {name}'s cards"`)

## Task Commits

Each task was committed atomically (TDD RED/GREEN pairs):

1. **Task 1: Clue-memory derivations** — `a8bb156` (test, RED) → `674e552` (feat, GREEN)
2. **Task 2: Action/turn/end derivations** — `5abd496` (test, RED) → `355b67c` (feat, GREEN)

_No refactor commits were needed — GREEN implementations required no follow-up cleanup._

## Files Created/Modified
- `apps/web/lib/hanabi-visual-logic.ts` - New module: `luminosityStepFor`, `candidateDisplayFor`, `touchedCardIdsFromLatestClue`, `newlyCompletedStacks`, `disabledReasonFor`, `endReasonForView`, `END_REASON_COPY`, `deckCountText`, `teammatesInTurnOrder`, `CLUE_HIGHLIGHT_MS`, `STACK_FLASH_MS`
- `apps/web/lib/hanabi-visual-logic.test.ts` - Full behavior coverage plus the D-15 identity tripwire (28 tests)
- `apps/web/lib/hanabi-board-logic.ts` - Added `clueTouchIdsForTarget`; `clueTouchCountForTarget` reimplemented on top of it
- `apps/web/lib/hanabi-board-logic.test.ts` - Added `clueTouchIdsForTarget` describe block (7 tests, including a rainbow case and a cross-check against `clueTouchCountForTarget`)

## Decisions Made
- `CardFacts`/`HistoryEntry` type aliases live in `hanabi-visual-logic.ts` via indexed-access types over `HanabiCardView`/`HanabiView`, not as new exports from `packages/rules` — keeps the frozen wire contract untouched (`git diff --stat packages/` is empty)
- `teammatesInTurnOrder` implemented via a rotation-index sort (`(idx - yourIndex - 1 + length) % length`) rather than array-splicing, so seats missing from `seatOrder` naturally sort to the end via `Number.POSITIVE_INFINITY`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed noUncheckedIndexedAccess strict-mode type errors in the GREEN implementation**
- **Found during:** Task 1, first `tsc -b apps/web` run after the GREEN commit's initial draft
- **Issue:** `facts.possibleSuits[0]`/`facts.possibleRanks[0]` and `history[i]` are typed as possibly `undefined` under the project's `noUncheckedIndexedAccess` tsconfig option, causing 5 compile errors
- **Fix:** Added `?? null` fallbacks for the confirmed-suit/rank reads and an explicit `entry !== undefined` guard in `touchedCardIdsFromLatestClue`'s backward scan
- **Files modified:** apps/web/lib/hanabi-visual-logic.ts
- **Verification:** `npx tsc -b apps/web` exits clean; all 20 Task 1 tests still pass
- **Committed in:** 674e552 (Task 1 GREEN commit — fixed before commit, not a separate commit)

**2. [Rule 1 - Bug] Removed literal `canPlay`/`canDiscard`/`canClue` substrings from a header comment**
- **Found during:** Task 2, acceptance-criteria grep verification
- **Issue:** The file-header comment explaining the module never calls the engine's full-legality checks literally spelled out `canPlay/canDiscard/canClue`, causing the acceptance criterion's `grep -cE "canPlay|canDiscard|canClue"` (expected 0) to return 1
- **Fix:** Reworded the comment to describe the checks generically ("the engine's full-legality checks") without naming the three functions literally
- **Files modified:** apps/web/lib/hanabi-visual-logic.ts
- **Verification:** `grep -cE "canPlay|canDiscard|canClue" apps/web/lib/hanabi-visual-logic.ts` now exits 1 (no match, count 0)
- **Committed in:** 355b67c (Task 2 GREEN commit — fixed before commit, not a separate commit)

---

**Total deviations:** 2 auto-fixed (2 bug fixes, both caught by the plan's own acceptance-criteria verification before commit)
**Impact on plan:** Both fixes were required to meet the plan's own stated acceptance criteria; no scope creep, no architectural change.

## Issues Encountered
None beyond the two auto-fixed items above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Every function named in 06-VALIDATION.md's Wave 0 list exists, is exported, and its behavior is unit-tested; `npx vitest run --project web` (147 tests) and `npx tsc -b apps/web` are both green
- Plans 06-02 through 06-07 (components) can now import this derivation layer directly instead of re-deriving any of luminosity, candidate display, disabled reasons, end reason, deck text, or turn order
- No blockers identified

## Self-Check: PASSED

Verified all claimed files exist and all claimed commits exist in git history (see below).

---
*Phase: 06-game-interface*
*Completed: 2026-09-17*
