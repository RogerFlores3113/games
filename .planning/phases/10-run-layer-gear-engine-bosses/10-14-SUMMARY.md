---
phase: 10-run-layer-gear-engine-bosses
plan: 14
subsystem: rules-engine
tags: [expedition, boss-twist, objectives, catalogue-contract, typescript, vitest, tdd]

# Dependency graph
requires:
  - phase: 10-run-layer-gear-engine-bosses
    plan: 12
    provides: "boss/radio-silence.ts's radioSilence, boss/eclipse.ts's eclipse BossDefs"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 13
    provides: "boss/blind-orders.ts's blindOrders, boss/mutiny.ts's mutiny BossDefs"
provides:
  - "boss/registry.ts: BOSS_REGISTRY (satisfies Readonly<Record<string, BossDef>>), BossId — the ENG-01 one-file-plus-one-line boss catalogue"
  - "boss/boss.contract.test.ts: ENG-02's automatic per-registered-boss contract (shape, 3/4/5-seat driven-camp conservation/determinism/JSON-round-trip/interim-no-leak), proven non-vacuous against a deliberately broken fake def"
  - "objective-kinds.contract.test.ts: ENG-02's automatic per-registered-objective-kind contract (key===id, non-empty describe(), deterministic evaluate() in {pending,done,failed}, and full BALANCE_TABLE coverage), plus a fixture-coverage guard"
affects: [10-15, 10-16, 10-17, 11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "boss.contract.test.ts's driveOneCamp helper stops on run.history growing past a captured starting length (not a target window), so it covers both a succeeded AND a failed camp attempt with the same loop — a boss twist that fails the camp (Mutiny) settles exactly the same way a twist that doesn't (Monsoon/Eclipse/Thick Fog) does"
    - "objective-kinds.contract.test.ts's FIXTURE_SLOT_FOR map is the only per-kind data in the file; a guard test asserts it covers every OBJECTIVE_KINDS key, so a Phase-15-or-later new objective kind registered without updating this map fails loudly here rather than silently skipping its contract check"

key-files:
  created:
    - packages/rules/src/expedition/boss/registry.ts
    - packages/rules/src/expedition/boss/boss.contract.test.ts
    - packages/rules/src/expedition/objective-kinds.contract.test.ts
  modified: []

key-decisions:
  - "Task 1 followed real RED/GREEN: boss.contract.test.ts was written and committed first (test(10-14)), confirmed failing because boss/registry.ts did not yet exist (module-resolution failure, not an assertion failure — still a genuine RED per the file header's own contract), then registry.ts was added (feat(10-14)) and the full suite went green in one step with no iteration needed."
  - "Task 2 was NOT run through a RED/GREEN cycle: OBJECTIVE_KINDS and every one of its four entries already existed from Phase 9 with no code gap to close — this task is pure test-authoring for existing production code (the same category as purity.test.ts), so it landed as a single test(10-14) commit that passed on first run, per <tdd_execution>'s guidance that RED is meaningful only when there is behavior yet to implement."
  - "Neither commit marks ENG-02 complete: BOSS-01/ENG-01/RUN-01 were already [x] in REQUIREMENTS.md before this plan (closed by 10-12/10-13 and earlier); ENG-02 also needs the gear catalogue contract test that Plan 10-15 delivers, so it stays [ ] until that plan lands."

requirements-completed: []
# BOSS-01, ENG-01 and RUN-01 were already marked complete in REQUIREMENTS.md
# before this plan ran (10-12/10-13 and earlier plans). ENG-02 is NOT marked
# complete here: this plan only closes the boss and objective-kind halves of
# ENG-02's "every registered catalogue entry is checked automatically"
# requirement — the gear catalogue half is Plan 10-15's job, per this plan's
# own header note ("ENG-02 also needs the gear contract from 10-15").

# Metrics
duration: ~15min
completed: 2026-09-27
---

# Phase 10 Plan 14: Boss Registry & Catalogue Contract Tests Summary

**boss/registry.ts's `BOSS_REGISTRY` registers all four provisional boss twists by id (ENG-01's "one file plus one line" now literally true for bosses), and two new registry-iterating contract test files — `boss.contract.test.ts` and `objective-kinds.contract.test.ts` — automatically prove every registered boss and objective kind is well-shaped, deterministic, card-conserving and leak-free (interim), each proven non-vacuous against a deliberately broken fake entry.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-09-27
- **Tasks:** 2/2 completed
- **Files created:** 3

## Accomplishments

