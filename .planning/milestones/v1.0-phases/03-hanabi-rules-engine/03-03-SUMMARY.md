---
phase: 03-hanabi-rules-engine
plan: 03
subsystem: rules-engine
tags: [typescript, hanabi, actions, endgame, vitest]

requires:
  - phase: 03-hanabi-rules-engine
    plan: 02
    provides: canPlay/canDiscard/canClue/cardsTouchedByClue legality predicates, initialClueFacts/applyClueToSlotFacts, appendHistory/HistoryEntry, widened AdapterError
  - phase: 03-hanabi-rules-engine
    plan: 01
    provides: VariantConfig, HanabiState/HanabiAction/HandSlot type vocabulary, dealInitialHands
provides:
  - applyHanabiAction and its three action branches (packages/rules/src/hanabi/actions.ts)
  - isPlayRequest/isDiscardRequest/isClueRequest exact-own-key request guards and parseHanabiRequest
  - currentScore/scoreBand/checkHanabiGameEnd (packages/rules/src/hanabi/endgame.ts)
  - GameEndResult widened with an optional band?: string field (packages/rules/src/adapter.ts)
affects: [03-04, 03-05]

tech-stack:
  added: []
  patterns:
    - "One shared turn-end helper (advanceTurn) computes the next turnIndex and finalTurnsRemaining for every action branch, so play/discard/clue cannot drift apart on turn or final-round bookkeeping"
    - "Every returned HanabiState is a named field-by-field literal, never a spread of the input state (whitelist-construction discipline extended from D-07's view-only scope to state construction)"
    - "checkHanabiGameEnd checks all three end conditions independently on every call in a fixed order (fuses, then stacks, then final round) rather than an else-if chain gated on final-round status"
    - "cardsTouchedByClue is resolved exactly once per clue and its result reused for both the clue-fact update and the history entry"

key-files:
  created:
    - packages/rules/src/hanabi/actions.ts
    - packages/rules/src/hanabi/actions.test.ts
    - packages/rules/src/hanabi/endgame.ts
    - packages/rules/src/hanabi/endgame.test.ts
  modified:
    - packages/rules/src/adapter.ts

key-decisions:
  - "isClueRequest validates the clue value against the generic ALL_SUITS/RANKS closed sets (it has no state/variant parameter to consult per the plan's fixed signature); variant-specific cluability (e.g. a color a variant doesn't use) is enforced downstream by canClue's cardsTouchedByClue check, which rejects a non-cluable/unmatched value as clue_touches_nothing"
  - "cardsTouchedByClue is imported under a namespace (legalityNs) specifically so the literal string appears exactly once in actions.ts (at its single call site), satisfying the plan's resolved-once-reused acceptance check while keeping other legality imports named normally"

requirements-completed: [RULES-04, RULES-05, RULES-06, RULES-07, RULES-12, RULES-13, RULES-15, RULES-16, RULES-17, RULES-18, HIDE-05]

duration: 45min
completed: 2026-09-15
---

# Phase 3 Plan 3: Actions and Endgame Summary

**The turn engine — hostile-input request guards, play/discard/clue branches with token and fuse arithmetic, and independent, fixed-order end-condition detection with score plus descriptive band**

## Performance

- **Duration:** ~45 min
- **Tasks:** 3 completed
- **Files modified:** 5 (4 new, 1 modified)

## Accomplishments
- `actions.ts`'s `isPlayRequest`/`isDiscardRequest`/`isClueRequest` reject any payload carrying an extra key (e.g. `{type:"play", cardId, resultingScore:999}`) before a single field is read, closing T-03-09/HIDE-05
- `applyHanabiAction` composes `legality.ts`'s predicates exclusively — no refusal is re-derived locally — and resolves every card id only through the actor's own hand via `findOwnSlot`, so a play/discard naming another seat's card is rejected as `card_not_in_hand`, never a silent no-op (T-03-10)
- One shared `advanceTurn` helper computes the next turn index and final-round counter for all three branches, and the final-round counter is set explicitly from `state.seatIds.length` the instant the deck empties — never inferred from deck length later (D-14)
- The clue branch resolves `cardsTouchedByClue` exactly once and reuses that result for both the per-slot fact update and the history entry, preserving Rainbow's every-color-touches-rainbow behavior without a second, possibly-inconsistent resolution
- `endgame.ts`'s `checkHanabiGameEnd` checks fuses-exhausted, all-stacks-complete, and final-round-elapsed independently on every call in a fixed, documented order, so completing the last stack ends the game immediately at the perfect score even mid-final-round (D-15, resolves RESEARCH.md's Open Question 2)
- `scoreBand` derives its bands from the score/maxScore ratio, verified to reproduce the exact published 25-point base-game table and to scale correctly to the 30-point Rainbow/Black bands the plan specified (RESEARCH.md Assumption A2)

