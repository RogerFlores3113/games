---
phase: 03-hanabi-rules-engine
plan: 04
subsystem: rules-engine
tags: [typescript, hanabi, redaction, leak-checker, adapter, vitest]

requires:
  - phase: 03-hanabi-rules-engine
    plan: 01
    provides: VariantConfig, HanabiState/HanabiAction type vocabulary, dealInitialHands
  - phase: 03-hanabi-rules-engine
    plan: 02
    provides: clue-facts candidate narrowing, legality predicates, history
  - phase: 03-hanabi-rules-engine
    plan: 03
    provides: applyHanabiAction, checkHanabiGameEnd/currentScore/scoreBand
provides:
  - toHanabiPlayerView per-seat whitelist projection (packages/rules/src/hanabi/projection.ts)
  - checkHanabiViewForLeaks/secretsForHanabiSeat generalized leak checker (packages/rules/src/hanabi/hanabi-leak-check.ts)
  - hanabiGame, the composed five-member GameAdapter (packages/rules/src/hanabi/adapter.ts)
  - Hanabi barrel exports from packages/rules/src/index.ts
  - Second describeAdapterConformance("hanabi", ...) call site in adapter.test.ts
affects: [03-05, 04]

tech-stack:
  added: []
  patterns:
    - "toHanabiPlayerView follows forehead-card.ts's three-part structure exactly: public fields computed once, a fail-closed unseated branch, then a seated branch mapping own slots to identity-lacking literals and other seats' slots to full-identity literals"
    - "Array copies inside the projection use Array.from(...) rather than [...spread] specifically to keep the projection's own forbidden-construct grep (which flags any '...' occurrence) clean, without weakening the no-object-spread discipline it enforces"
    - "The leak checker's typed multiset pass is a second, independent recursive walk (collectIdentityCounts) rather than folded into the structural walk, so an excess {suit,rank} count is detected even when no single object triggers a structural rule"
    - "secretsForHanabiSeat computes allowedIdentityCounts by bumping suit:rank keys from every other seat's hand, the whole discard pile, and one entry per rank 1..topRank implied by each stack — the multiset a viewer may legitimately see elsewhere"

key-files:
  created:
    - packages/rules/src/hanabi/projection.ts
    - packages/rules/src/hanabi/projection.test.ts
    - packages/rules/src/hanabi/hanabi-leak-check.ts
    - packages/rules/src/hanabi/hanabi-leak-check.test.ts
    - packages/rules/src/hanabi/adapter.ts
  modified:
    - packages/rules/src/index.ts
    - packages/rules/src/adapter.test.ts

key-decisions:
  - "Array.from(...) used instead of array-spread syntax inside projection.ts purely to satisfy the plan's own forbidden-construct grep, which matches any '...' substring rather than distinguishing object-spread (forbidden) from array-spread (not the D-07 concern) — no semantic difference from spread, just a grep-safe equivalent"
  - "The typed identity-count check is implemented as its own recursive walk (collectIdentityCounts) separate from the structural-reason walk (walkStructural), matching the plan's explicit 'separate pass' instruction, rather than merging both concerns into one traversal"

requirements-completed: [HIDE-05, RULES-19, FDN-02]

duration: ~35min
completed: 2026-09-16
---

# Phase 3 Plan 4: Redaction Layer and Adapter Composition Summary

**The per-seat whitelist projection, a leak checker generalized for numeric `{suit,rank}` identity (closing WR-03), its eight-canary suite (closing WR-02), and the composed `hanabiGame` adapter wired into the barrel and conformance suite**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3 completed
- **Files modified:** 8 (5 new, 3 modified)

## Accomplishments

