---
phase: 10-run-layer-gear-engine-bosses
plan: 18
subsystem: expedition-run-gear
tags: [gear, toolkit, testing, gap-closure]
dependency-graph:
  requires: [10-15, 10-16, 10-17]
  provides: [GEAR-02-fixed, ENG-02-harness-hardened]
  affects: [packages/rules/src/expedition/run/toolkit.ts, packages/rules/src/expedition/gear/gear.contract.test.ts]
tech-stack:
  added: []
  patterns:
    - "assertLegalUseContract: shared module-level assertion helper applied over EVERY accepted (seat, targets) combination, not just the first"
key-files:
  created: []
  modified:
    - packages/rules/src/expedition/run/toolkit.ts
    - packages/rules/src/expedition/run/toolkit.test.ts
    - packages/rules/src/expedition/gear/objective-gear.test.ts
    - packages/rules/src/expedition/gear/gear.contract.test.ts
    - packages/rules/src/expedition/run/run-test-support.ts
    - packages/rules/src/expedition/run/run-test-support.test.ts
    - .planning/REQUIREMENTS.md
decisions:
  - "toolkit.ts's replace-objective kind guard widened to accept both win-card and ordered, matching camp.ts's isCardBearingSlot and reroll.ts's canTarget (CR-01)"
  - "gear.contract.test.ts's findUsableFixture -> findUsableFixtures (WR-01): every accepted target combination is applied and asserted, not just the first"
  - "enumerateLegalRunActions now enumerates use-gear candidates in the objective-pick window in addition to pre-deal and between-tricks (WR-01), so run.property.test.ts now drives objective-pick gear"
metrics:
  duration: "~25min"
  completed: "2026-09-27"
---

# Phase 10 Plan 18: Compass win-card crash fix + WR-01 harness hardening Summary

Fixed a shipped-but-crashing GEAR-02 defect (Compass/reroll threw on win-card objectives, its most common target) and closed the WR-01 test-harness blind spot that let it through: the whole-run enumerator never offered objective-pick-window gear, and the gear contract suite only ever applied the first accepted target combination instead of every one.

## What Was Built

**Task 1 (RED):**
- `objective-gear.test.ts`: `setupCompass` now takes an optional `campNumber` (default 4). Added two regression tests — "CR-01: rerolls an unowned win-card objective at camp 2 (all win-card)..." and "...at camp 4 (mixed)" — asserting the objective keeps its id/kind/`ownerSeatId: null`, its target becomes the deck's previous top card, the deck shrinks by exactly that card, and every other objective is unchanged.
- `run-test-support.ts`'s `enumerateLegalRunActions`: added an objective-pick-window use-gear enumeration block (mirroring the existing between-tricks block), so the whole-run driver/property tests now exercise Compass. Doc comment updated to note all three windows.
- `run-test-support.test.ts`: added a test proving the objective-pick enumerator offers `use-gear`/`reroll` candidates targeting win-card objectives at camp 2.
- `gear.contract.test.ts`: replaced `findUsableFixture` (first accepted combination only) with `findUsableFixtures` (every accepted combination), and extracted the per-fixture assertion body into a module-level `assertLegalUseContract` helper that wraps `applyRunAction` in try/catch and rethrows as `"gear.contract: {id} checkUseGear accepted ... but applyRunAction threw: {message}"` — making "checkUseGear ok implies apply succeeds" an explicit, catchable assertion. Each per-playerCount `it` now loops over every fixture found.

**RED evidence:** Before Task 2's fix, running the four extended test files produced exactly 6 failures, all with the message `toolkit: replace-objective: objective has no card to replace` (2 in objective-gear.test.ts, 3 in gear.contract.test.ts's reroll contract at playerCount 3/4/5, 1 in run-test-support.test.ts's new enumerator test). The pre-existing ordered-reroll regression test still passed (14/16 in objective-gear.test.ts).

**Task 2 (GREEN):**
- `toolkit.ts`'s `replace-objective` op: the kind guard changed from `objective.kind !== "ordered"` to `objective.kind !== "ordered" && objective.kind !== "win-card"`, now matching `camp.ts`'s `isCardBearingSlot`. A one-line comment above the guard documents this invariant. The target-swap logic was already generic over the union (map by id, spread `target`), so no further change was needed — it compiled and worked for win-card immediately.
- `toolkit.test.ts`: added "replace-objective on a win-card objective keeps id/kind and pulls the next objective-deck card (CR-01)".
- `.planning/REQUIREMENTS.md`: GEAR-02 re-ticked (checkbox and traceability row → Complete). The ROADMAP.md Phase 10 line was left untouched, as instructed — phase completion is re-judged by the phase verifier after 10-19 also runs.

## Verification

- The four Task 1 files plus `toolkit.test.ts` and `run.property.test.ts`: 132/132 passed after the fix.
- `run.property.test.ts` runtime after the enumerator change: ~1.6s (well under the 90s ceiling; no numRuns change needed).
- Full suite (`npm test`): **1662 tests, 115 files, all passed** (comfortably above the plan's "more than 516" floor — the codebase has grown substantially since that count was recorded).
- `npm run typecheck` (`tsc -b`): exits 0, no errors.
- `grep -c "\- \[x\] \*\*GEAR-02\*\*" .planning/REQUIREMENTS.md` → 1; `grep -c "| GEAR-02 | Phase 10 | Complete |" .planning/REQUIREMENTS.md` → 1.
- `grep -c "\- \[ \] \*\*Phase 10:" .planning/ROADMAP.md` → 1 (unchanged, as required).

## Deviations from Plan

None — plan executed exactly as written. The toolkit's existing generic map-and-spread logic for the target swap required no further narrowing beyond the kind guard change (the plan anticipated a possible TS narrowing issue that did not materialize; `tsc -b` was clean on the first attempt).

## Deferred Review Findings

- **WR-03** (a reveal's `fromSeatId` goes stale after Trained Monkey moves the card) is deferred pending a product decision on whether a reveal follows the card; it must be settled before Phase 11 builds the per-seat view.
- **WR-04** (the latent `move-card` op can break hand sizes) is deferred because no v1 gear or boss emits `move-card`; close it before any content uses that op.
- **WR-02** is handled by plan 10-19 (not this plan).

## Self-Check: PASSED

- `packages/rules/src/expedition/run/toolkit.ts` — FOUND
- `packages/rules/src/expedition/run/toolkit.test.ts` — FOUND
- `packages/rules/src/expedition/gear/objective-gear.test.ts` — FOUND
- `packages/rules/src/expedition/gear/gear.contract.test.ts` — FOUND
- `packages/rules/src/expedition/run/run-test-support.ts` — FOUND
- `packages/rules/src/expedition/run/run-test-support.test.ts` — FOUND
- `.planning/REQUIREMENTS.md` — FOUND
- Commit `343620b` (test(10-18): add failing CR-01 regression and WR-01 harness coverage) — FOUND in `git log`
- Commit `2645959` (fix(10-18): Compass rerolls win-card objectives (CR-01)) — FOUND in `git log`
