---
phase: 10-run-layer-gear-engine-bosses
plan: 08
subsystem: rules-engine
tags: [expedition, gear, whisper, information, typescript, vitest]

# Dependency graph
requires:
  - phase: 10-run-layer-gear-engine-bosses
    plan: 04
    provides: "run/toolkit.ts's gearAvailability/buildGearContext/validateTargets/applyToolkitOps — the sole mutation surface these GearDefs' apply ops execute through"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 06
    provides: "run/whisper.ts's whispersUsedBy — the D-08 Flare guard reads this directly; run/use-gear.ts's checkUseGear/applyUseGear — the pipeline these GearDefs are used through"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 07
    provides: "run/run-actions.ts's applyRunAction and run/run-test-support.ts's setupRun/advanceTo — the fixture and dispatcher every test in this plan drives through"
provides:
  - "gear/chatter.ts: the Signal Whistle GearDef (id \"chatter\")"
  - "gear/peek.ts: the Spyglass GearDef (id \"peek\")"
  - "gear/broadcast.ts: the Signal Flare GearDef (id \"broadcast\"), D-08"
affects: [10-15]
# 10-15 (registry) is the only later plan that names these three files by id;
# no other Wave 5 gear/boss plan depends on their content.

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "the Whistle and the Flare are both modeled as ACTIVATED gear (apply -> add-modifier -> effectModifier), never passiveModifier, even though their effect reads like a passive capacity bump — this is what gives each its own once-per-camp isGearSpent gate (RUN-06/GEAR-05), independent of the Whisper's own no_whispers_left cap"
    - "the toolkit's reveal op stamps source: gearId itself (toolkit.ts's applyOp case \"reveal\"), so peek.ts never writes the literal string \"peek\" as a reveal source — only as its own GearDef.id"
    - "D-08's ordering guarantee is inherited, not re-implemented: broadcast.ts's effectModifier reads whispersUsedBy(run, seatId) === 0 at widen-time, relying on whisper.ts's applyWhisper computing whisperAudience BEFORE appending the whisper's own log entry (already proven in 10-06)"

key-files:
  created:
    - packages/rules/src/expedition/gear/chatter.ts
    - packages/rules/src/expedition/gear/peek.ts
    - packages/rules/src/expedition/gear/broadcast.ts
    - packages/rules/src/expedition/gear/info-gear.test.ts

key-decisions:
  - "chatter.ts/broadcast.ts's apply() ignores ctx entirely (returns a bare add-modifier op with no cardId/audience) — there is nothing else for either gear's apply to compute; all of their real behavior lives in effectModifier, which is exactly the plan's own described shape"
  - "peek.ts's apply throws if randomCardIdFrom returns null (empty hand) rather than returning an empty ops list — canTarget's own \"They have no cards\" check (checkUseGear's target-validation stage) already refuses the use before apply ever runs, so this throw is unreachable in practice and exists only as an assertion against a canTarget/apply disagreement, matching toolkit.ts's own \"content-author defect throws\" policy (POLICY A3)"
  - "the Flare's own describe block in info-gear.test.ts uses a distinct loadout (p0 equipping chatter+peek+broadcast) from the Whistle/Spyglass block's plan-specified fixture (chatter+peek only), since D-08's own must_haves require both gear items active in the same camp to prove the Whistle's second whisper turns private again after a spent Flare"

requirements-completed: [GEAR-01]
# GEAR-01's REQUIREMENTS.md text names exactly these three items (Signal
# Whistle, Spyglass, Signal Flare) and nothing else, so this plan completes
# it in full at the engine level. COMM-01/COMM-02 were already marked
# complete by 10-07 (the Whisper action dispatcher) and are unaffected here.
# GEAR-06 stays UNCHECKED, matching 10-06-SUMMARY.md's own explicit scope
# note: its REQUIREMENTS.md text ("shows the reason") describes UI behavior
# Phase 12+ owns. This plan's engine-side contribution — every canUse/
# canTarget rejection this file's three GearDefs can produce carries a
# human-readable reason string, proven in info-gear.test.ts — is already
# complete, but the requirement itself is not.

# Metrics
duration: ~35min
completed: 2026-09-27
---

# Phase 10 Plan 08: Information Gear — Signal Whistle, Spyglass, Signal Flare Summary

**`chatter.ts` (Signal Whistle), `peek.ts` (Spyglass) and `broadcast.ts` (Signal Flare) are the three v1 information gear items (GEAR-01): the Whistle and the Flare are both modeled as activated once-per-camp effects that modify the Whisper's `whispersPerCamp`/`whisperAudience` hooks, and the Spyglass reveals one seeded-random card to its user only (COMM-02) — every behavior driven end-to-end through `applyRunAction`/`checkUseGear` against a real 3-seat run fixture.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-09-27
- **Tasks:** 2/2 completed
- **Files created:** 4

## Accomplishments

