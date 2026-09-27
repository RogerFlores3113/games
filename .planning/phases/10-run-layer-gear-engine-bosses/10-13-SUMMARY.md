---
phase: 10-run-layer-gear-engine-bosses
plan: 13
subsystem: rules-engine
tags: [expedition, boss-twist, objectives, trick-taking, typescript, vitest]

# Dependency graph
requires:
  - phase: 10-run-layer-gear-engine-bosses
    plan: 02
    provides: "boss/boss-def.ts's BossDef type, run/run-rules.ts's RuleModifier/objectiveAssignment hook"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 05
    provides: "run/lifecycle.ts's dealAttempt/assignFaceDown (A5 seeded round-robin), run/rng.ts's STREAMS.faceDown"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 07
    provides: "run/run-actions.ts's applyRunAction, run/run-test-support.ts's setupRun/advanceTo"
provides:
  - "boss/blind-orders.ts: blindOrders BossDef — Thick Fog, flips objectiveAssignment to face-down only; the actual assignment stays lifecycle.ts's existing assignFaceDown"
  - "boss/mutiny.ts: mutiny BossDef — Mutiny, fails the camp (\"mutiny\") exactly when completedTricks[0].winnerSeatId is the expedition leader"
affects: [10-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Thick Fog needed no new assignment logic at all: flipping objectiveAssignment to 'face-down' is sufficient because dealAttempt (Plan 10-05) already calls the run layer's own seeded assignFaceDown whenever the composed hook answers that way — the boss twist is a pure one-line hook override, same shape as Monsoon's whisperAllowed"
    - "campPhase (camp.ts) derives 'objective-pick' purely from any objective having a null ownerSeatId; since assignFaceDown runs inside dealAttempt before the caller ever observes the camp, a freshly dealt Thick Fog camp is never observably in the objective-pick phase — proven directly by capturing state at advanceTo's own 'objective-pick' return point (which only asserts 'dealt', not 'in the objective-pick sub-phase') and checking currentWindow there"
    - "Mutiny's failureChecks hook reads only CampState.expeditionLeaderSeatId and completedTricks[0] — the leader recorded at deal time, never whoever actually led trick 1's play (Machete's commandeer can change the acting leader without affecting who Mutiny checks)"

key-files:
  created:
    - packages/rules/src/expedition/boss/blind-orders.ts
    - packages/rules/src/expedition/boss/mutiny.ts
    - packages/rules/src/expedition/boss/fog-mutiny.test.ts
  modified: []

key-decisions:
  - "fog-mutiny.test.ts proves the Thick Fog 'never passes through objective-pick' truth by calling advanceTo(..., \"objective-pick\", catalog) (which returns as soon as the camp is dealt, regardless of campPhase sub-window) and then asserting currentWindow(...) === \"between-tricks\" directly on that state, rather than relying on advanceTo's between-tricks target (which would silently succeed even if an objective-pick step were needed, since its loop just resolves whichever window is open)"
  - "The attempt-1-vs-attempt-2 determinism/divergence pair (behavior list item 4) is tested directly against assignFaceDown with a single fixed CampState fixture and two attemptNumber arguments (1 and 1 for determinism, 1 and 2 for divergence) rather than driving a real failed-then-replayed run — mirrors 10-12's precedent of testing eclipseDeckFor directly with no RunState at all for a pure-function property"
  - "Mutiny's three hook-level truths (empty before any trick, fires on a leader-won trick 0, stays empty when trick 0 is won by someone else even if the leader later wins trick 1) are tested by spreading a real dealt CampState with a synthetic completedTricks array, calling rulesFor(run).failureChecks(spread) directly — no real trick needs to be played for these three cases, only the end-to-end 50-seed integration test drives real play"

requirements-completed: [BOSS-01]
# BOSS-01 ("Each boss camp applies one twist from the provisional v1 set") is
# now complete at the boss-def level: Monsoon (10-12), Eclipse (10-12), Thick
# Fog (this plan), Mutiny (this plan) all exist as BossDef catalogue entries.
# Registering all four in the actual catalog (Plan 10-14's registry file) is
# that later plan's job, not a precondition of this requirement per the
# plan's own <success_criteria>: "BOSS-01 is complete across 10-12 and
# 10-13: four provisional twists, each one file."

# Metrics
duration: ~20min
completed: 2026-09-27
---

# Phase 10 Plan 13: Thick Fog and Mutiny Boss Twists Summary

**Thick Fog flips a single objectiveAssignment hook to "face-down", letting run/lifecycle.ts's existing seeded A5 round-robin (assignFaceDown) do all the real work; Mutiny fails the camp with a single failureChecks override the instant completedTricks[0].winnerSeatId equals the camp's expedition leader — completing all four provisional BOSS-01 twists across 10-12/10-13.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-27
- **Tasks:** 1/1 completed
- **Files created:** 3

## Accomplishments

- `boss/blind-orders.ts`'s `blindOrders` is a single-hook `BossDef` (`objectiveAssignment: () => () => "face-down"`), proven at 3, 4, and 5 seats: after the whole table readies and the deal happens, every objective has a non-null `ownerSeatId` and `currentWindow` reads `"between-tricks"` directly — the camp is never observably in the `objective-pick` sub-phase. At 5 seats with camp 3's 3 objectives, exactly 3 distinct seats each own exactly one.
- Direct `assignFaceDown` calls prove determinism (same seed/campNumber/attemptNumber gives the same assignment) and that attempt 2's assignment (drawn from `STREAMS.faceDown(3, 2)`) differs from attempt 1's for the fixture seed — matching the plan's stated behavior without needing a real failed-then-replayed run.
- `boss/mutiny.ts`'s `mutiny` is a single-hook `BossDef` (`failureChecks` override reading `expeditionLeaderSeatId`/`completedTricks[0]`), proven at the hook level directly (empty before any trick; contains `"mutiny"` on a spread camp whose first completed trick's winner is the leader; stays empty when trick 0 is won by someone else even if the leader wins trick 1) and end-to-end: driving 50 seeded camp-3 attempts (`"m0"`..`"m49"`) with first-legal plays until trick 0 completes finds at least one seed where the leader wins trick 0 and the run settles `"failed"` in that same `applyRunAction` call.
- `npx vitest run --project rules packages/rules/src/expedition/boss/fog-mutiny.test.ts` — 10 tests passed; full `packages/rules/src/expedition/boss` suite — 3 files, 22 tests passed; full `packages/rules/src/expedition` suite — 27 files, 434 tests passed; `npm run typecheck` exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Thick Fog and Mutiny boss twists** - `5788cab` (feat)

