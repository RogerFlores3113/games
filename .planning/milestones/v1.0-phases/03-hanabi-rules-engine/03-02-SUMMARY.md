---
phase: 03-hanabi-rules-engine
plan: 02
subsystem: rules-engine
tags: [typescript, hanabi, legality, clue-facts, history, vitest]

requires:
  - phase: 03-hanabi-rules-engine
    plan: 01
    provides: VariantConfig, HanabiState/HanabiAction/HandSlot/ClueFacts type vocabulary, dealInitialHands
provides:
  - HistoryEntry union and appendHistory (packages/rules/src/hanabi/history.ts)
  - initialClueFacts/applyClueToSlotFacts candidate-set narrowing (packages/rules/src/hanabi/clue-facts.ts)
  - canPlay/canDiscard/canClue/cardsTouchedByClue/activeSeatId/isActorsTurn/findOwnSlot pure legality predicates (packages/rules/src/hanabi/legality.ts)
  - Widened AdapterError union (8 members) in packages/rules/src/adapter.ts
affects: [03-03, 03-04, 03-05]

tech-stack:
  added: []
  patterns:
    - "Legality predicates are exported pure functions returning { legal: true } | { legal: false; reason }, never invoking applyAction (D-13)"
    - "Clue-fact candidate narrowing is always derived by filtering the current candidate set through the variant's clue-touch predicate, never by assigning a suit/rank directly from a clue value (D-09)"
    - "History entries are appended via spread ([...history, entry]), never mutated in place"

key-files:
  created:
    - packages/rules/src/hanabi/history.ts
    - packages/rules/src/hanabi/history.test.ts
    - packages/rules/src/hanabi/clue-facts.ts
    - packages/rules/src/hanabi/clue-facts.test.ts
    - packages/rules/src/hanabi/legality.ts
    - packages/rules/src/hanabi/legality.test.ts
  modified:
    - packages/rules/src/hanabi/state.ts
    - packages/rules/src/adapter.ts

key-decisions:
  - "HanabiView.history concretized as HistoryEntryView[] (non-readonly plain-object mirror of HistoryEntry), matching the readonly-state/plain-view split established in plan 01"
  - "AdapterError widened to 8 members exactly as specified in the plan interfaces block; GameAdapter's five-member interface left untouched (D-03), confirmed apps/worker's mapAdapterError (no-parameter, constant-returning) is unaffected"

requirements-completed: [RULES-08, RULES-09, RULES-10, RULES-20]

duration: 25min
completed: 2026-09-16
---

# Phase 3 Plan 2: Legality, Clue Facts, and History Summary

**Three pure, side-effect-free modules — typed legality predicates, clue-fact candidate narrowing, and public-facts-only turn history — that `applyAction` will compose in plan 03**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3 completed
- **Files modified:** 8 (6 new, 2 modified)

## Accomplishments
- `history.ts` gives `HanabiState.history` its real type, replacing plan 01's `unknown` placeholder; a draw entry is structurally incapable of carrying a card's identity (D-19)
- `clue-facts.ts` derives candidate-set narrowing generically from the variant's clue-touch predicate, correctly preserving Rainbow's two-candidate ambiguity after a positive color clue and its stronger negative-clue elimination (RESEARCH.md Pitfall 3)
- `legality.ts` exports `canPlay`/`canDiscard`/`canClue` plus supporting predicates as pure functions callable without invoking `applyAction` (D-13), with one shared `cardsTouchedByClue` resolver used by both clue types and the zero-touch check (Pitfall 2), and `canDiscard` correctly rejects (not no-ops) at 8 clue tokens (Pitfall 1/RULES-10)
- `AdapterError` widened to 8 members per D-03; `GameAdapter`'s five-member interface is unchanged and `apps/worker`'s `mapAdapterError` (parameterless, constant-returning) is confirmed unaffected

## Task Commits

1. **Task 1: Public-facts-only turn history** - `d86ecf0` (feat)
2. **Task 2: Clue-fact candidate narrowing** - `0f20790` (feat)
3. **Task 3: Typed legality predicates** - `425458a` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `packages/rules/src/hanabi/history.ts` - `HistoryEntry` discriminated union (play/discard/clue/draw), `appendHistory`
- `packages/rules/src/hanabi/history.test.ts` - Append-only, key-presence (`"suit" in`/`"rank" in`), monotonic turn number tests
- `packages/rules/src/hanabi/clue-facts.ts` - `initialClueFacts`, `applyClueToSlotFacts` (predicate-derived narrowing, no hardcoded suit assignment)
- `packages/rules/src/hanabi/clue-facts.test.ts` - Base/Rainbow/Black narrowing cases, Rainbow's two-candidate and stronger-elimination cases, non-mutation
- `packages/rules/src/hanabi/legality.ts` - `MAX_CLUE_TOKENS`/`MAX_FUSES`, `Legality`, `activeSeatId`, `isActorsTurn`, `findOwnSlot`, `cardsTouchedByClue`, `canPlay`/`canDiscard`/`canClue`
- `packages/rules/src/hanabi/legality.test.ts` - All refusal reasons asserted exactly, all three variants for clue-touch, game-over/turn/token/hand-ownership edge cases, purity (deep-equal snapshot)
- `packages/rules/src/hanabi/state.ts` - `HistoryEntry` placeholder replaced with a real re-export/import from `history.ts`; `HanabiView.history` concretized as `HistoryEntryView[]`
- `packages/rules/src/adapter.ts` - `AdapterError` widened to 8 members with a comment noting D-03's five-member interface is unchanged

## Decisions Made
- `HistoryEntryView` added to `state.ts` as the non-readonly plain-array mirror of `HistoryEntry`, matching every other `*View` type's split in that file
- Legality guard order kept identical to `forehead-card.ts:128-138` (turn check, then game-over, then action-specific) for consistency with the existing conformance suite's rejection-path exercises

## Deviations from Plan

None — plan executed exactly as written. One wording-only adjustment: reworded a comment in `legality.ts` that originally named `canClueColor`/`canClueRank` literally (to explain why they don't exist), since the plan's own acceptance-criteria grep for those exact strings would otherwise have matched the comment itself. No logic change.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Self-Check: PASSED

- FOUND: packages/rules/src/hanabi/history.ts
- FOUND: packages/rules/src/hanabi/history.test.ts
- FOUND: packages/rules/src/hanabi/clue-facts.ts
- FOUND: packages/rules/src/hanabi/clue-facts.test.ts
- FOUND: packages/rules/src/hanabi/legality.ts
- FOUND: packages/rules/src/hanabi/legality.test.ts
- FOUND commit d86ecf0, 0f20790, 425458a in git log

## Next Phase Readiness
- `packages/rules/src/hanabi/{history,clue-facts,legality}.ts` are ready for plan 03 (`actions.ts`/`endgame.ts`) to compose against; `applyAction` must call these same legality predicates rather than re-implementing checks
- Full `npm test` (35 files, 342 tests) stays green, including the untouched forehead-card toy suite (D-02)
- `npx tsc -p packages/rules/tsconfig.json --noEmit` exits 0
- No blockers for Plan 03

---
*Phase: 03-hanabi-rules-engine*
*Completed: 2026-09-16*