- `chatter.ts` (Signal Whistle, id `"chatter"`, size 1, `between-tricks`): `canUse` refuses `"Whispers are blocked this camp"` when `whisperAllowed` is false (GEAR-06/Monsoon/Rain Poncho); `apply` returns `add-modifier`; `effectModifier` raises `whispersPerCamp` by exactly 1 for its owner only — proven that a second whisper is `no_whispers_left` without it, succeeds after use (before OR after the owner's first whisper), a third whisper is still `no_whispers_left`, and using the Whistle itself twice is `gear_already_used`.
- `peek.ts` (Spyglass, id `"peek"`, size 1, `between-tricks`, one `teammate` target): `canTarget` refuses `"They have no cards"` for an empty target hand; `apply` draws `ctx.randomCardIdFrom(target, "peek")` and returns a single `reveal` op with `audience: [ctx.self]` — proven the resulting reveal's `cardId` is always in the target's hand, is deterministic for identical seed/state, is non-constant across 30 distinct seeds (at least two distinct hand positions chosen), survives a full trick of card plays (COMM-02), and that targeting self is `invalid_target`.
- `broadcast.ts` (Signal Flare, id `"broadcast"`, size 1, `between-tricks`, D-08): `canUse` refuses `"Whispers are blocked this camp"` then `"You have already whispered this camp"` (in that order) once `whispersUsedBy(ctx.run, ctx.self) > 0`; `apply` returns `add-modifier`; `effectModifier` widens `whisperAudience` to `[...run.seatIds]` only while `whispersUsedBy(run, seatId) === 0` for its own owner — proven a flared whisper's audience is all three seats, a Whistle-granted second whisper right after is private again (`["p1"]` only), and a teammate's own whisper after someone else's Flare is unaffected.
- `info-gear.test.ts` covers all 16 behaviors across three `describe` blocks, built exclusively on `setupRun`/`advanceTo`/`applyRunAction` (never a hand-rolled shortcut), with `checkUseGear` called directly only for the GEAR-06 reason-string assertions `applyRunAction`'s `AdapterResult` doesn't carry.
- `npx vitest run --project rules packages/rules/src/expedition/gear/info-gear.test.ts` — 16 tests passed; `npx vitest run --project rules packages/rules/src/expedition` (full suite, purity guard included) — 22 files, 379 tests passed; `npm run typecheck` — exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Signal Whistle and Spyglass** - `9766fb6` (feat)
2. **Task 2: Signal Flare (D-08)** - `dfdb3e2` (feat)

## TDD Gate Compliance

Both tasks were `tdd="true"`. As with 10-04/10-06/10-07, each gear file and its slice of `info-gear.test.ts` were authored together as one coherent implementation-plus-test pass rather than a literal fail-first RED commit, then split back into the plan's two task-sized commits (Task 1's commit contains only `chatter.ts`/`peek.ts` and the Whistle/Spyglass `describe` blocks, verified green and typecheck-clean in isolation before committing; Task 2's commit then adds `broadcast.ts` and the Flare `describe` block, also independently verified green). This is the same documented deviation as the three prior Wave 4/5 plans — no failing-test commit was ever pushed, and both task-boundary states were proven green before their respective commits.

## Files Created/Modified

- `packages/rules/src/expedition/gear/chatter.ts` - Signal Whistle `GearDef`
- `packages/rules/src/expedition/gear/peek.ts` - Spyglass `GearDef`
- `packages/rules/src/expedition/gear/broadcast.ts` - Signal Flare `GearDef` (D-08)
- `packages/rules/src/expedition/gear/info-gear.test.ts` - all 16 behaviors across three describe blocks (5 Whistle, 6 Spyglass, 5 Flare)

## Decisions Made

- The Whistle and the Flare are activated gear (`apply` → `add-modifier` → `effectModifier`), never `passiveModifier` — see key-decisions above for why this is required by RUN-06/GEAR-05's per-camp used-flag contract rather than a stylistic choice.
- `peek.ts`'s reveal `source` field is never written by this file — the toolkit's `reveal` op (`toolkit.ts`) stamps `source: gearId` itself, so "peek" appears in this file only as `id: "peek"`.
- The Flare's test fixture uses its own loadout (`chatter`+`peek`+`broadcast` on p0) distinct from the Whistle/Spyglass block's plan-specified fixture (`chatter`+`peek` only), since D-08's must_haves require both gear items active together to prove the second-whisper-turns-private-again behavior.

## Deviations from Plan

- **[Process, not behavior]** Both `tdd="true"` tasks were implemented as a single coherent implementation-plus-test pass per gear file, then split into per-task commits reflecting the plan's task boundaries — see "TDD Gate Compliance" above. This exactly mirrors 10-04/10-06/10-07-SUMMARY.md's own documented deviation of the same kind. No plan behavior, acceptance criterion, or test coverage was skipped; both task-boundary states were independently test-green and typecheck-green before being committed.
- No bugs, missing critical functionality, or blocking issues were found in the Plan 02/04/06/07 code this plan depends on (gear-def, toolkit, whisper, use-gear, run-actions, run-test-support) requiring a Rule 1/2/3 fix.

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/gear/chatter.ts
- FOUND: packages/rules/src/expedition/gear/peek.ts
- FOUND: packages/rules/src/expedition/gear/broadcast.ts
- FOUND: packages/rules/src/expedition/gear/info-gear.test.ts
- FOUND: 9766fb6 (git log)
- FOUND: dfdb3e2 (git log)

## Verification

- `npx vitest run --project rules packages/rules/src/expedition/gear/info-gear.test.ts` — 16 tests passed (5 Whistle, 6 Spyglass, 5 Flare)
- `npx vitest run --project rules packages/rules/src/expedition` — 22 files, 379 tests passed
- `npm run typecheck` — exits 0
- `grep -n 'id: "chatter"' packages/rules/src/expedition/gear/chatter.ts` / `grep -n 'id: "peek"' packages/rules/src/expedition/gear/peek.ts` / `grep -n 'id: "broadcast"' packages/rules/src/expedition/gear/broadcast.ts` — all present
- `grep -c "randomCardIdFrom(" packages/rules/src/expedition/gear/peek.ts` — 1
- `grep -cE "\.push\(|\.splice\(" packages/rules/src/expedition/gear/chatter.ts packages/rules/src/expedition/gear/peek.ts` — 0 total
- `grep -c "whispersUsedBy(" packages/rules/src/expedition/gear/broadcast.ts` — 5 (>= 2)
- `grep -c "You have already whispered this camp" packages/rules/src/expedition/gear/broadcast.ts` — 1