## Files Created/Modified

- `packages/rules/src/expedition/boss/blind-orders.ts` - Thick Fog `BossDef` (objectiveAssignment only)
- `packages/rules/src/expedition/boss/mutiny.ts` - Mutiny `BossDef` (failureChecks only)
- `packages/rules/src/expedition/boss/fog-mutiny.test.ts` - contract tests for both twists per the plan's behavior list

## Decisions Made

- Thick Fog's "never passes through objective-pick" truth is verified by capturing state at `advanceTo`'s `"objective-pick"` target (which returns as soon as the camp is dealt, not once the objective-pick sub-window is confirmed open) and directly asserting `currentWindow(...) === "between-tricks"` there — a stronger check than merely observing that `advanceTo(..., "between-tricks", ...)` succeeds, since that helper's loop would silently resolve an objective-pick step too if one were needed.
- The attempt-1-vs-attempt-2 divergence check is proven directly against `assignFaceDown` with one fixed `CampState` fixture and two `attemptNumber` arguments, rather than driving a real failed-then-replayed run, mirroring 10-12's precedent for `eclipseDeckFor`'s pure-function tests.
- Mutiny's three hook-level truths are tested by spreading a real dealt `CampState` with a synthetic `completedTricks` array and calling `rulesFor(run).failureChecks(spread)` directly, reserving the real 50-seed driven-play loop for the one end-to-end truth that actually requires it (a real settle happening in the same action a trick completes in).

## Deviations from Plan

None - plan executed exactly as written. No bugs, missing critical functionality, or blocking issues were found in the Plan 02/05/07 code this plan depends on (BossDef, dealAttempt/assignFaceDown, run-actions, run-test-support).

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/boss/blind-orders.ts
- FOUND: packages/rules/src/expedition/boss/mutiny.ts
- FOUND: packages/rules/src/expedition/boss/fog-mutiny.test.ts
- FOUND: 5788cab (git log)

## Verification

- `npx vitest run --project rules packages/rules/src/expedition/boss/fog-mutiny.test.ts` — 10 tests passed
- `npx vitest run --project rules packages/rules/src/expedition/boss` — 3 files, 22 tests passed
- `npx vitest run --project rules packages/rules/src/expedition` — 27 files, 434 tests passed
- `npm run typecheck` — exits 0
- `grep -c 'id: "blind-orders"' packages/rules/src/expedition/boss/blind-orders.ts` — 1
- `grep -c '"face-down"' packages/rules/src/expedition/boss/blind-orders.ts` — 2
- `grep -c 'id: "mutiny"' packages/rules/src/expedition/boss/mutiny.ts` — 1
- `grep -c '"mutiny"' packages/rules/src/expedition/boss/mutiny.ts` — 4
