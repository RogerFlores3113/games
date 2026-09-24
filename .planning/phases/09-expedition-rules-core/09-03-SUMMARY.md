---
phase: 09-expedition-rules-core
plan: 03
subsystem: rules
tags: [expedition, objectives, rules-engine]
dependency-graph:
  requires: [expedition-state-types, expedition-deck-module]
  provides: [expedition-objective-evaluation, expedition-objective-pick-sequencing]
  affects: [09-04, 09-06]
tech-stack:
  added: []
  patterns:
    - "ObjectiveKindDef-shaped registry (OBJECTIVE_KINDS) with a mapped type over ObjectiveKind, so a missing kind is a compile error — Phase 10 wraps it into the full content catalogue by adding one def plus one registry line"
    - "Every evaluator recomputes status fresh from CampState.completedTricks every call, never reading/writing a stored status field — mirrors hanabi/endgame.ts's fixed-order, statelessly-recomputed discipline"
key-files:
  created:
    - packages/rules/src/expedition/objectives.ts
    - packages/rules/src/expedition/objectives.test.ts
  modified: []
decisions:
  - "A-TIE: two ordered objectives whose cards are won in the same completed trick satisfy their relative order (non-strict) — recorded in objectives.ts's header for owner review"
  - "A-LAST: an ordered 'last' objective is done only if its card is won in the camp's actual final trick (index totalTricks - 1); any earlier trick fails it immediately"
  - "A-END: no-tricks and exactly-n resolve to done only once every trick of the camp has been played; reaching N (or staying at 0) mid-camp is pending, not done, until the camp ends"
  - "orderedKind's relative-order check compares each ordered objective's resolving trick index against every OTHER ordered objective's incrementally, with 'last' comparing as +Infinity (markerValue), so failure is detected the trick it happens, not retroactively at camp end"
metrics:
  duration: "~20 min"
  completed: 2026-09-23
---

# Phase 9 Plan 3: Objective Evaluation and Clockwise Pick Sequencing Summary

All four spec §5.2 objective kinds (`win-card`, `ordered`, `no-tricks`, `exactly-n`) as a compile-checked `ObjectiveKindDef` registry, plus `nextObjectivePicker`'s clockwise pick sequencing — every evaluator is a pure function recomputed from `CampState` on every call, and `exactly-n`/`ordered` detect failure at the earliest trick the spec's rule text allows, proven by 40 passing unit tests.

## What Was Built

**`packages/rules/src/expedition/objectives.ts`** — derivation helpers (`countTricksWon`, `tricksRemaining`, `isCampFinished`, `trickContaining`, all derived fresh from `state.completedTricks`, never cached); the four `ObjectiveKindDef` evaluators (`winCardKind`, `noTricksKind`, `exactlyNKind`, `orderedKind`); the compile-checked `OBJECTIVE_KINDS` registry (a mapped type over `ObjectiveKind`, so a missing kind fails to compile); `evaluateObjective`/`objectiveStatuses`/`describeObjective` dispatching through it; and `nextObjectivePicker` for clockwise objective-pick sequencing with wraparound. The file header documents the three labeled assumptions (A-TIE, A-LAST, A-END) with one-sentence rationales for owner review, resolving RESEARCH.md's Open Questions 2 and 4.

