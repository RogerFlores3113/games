---
phase: 10-run-layer-gear-engine-bosses
plan: 07
subsystem: rules-engine
tags: [expedition, run-layer, dispatcher, state-machine, simulation, typescript, vitest]

# Dependency graph
requires:
  - phase: 10-run-layer-gear-engine-bosses
    plan: 05
    provides: "run/lifecycle.ts's createRun/runStatus/runPhase/capacityOf/loadoutSize/preDealPendingSeatIds/startAttempt/advanceRun"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 06
    provides: "run/whisper.ts's applyWhisper, run/use-gear.ts's applyUseGear — the Whisper and generic gear-use transitions this dispatcher wires up as player-reachable actions"
provides:
  - "run/run-actions.ts: applyRunAction(run, actorSeatId, action, catalog) — the ONE run-level transition Phase 11's adapter wraps; dispatches all 8 RunAction types, guards invalid_action/not_a_seat/run_over, and runs advanceRun after every accepted action"
  - "run/run-test-support.ts: setupRun, advanceTo, enumerateLegalRunActions, driveRun, replayRun — the fixture builders and bot every wave-5 content/contract/property plan drives real gear and bosses through"
affects: [10-08, 10-09, 10-10, 10-11, 10-12, 10-13, 10-14, 10-15, 10-16, 10-17, 11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "single accept()/delegated() chokepoint: every accepted-action exit path in run-actions.ts routes through advanceRun exactly once, whether the handler is a local fireside/pre-deal/camp-delegation function or a re-wrap of applyWhisper/applyUseGear's own AdapterResult — so a camp decided by a play OR by a gear effect (Camouflage) settles in the same applyRunAction call"
    - "T-03-24 discipline carried into the run layer: enumerateLegalRunActions builds CANDIDATE actions per phase and keeps only the ones applyRunAction itself accepts — it never re-derives capacity, follow-suit or trick-winner logic, matching Phase 9's test-support.ts precedent"
    - "setupRun is a labeled test seam: owned===equipped===the caller's loadouts, draftOffer forced null, bypassing every capacity/ownership check set-loadout would otherwise enforce — documented in its own doc comment as deliberate, not a gap"
    - "driveRun's fireside-progress guard: a seat that already ran set-loadout during the CURRENT fireside visit is excluded from candidates (a Set, cleared on every phase transition away from fireside), so random walks can't loop forever re-packing the same loadout instead of readying"

key-files:
  created:
    - packages/rules/src/expedition/run/run-actions.ts
    - packages/rules/src/expedition/run/run-actions.test.ts
    - packages/rules/src/expedition/run/run-test-support.ts
    - packages/rules/src/expedition/run/run-test-support.test.ts

key-decisions:
  - "use-gear and whisper both re-run advanceRun after their own delegate call succeeds (a small delegated() wrapper), even though whisper never decides a camp itself — kept uniform with every other accepted-action exit point rather than special-casing whisper as 'never needs it', since a future gear/boss layer changing whisper's effect on camp state is not this plan's concern to predict"
  - "capacityOf/loadoutSize for set-loadout are computed against a CANDIDATE run with the proposed equippedGearIds already substituted in, before the size check — this is what makes Energy-Tonic-style passive gear (in the same proposed loadout) count toward its own capacity room, matching T-10-26's threat-model mitigation literally"
  - "enumerateLegalRunActions's between-tricks gear-target cartesian product is built from a small per-TargetSpec-kind pool function (teammates; first 3 own cards; face-up objectives; own pending objectives), never a hardcoded per-gear-id branch, so a real wave-5 gear item needs no change here to be enumerable"

requirements-completed: [RUN-04, RUN-05, COMM-01, COMM-02]
# RUN-04/RUN-05 are now FULLY delivered: Plan 10-05 built the private seeded
# offer and the capacity/size machinery, but the actual "pick-draft" and
# "set-loadout" RunActions a player invokes were this plan's dispatcher —
# now built, tested (not_offered/no_draft_pending/gear_not_owned/
# duplicate_gear/over_capacity, and the capacity-with-proposed-loadout T-10-26
# case), and reachable.
# COMM-01/COMM-02 are now FULLY delivered: Plan 10-06 built whisperLegality/
# applyWhisper and the reveal/log machinery, but the "whisper" RunAction that
# lets a player actually invoke it from the run loop is this plan's
# dispatcher — now wired (case "whisper": delegated(applyWhisper(...))).
# GEAR-05 stays UNCHECKED, matching 10-06-SUMMARY.md's own explicit scope
# note: the requirement's text ("show a confirm step") describes UI behavior
# Phase 12+ owns; this plan's engine-side finality (no undo action anywhere
# in RunAction, GearUse is atomic with the effect) was already complete
# before this plan and remains so.

# Metrics
duration: ~40min
completed: 2026-09-26
---

# Phase 10 Plan 07: applyRunAction Dispatcher & Run Simulation Helpers Summary

**`run/run-actions.ts`'s `applyRunAction` is now the single run-level transition — dispatching all 8 `RunAction` types (draft, loadout, ready, use-gear, skip-window, whisper, pick-objective, play-card) behind one invalid_action/not_a_seat/run_over guard, running `advanceRun` after every accepted action so a camp decided by a play or a gear effect settles in the same call — and `run/run-test-support.ts` gives every later wave-5 plan a fixture builder, a phase-driver, a T-03-24-disciplined enumerator, and a drive/replay bot, all built exclusively on top of that one dispatcher.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-09-26
- **Tasks:** 2/2 completed
- **Files created:** 4

## Accomplishments

- `applyRunAction(run, actorSeatId, action, catalog)` guards `invalid_action` (non-object/null, or any unknown `type` — including a hand-forged `"undo"`, GEAR-05/XRULE-08), `not_a_seat`, and `run_over`, in that order, before dispatching on `action.type`; every accepted-action exit path (local handlers and the `applyWhisper`/`applyUseGear` delegates) routes through a single `advanceRun` re-run.
- `pick-draft` moves an offered gear id into `ownedGearIds` and clears the offer (`not_offered`, `no_draft_pending`, `wrong_phase` all proven); `set-loadout` enforces ownership, no duplicates, and **capacity computed with the proposed loadout already in place** (T-10-26) — proven both for a plain size-2-at-camp-1 rejection and for a fake +2-capacity passive gear making an otherwise-over-capacity size-3 loadout legal — and un-readies the actor on success; `ready` enforces `draft_pending`/`already_ready` and calls `startAttempt` the instant the last seat readies, landing on `"camp"` or `"pre-deal"` correctly depending on whether a seat has pre-deal gear equipped (D-07/D-12).
- `skip-window` resolves the actor's pending pre-deal gear as `GearUse { kind: "skipped" }` entries and is `nothing_to_skip` for any other seat; `pick-objective`/`play-card` require the camp phase, delegate to Phase 9's `applyCampAction` composed with `rulesFor(run, catalog)`, pass a camp-rule error through unchanged (`not_your_turn` proven), and settle a decided camp in the same call — proven with a hand-built one-trick fixture where the actor's single remaining play both wins the trick and completes the camp's only objective, advancing `history` to length 1, `campNumber` to 2, and `equippedGearIds` staying byte-identical while a fresh camp-2 draft offer appears (D-06).
- `run-test-support.ts`'s `setupRun` builds a fireside fixture with owned/equipped gear set directly from a `loadouts` map (a documented test seam, bypassing capacity checks on purpose) and every `draftOffer` cleared to `null`; `advanceTo` drives a run to `"pre-deal"`, `"objective-pick"` or `"between-tricks"` purely through `applyRunAction` (readying every seat, then resolving pre-deal skips, then picking the current actor's first unowned objective as needed), throwing if the target is unreachable (e.g. `"pre-deal"` requested but no seat had pre-deal gear equipped, so the deal already happened); `enumerateLegalRunActions` builds per-phase candidates (draft picks, a current/empty/greedy-fill loadout, ready at the fireside; skip-window and pre-deal gear-use during pre-deal; the current actor's objective picks and card plays, plus whisper/gear-use cartesian-product-over-`TargetSpec` candidates once between-tricks) and keeps only the ones `applyRunAction` itself accepts (T-03-24); `driveRun` random-walks a whole run to `"won"`/`"lost"` via the enumerator, guarding fireside progress against an infinite re-pack loop, and `replayRun` reproduces every state from the action log alone.
- `npx vitest run --project rules packages/rules/src/expedition/run/run-actions.test.ts` — 30 tests passed; `npx vitest run --project rules packages/rules/src/expedition/run/run-test-support.test.ts packages/rules/src/expedition/purity.test.ts` — 15 tests passed (purity guard included, new files auto-covered by its directory scan); `npx vitest run --project rules packages/rules/src/expedition` (full suite) — 21 files, 363 tests passed; `npm run typecheck` — exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: applyRunAction dispatcher with fireside, pre-deal and camp delegation** - `00f7d59` (feat)
2. **Task 2: Run-level simulation helpers (setupRun, advanceTo, enumerate, drive, replay)** - `b6e81bf` (feat)

## Files Created/Modified

- `packages/rules/src/expedition/run/run-actions.ts` - `applyRunAction`
- `packages/rules/src/expedition/run/run-actions.test.ts` - every guard, every handler's rejection reasons, the capacity-with-proposed-loadout case, camp delegation/settlement, D-06, and no-mutation checks
- `packages/rules/src/expedition/run/run-test-support.ts` - `setupRun`, `advanceTo`, `enumerateLegalRunActions`, `driveRun`, `replayRun`
- `packages/rules/src/expedition/run/run-test-support.test.ts` - fake 4-gear/1-boss catalog fixtures covering every must_have behavior, including a full drive-to-won-or-lost plus replay-deep-equality proof across three seeds/choice streams

## Decisions Made

- `use-gear`/`whisper` both re-run `advanceRun` through a small `delegated()` wrapper after their own transition succeeds, kept uniform with every other accepted-action exit point rather than special-casing whisper as "never decides a camp" — a future boss/gear layer changing that is not this plan's concern to predict.
- `set-loadout`'s capacity check builds a candidate `RunState` with the proposed `equippedGearIds` already substituted in *before* computing `capacityOf`, so a passive gear item in the same proposed loadout (Energy-Tonic-style) counts toward its own capacity room — proven with a fake +2-capacity passive gear plus a size-3 gear at camp 1 (capacity 1+2=3, loadout size 0+3=3, accepted).
- `enumerateLegalRunActions`'s between-tricks gear-target combinations are built from one small per-`TargetSpec`-kind pool function (teammates minus self; the actor's first 3 own cards; face-up objectives; the actor's own pending objectives), never a per-gear-id branch, so a real wave-5 gear item is enumerable with zero changes to this file.

## Deviations from Plan

None — plan executed as written. No bugs, missing critical functionality, or blocking issues were found in the Plan 05/06 code this plan depends on (lifecycle, whisper, use-gear, toolkit, compose) requiring a Rule 1/2/3 fix.

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/run/run-actions.ts
- FOUND: packages/rules/src/expedition/run/run-actions.test.ts
- FOUND: packages/rules/src/expedition/run/run-test-support.ts
- FOUND: packages/rules/src/expedition/run/run-test-support.test.ts
- FOUND: 00f7d59 (git log)
- FOUND: b6e81bf (git log)

## Verification

- `npx vitest run --project rules packages/rules/src/expedition/run/run-actions.test.ts` — 30 tests passed
- `npx vitest run --project rules packages/rules/src/expedition/run/run-test-support.test.ts packages/rules/src/expedition/purity.test.ts` — 15 tests passed
- `npx vitest run --project rules packages/rules/src/expedition` — 21 files, 363 tests passed
- `npm run typecheck` — exits 0
- `grep -c "export function applyRunAction" packages/rules/src/expedition/run/run-actions.ts` — 1
- `grep -cE "\"(pick-draft|set-loadout|ready|use-gear|skip-window|whisper|pick-objective|play-card)\"" packages/rules/src/expedition/run/run-actions.ts` — 9 (>= 8)
- `grep -c "advanceRun(" packages/rules/src/expedition/run/run-actions.ts` — 1 (>= 1); `grep -c "applyCampAction(" packages/rules/src/expedition/run/run-actions.ts` — 1 (>= 1)
- run-actions.test.ts asserts `draft_pending`, `over_capacity`, `nothing_to_skip`, `not_a_seat`, `run_over`, and `invalid_action` for `{ type: "undo" }` — confirmed present
- `grep -nE "^export function (setupRun|advanceTo|enumerateLegalRunActions|driveRun|replayRun)" packages/rules/src/expedition/run/run-test-support.ts` — all 5
- `grep -c "applyRunAction(" packages/rules/src/expedition/run/run-test-support.ts` — 6 (>= 3)
- `grep -cE "legalPlaysFor|trickWinner\(|isTrump\("packages/rules/src/expedition/run/run-test-support.ts` — 0
- run-test-support.test.ts asserts `replayRun(...)` deep-equals `driveRun`'s states
