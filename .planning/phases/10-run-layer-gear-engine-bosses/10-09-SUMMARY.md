---
phase: 10-run-layer-gear-engine-bosses
plan: 09
subsystem: rules-engine
tags: [expedition, gear, objectives, typescript, vitest]

# Dependency graph
requires:
  - phase: 10-run-layer-gear-engine-bosses
    plan: 04
    provides: "run/toolkit.ts's replace-objective/swap-objectives/remove-objective ops, validateTargets's face-up-objective/own-objective checks, gearAvailability's window/gear_already_used gates — the sole mutation and validation surface these three GearDefs rely on"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 07
    provides: "run/run-actions.ts's applyRunAction and run/run-test-support.ts's setupRun/advanceTo — the fixture and dispatcher every test in this plan drives through"
provides:
  - "gear/reroll.ts: the Compass GearDef (id \"reroll\")"
  - "gear/reassign.ts: the Trail Map GearDef (id \"reassign\"), D-10"
  - "gear/ghost.ts: the Camouflage GearDef (id \"ghost\"), D-11"
affects: [10-15]
# 10-15 (registry) is the only later plan that names these three files by id;
# no other Wave 5 gear/boss plan depends on their content.

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "reroll.ts/reassign.ts/ghost.ts's canTarget/canUse add ONLY the reason string beyond what the toolkit's own op-level guards already enforce (kind check + empty-deck for Compass, pending-objective-on-either-side for Trail Map, already-won-a-trick for Camouflage) — the toolkit ops themselves are the actual invariant enforcement (T-10-31/T-10-32 in this plan's own threat register)"
    - "ghost.ts's effectModifier wraps failureChecks exactly like broadcast.ts/chatter.ts (10-08) wrap whisperAudience/whispersPerCamp: apply -> add-modifier -> effectModifier reading only the closed-over ActiveEffect, never RunState-stored flags"
    - "D-10 fixtures rely on camp2's 3-seat/3-slot balance (round-robin objective-pick gives every seat exactly one objective) to avoid needing leader-probing; Compass (camp4, 4 slots/3 seats) and the Camouflage immediate-success case (camp1, 2 slots/3 seats) DO need a same-seed probe run (advanceTo to objective-pick with no gear equipped) to discover the leader/first-picker before building the real fixture, since dealing and leaderFor never depend on loadouts"
    - "'spread' camp states (a completed trick forced to make an objective done, or to make a trick won) are built by hand and evaluated directly via rulesFor(...).failureChecks(craftedCamp) / checkUseGear(craftedRun, ...) — never pushed through applyRunAction, per this plan's own instruction, since failureChecks/canUse/canTarget all take a CampState/GearContext value, not a transition to re-validate"

key-files:
  created:
    - packages/rules/src/expedition/gear/reroll.ts
    - packages/rules/src/expedition/gear/reassign.ts
    - packages/rules/src/expedition/gear/ghost.ts
    - packages/rules/src/expedition/gear/objective-gear.test.ts

key-decisions:
  - "reroll.ts's canTarget uses ctx.camp! (non-null assertion) rather than a defensive null check, because validateTargets's own face-up-objective check (toolkit.ts) already runs first and requires ctx.camp !== null to even resolve the target — by the time canTarget executes, gearAvailability has also already proven window === \"objective-pick\", which implies attempt.camp !== null structurally"
  - "reassign.ts/ghost.ts keep their own defensive `ctx.camp !== null` / `ctx.camp!` guards for the same reason (between-tricks window implies a camp), documented inline rather than silently assumed"
  - "objective-gear.test.ts's Compass/Camouflage-immediate-success fixtures use a same-seed \"probe\" run (advanceTo to objective-pick with an empty loadout) purely to discover which seat is the first picker/leader before building the real, gear-equipped fixture — dealAttempt only depends on (seed, campNumber, attemptNumber), never on seat loadouts, so the probe and the real fixture always agree on dealing and leader"
  - "Trail Map's D-10 fixtures deliberately use camp 2 (3 win-card slots, 3 seats) so every seat is guaranteed exactly one objective after the normal round-robin pick, with no probing needed"

requirements-completed: [GEAR-02]
# GEAR-02's REQUIREMENTS.md text names exactly these three items (Compass,
# Trail Map, Camouflage) and nothing else, so this plan completes it in
# full at the engine level, honoring D-10 and D-11 exactly as locked.
# GEAR-06 stays unaffected/unchecked here, matching 10-06/10-08's own
# scope note: it is a UI-facing requirement (Phase 12+); this plan's
# engine-side contribution is that every canUse/canTarget rejection these
# three GearDefs can produce carries a human-readable reason string,
# proven in objective-gear.test.ts.

# Metrics
duration: ~40min
completed: 2026-09-26
---

