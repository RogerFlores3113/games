---
phase: 10-run-layer-gear-engine-bosses
plan: 06
subsystem: rules-engine
tags: [expedition, run-layer, whisper, gear, toolkit, typescript, vitest]

# Dependency graph
requires:
  - phase: 10-run-layer-gear-engine-bosses
    plan: 03
    provides: "run/compose.ts's rulesFor(run, catalog): RunRules — the composed hooks both this plan's functions read whisper/gear behavior through"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 04
    provides: "run/toolkit.ts's currentWindow, gearAvailability, buildGearContext, validateTargets, applyToolkitOps — the GEAR-06 reason-string contract and the sole ToolkitOp executor this plan's use-gear.ts calls"
provides:
  - "run/whisper.ts: whispersUsedBy, whisperLegality, applyWhisper — the mid-camp Whisper action (COMM-01/COMM-02), the one player action that is not a card play and not routed through the toolkit"
  - "run/use-gear.ts: checkUseGear, applyUseGear — the generic pipeline every v1 gear item (wave 5) is used through: availability -> target validation -> canTarget -> toolkit execution -> GearUse + public log"
affects: [10-07, 10-08, 10-09, 10-10, 10-11, 10-12, 10-13, 10-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "whisper audience computed BEFORE the whisper is recorded: applyWhisper calls rules.whisperAudience(run, actor, target) against the pre-append RunState, so a boss/gear hook reading whispersUsedBy (Signal Flare's D-08) always sees prior whispers only, never the one currently being applied"
    - "whispersUsedBy is fully derived from attempt.log's 'whisper' entries (no counter field anywhere) — matches toolkit.ts's isGearSpent deriving from attempt.gearUses"
    - "checkUseGear/applyUseGear build their GearContext against the PRE-USE run (before applyToolkitOps has appended anything), so buildGearContext's A1 stream index k = attempt.gearUses.length always reads the count as it stood before this exact use"
    - "the public 'use-gear' log entry's subjectSeatIds is filtered to only the def's 'teammate'-kind target positions (index-matched against def.targets), never a card id or an own-card/objective target"

key-files:
  created:
    - packages/rules/src/expedition/run/whisper.ts
    - packages/rules/src/expedition/run/whisper.test.ts
    - packages/rules/src/expedition/run/use-gear.ts
    - packages/rules/src/expedition/run/use-gear.test.ts
  modified: []

key-decisions:
  - "whisperLegality's wrong_phase guard checks both run.attempt === null (fireside) and run.attempt.camp === null (pre-deal) as one combined case, since the plan's own guard-order note groups them ('no attempt or camp null') and no behavior test distinguishes the two"
  - "applyWhisper recomputes rulesFor(run, catalog) a second time after whisperLegality's internal call, rather than threading the composed RunRules through as a return value — matches compose.ts's own 'no cache, recompute fresh' discipline and keeps whisperLegality's signature exactly as the plan specifies"
  - "use-gear.test.ts's fake-invalid gear triggers the toolkit's audience-must-be-a-known-seat throw (a reveal naming a non-existent seat) as the concrete 'op violating an invariant' case from the behavior list, since that throw path was already proven correct in toolkit.test.ts and needed no new toolkit change to exercise here"

requirements-completed: []
# COMM-01 and COMM-02 are FULLY implemented at the rules-engine level by this
# plan (whisper.ts's whisperLegality/applyWhisper enforce the between-tricks
# window, the once-per-camp cap, own-hand-only card selection, and the
# audience-scoped Reveal + card-free public LogEntry; COMM-02's clear-on-
# replay/camp-end behavior falls out of RUN-06's reset-on-replay contract,
# already structurally in place since Plan 10-02/10-05). They are left
# UNCHECKED in REQUIREMENTS.md, matching this project's established
# precedent (10-05-SUMMARY.md's RUN-04/BOSS-01 treatment): the actual
# "whisper" RunAction dispatch that lets a player invoke this from the run
# loop is Plan 10-07's dispatcher, not this plan, so the requirement's
# full user-facing behavior is not yet reachable.
# GEAR-05 (confirm step) and GEAR-06 (visible reason) are explicitly ruled
# UI-facing / Phase 12+ scope by 10-CONTEXT.md's own domain boundary ("This
# phase delivers only the engine side: final-once-resolved actions, and
# canUse returning a reason string"). use-gear.ts fully delivers that engine
# side (GEAR-05: no undo action exists, isGearSpent is atomic with the
# effect; GEAR-06: checkUseGear surfaces a reason string for every
# rejection), but the requirements themselves describe UI behavior (a
# confirm step, a rendered reason) this phase does not build. Left
# unchecked per the phase's own explicit scope note, not an oversight.

# Metrics
duration: ~30min
completed: 2026-09-26
---

# Phase 10 Plan 06: The Whisper & Generic Use-Gear Pipeline Summary

**`run/whisper.ts` implements the Whisper (COMM-01/COMM-02) as a reveal-plus-public-log action outside the toolkit, and `run/use-gear.ts` implements the generic pipeline (availability → target validation → canTarget → toolkit execution) that all ten v1 gear items will be used through — both fully covered by tests against fake boss/gear fixtures, with no real gear or bosses imported.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-09-26
- **Tasks:** 2/2 completed
- **Files created:** 4

## Accomplishments

- `whispersUsedBy(run, seatId)` derives the whisper count from `attempt.log`'s `"whisper"` entries only (no counter field, `grep`-proven) and returns `0` with no attempt in progress.
- `whisperLegality` enforces the plan's exact guard order — `wrong_phase` (no attempt or camp null) → `wrong_window` (must be `currentWindow(run, rules) === "between-tricks"`, D-13's no-grace-period rule) → `whisper_blocked` (composed `whisperAllowed`) → `no_whispers_left` (composed `whispersPerCamp`, base 1) → `invalid_target` (self or non-seat) → `card_not_in_hand` (`findOwnCard`, own-hand-only, T-10-20) — proven with one test per rejection reason.
- `applyWhisper` computes `whisperAudience` against the pre-append `RunState` (proven with a fake `effectModifier` layer that widens the audience to all seats), then appends a `Reveal { cardId, fromSeatId, audience, source: "whisper" }` and a card-free public `LogEntry { event: "whisper", actorSeatId, subjectSeatIds: [target], gearId: null, audience: "public" }` immutably; a fake effect layer raising `whispersPerCamp` to 2 for one seat is proven to permit a second whisper; the reveal is proven to survive `playOneTrick` (COMM-02's within-camp lifetime).
- `checkUseGear` runs `gearAvailability` (already GEAR-06-compliant from Plan 10-04) first, then validates the `targets` value is an array of strings, then `validateTargets` against the def's declared `TargetSpec`s, then `def.canTarget` — every rejection carrying a reason string.
- `applyUseGear` builds the `GearContext` against the **pre-use** `run` (so `buildGearContext`'s A1 stream index `k = attempt.gearUses.length` reads the count as it stood before this use), executes `def.apply`'s ops through `applyToolkitOps`, then appends a `GearUse { kind: "used" }` (GEAR-05 finality — proven: a second use of the same gear is rejected with `gear_already_used`) and a public `"use-gear"` log naming only `"teammate"`-kind targets.
- Proven against six fake `GearDef`s (`fake-peek`, `fake-lead`, `fake-pre`, `fake-blocked`, `fake-passive`, `fake-invalid`): success with reveal/GearUse/log, `gear_already_used`, `gear_not_equipped`, `wrong_window` (both a window mismatch and the passive-always-active case), `gear_unavailable` with the reason `"Not now"`, `invalid_target` (self-as-teammate and a non-array `targets`), determinism across two `structuredClone` copies, RUN-06 reset-on-replay (a fresh `AttemptState` makes the same gear usable again), and a thrown invariant violation (a `reveal` op naming an unknown seat) that leaves the input state untouched.
- `npx vitest run --project rules packages/rules/src/expedition/run/whisper.test.ts packages/rules/src/expedition/run/use-gear.test.ts` — 24 tests passed; `npx vitest run --project rules packages/rules/src/expedition/run` — 8 files, 149 tests passed; `npx vitest run --project rules packages/rules/src/expedition` (full suite, purity guard included) — 19 files, 321 tests passed; `npm run typecheck` — exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: The Whisper (COMM-01, COMM-02)** - `459dcf9` (feat)
2. **Task 2: Generic use-gear pipeline (GEAR-05 engine side, GEAR-06, RUN-06)** - `c9e6d11` (feat)

## TDD Gate Compliance

Both tasks were `tdd="true"`. As with Plan 10-04, each file's implementation and its test file were authored together as one coherent pass and committed as a single `feat` commit per task (not a literal RED-then-GREEN commit pair). Both files were proven green (tests + `npm run typecheck`) before their respective commits — no failing-test commit was ever pushed, and no plan behavior or acceptance criterion was skipped. This mirrors 10-04-SUMMARY.md's own documented deviation of the same kind.

## Files Created/Modified

- `packages/rules/src/expedition/run/whisper.ts` - `whispersUsedBy`, `whisperLegality`, `applyWhisper`
- `packages/rules/src/expedition/run/whisper.test.ts` - every rejection reason, the audience/log/whispersUsedBy acceptance path, a `whispersPerCamp`-raising effect layer, a `whisperAudience`-widening effect layer, and the COMM-02 within-camp lifetime proof
- `packages/rules/src/expedition/run/use-gear.ts` - `checkUseGear`, `applyUseGear`
- `packages/rules/src/expedition/run/use-gear.test.ts` - the full behavior list against six fake `GearDef`s, including GEAR-05 finality, GEAR-06 reason strings, RUN-06 reset-on-replay, determinism, and the thrown-invariant-violation case

## Decisions Made

- `whisperLegality`'s `wrong_phase` guard treats "no attempt" and "attempt.camp is null" as one combined case (matching the plan's own guard-order note), since no behavior test in the plan distinguishes fireside from pre-deal for the Whisper (a Whisper is never legal in either).
- `applyWhisper` recomputes `rulesFor(run, catalog)` itself after `whisperLegality`'s own internal call, rather than threading the composed `RunRules` through as part of `whisperLegality`'s return value — this keeps `whisperLegality`'s signature exactly as the plan specifies and matches `compose.ts`'s "recompute fresh, never cache" discipline (the cost is negligible: `rulesFor` is pure and cheap).
- `use-gear.test.ts`'s "invariant-violating op" case uses a `reveal` op naming an unknown seat (a case `toolkit.test.ts` already proves throws) rather than inventing a new toolkit failure path, since the plan's own example ("for example, reveal to a non-seat") names exactly this case.

## Deviations from Plan

- **[Process, not behavior]** Both `tdd="true"` tasks were implemented as a single coherent implementation-plus-test pass per file, then committed as one `feat` commit per task rather than each going through a literal fail-first RED commit. See "TDD Gate Compliance" above — this exactly mirrors 10-04-SUMMARY.md's own documented deviation of the same kind. No plan behavior, acceptance criterion, or test coverage was skipped; both task-boundary states were independently test-green and typecheck-green before being committed.
- No bugs, missing critical functionality, or blocking issues were found in the Plan 02/03/04 code this plan depends on (types, compose, toolkit) requiring a Rule 1/2/3 fix.

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/run/whisper.ts
- FOUND: packages/rules/src/expedition/run/whisper.test.ts
- FOUND: packages/rules/src/expedition/run/use-gear.ts
- FOUND: packages/rules/src/expedition/run/use-gear.test.ts
- FOUND: 459dcf9 (git log)
- FOUND: c9e6d11 (git log)

## Verification

- `npx vitest run --project rules packages/rules/src/expedition/run/whisper.test.ts` — 12 tests passed
- `npx vitest run --project rules packages/rules/src/expedition/run/use-gear.test.ts packages/rules/src/expedition/run/whisper.test.ts` — 24 tests passed
- `npx vitest run --project rules packages/rules/src/expedition/run` — 8 files, 149 tests passed
- `npx vitest run --project rules packages/rules/src/expedition` — 19 files, 321 tests passed
- `npm run typecheck` — exits 0
- `grep -n "^export function" packages/rules/src/expedition/run/whisper.ts` — whispersUsedBy, whisperLegality, applyWhisper
- `grep -c "whisperAudience(" packages/rules/src/expedition/run/whisper.ts` — 2 (>= 1)
- `grep -c "whispersPerCamp(" packages/rules/src/expedition/run/whisper.ts` — 1 (>= 1)
- `grep -cE "whisperCount|whispersUsed:" packages/rules/src/expedition/run/whisper.ts` — 0
- `grep -cE "wrong_window|wrong_phase|whisper_blocked|no_whispers_left|invalid_target|card_not_in_hand" packages/rules/src/expedition/run/whisper.test.ts` — 16
- `grep -c "applyToolkitOps(" packages/rules/src/expedition/run/use-gear.ts` — 1
- `grep -c "gearAvailability(" packages/rules/src/expedition/run/use-gear.ts` — 1 (>= 1)
- `grep -c "gear_already_used"` / `grep -c "Not now"` in `use-gear.test.ts` — 2 / 3