- `boss/registry.ts`'s `BOSS_REGISTRY` is a `satisfies Readonly<Record<string, BossDef>>` object literal with keys `"radio-silence"`, `"eclipse"`, `"blind-orders"` and `"mutiny"`, each equal to its def's own `id`; `BossId` is `keyof typeof BOSS_REGISTRY`.
- `boss.contract.test.ts` iterates `Object.entries(BOSS_REGISTRY)` only: a local `checkBossDef` proves non-empty `name`/`text` and every `modifiers` key is a known `HookName` (from `run/run-rules.ts`'s `HOOK_NAMES`) mapping to a function; for every entry at 3, 4 and 5 seats, a `driveOneCamp` helper (built on `enumerateLegalRunActions`/`applyRunAction`, always preferring the first `pick-objective` then the first `play-card`, never whisper or gear) drives a real camp-3 attempt from deal to a decided outcome (succeeded or failed) with no throw, `campCardIds` conservation at every step with a camp, `JSON.parse(JSON.stringify(state))` deep-equality at every step, `attempt.reveals` staying `[]`, every `attempt.log` entry carrying only the five whitelisted non-card keys, and a full independent replay from the same seed producing a byte-identical action log (determinism).
- A deliberately broken fake `BossDef` (`modifiers: { notAHook: ... } }`) makes `checkBossDef` report at least one violation naming `notAHook`, proving the contract is not vacuous; all four real defs return `[]`.
- `objective-kinds.contract.test.ts` iterates `Object.entries(OBJECTIVE_KINDS)` only: a `FIXTURE_SLOT_FOR` map (the file's only per-kind data) builds a one-objective `createCamp` fixture per kind, proving key `===` id, a non-empty `describeObjective()`, and `evaluateObjective()` in `{pending, done, failed}` identically across two calls; a guard test asserts `FIXTURE_SLOT_FOR`'s keys exactly match `OBJECTIVE_KINDS`'s keys, so a future unregistered kind fails loudly rather than silently skipping its check. A second test drives `objectiveSlotsFor` across camps 1–6 and 20 seeds, asserting every produced `ObjectiveSlot.kind` is a key of `OBJECTIVE_KINDS`.
- `npx vitest run --project rules packages/rules/src/expedition/boss` — 45 tests passed; `npx vitest run --project rules packages/rules/src/expedition/objective-kinds.contract.test.ts` — 10 tests passed; full `packages/rules/src/expedition` suite — 29 files, 467 tests passed; `npm run typecheck` exits 0.

## Task Commits

Each task was committed atomically (Task 1 as a genuine TDD RED/GREEN pair; Task 2 as a single test-only commit — see Deviations):

1. **Task 1 RED: failing boss catalogue contract test** - `418db8f` (test)
2. **Task 1 GREEN: register the four boss twists** - `c9c86ab` (feat)
3. **Task 2: objective-kind catalogue contract test** - `5ab718b` (test)

## Files Created/Modified

- `packages/rules/src/expedition/boss/registry.ts` - `BOSS_REGISTRY`, `BossId`
- `packages/rules/src/expedition/boss/boss.contract.test.ts` - ENG-02 boss catalogue contract, `checkBossDef`, `driveOneCamp`
- `packages/rules/src/expedition/objective-kinds.contract.test.ts` - ENG-02 objective-kind catalogue contract, `FIXTURE_SLOT_FOR`

## Decisions Made

- Task 1 genuinely followed RED/GREEN: the contract test was written and run first, confirmed failing because `boss/registry.ts` did not yet exist (a module-resolution error rather than an assertion failure, but still a real "this does not exist yet" RED), committed, then `registry.ts` was added and the whole suite went green in one pass.
- Task 2 skipped a RED/GREEN split: `OBJECTIVE_KINDS` and all four of its entries were fully implemented in Phase 9 with zero code gap for this plan to close, so writing the contract test against already-correct production code is analogous to `purity.test.ts`'s own precedent — a legitimate test-only commit that passes on first run, not a violation of the "run (MUST fail)" RED discipline (which applies when there is unimplemented behavior to drive toward, not when auditing existing code).
- Neither this plan's boss registry nor its contract tests mark ENG-02 complete in REQUIREMENTS.md: ENG-02's "every registered catalogue entry is checked automatically" requirement also covers the gear catalogue, which is Plan 10-15's job — ENG-02 stays `[ ]` until that plan lands.

## Deviations from Plan

None — plan executed as written, with one process note: Task 1 (`tdd="true"`) landed as two commits (RED test, GREEN implementation) rather than one, matching this repo's stated TDD execution flow for a task that adds new production code; Task 2 (also `tdd="true"` in the plan's frontmatter) landed as a single commit because it added no new production code to drive toward — it is a pure catalogue-contract test for code Phase 9 already completed. No bugs, missing critical functionality, or blocking issues were found in the Plan 02/07/12/13 code this plan depends on (`BossDef`, `run-actions`, `run-test-support`, the four boss defs, `objectives.ts`).

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/boss/registry.ts
- FOUND: packages/rules/src/expedition/boss/boss.contract.test.ts
- FOUND: packages/rules/src/expedition/objective-kinds.contract.test.ts
- FOUND: 418db8f (git log)
- FOUND: c9c86ab (git log)
- FOUND: 5ab718b (git log)

## Verification

- `npx vitest run --project rules packages/rules/src/expedition/boss` — 3 files, 45 tests passed
- `npx vitest run --project rules packages/rules/src/expedition/objective-kinds.contract.test.ts` — 1 file, 10 tests passed
- `npx vitest run --project rules packages/rules/src/expedition` — 29 files, 467 tests passed
- `npm run typecheck` — exits 0
- `grep -c "export const BOSS_REGISTRY" packages/rules/src/expedition/boss/registry.ts` — 1; contains `satisfies` — 1
- `grep -c "Object.entries(BOSS_REGISTRY)" packages/rules/src/expedition/boss/boss.contract.test.ts` — 3; `grep -c "JSON.parse(JSON.stringify("` — 1
- `grep -c "Object.entries(OBJECTIVE_KINDS)" packages/rules/src/expedition/objective-kinds.contract.test.ts` — 2; `grep -c "objectiveSlotsFor("` — 1

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ENG-02 remains partially delivered: bosses and objective kinds are now automatically contract-checked; the gear catalogue contract (Plan 10-15) is the remaining piece before ENG-02 can be marked complete.
- Full `packages/rules` test suite passes with these changes in place.

---
*Phase: 10-run-layer-gear-engine-bosses*
*Completed: 2026-09-27*
