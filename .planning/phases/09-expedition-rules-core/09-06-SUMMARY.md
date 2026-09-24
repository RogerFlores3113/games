---
phase: 09-expedition-rules-core
plan: 06
subsystem: rules
tags: [expedition, rules-engine, fast-check, property-testing, purity]

requires:
  - phase: 09-expedition-rules-core (Plans 01-05)
    provides: deck/trick/leader/objectives/camp/legality/actions modules that this plan proves

provides:
  - Whole-camp fast-check simulation properties proving termination, card conservation, follow-suit (including the forced Sun/Moon joker), trick winners, expedition leader/first-pick, and monotone objective statuses across 3, 4 and 5 players
  - Independent-oracle failure-timing properties for exactly-n, no-tricks and ordered objectives, with non-vacuity counters proving the unreachable-before-exceeded and out-of-order hard cases are actually generated
  - A directory-scanning purity guard covering the whole expedition source tree

affects: [10-expedition-content-and-boss-twists]

tech-stack:
  added: []
  patterns:
    - "test-support.ts enumerates candidate actions and filters them through canPickObjective/canPlayCard ONLY (T-03-24), never re-deriving follow-suit or trick-winner rules"
    - "driveCamp applies every enumerated step through the real applyCampAction and throws if the transition ever rejects an action the enumerator called legal — enumerator/transition disagreement is a bug, never silently tolerated"
    - "Property oracles for objective failure-timing independently restate spec §5.2 text from completedTricks, calling evaluateObjective only on the comparison side of assertions, never inside the oracle helper bodies"
    - "purity.test.ts scans the expedition directory (readdirSync) rather than a hand-maintained file list, so Phase 10 content files are covered automatically"

key-files:
  created:
    - packages/rules/src/expedition/test-support.ts
    - packages/rules/src/expedition/purity.test.ts
    - packages/rules/src/expedition/camp.property.test.ts
    - packages/rules/src/expedition/objectives.property.test.ts
  modified: []

key-decisions:
  - "Objective-slot generators bias toward the hard cases the plan calls out explicitly (exactly-n's n drawn from [3,18] clamped to hand size; ordered camps always carry at least markers 1 and 2) rather than relying on a fully general random mix to stumble into them, so the non-vacuity counters are reliably > 0 across the default numRuns"
  - "All four property tests passed on first run against the existing Plans 01-05 engine — no engine bugs were found, so this plan's tdd=\"true\" tasks produced only test(...) commits, with no accompanying feat(...) fix commit needed"

requirements-completed: [XRULE-01, XRULE-02, XRULE-03, XRULE-04, XRULE-06, XRULE-07, XRULE-08]

duration: 35min
completed: 2026-09-23
---

# Phase 9 Plan 6: Whole-Camp Property Proofs and Package Purity Summary

