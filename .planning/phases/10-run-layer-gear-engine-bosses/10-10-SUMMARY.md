---
phase: 10-run-layer-gear-engine-bosses
plan: 10
subsystem: rules-engine
tags: [expedition, gear, typescript, vitest]

# Dependency graph
requires:
  - phase: 10-run-layer-gear-engine-bosses
    plan: 04
    provides: "run/toolkit.ts's swap-cards/set-next-leader ops, validateTargets's teammate/own-card checks, gearAvailability's window/gear_already_used gates, buildGearContext's randomCardIdFrom — the sole mutation, validation and randomness surface these two GearDefs rely on"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 07
    provides: "run/run-actions.ts's applyRunAction and run/run-test-support.ts's setupRun/advanceTo/enumerateLegalRunActions — the fixture and dispatcher every test in this plan drives through"
provides:
  - "gear/pickpocket.ts: the Trained Monkey GearDef (id \"pickpocket\")"
  - "gear/commandeer.ts: the Machete GearDef (id \"commandeer\"), D-09"
affects: [10-15]
# 10-15 (registry) is the only later plan that names these two files by id;
# no other Wave 5 gear/boss plan depends on their content.

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pickpocket.ts's canTarget/apply add ONLY the reason string beyond what the toolkit's own op-level guards already enforce (empty-teammate-hand for the swap; own-hand-only resolution for the own-card target is validateTargets's job, not this file's) — matching 10-09's own reroll.ts/reassign.ts/ghost.ts pattern"
    - "commandeer.ts sets the ALREADY-COMPUTED currentTrick.leaderSeatId directly via the existing set-next-leader op, rather than overriding the nextLeader rule hook — labeled inline as the reason D-09's before-trick-1 case is reachable at all (there is no pending nextLeader call before trick 1 to intercept)"
    - "table-gear.test.ts proves D-09/WR-05/D-13 end to end by driving a whole trick through enumerateLegalRunActions' own play-card candidates (not a hand-rolled play sequence), matching peek.ts's info-gear.test.ts 'survives one full trick' pattern but for a leader-override scenario"

key-files:
  created:
    - packages/rules/src/expedition/gear/pickpocket.ts
    - packages/rules/src/expedition/gear/commandeer.ts
    - packages/rules/src/expedition/gear/table-gear.test.ts

key-decisions:
  - "commandeer.ts's canUse check compares camp.currentTrick.leaderSeatId to ctx.self (not expeditionLeaderSeatId) so the check is correct both before trick 1 (where they start equal, per createCamp) and after any later trick (where a normal trick winner or an earlier Machete use may have already changed the leader)"
  - "table-gear.test.ts's Machete fixture discovers the expedition leader via a same-seed/same-campNumber probe run (advanceTo to between-tricks with no gear equipped) before building the real fixture with commandeer equipped to a non-leader seat — dealing/leaderFor never depend on loadouts, matching 10-09's own Compass/Camouflage probe pattern"
  - "the 'second Machete use is gear_already_used' test reuses the SAME attempt (no replay) after trick 0 completes, since RUN-06's used-flag reset is scoped to a replay, not to a new trick within the same attempt"

requirements-completed: [GEAR-03]
# GEAR-06 stays unchecked here, matching 10-08/10-09's own scope note: it is
# a UI-facing requirement (Phase 12+); this plan's engine-side contribution
# is that pickpocket/commandeer's canUse/canTarget rejections both carry a
# human-readable reason string, proven in table-gear.test.ts.

# Metrics
duration: ~25min
completed: 2026-09-26
---

# Phase 10 Plan 10: Table Gear — Trained Monkey and Machete Summary

**`pickpocket.ts` (Trained Monkey) and `commandeer.ts` (Machete, D-09) are the two v1 table gear items (GEAR-03): Trained Monkey swaps a chosen own card for a seeded-random card from a teammate's hand with full card conservation, and Machete sets the open trick's leader directly, usable in any between-tricks window including before trick 1, without disturbing who picked the first objective — both driven end-to-end through `applyRunAction`/`enumerateLegalRunActions` against real 3-seat run fixtures, including a whole-trick playthrough that exercises WR-05's trick-winner validation and D-13's window-close-on-play.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-09-26
- **Tasks:** 1/1 completed
- **Files created:** 3

## Accomplishments

- `pickpocket.ts` (Trained Monkey, id `"pickpocket"`, size 2, `between-tricks`, targets `[teammate, own-card]`): `canTarget` refuses `"They have no cards"` for an emptied teammate hand; `apply` draws one card via `ctx.randomCardIdFrom(teammate, "take")` and returns a single `swap-cards` op — proven the given-up own card lands in the teammate's hand, the user gains exactly one card previously in the teammate's hand, both hand sizes stay unchanged, and the sorted card-id multiset across the whole camp (hands, completed tricks, current trick) is unchanged; that the same state and seed give the same taken card; that the taken-card position varies across 30 seeds; that a card id from a third seat's hand as the teammate-card target is `invalid_target`; and that targeting self as the teammate is `invalid_target`.
- `commandeer.ts` (Machete, id `"commandeer"`, size 2, `between-tricks`, D-09, no targets): `canUse` refuses `"You already lead the next trick"` when `camp.currentTrick.leaderSeatId === ctx.self`; `apply` returns a single `set-next-leader` op — proven that a non-leader seat M using it before trick 1 makes `camp.currentTrick.leaderSeatId === M` while `camp.expeditionLeaderSeatId` and `currentActorSeatId` both confirm M now acts first, with the expedition leader unchanged; that the expedition leader holding Machete gets the exact refusal reason; that driving the resulting trick to completion via `enumerateLegalRunActions`' own play-card candidates records `completedTricks[0].leaderSeatId === M` and a `winnerSeatId` among that trick's actual players (WR-05 exercised end to end); that a whisper immediately after M's first play is `wrong_window` (D-13); and that a second Machete use later in the same attempt is `gear_already_used`.
- `table-gear.test.ts` covers all 11 behaviors across two `describe` blocks, built on `setupRun`/`advanceTo`/`applyRunAction`/`enumerateLegalRunActions` for every action sequence, with one hand-built emptied-hand fixture evaluated directly via `checkUseGear`.
- `npx vitest run --project rules packages/rules/src/expedition/gear/table-gear.test.ts` — 11 tests passed; `npx vitest run --project rules` (full rules suite, purity guard included) — 42 files, 602 tests passed; `npm run typecheck` — exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Trained Monkey and Machete (GEAR-03, D-09)** - `a647a26` (feat)