- `toHanabiPlayerView` builds every own-hand card as a field-by-field literal that structurally never mentions `suit`/`rank`, and every other seat's card with full identity, computing all public fields (stacks, discard, tokens, deck count, turn, final-round counter, history, score) once before branching (D-07)
- An unseated/unknown viewer fails closed: `yourSeatId` is `null`, `yourHand` is empty, and every hand — including what would have been the viewer's own — renders `hidden: true` with no `suit`/`rank` key, proven by a dedicated test plus a "never sees more than the least-privileged seat" comparison test
- `checkHanabiViewForLeaks` detects Hanabi identity leaks structurally (key presence under `yourHand`, on `hidden === true` objects, and on objects sharing an own card's id) and via a typed `{suit,rank}` multiset comparison — an *excess* count proves a leak, since duplicate identities legitimately exist in a 50/60/60-card deck — closing WR-03's finding that a bare-number scan is unsound against ranks 1-5
- Eight canaries (A-H) each prove the checker can fail on a distinct leak shape, with the clean-baseline test declared first and a non-vacuousness assertion (`expect(deckIdentities.length).toBeGreaterThan(0)`) guarding the one filtered-collection loop in the suite, closing WR-02
- `hanabiGame` composes `dealInitialHands`, `applyHanabiAction`, `toHanabiPlayerView`, and `checkHanabiGameEnd` behind the unmodified five-member `GameAdapter` interface; `createInitialState` sets 8 clue tokens, 0 fuses, a `null` final-round counter, and one `{suit, topRank: 0}` stack per configured suit
- `packages/rules/src/index.ts` now exports `hanabiGame` and the Hanabi type/value vocabulary alongside the still-present, untouched `foreheadCardGame` block (D-02); `adapter.test.ts` runs the shared `describeAdapterConformance` suite a second time against `hanabiGame` and extends the purity file list to cover all 10 hanabi source modules

## Task Commits

1. **Task 1: Per-seat whitelist projection** - `f5b51be` (feat)
2. **Task 2: Generalized leak checker and canary suite** - `b7820e2` (feat)
3. **Task 3: Compose hanabiGame, export it, and extend the conformance suite** - `533fbf3` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `packages/rules/src/hanabi/projection.ts` - `toHanabiPlayerView`, the redaction chokepoint from `HanabiState` to `HanabiView`
- `packages/rules/src/hanabi/projection.test.ts` - Per-variant, per-seat structural key-presence assertions, public-field parity, unseated-viewer fail-closed coverage, purity, non-vacuous loop counters
- `packages/rules/src/hanabi/hanabi-leak-check.ts` - `HanabiSeatSecrets`, `secretsForHanabiSeat`, `checkHanabiViewForLeaks`
- `packages/rules/src/hanabi/hanabi-leak-check.test.ts` - `describe("leak", ...)` clean baseline first, then canaries A-H, then `secretsForHanabiSeat` unit coverage
- `packages/rules/src/hanabi/adapter.ts` - `hanabiGame`, the composed `GameAdapter<HanabiState, HanabiAction>`
- `packages/rules/src/index.ts` - Hanabi export block added alongside the untouched forehead-card block
- `packages/rules/src/adapter.test.ts` - Second `describeAdapterConformance("hanabi", ...)` call site; purity file list extended with all 10 `hanabi/*.ts` modules

## Decisions Made

- Array copies inside `projection.ts` use `Array.from(...)` rather than `[...spread]` so the file's own forbidden-construct grep (which matches any `...` substring, not just object spread) stays at zero without weakening the no-object-spread discipline the grep exists to enforce
- The typed identity-count check is a second, independent recursive walk (`collectIdentityCounts`), matching the plan's explicit instruction to add it "as a separate pass" rather than folding it into the structural-reason walk

## Deviations from Plan

None — plan executed exactly as written. Every `<behavior>` bullet in all three tasks is covered by an explicit test, and every acceptance-criteria grep (forbidden-construct count, `in obj` count ≥ 2, `typed:identity-count-exceeded` count ≥ 1, `describeAdapterConformance(` count = 3, `hanabi/` count ≥ 11, barrel export counts) passes as specified.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

- FOUND: packages/rules/src/hanabi/projection.ts
- FOUND: packages/rules/src/hanabi/projection.test.ts
- FOUND: packages/rules/src/hanabi/hanabi-leak-check.ts
- FOUND: packages/rules/src/hanabi/hanabi-leak-check.test.ts
- FOUND: packages/rules/src/hanabi/adapter.ts
- FOUND commit f5b51be, b7820e2, 533fbf3 in git log

## Next Phase Readiness

- `hanabiGame` is exported from `@games/rules` and passes the shared conformance and purity suites, ready for Phase 4's `game-registration.ts` to register in place of the forehead-card toy
- Full `npm test` (39 files, 415 tests) stays green, including the untouched forehead-card toy suite (D-02)
- `npx tsc -p packages/rules/tsconfig.json --noEmit` exits 0
- `packages/rules/package.json` still declares no `dependencies`
- No blockers for Plan 05

---
*Phase: 03-hanabi-rules-engine*
*Completed: 2026-09-16*
