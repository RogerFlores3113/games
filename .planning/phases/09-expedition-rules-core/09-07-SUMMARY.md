---
phase: 09-expedition-rules-core
plan: 07
subsystem: rules-engine
tags: [expedition, objectives, property-testing, gap-closure]
dependency-graph:
  requires: [09-03-SUMMARY.md, 09-06-SUMMARY.md]
  provides: "Monotone ordered-objective evaluator plus an independent, pair-based property oracle proving it"
  affects: [packages/rules/src/expedition/objectives.ts, packages/rules/src/expedition/camp.ts checkCampOutcome]
tech-stack:
  added: []
  patterns:
    - "markerPrecedes(a, b) — no numeric Infinity mapping for 'last', unlike the evaluator's own markerValue"
    - "Pair-based oracle restatement (lo/hi per ordered pair) instead of a resolved/unresolved branch-split transcription"
    - "Raw hand-rolled trick sequences (not driveCamp/applyCampAction) to reach post-failure CampStates for property testing"
key-files:
  created: []
  modified:
    - packages/rules/src/expedition/objectives.property.test.ts
    - packages/rules/src/expedition/objectives.test.ts
    - packages/rules/src/expedition/objectives.ts
decisions:
  - "orderedKind.evaluate's resolved branch made symmetric: fails on either a lower-marker objective unresolved/later, OR a higher-marker objective resolved strictly earlier (otherTrickIndex < myTrickIndex) — equal indices stay in order (A-TIE unchanged)"
  - "New orderedOracle in the property test is a from-scratch pair-based restatement of spec §5.2 (markerPrecedes, no Infinity marker value, no resolved/unresolved branch split), replacing the prior oracle that transcribed the evaluator's own control flow"
  - "rawSequenceCampArb builds CampState prefixes directly (owners assigned by array index, tricks built from a mutable hand copy with arbitrary winners) rather than via driveCamp/applyCampAction, specifically to reach states past the first objective failure"
metrics:
  duration: ~45min
  tasks_completed: 2
  files_changed: 3
  completed: 2026-09-26
---

# Phase 9 Plan 07: Ordered-Objective Monotonicity + Independent Oracle (WR-01/WR-02) Summary

Fixed a real evaluator bug where a failed ordered objective could later report "done" once its own card resolved, and replaced the self-confirming property oracle that let the bug through.

## What Was Built

**Task 1 (RED):** Rewrote `objectives.property.test.ts`'s ordered oracle from a line-by-line transcription of `orderedKind.evaluate` into an independent, pair-based restatement of spec §5.2:

- `markerPrecedes(a, b)`: a boolean "must resolve no later than" relation over `OrderMarker`, with no `Number.POSITIVE_INFINITY` mapping for `"last"` (the prior oracle mirrored the evaluator's own `markerValue` helper exactly).
- New `orderedOracle`: computes failure as F1 (base win-card rule) OR F2 (A-LAST) OR F3 (a broken pair against every *other* ordered objective with a different marker, using `markerPrecedes` to pick which side is `lo`/`hi` and checking `hi` resolved while `lo` is unresolved or resolved strictly later).
- Added `rawSequenceCampArb`: builds every prefix (k = 0..totalTricks) of a hand-rolled trick sequence directly from `createCamp`'s dealt hands, bypassing the pick flow and `driveCamp`/`applyCampAction` entirely (those halt at the first objective failure and so can never reach a post-failure state). Winners are arbitrary per-trick picks, not computed by `trickWinner` — deliberate, since the evaluator's contract is "correct at ANY CampState."
- Added a new property: at every prefix, ordered statuses match `orderedOracle`, and every objective kind's `"failed"` status is absorbing (never flips back) as `completedTricks` grows. Two non-vacuity counters are asserted `> 0`: `failedThenOwnWonByOwnerRuns` (the exact WR-01 shape — failed while unresolved, later won by the objective's own owner) and `failedBeforeEnd` per kind (each of the four kinds failed at some prefix before the camp's final trick).

Confirmed RED against the unfixed evaluator: `npx vitest run --project rules objectives.property.test.ts` failed after 7 generated runs (seed `722147893`) with `AssertionError: expected 'done' to be 'failed'` — the exact WR-01 shape. Committed as `a5a1bde`.

**Task 2 (GREEN):** Added two regression unit tests to `objectives.test.ts` ("WR-01" and "WR-01 (other order)") and confirmed both failed against the unfixed evaluator (`'done'` instead of `'failed'`). Fixed `orderedKind.evaluate` in `objectives.ts`: the resolved branch (`myTrickIndex !== undefined`) now also fails when a higher-marker objective resolved strictly earlier (`otherTrickIndex < myTrickIndex`), symmetric with the existing lower-marker check. Equal trick indices still count as in-order (A-TIE preserved). Updated the file header with a "Monotonicity (WR-01)" paragraph and the `orderedKind` doc comment to describe the now-symmetric check. Committed as `fcab245`.

## Verification

- `npx vitest run --project rules objectives.test.ts objectives.property.test.ts` — 47/47 passed.
- `npm test` — 94 files, 1295 tests, all passed.
- `npm run typecheck` (`tsc -b`) — clean, no output.
- `git diff HEAD~2 HEAD --stat` — touches only `packages/rules/src/expedition/objectives.ts`, `objectives.test.ts`, `objectives.property.test.ts` (no files outside the expedition rules-core module).
- Acceptance-criteria greps all pass: `otherTrickIndex < myTrickIndex` count 1, `WR-01` in test file count 2, `Monotonicity (WR-01)` count 1.

## RED Counterexample (Task 1)

fast-check seed `722147893`, failed after 7 generated runs. The generated run reached a 3-seat, 18-trick raw sequence where an ordered objective's status computed by `evaluateObjective` was `"done"` at a prefix where the independent oracle (and the monotonicity check against the same objective's earlier `"failed"` status) required `"failed"` — the counterexample CampState is large (full dealt hands + trick sequence) and was captured in full in the vitest failure output rather than reproduced here; the assertion failure itself (`expected 'done' to be 'failed'`) is the load-bearing evidence and is unambiguous.

## Deviations from Plan

None — plan executed exactly as written. Both tasks' `<action>` steps were followed in order; the RED/GREEN gate sequence is present in git log (`test(09-07): ...(RED)` then `fix(09-07): ...`).

## TDD Gate Compliance

- RED gate: `a5a1bde test(09-07): add independent ordered oracle and post-failure monotonicity property (RED)` — present, and confirmed failing before commit.
- GREEN gate: `fcab245 fix(09-07): make ordered objective evaluation monotone (WR-01)` — present, confirmed passing.
- No REFACTOR commit was needed (no post-GREEN cleanup).

## Self-Check: PASSED

- `packages/rules/src/expedition/objectives.ts` — FOUND (modified)
- `packages/rules/src/expedition/objectives.test.ts` — FOUND (modified)
- `packages/rules/src/expedition/objectives.property.test.ts` — FOUND (modified)
- Commit `a5a1bde` — FOUND in `git log --oneline --all`
- Commit `fcab245` — FOUND in `git log --oneline --all`