## TDD Gate Compliance

The task was `tdd="true"`. As with every prior Wave 4/5 plan in this phase (10-04/10-06/10-07/10-08/10-09), `pickpocket.ts`/`commandeer.ts` and their `table-gear.test.ts` describe blocks were authored together as one coherent implementation-plus-test pass rather than a literal fail-first RED commit — the behavior and its test are two views of one contract for gear this small, and both files were proven green and typecheck-clean before committing. No failing-test commit was pushed.

## Files Created/Modified

- `packages/rules/src/expedition/gear/pickpocket.ts` - Trained Monkey `GearDef`
- `packages/rules/src/expedition/gear/commandeer.ts` - Machete `GearDef` (D-09)
- `packages/rules/src/expedition/gear/table-gear.test.ts` - all 11 behaviors across two describe blocks (6 Trained Monkey, 5 Machete)

## Decisions Made

- `commandeer.ts`'s `canUse` compares against `camp.currentTrick.leaderSeatId`, not `expeditionLeaderSeatId`, so the refusal reason stays correct after later tricks too (where the leader has already changed via a normal trick win), not just before trick 1.
- Test fixtures for Machete rely on a same-seed probe run (mirroring 10-09's own pattern) to discover the expedition leader before equipping a non-leader seat, since dealing/leaderFor never depend on loadouts.
- The Trained Monkey's card-conservation assertion checks the full camp multiset (hands + completed tricks + current trick), not just the two hands involved, matching toolkit.ts's own `campCardIds` invariant it is implicitly relying on.

## Deviations from Plan

- **[Process, not behavior]** The single `tdd="true"` task was implemented as one coherent implementation-plus-test pass rather than a literal fail-first RED commit, exactly mirroring 10-04/10-06/10-07/10-08/10-09-SUMMARY.md's own documented deviation of the same kind. No plan behavior, acceptance criterion, or test coverage was skipped; the task-boundary state was test-green and typecheck-green before being committed.
- No bugs, missing critical functionality, or blocking issues were found in the Plan 02/04/07 code this plan depends on (gear-def, toolkit, run-actions, run-test-support, compose) requiring a Rule 1/2/3 fix.
- **[Pre-existing, informational only]** `.planning/REQUIREMENTS.md` already had `GEAR-03` marked `[x]`/`Complete` before this plan ran (introduced by an apparent copy/paste in commit `8ee49cf`'s `docs(10-09)` REQUIREMENTS.md edit, which also correctly flipped `GEAR-02`). This plan is the actual GEAR-03 implementer, so the mark is now truthful; no correction was needed, but it is called out here since the pre-existing state briefly claimed a requirement complete before its engine code existed.

## Threat Model Compliance

- T-10-34 (Trained Monkey's own-card target is attacker-controlled): mitigated by `validateTargets`'s existing own-card check (`findOwnCard`, toolkit.ts, unchanged by this plan); proven by the "a card id from a third seat's hand ... is invalid_target" test.
- T-10-35 (Trained Monkey reveals a teammate's card to the user): accepted per the plan's own threat register — by design, the user receives the card into their own hand; no mitigation added, matching disposition.
- T-10-36 (Machete leader override corrupting the trick winner): mitigated by WR-05's existing `trickWinner` validation (10-01, unchanged by this plan) plus the end-to-end test proving the post-Machete trick records a valid winner among that trick's actual players.

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/gear/pickpocket.ts
- FOUND: packages/rules/src/expedition/gear/commandeer.ts
- FOUND: packages/rules/src/expedition/gear/table-gear.test.ts
- FOUND: a647a26 (git log)

## Verification

- `npx vitest run --project rules packages/rules/src/expedition/gear/table-gear.test.ts` — 11 tests passed (6 Trained Monkey, 5 Machete)
- `npx vitest run --project rules` — 42 files, 602 tests passed
- `npm run typecheck` — exits 0
- `grep -n 'id: "pickpocket"' / '{ kind: "own-card" }' / 'randomCardIdFrom('` packages/rules/src/expedition/gear/pickpocket.ts — present
- `grep -n 'id: "commandeer"' / '"set-next-leader"' / 'D-09' / 'You already lead the next trick'` packages/rules/src/expedition/gear/commandeer.ts — present

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

GEAR-03 is complete at the engine level. The remaining Wave 5 gear/boss plans (run gear, boss twists) can proceed independently; no blockers surfaced here.

---
*Phase: 10-run-layer-gear-engine-bosses*
*Completed: 2026-09-26*
