---
phase: 10-run-layer-gear-engine-bosses
plan: 11
subsystem: rules-engine
tags: [expedition, run-layer, gear, boss-twist, typescript, vitest]

# Dependency graph
requires:
  - phase: 10-run-layer-gear-engine-bosses
    plan: 02
    provides: "gear/gear-def.ts's GearDef/GearContext/ToolkitOp (cancel-boss-twist, add-modifier)"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 03
    provides: "run/compose.ts's activeBossId/rulesFor, run/run-rules.ts's RuleModifier/capacity/failureCost/whisperAllowed hooks"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 05
    provides: "run/lifecycle.ts's preDealPendingSeatIds/capacityOf/settleIfDecided, the pre-deal wait D-12 depends on"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 07
    provides: "run/run-actions.ts's applyRunAction, run/run-test-support.ts's setupRun/advanceTo"
provides:
  - "gear/jam.ts: Rain Poncho (GEAR-04) — pre-deal, cancels the current attempt's boss twist and blocks every Whisper this camp (D-04, D-12)"
  - "gear/overclock.ts: Energy Tonic (GEAR-04) — passive, +2 capacity for its own owner and +1 camp-wide failure cost per equipped copy"
  - "gear/run-gear.test.ts: end-to-end proof that the capacity and failure-cost hooks feed RUN-02/RUN-03 through set-loadout and a forced failure"
affects: [10-12, 10-13, 10-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A camp-cancelling gear item (cancel-boss-twist) is still an activated effect: apply returns BOTH cancel-boss-twist AND add-modifier, so the whisper-blocking downside rides the same effectModifier mechanism every other mid-camp gear item uses"
    - "A passive gear item defines no apply/canUse at all — toolkit.ts's gearAvailability already refuses any use-gear attempt on window: \"passive\" with a fixed reason, so the def itself only needs passiveModifier"
    - "Stacking N copies of the same passive gear (owned by different seats, D-05) is not special-cased anywhere: ruleLayersFor pushes one passiveModifier layer per equipped copy, and each layer's own seatId-guarded capacity mapper / unconditional failureCost mapper composes correctly through the existing fold"

key-files:
  created:
    - packages/rules/src/expedition/gear/jam.ts
    - packages/rules/src/expedition/gear/overclock.ts
    - packages/rules/src/expedition/gear/run-gear.test.ts
  modified: []

key-decisions:
  - "D-12's 'gives a reason' behavior can only be observed by constructing a hypothetical pre-deal RunState directly (attempt.camp: null) at a non-boss camp, since applyRunAction's own advanceRun deals immediately once the (empty) pre-deal wait clears — there is no reachable moment where the run itself sits at pre-deal with a Poncho that can never be used. The test documents this and asserts the real behavior (deal proceeds straight to \"camp\") plus the direct canUse probe, matching the plan's own two must_haves without inventing an unreachable game state as if it were normal play."
  - "Rain Poncho's downside (whisperAllowed: false) is unconditional in effectModifier, ignoring the ActiveEffect argument, because D-04's ruling is camp-wide ('nobody may Whisper this camp'), not owner-scoped like Signal Flare's audience widening."

patterns-established: []

requirements-completed: [GEAR-04, RUN-02, RUN-03, RUN-05, GEAR-06]

# Metrics
duration: 18min
completed: 2026-09-27
---

# Phase 10 Plan 11: Run Gear (Rain Poncho, Energy Tonic) Summary

**Rain Poncho cancels a boss twist for one attempt and silences the camp; Energy Tonic stacks +2 owner-only capacity and +1 camp-wide failure cost per equipped copy.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-09-27T06:17:00Z
- **Completed:** 2026-09-27T06:35:00Z
- **Tasks:** 2 completed
- **Files modified:** 3 (all created)

## Accomplishments
- Rain Poncho (`jam.ts`): pre-deal gear that cancels the current camp's boss twist for this attempt only (`cancel-boss-twist` + `add-modifier`), blocks every seat's Whisper this camp, and never holds up a non-boss deal (`canUse` refuses "There is no boss twist this camp")
- Energy Tonic (`overclock.ts`): passive gear with no `apply`, adding +2 capacity to its own owner and +1 to the camp-wide failure cost per equipped copy — proven to stack correctly with two independent owners
- `run-gear.test.ts` proves D-04 (twist returns unless Poncho is used again on replay), D-12 (the deal never waits on an unusable Poncho), and the capacity/failure-cost hooks feeding RUN-02/RUN-03 end to end through real `set-loadout` and a forced camp failure

## Task Commits

Each task was committed atomically:

1. **Task 1: Rain Poncho (D-04, D-12)** - `0389e18` (feat)
2. **Task 2: Energy Tonic (capacity and failure-cost stacking)** - `e34b112` (feat)

_Note: both tasks share `run-gear.test.ts` as one file, which was created whole in Task 1's commit; Task 2's commit adds only `overclock.ts` (the test file already covered both gear items from Task 1's authoring, per this plan's own single-file test spec)._

## Files Created/Modified
- `packages/rules/src/expedition/gear/jam.ts` - Rain Poncho GearDef (D-04, D-12)
- `packages/rules/src/expedition/gear/overclock.ts` - Energy Tonic GearDef (passive, no apply)
- `packages/rules/src/expedition/gear/run-gear.test.ts` - contract tests for both, including local `fake-fog`/`fake-fail` bosses and `fake-sabotage`/`fake-size-3` test-only gear

## Decisions Made
- D-12's "gives a reason" behavior is asserted via a directly-constructed hypothetical pre-deal RunState at a non-boss camp (see key-decisions above) — the real dispatcher never leaves the run sitting at pre-deal with an unusable Poncho, so this is the only way to observe `canUse`'s reason string while still proving the deal itself never waits (asserted separately via `runPhase(readied) === "camp"`).
- Rain Poncho's whisper-block downside is unconditional per camp, not owner-scoped, per D-04's own wording ("nobody may Whisper this camp").

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Initial draft of the D-12 test called `checkUseGear` after the automatic deal had already happened (run in `"camp"` phase), which correctly returned `"wrong_window"` instead of the plan's expected `"There is no boss twist this camp"` — because `gearAvailability` checks the window before `canUse`. Fixed by probing a hand-constructed pre-deal snapshot directly (see Decisions Made), which is consistent with how `table-gear.test.ts` already probes hypothetical states (e.g. its "emptied hand" test for Trained Monkey).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- GEAR-04 is complete; the v1 gear catalogue (10 items across Plans 10-08 through 10-11) is now fully implemented and unit-tested.
- No catalogue registry file exists yet tying all gear/boss ids into one `Catalog` — that is Plan 10-14's job per this phase's 10-CONTEXT.md ("new gear... should each be one file plus one registry line").
- Full `packages/rules` test suite (610 tests, 43 files) and `tsc -b` both pass with these changes.

---
*Phase: 10-run-layer-gear-engine-bosses*
*Completed: 2026-09-27*