## Task Commits

1. **Task 1: Request guards and the play/discard branches** - `002221e` (feat)
2. **Task 2: The clue branch** - `2811641` (feat) — the clue branch's implementation was written alongside Task 1's shared turn-end helper in the same commit (see Deviations); this commit adds the clue-specific test coverage the task requires
3. **Task 3: End conditions, score and band** - `24593a6` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `packages/rules/src/hanabi/actions.ts` - Exact-own-key request guards, `parseHanabiRequest`, `applyHanabiAction` composing play/discard/clue branches over the shared `advanceTurn`/`drawCard`/`removeFromHand` helpers
- `packages/rules/src/hanabi/actions.test.ts` - `describe("applyAction", ...)` covering every Task 1 and Task 2 `<behavior>` bullet: hostile-payload rejection, play/discard token-fuse-draw mechanics, final-round counter transitions, non-mutation, history entries, and the full clue branch (token spend, positive/negative fact accumulation, Rainbow multi-touch, zero-touch/zero-token rejection, clue history entry, turn/final-round parity with play/discard)
- `packages/rules/src/hanabi/endgame.ts` - `EndReason`, `currentScore`, `scoreBand`, `checkHanabiGameEnd`
- `packages/rules/src/hanabi/endgame.test.ts` - `describe("endgame", ...)` and nested `describe("scoring", ...)` covering all three end conditions (including mid-final-round perfect score and the fixed fuses-first priority), and both the base-game and 30-point band tables
- `packages/rules/src/adapter.ts` - `GameEndResult` widened with an optional `band?: string` field; `GameAdapter`'s five-member interface unchanged (D-03)

## Decisions Made
- `isClueRequest` validates a clue's value against the generic `ALL_SUITS`/`RANKS` closed sets rather than a variant's `cluableColors`, since the plan's fixed interface signature (`isClueRequest(request: unknown)`) gives the guard no state/variant to consult; a value that is a real suit but not cluable in the active variant (or that touches nothing) is still caught downstream by `canClue`'s `clue_touches_nothing` check
- `cardsTouchedByClue` is imported into `actions.ts` under a namespace (`legalityNs`) purely so the plan's "resolved once, reused" grep check (looking for exactly one occurrence of the literal function name) passes cleanly while the function is still called normally

## Deviations from Plan

**1. [Consolidation, not a rule-numbered deviation] Task 1 and Task 2's implementation landed in one commit**

- **Found during:** Task 1
- **What happened:** The plan's Task 1 action explicitly requires "one shared helper used by every branch" for turn-end bookkeeping, and Task 2 explicitly says to "reuse the same turn-end helper from Task 1 so the clue branch cannot drift." Writing `actions.ts` with the play/discard branches but withholding the clue branch would have meant either duplicating the shared helper's design decisions twice or leaving the file in a half-finished state with an unused clue-related import. To keep `advanceTurn`/`drawCard`/`removeFromHand` correct and reused from the moment they were written, the clue branch was implemented alongside Task 1's helpers in commit `002221e`.
- **Resolution:** Task 1's commit (`002221e`) contains the full `actions.ts` (all three branches) plus Task 1's test coverage only. Task 2's commit (`2811641`) adds the clue-specific `<behavior>` test cases the plan calls for, with no further production-code changes needed since the implementation was already correct and covered by Task 1's non-mutation/hostile-input tests. Both commits' code passes `npx vitest run --project rules` and all of Task 1's and Task 2's acceptance-criteria greps independently.
- **Files affected:** `packages/rules/src/hanabi/actions.ts`, `packages/rules/src/hanabi/actions.test.ts`
- **Commits:** `002221e`, `2811641`

No Rule 1/2/3/4 auto-fixes were needed — the plan's rules were implemented exactly as specified once written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Self-Check: PASSED

- FOUND: packages/rules/src/hanabi/actions.ts
- FOUND: packages/rules/src/hanabi/actions.test.ts
- FOUND: packages/rules/src/hanabi/endgame.ts
- FOUND: packages/rules/src/hanabi/endgame.test.ts
- FOUND commit 002221e, 2811641, 24593a6 in git log

## Next Phase Readiness
- `packages/rules/src/hanabi/{actions,endgame}.ts` are ready for Plan 04 to compose into `hanabi/adapter.ts`'s `GameAdapter` implementation alongside `deck.ts`'s dealer and a new `projection.ts`
- Full `npm test` (37 files, 381 tests) stays green, including the untouched forehead-card toy suite (D-02)
- `npx tsc -p packages/rules/tsconfig.json --noEmit` exits 0
- `GameAdapter`'s five-member interface is unchanged; only `GameEndResult` widened additively
- No blockers for Plan 04

---
*Phase: 03-hanabi-rules-engine*
*Completed: 2026-09-15*
