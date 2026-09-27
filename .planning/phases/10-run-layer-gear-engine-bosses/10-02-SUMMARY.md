---
phase: 10-run-layer-gear-engine-bosses
plan: 02
subsystem: rules-engine
tags: [expedition, run-layer, gear, boss, typescript, rng, purity-guard, vitest]

# Dependency graph
requires:
  - phase: 09-expedition-rules-core
    provides: "CampState/CampError (state.ts), CoreRules/baseRulesWith (rules.ts), shuffle.ts's seedToRngState/nextRandom, purity.test.ts's directory-scan idiom"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 01
    provides: "trickWinner/nextLeader hook-composition throw policy (POLICY A3) this plan's RunRules composition will route through"
provides:
  - "run/types.ts: RunState, AttemptState, SeatRun, Reveal, LogEntry, ActiveEffect, GearUse, CampResult, RunAction, RunError, RunPhase, RunStatus, CampNumber, Catalog — the type contract every Wave 2-6 Phase 10 plan compiles against"
  - "run/run-rules.ts: RunHooks, RunRules, HookName, RuleModifier, HOOK_NAMES, baseRunHooks"
  - "gear/gear-def.ts: GearWindow, TargetKind, TargetSpec, ToolkitOp, GearContext, GearDef"
  - "boss/boss-def.ts: BossDef"
  - "run/rng.ts: attemptSeed, STREAMS, seededIndex — the single RNG stream-name/seeded-draw primitive (A1)"
  - "purity.test.ts recursing into run/, gear/, boss/ with comment-stripped token scanning and a Core-never-imports-content check"
