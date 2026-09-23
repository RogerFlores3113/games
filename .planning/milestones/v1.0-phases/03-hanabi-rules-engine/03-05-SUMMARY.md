---
phase: 03-hanabi-rules-engine
plan: 05
subsystem: rules-engine
tags: [typescript, hanabi, fast-check, property-testing, vitest]

requires:
  - phase: 03-hanabi-rules-engine
    plan: 01
    provides: VariantConfig, HanabiState/HanabiAction type vocabulary, dealInitialHands
  - phase: 03-hanabi-rules-engine
    plan: 02
    provides: canPlay/canDiscard/canClue legality predicates, history
  - phase: 03-hanabi-rules-engine
    plan: 03
    provides: applyHanabiAction, checkHanabiGameEnd/currentScore/scoreBand
  - phase: 03-hanabi-rules-engine
    plan: 04
    provides: toHanabiPlayerView, checkHanabiViewForLeaks/secretsForHanabiSeat, hanabiGame adapter
provides:
  - enumerateLegalActions/currentActorSeatId/locateAllCards test-only helpers (packages/rules/src/hanabi/test-support.ts)
  - Token and card conservation properties over 200 random games per variant (packages/rules/src/hanabi/conservation.property.test.ts)
  - Redaction property over 200 random games per variant (packages/rules/src/hanabi/redaction.property.test.ts)
  - Termination property with a hard 500-turn bound plus a deterministic RULES-15/16 final-round case (packages/rules/src/hanabi/termination.property.test.ts)
  - Variant matrix sweep over base/rainbow/black (packages/rules/src/hanabi/variant-matrix.test.ts)
  - A fix closing a false-positive leak flag in secretsForHanabiSeat (packages/rules/src/hanabi/hanabi-leak-check.ts)
affects: [04]

tech-stack:
  added: []
  patterns:
    - "enumerateLegalActions builds candidate actions and filters them through legality.ts's exported canPlay/canDiscard/canClue exclusively, never re-deriving legality locally, so every property test is an independent check on the real engine rather than self-confirming (T-03-24)"
    - "locateAllCards represents played cards (which have no surviving minted id once removed from a hand) with a synthetic, collision-free id (\"${suit}:stack:${rank}\") so a card-conservation count never silently shrinks as a game progresses"
    - "Every fast-check property loop counts applied steps (or ended games) in a local counter asserted toBeGreaterThan(0) after fc.assert, closing D-22/WR-02's non-vacuousness requirement"
    - "The deterministic final-round test drives discard-then-clue-fallback moves only (never play), which structurally cannot lose a fuse or complete a stack, so deck exhaustion and the final round are reached without any of the other two end conditions racing it"

key-files:
  created:
    - packages/rules/src/hanabi/test-support.ts
    - packages/rules/src/hanabi/conservation.property.test.ts
    - packages/rules/src/hanabi/redaction.property.test.ts
    - packages/rules/src/hanabi/termination.property.test.ts
    - packages/rules/src/hanabi/variant-matrix.test.ts
  modified:
    - packages/rules/src/adapter.test.ts
    - packages/rules/src/hanabi/hanabi-leak-check.ts

key-decisions:
  - "secretsForHanabiSeat now bumps allowedIdentityCounts once per play/discard history entry, in addition to the existing discard-pile and stack bumps, closing a false-positive leak the redaction property surfaced (see Deviations)"
  - "Variant type is imported from '../adapter' in the new test files, not re-exported from './variant' (variant.ts only re-uses it as a parameter type, it does not export it) — matches how every other hanabi module already imports it"
  - "The deterministic RULES-15/16 case picks discard-then-clue-fallback moves specifically to avoid ever risking a fuse loss or stack completion, isolating the final-round assertions from the other two end conditions"

requirements-completed: [RULES-02, RULES-03, RULES-15, RULES-16, RULES-17, RULES-20, FDN-02]

duration: ~50min
completed: 2026-09-16
---

# Phase 3 Plan 5: Property Tests and Phase Gate Summary