**`packages/rules/src/expedition/objectives.test.ts`** — a local `makeState`/`trick`/`std`/objective-builder fixture kit (no `createCamp` yet — that's Plan 04), 40 tests covering: the four derivation helpers; pending/done/failed for all four kinds including the unowned-objective pending case; `exactly-n`'s exceeded AND unreachable-before-exceeded branches (the highest-value test per RESEARCH.md Pitfall 3), plus its A-END mid-camp/camp-end and n=0 cases; `ordered`'s win-card-failure-applies-too case, the incremental out-of-order failure (②'s card won while ①'s is unresolved fails both, immediately — RESEARCH.md Pitfall 4), the same-trick A-TIE case (both done), and all three "last" marker cases including the cross-marker "last resolves before a numbered one" failure; the registry's exhaustive dispatch; `objectiveStatuses`' ordering and all-pending-with-no-tricks case; `nextObjectivePicker`'s clockwise wraparound and leader-not-found throw; and `describeObjective`'s circled-numeral/`#10`/`Last:` prefixes.

## Task Sequence

1. **Task 1 (auto, tdd):**
   - RED: wrote `objectives.test.ts` (21 tests) for the derivation helpers and the win-card/no-tricks/exactly-n evaluators first; confirmed failure (`Cannot find module './objectives'`). Commit `596c248`.
   - GREEN: implemented `objectives.ts` with `countTricksWon`/`tricksRemaining`/`isCampFinished`/`trickContaining` and `winCardKind`/`noTricksKind`/`exactlyNKind`; 21/21 tests pass, `tsc -p packages/rules/tsconfig.json --noEmit` clean. Commit `6e8b5ce`.
2. **Task 2 (auto, tdd):**
   - RED: extended `objectives.test.ts` with 19 more tests for `orderedKind`, `OBJECTIVE_KINDS`, `evaluateObjective`, `objectiveStatuses`, `describeObjective`, `nextObjectivePicker`; confirmed 18 new failures (`describeObjective is not a function`, etc.), 22 prior tests still green. Commit `5e878dd`.
   - GREEN: implemented `orderedKind` (incremental order checking against every other ordered objective, with "last" as `+Infinity` via `markerValue`), the `KindRegistry`-typed `OBJECTIVE_KINDS`, `evaluateObjective`/`objectiveStatuses`/`describeObjective`, and `nextObjectivePicker`; 40/40 tests pass, `tsc` clean. Commit `45a482d`.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written; no bugs, missing functionality, or blocking issues were found during implementation.

### Acceptance-criteria grep discrepancy (documented, not a defect)

Task 1's acceptance criteria included `grep -n "status:" packages/rules/src/expedition/state.ts` expected to print nothing. It actually matches three lines inside `CampOutcome`'s discriminated union (`{ readonly status: "in_progress" }` etc.), which is pre-existing code from Plan 01 — a computed camp-level outcome type, not a stored per-objective status field. The actual intent of the grep (no `Objective` type carries a stored `status` field, so status is always derived) is satisfied: none of `WinCardObjective`/`OrderedObjective`/`NoTricksObjective`/`ExactlyNObjective` in `state.ts` has a `status` field. No code change was made since `state.ts` is out of this plan's file scope (`files_modified` lists only `objectives.ts`/`objectives.test.ts`) and `CampOutcome.status` is a different, legitimate concept.

## Verification

- `npx vitest run packages/rules/src/expedition/objectives.test.ts` — 40/40 passed
- `npx vitest run packages/rules/src/expedition` — 90/90 passed (5 test files: deck/trick/trick.property/leader from Plans 01-02, plus this plan's objectives.test.ts)
- `npx tsc -p packages/rules/tsconfig.json --noEmit` — exit 0
- `npm run typecheck` (`tsc -b`, root project references) — exit 0
- `grep -c "it(" objectives.test.ts` → 40
- `grep -n "A-TIE\|A-LAST\|A-END" objectives.ts` → 8 matches (header + inline)
- `grep -n "OBJECTIVE_KINDS\[" objectives.ts` → 2 matches (registry dispatch in `evaluateObjective`/`describeObjective`)
- `grep -n "same trick" objectives.test.ts` → 1 match
- `grep -n "unreachable" objectives.test.ts` → matches present
- `grep -n "completedTricks.filter" objectives.ts` → matches present

## TDD Gate Compliance

Both tasks show a `test(...)` commit followed by a `feat(...)` commit in git log (`596c248` → `6e8b5ce`; `5e878dd` → `45a482d`); RED confirmed via a real failing run before each GREEN implementation.

## Known Stubs

None.

## Threat Flags

None — this plan's only threat-register entry (T-09-06, no stored status field so no stale-status path exists) is addressed by the derive-fresh-every-call design described above; T-09-07 (objective statuses being public) is accepted per the plan's own threat model, no new surface introduced.

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/objectives.ts
- FOUND: packages/rules/src/expedition/objectives.test.ts
- FOUND commit: 596c248
- FOUND commit: 6e8b5ce
- FOUND commit: 5e878dd
- FOUND commit: 45a482d