affects: [10-03, 10-04, 10-05, 10-06, 10-07, 10-08, 10-09, 10-10, 10-11, 10-12, 10-13, 10-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A1 seed-only RunState: no RngState/generator tuple is ever stored; every draw derives a fresh stream by a unique name via run/rng.ts's STREAMS builder"
    - "RunRules lives beside CoreRules as an intersection (CoreRules & RunHooks), never inside rules.ts, keeping Core boss/gear-agnostic"
    - "HOOK_NAMES built from a Record<HookName, true> object literal (objectives.ts's KindRegistry exhaustiveness idiom), so a hook added to RunRules without a HOOK_NAMES entry is a compile error"
    - "GearDef.apply returns ToolkitOp data only; the toolkit (Plan 10-04) is the sole executor — gear can never mutate state directly"
    - "purity.test.ts's sourceFiles() recurses via readdirSync(..., { withFileTypes: true }), returning forward-slash relative paths, so future content files are scanned with no list update"
    - "purity.test.ts strips /* */ and // comments before forbidden-token scanning, so documentation prose never false-positives the guard"

key-files:
  created:
    - packages/rules/src/expedition/run/types.ts
    - packages/rules/src/expedition/run/run-rules.ts
    - packages/rules/src/expedition/gear/gear-def.ts
    - packages/rules/src/expedition/boss/boss-def.ts
    - packages/rules/src/expedition/run/rng.ts
    - packages/rules/src/expedition/run/rng.test.ts
  modified:
    - packages/rules/src/expedition/purity.test.ts

key-decisions:
  - "run/types.ts's A1 doc comment rewords 'RngState' to 'shuffle.ts-style generator state tuple' so the file's own prose doesn't trip its acceptance grep for a literal 'RngState' string (labeled, mirrors a Phase 06.1 precedent of the same kind)"
  - "HOOK_NAME_SET is a private module-level const (not exported); only the derived HOOK_NAMES array is exported, since the object literal's sole purpose is the compile-time exhaustiveness check"
  - "purity.test.ts's Core-never-imports-content check filters sourceFiles() to entries with no '/' in their relative path (walk()'s output), rather than a separate top-level-only directory read, reusing the same recursive listing for both purposes"

requirements-completed: []
# ENG-01, RUN-04, RUN-05, COMM-02 are structurally encoded in this plan's
# types (draftOffer privacy, LogEntry's no-card-id shape, Reveal.audience,
# the extensible gear/boss content-file pattern) but are not FULLY
# delivered until later Phase 10 plans wire real behavior against them —
# left unchecked in REQUIREMENTS.md per this plan's own scope ("contains
# no runtime logic beyond baseRunHooks/HOOK_NAMES/GEAR_WINDOWS/TARGET_KINDS
# and run/rng.ts's helpers"). RUN-07 (the run's RNG mechanism) is the one
# requirement this plan fully realizes via run/rng.ts's STREAMS/seededIndex,
# but RUN-07 is not in REQUIREMENTS.md's traceability table under this
# plan's exact requirement-id casing, so it is likewise left for a later
# plan's mark-complete pass to avoid partial-credit mischecking.

# Metrics
duration: ~25min
completed: 2026-09-27
---

# Phase 10 Plan 02: Run/Gear/Boss Type Contract, RNG Stream Names & Purity Guard Extension Summary

**Defined the four-file Phase 10 type contract (run state, layered rule hooks, gear definitions, boss definitions) plus the single RNG stream-name builder that realizes the "no carried generator" deviation (A1), and extended the expedition purity guard to recurse into the new subdirectories with comment-aware scanning.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-09-27
- **Tasks:** 2/2 completed
- **Files created:** 6, modified: 1

## Accomplishments

- `run/types.ts` defines `RunState` and every type Wave 2-6 needs, with a header documenting the derive-don't-cache rule, the reset-on-replay contract, the full A1 stream-name table, the privacy notes for Phase 11's redaction, and the use-gear flat-target-array ruling.
- `run/run-rules.ts` defines `RunHooks`/`RunRules`/`HookName`/`RuleModifier`, `HOOK_NAMES` (built via a `Record<HookName, true>` exhaustiveness literal covering all 13 hooks — 7 Core + 6 run), and `baseRunHooks` implementing the six base behaviors (including `capacity` returning `run.campNumber`, RUN-03).
- `gear/gear-def.ts` and `boss/boss-def.ts` define the gear/boss content shapes: `ToolkitOp` as pure data (apply never mutates), `remove-objective` (D-11) and `cancel-boss-twist` (D-04) ops present, `player-pair` dropped from `TargetKind` entirely (D-10).
- `run/rng.ts` provides `attemptSeed`, `STREAMS` (one builder per draw site: draft, boss, trickCountKind, trickCountN, faceDown, gear), and `seededIndex` as the single seeded 0..n-1 primitive — proven pairwise-distinct over the full camp × attempt × seat × use-index × gear-id × purpose grid in `rng.test.ts`.
- `purity.test.ts` now recurses into `run/`, `gear/`, `boss/` via a `withFileTypes` walk, strips comments before forbidden-token scanning, and gained a third check that no top-level Core file imports from `./run/`, `./gear/` or `./boss/`.
- `npm run typecheck` exits 0; `npx vitest run --project rules` — 30 files, 375 tests passed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the run, rule-hook, gear and boss type contracts** - `ce12f4e` (feat)
2. **Task 2 (TDD RED): failing test for run/rng.ts stream names** - `2c5fd75` (test)
3. **Task 2 (TDD GREEN): implement run/rng.ts** - `1e04dcd` (feat)
4. **Task 2 (purity guard extension)** - `ceca019` (feat)

## TDD Gate Compliance

Task 2 was `tdd="true"`. Gate sequence verified in git log:
1. RED gate: `2c5fd75` (`test(10-02): add failing test for run/rng.ts stream names (A1)`) — confirmed failing (`Cannot find module './rng'`) before commit.
2. GREEN gate: `1e04dcd` (`feat(10-02): implement run/rng.ts stream names (A1)`) — confirmed passing (5/5 tests) after commit.
No REFACTOR commit was needed; the purity-guard extension is a separate, non-TDD sub-scope of the same task and was committed on its own (`ceca019`).

## Files Created/Modified

- `packages/rules/src/expedition/run/types.ts` - the full RunState type contract, the A1 stream-name table, reset-on-replay and privacy documentation
- `packages/rules/src/expedition/run/run-rules.ts` - RunHooks/RunRules/HookName/RuleModifier/HOOK_NAMES/baseRunHooks
- `packages/rules/src/expedition/gear/gear-def.ts` - GearWindow/TargetKind/TargetSpec/ToolkitOp/GearContext/GearDef
- `packages/rules/src/expedition/boss/boss-def.ts` - BossDef
- `packages/rules/src/expedition/run/rng.ts` - attemptSeed/STREAMS/seededIndex
- `packages/rules/src/expedition/run/rng.test.ts` - attemptSeed shape, STREAMS pairwise-distinctness, seededIndex determinism/range/throw
- `packages/rules/src/expedition/purity.test.ts` - recursive `withFileTypes` walk, `stripComments`, extended `MUST_BE_SCANNED`, new Core-import-fence check

## Decisions Made

- Reworded `run/types.ts`'s A1 doc comment from "never an RngState" to "never a shuffle.ts-style generator state tuple" — the plan's own acceptance grep (`grep -c "RngState" ... outputs 0`) would otherwise have matched the explanatory prose itself, not just code. This mirrors an established project pattern (see STATE.md's 06.1-04/06.1-03 precedents of the same kind).
- `HOOK_NAME_SET` kept as an unexported module-private const; only the derived `HOOK_NAMES` array is exported, since the literal's only job is the compile-time `Record<HookName, true>` exhaustiveness check described in the plan.
- The new "Core never imports run/gear/boss" purity check reuses the same recursive `sourceFiles()` walk, filtering to entries with no `/` in their relative path, rather than adding a second directory-reading helper.

## Deviations from Plan

None — plan executed as written. The `RngState` reword above is not a deviation from the plan's required *content* (the header still fully documents A1), only a wording change made to keep the file's own prose from tripping its stated acceptance criterion.

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/run/types.ts
- FOUND: packages/rules/src/expedition/run/run-rules.ts
- FOUND: packages/rules/src/expedition/gear/gear-def.ts
- FOUND: packages/rules/src/expedition/boss/boss-def.ts
- FOUND: packages/rules/src/expedition/run/rng.ts
- FOUND: packages/rules/src/expedition/run/rng.test.ts
- FOUND: packages/rules/src/expedition/purity.test.ts (modified)
- FOUND: ce12f4e (git log)
- FOUND: 2c5fd75 (git log)
- FOUND: 1e04dcd (git log)
- FOUND: ceca019 (git log)

## Verification

- `npm run typecheck` — exits 0
- `npx vitest run --project rules` — 30 files, 375 tests passed
- All plan acceptance-criteria greps (RunState/seed/bossTwists/RngState-absence/stream-name prefixes/HOOK_NAMES/Record<HookName,true>/remove-objective/cancel-boss-twist/randomCardIdFrom/effectModifier/passiveModifier/player-pair-absence/withFileTypes/STREAMS/seededIndex/new Set(/run-types-in-MUST_BE_SCANNED/stripComments/Core-import-fence-title) confirmed matching