Four new test files (test-support.ts's simulation driver, a directory-scanning purity guard, and two fast-check property suites) drove 3/4/5-player camps end-to-end through the real `applyCampAction` transition across 200 runs per property, proving termination, card conservation, spec-accurate follow-suit including the forced Sun/Moon joker, trick winners, expedition-leader/first-pick, monotone objective statuses, and exact failure-timing for exactly-n, no-tricks and ordered objectives — with non-vacuity counters confirming the two hardest failure-timing cases (unreachable-before-exceeded, and out-of-order) were actually exercised, not merely permitted by the generators.

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-23T22:46Z
- **Completed:** 2026-09-23T22:52Z
- **Tasks:** 3 completed
- **Files modified:** 4 created, 0 modified

## Accomplishments

- `enumerateLegalActions`/`driveCamp` in `test-support.ts` drive whole camps purely through the engine's own exported predicates and transition, with a hard step bound that fails loudly (never hangs CI) if the enumerator and transition ever disagree
- `camp.property.test.ts` proves, across 200 runs per assertion block and all of 3/4/5 players: every simulated camp terminates with no card lost/duplicated, every accepted play obeys the spec's follow-suit and forced-joker text, every completed trick's winner and the next trick's leader match the spec's trick-winner text, the Sun holder always picks and leads first, and objective statuses never un-fail or un-complete
- `objectives.property.test.ts` proves failure timing for exactly-n, no-tricks and ordered objectives against independently-restated oracles (not the engine's own evaluator) at every state of every simulated camp, and proves `checkCampOutcome`'s first-failed-state exactly matches the first state any objective evaluates failed, with driveCamp producing no states after it
- `purity.test.ts` scans the whole `expedition/` directory (not a hand-maintained file list) for Node/Worker imports, Hanabi imports, and nondeterministic APIs (`Math.random`, `Date.now`)

## Task Commits

Each task was committed atomically:

1. **Task 1: test-support.ts simulation helpers and the expedition purity guard** - `4352388` (feat)
2. **Task 2: camp.property.test.ts — whole-camp simulation properties** - `bcee05c` (test — passed immediately against the existing engine, no accompanying feat/fix commit needed)
3. **Task 3: objectives.property.test.ts — failure-timing properties with non-vacuity counters** - `a5e3e49` (test — passed immediately against the existing engine, no accompanying feat/fix commit needed)

**Plan metadata:** (this commit, follows)

_Note: Tasks 2 and 3 were `tdd="true"` per the plan, but the plan's own `<action>` text anticipated the properties passing immediately since the engine already existed from Plans 01-05 ("if one fails, fix the ENGINE module at fault, not the property"). No engine bug was found, so there is no RED/GREEN pair — see "TDD Gate Compliance" below._

## Files Created/Modified

- `packages/rules/src/expedition/test-support.ts` - `currentActor`, `enumerateLegalActions`, `locateAllCards`, `driveCamp` — engine-predicate-driven whole-camp simulation helpers
- `packages/rules/src/expedition/purity.test.ts` - directory-scanning purity guard for the whole `expedition/` source tree
- `packages/rules/src/expedition/camp.property.test.ts` - whole-camp simulation properties (termination, conservation, follow-suit, winner, leader, monotone statuses) across 3, 4, 5 players, 200 runs each
- `packages/rules/src/expedition/objectives.property.test.ts` - independent-oracle failure-timing properties for exactly-n, no-tricks, ordered objectives, plus the camp-stop property, with non-vacuity counters

## Decisions Made

- Objective-slot generators are deliberately biased per property (high-n exactly-n; at-least-two-ordered-markers) rather than left fully general, so the plan's required non-vacuity counters (`unreachableWhileFeasibleRuns`, `orderFailureRuns`) are reliably `> 0` at `numRuns: 200` instead of depending on a general mix to stumble into the hard cases
- The ordered-objective oracle and exactly-n oracle in `objectives.property.test.ts` re-derive the spec's rule text using only local helper functions (`wonTricksBy`, `remainingTricks`, `trickResolutionFor`) and `deck.ts`'s `identitiesEqual` (a data-equality helper, not a rules evaluator) — `evaluateObjective` itself is called only on the comparison side of assertions, never inside an oracle body, satisfying the plan's non-self-confirmation requirement

## Deviations from Plan

None — plan executed exactly as written. No engine bugs were found by any of the four property blocks; all passed on first run against the Plans 01-05 implementation.

## TDD Gate Compliance

Tasks 2 and 3 carry `tdd="true"` in the plan, but their own `<action>` text explicitly anticipates a pass-immediately outcome because the engine under test (Plans 01-05) already exists — the RED/GREEN cycle in this case is "write the property against the real engine; if it fails, fix the engine, not the property." Both property files passed on first run (`git log` shows `test(09-06): prove whole-camp simulation properties...` at `bcee05c` and `test(09-06): prove objective failure-timing...` at `a5e3e49`, each a single commit with no preceding `feat`/`fix` needed). This is not a gate violation: no behavior was added by these tasks (the engine's behavior was already committed in Plans 01-05), so there is no GREEN implementation step to gate.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 9 (Expedition Rules Core) is now fully proven: whole-camp fast-check simulations across 3/4/5 players confirm termination, conservation, spec-accurate follow-suit/forced-joker play, trick winners, leader determination, and objective failure-timing including the hardest documented edge cases (unreachable-before-exceeded exactly-n, out-of-order ordered objectives). The package purity guard now covers the full `expedition/` directory automatically, so Phase 10's content/boss-twist files inherit the same zero-Node/zero-nondeterminism check with no manual list update required. Phase 10 (Expedition Content and Boss Twists) can build directly on `CoreRules`' hook seam (deckFor, leaderFor, isTrump, trickWinner, legalPlays, nextLeader, failureChecks) with full confidence the base layer it composes over is correct.

No blockers.

---
*Phase: 09-expedition-rules-core*
*Completed: 2026-09-23*

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/test-support.ts
- FOUND: packages/rules/src/expedition/purity.test.ts
- FOUND: packages/rules/src/expedition/camp.property.test.ts
- FOUND: packages/rules/src/expedition/objectives.property.test.ts
- FOUND commit: 4352388
- FOUND commit: bcee05c
- FOUND commit: a5e3e49