**The four fast-check invariants closing the phase — token/card conservation, redaction, and termination — plus a variant matrix sweep, a real leak-checker bug fixed along the way, and a green four-project suite with a clean typecheck**

## Performance

- **Duration:** ~50 min
- **Tasks:** 3 completed
- **Files modified:** 7 (5 new, 2 modified)

## Accomplishments

- `test-support.ts`'s `enumerateLegalActions` builds every candidate play/discard/clue action and filters it through `legality.ts`'s exported `canPlay`/`canDiscard`/`canClue` exclusively — the file's header states why a private re-derivation would make every property test self-confirming (T-03-24)
- `locateAllCards` accounts for every minted card across deck/hands/discard, plus a synthetic per-rank id for each suit's played cards (since a stack only stores `{suit, topRank}`, not the played cards' real ids) — the card-conservation property asserts the located count equals the variant's true deck size after every step, with no id seen in two places
- Token conservation (clueTokens 0..8, fuses 0..3) and card conservation both hold across 200 random games per variant, asserted after the initial state and after every step including rejected ones
- The redaction property drove 200 random games per variant through `checkHanabiViewForLeaks`/`secretsForHanabiSeat` and immediately surfaced a real bug: a misplayed or discarded card produces both a discard-pile entry and a history log entry carrying the same identity, and `secretsForHanabiSeat` was only counting the discard-pile occurrence — fixed by bumping the allowed-identity multiset once per `play`/`discard` history entry (see Deviations)
- The termination property drives 200 random games per variant to a non-null `checkHanabiGameEnd` within a hard 500-turn bound that fails the test outright (no soft-warn/soft-skip) if breached; a deterministic discard-then-clue-fallback game proves a deck-exhausted game gives every seat exactly one further turn with no hand growing (RULES-15/16), ending with `final_round_elapsed`
- `variant-matrix.test.ts` sweeps base/rainbow/black in one `for` loop: deck size (50/60/55), suit count (5/6/6), max score (25/30/30), a full deterministic seeded game to completion, Rainbow's every-color-touch-plus-never-nameable rule, and Black's cluable-color-plus-single-copy-per-rank consequence — with an explicit `variantsSwept === 3` non-vacuousness assertion
- Phase gate green: `npm test` (43 files, 424 tests across all four Vitest projects, including the untouched forehead-card toy per D-02), `npx tsc -p packages/rules/tsconfig.json --noEmit` clean, `packages/rules/package.json` still declares zero dependencies (FDN-02)

## Task Commits

1. **Task 1: Test-support helpers and the conservation properties** - `e64fbb3` (test)
2. **Task 2: Redaction and termination properties** - `9c63da0` (test) — includes the `hanabi-leak-check.ts` fix (Rule 1)
3. **Task 3: Variant matrix sweep and phase gate** - `66e2337` (test) — includes a `Variant` import-path fix surfaced by `tsc --noEmit`

**Plan metadata:** (this commit)

## Files Created/Modified

- `packages/rules/src/hanabi/test-support.ts` - `currentActorSeatId`, `enumerateLegalActions`, `locateAllCards`
- `packages/rules/src/hanabi/conservation.property.test.ts` - `describe("property: conservation", ...)`; token/card conservation over 200 random games per variant, plus unit coverage of the test-support helpers themselves
- `packages/rules/src/hanabi/redaction.property.test.ts` - `describe("property: redaction", ...)`; no seat's view leaks its own cards over 200 random games per variant
- `packages/rules/src/hanabi/termination.property.test.ts` - `describe("property: termination", ...)`; `MAX_SIMULATED_TURNS`-bounded termination property plus a deterministic RULES-15/16 final-round case
- `packages/rules/src/hanabi/variant-matrix.test.ts` - `describe("variant matrix", ...)`; one sweep over base/rainbow/black covering deck composition, clue touching, and scoring
- `packages/rules/src/adapter.test.ts` - `hanabi/test-support.ts` added to the purity file list
- `packages/rules/src/hanabi/hanabi-leak-check.ts` - `secretsForHanabiSeat` now also bumps the allowed-identity multiset from `play`/`discard` history entries