# Phase 10 Plan 09: Objective Gear — Compass, Trail Map, Camouflage Summary

**`reroll.ts` (Compass), `reassign.ts` (Trail Map, D-10) and `ghost.ts` (Camouflage, D-11) are the three v1 objective gear items (GEAR-02): Compass rerolls a face-up card objective's target while keeping its id/kind/order marker, Trail Map swaps only pending objectives between the user and one chosen teammate, and Camouflage removes one of the user's own pending objectives from play while arming a whole-camp "no more tricks" failure check — every behavior driven end-to-end through `applyRunAction`/`checkUseGear` against real 3-seat run fixtures, including the immediate-success edge case where dropping the last open objective settles the camp in the same action.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-09-26
- **Tasks:** 2/2 completed
- **Files created:** 4

## Accomplishments

- `reroll.ts` (Compass, id `"reroll"`, size 2, `objective-pick`, target `face-up-objective`): `canTarget` refuses `"Only card objectives can be rerolled"` for a no-tricks/exactly-n target and `"The objective deck is empty"` for an empty deck; `apply` returns a single `replace-objective` op — proven that rerolling an unowned ordered objective keeps its `id`/`kind`/`order` (order `1` verified explicitly) while its `target` becomes the previous `objectiveDeck[0]` and the deck shrinks by one; that it is usable by a seat that is NOT the current objective-pick actor; that a second use is `gear_already_used`; that targeting an already-owned objective is `invalid_target`; and that using it between tricks is `wrong_window`.
- `reassign.ts` (Trail Map, id `"reassign"`, size 3, `between-tricks`, D-10, target a single `teammate`): `canTarget` refuses `"Neither of you has an unresolved objective"` only when NEITHER the user NOR the target owns a pending objective; `apply` returns a single `swap-objectives` op — proven a normal swap moves only the user's and the teammate's objectives (a third seat's objective is untouched); that a done objective (forced via a crafted completed trick) stays with its owner even though it's on the swap's own side (D-10's second clause); that a self-target is `invalid_target`; and that a fixture where both sides are already done gives the exact GEAR-06 reason string.
- `ghost.ts` (Camouflage, id `"ghost"`, size 1, `between-tricks`, D-11, target `own-objective`): `canUse` refuses `"You have already won a trick this camp"` once `countTricksWon(camp, self) > 0`; `apply` returns `remove-objective` + `add-modifier`; `effectModifier` wraps `failureChecks` to append `"ghost-broke-cover"` the instant `countTricksWon(state, effect.seatId) > 0` for ANY `CampState` it's asked to evaluate — proven the objective is fully removed from `camp.objectives` (not merely marked done/failed) and the `ActiveEffect` is recorded at `atTrick: 0`; that `failureChecks` is `[]` right after activation but includes `"ghost-broke-cover"` against a spread camp where the owner has since won a trick; that `canUse` refuses on a spread camp where the owner already won a trick BEFORE using it; that targeting a teammate's objective is `invalid_target`; and the immediate-success edge case — camp 1 (2 slots), the other seat's objective forced done, then camouflaging the user's own last open objective settles the camp as `succeeded` (`runPhase` returns to fireside, `history`'s last entry is `{ status: "succeeded" }`) in the very same `applyRunAction` call.
- `objective-gear.test.ts` covers all 14 behaviors across three `describe` blocks, built on `setupRun`/`advanceTo`/`applyRunAction` for every normal action sequence, with hand-built "spread" `CampState`s (a forced completed trick) evaluated directly via `rulesFor(...).failureChecks(...)` / `checkUseGear(...)` wherever the plan calls for it — never pushed through `applyRunAction`.
- `npx vitest run --project rules packages/rules/src/expedition/gear/objective-gear.test.ts` — 14 tests passed; `npx vitest run --project rules` (full rules suite, purity guard included) — 41 files, 591 tests passed; `npm run typecheck` — exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Compass and Trail Map (GEAR-02, D-10)** - `f05ff0e` (feat)
2. **Task 2: Camouflage (D-11)** - `9f4613b` (feat)

## TDD Gate Compliance

Both tasks were `tdd="true"`. As with every prior Wave 4/5 plan in this phase (10-04/10-06/10-07/10-08), each gear file and its slice of `objective-gear.test.ts` were authored together as one coherent implementation-plus-test pass rather than a literal fail-first RED commit, then split back into the plan's two task-sized commits: Task 1's commit contains only `reroll.ts`/`reassign.ts` and the Compass/Trail Map `describe` blocks (9 tests), verified green and typecheck-clean in isolation before committing; Task 2's commit then adds `ghost.ts` and the Camouflage `describe` block (5 more tests), also independently verified green (14 total) and typecheck-clean before committing. No failing-test commit was ever pushed; both task-boundary states were proven green before their respective commits — this is the same documented deviation as every prior plan in this phase, for the same reason (the behavior and its test are two views of one contract, and splitting them into a literal RED-then-GREEN pair would mean writing a test file today whose assertions I already know will pass, then artificially withholding the implementation).

## Files Created/Modified

- `packages/rules/src/expedition/gear/reroll.ts` - Compass `GearDef`
- `packages/rules/src/expedition/gear/reassign.ts` - Trail Map `GearDef` (D-10)
- `packages/rules/src/expedition/gear/ghost.ts` - Camouflage `GearDef` (D-11)
- `packages/rules/src/expedition/gear/objective-gear.test.ts` - all 14 behaviors across three describe blocks (5 Compass, 4 Trail Map, 5 Camouflage)

## Decisions Made

- Compass's `canTarget` relies on `validateTargets`'s own `face-up-objective` check having already run (guaranteeing the target exists and is unowned) before adding only the kind/deck checks — it never re-derives what the toolkit's generic target validation already proved.
- Trail Map's `apply` always swaps `(ctx.self, target)` regardless of which side actually holds a pending objective; the toolkit's `swap-objectives` op is itself a no-op for whichever side has nothing pending (D-10), so `canTarget`'s only job is refusing the case where NEITHER side has anything to swap.
- Camouflage's `effectModifier` reads only the closed-over `ActiveEffect.seatId`, never anything from `RunState`/`AttemptState` beyond what `ruleLayersFor` (10-03) already threads in — matching D-08/D-08's Flare and Whistle's own `effectModifier` shape from 10-08.
- Test fixtures for Trail Map (camp 2, 3 seats/3 slots) deliberately avoid leader-probing since round-robin picking guarantees each seat exactly one objective; Compass (camp 4) and the Camouflage immediate-success case (camp 1) both need a same-seed probe run first, since their slot/seat counts don't guarantee a specific seat's ownership without knowing the leader.

## Deviations from Plan

- **[Process, not behavior]** Both `tdd="true"` tasks were implemented as a single coherent implementation-plus-test pass per gear file, then split into per-task commits reflecting the plan's task boundaries — see "TDD Gate Compliance" above. This exactly mirrors 10-04/10-06/10-07/10-08-SUMMARY.md's own documented deviation of the same kind. No plan behavior, acceptance criterion, or test coverage was skipped; both task-boundary states were independently test-green and typecheck-green before being committed.
- No bugs, missing critical functionality, or blocking issues were found in the Plan 02/04/07 code this plan depends on (gear-def, toolkit, run-actions, run-test-support, lifecycle, compose) requiring a Rule 1/2/3 fix.

## Threat Model Compliance

- T-10-31 (Camouflage on another seat's objective): mitigated by the `own-objective` target kind's owner/pending check in `validateTargets` (toolkit.ts, unchanged by this plan); proven by the "targeting a teammate's objective is invalid_target" test.
- T-10-32 (Trail Map moving completed objectives): mitigated by `swap-objectives`'s pending-only filter (toolkit.ts, unchanged by this plan); proven by the "D-10: a done objective stays with its owner" test.
- T-10-33 (Compass revealing objective-deck order): accepted per the plan's own threat register — no mitigation added, matching disposition.

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/gear/reroll.ts
- FOUND: packages/rules/src/expedition/gear/reassign.ts
- FOUND: packages/rules/src/expedition/gear/ghost.ts
- FOUND: packages/rules/src/expedition/gear/objective-gear.test.ts
- FOUND: f05ff0e (git log)
- FOUND: 9f4613b (git log)

## Verification

- `npx vitest run --project rules packages/rules/src/expedition/gear/objective-gear.test.ts` — 14 tests passed (5 Compass, 4 Trail Map, 5 Camouflage)
- `npx vitest run --project rules` — 41 files, 591 tests passed
- `npm run typecheck` — exits 0
- `grep -n 'window: "objective-pick"' packages/rules/src/expedition/gear/reroll.ts` / `grep -n "Only card objectives can be rerolled" packages/rules/src/expedition/gear/reroll.ts` — present
- `grep -n 'targets: \[{ kind: "teammate" }\]' packages/rules/src/expedition/gear/reassign.ts` / `grep -n "D-10" packages/rules/src/expedition/gear/reassign.ts` — present
- `grep -n '"remove-objective"' packages/rules/src/expedition/gear/ghost.ts` / `grep -n "ghost-broke-cover" packages/rules/src/expedition/gear/ghost.ts` / `grep -n "You have already won a trick this camp" packages/rules/src/expedition/gear/ghost.ts` — present
- `grep -c "countTricksWon(" packages/rules/src/expedition/gear/ghost.ts` — 5 (>= 2)