## Decisions Made

- `secretsForHanabiSeat` bumps identity counts once per `play`/`discard` history entry, independent of and in addition to the existing discard-pile/stack bumps — the correct fix is to recognize history as a second legitimate view of an already-public identity, not to weaken the leak checker's threshold
- `Variant` is imported from `../adapter` in every new test file (matching every existing hanabi module), not from `./variant`, which only consumes the type as a parameter without re-exporting it
- The deterministic RULES-15/16 test drives discard/clue moves only, never play, so it can reach deck exhaustion and the final round without any risk of the other two end conditions (fuse loss, stack completion) racing it

## Deviations from Plan

**1. [Rule 1 - Bug] `secretsForHanabiSeat` undercounted legitimate identity occurrences, producing a false-positive leak**

- **Found during:** Task 2, writing the redaction property test
- **Issue:** `fc.assert` immediately failed with `typed:identity-count-exceeded:blue:4` on the very first random game. A misplayed or discarded card's identity is legitimately visible in TWO places in a view: the current discard pile AND a `history` log entry recording the same play/discard action (D-19 records history as public facts, restated chronologically). `secretsForHanabiSeat` (written in plan 04) only bumped its allowed-identity multiset from the discard pile and the played stacks — it did not know history entries carry the same information a second time. This is exactly the class of bug the roadmap calls "silent": no example test in plan 04 drove real games through `applyHanabiAction` and the leak checker together, so the gap was invisible until plan 05's property test did.
- **Fix:** Added a loop over `state.history` in `secretsForHanabiSeat` bumping the multiset once per `play`/`discard` entry's `{suit, rank}`, matching the extra legitimate occurrence those entries introduce into a view.
- **Files modified:** `packages/rules/src/hanabi/hanabi-leak-check.ts`
- **Commit:** `9c63da0`

**2. [Rule 3 - Blocking issue] Broken `Variant` type import path**

- **Found during:** Task 3's phase-gate `npx tsc -p packages/rules/tsconfig.json --noEmit` run
- **Issue:** `termination.property.test.ts` and `variant-matrix.test.ts` initially imported `type Variant` from `./variant`, which only imports `Variant` as a parameter type from `../adapter` without re-exporting it — `tsc` reported `TS2459: Module "./variant" declares 'Variant' locally, but it is not exported`.
- **Fix:** Changed both imports to `import type { Variant } from "../adapter"`, matching every other hanabi module's import path.
- **Files modified:** `packages/rules/src/hanabi/termination.property.test.ts`, `packages/rules/src/hanabi/variant-matrix.test.ts`
- **Commit:** `66e2337`

No Rule 4 (architectural) deviations — both fixes were local, in-scope corrections to code this plan's own tasks touched or introduced.

## Issues Encountered

None beyond the two deviations above, both resolved within the same task's commit.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

- FOUND: packages/rules/src/hanabi/test-support.ts
- FOUND: packages/rules/src/hanabi/conservation.property.test.ts
- FOUND: packages/rules/src/hanabi/redaction.property.test.ts
- FOUND: packages/rules/src/hanabi/termination.property.test.ts
- FOUND: packages/rules/src/hanabi/variant-matrix.test.ts
- FOUND commit e64fbb3, 9c63da0, 66e2337 in git log

## Next Phase Readiness

- `hanabiGame` is fully proven by both example and property tests and remains exported from `@games/rules`, ready for Phase 4's `game-registration.ts` to register in place of the forehead-card toy
- Full `npm test` (43 files, 424 tests) is green across all four Vitest projects, including the untouched forehead-card toy suite (D-02) — Phase 4 is the one that deletes the toy, not this plan
- `npx tsc -p packages/rules/tsconfig.json --noEmit` exits 0
- `packages/rules/package.json` still declares zero dependencies (FDN-02)
- Phase 3 (Hanabi Rules Engine) is now complete — all five plans executed
- No blockers for Phase 4

---
*Phase: 03-hanabi-rules-engine*
*Completed: 2026-09-16*
