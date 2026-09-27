---
phase: 10-run-layer-gear-engine-bosses
plan: 15
subsystem: rules-engine
tags: [expedition, gear, catalogue-contract, typescript, vitest, tdd]

# Dependency graph
requires:
  - phase: 10-run-layer-gear-engine-bosses
    plan: 8
    provides: "gear/chatter.ts, gear/peek.ts, gear/broadcast.ts GearDefs"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 9
    provides: "gear/ghost.ts, gear/reroll.ts, gear/reassign.ts GearDefs"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 10
    provides: "gear/pickpocket.ts, gear/commandeer.ts GearDefs"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 11
    provides: "gear/jam.ts, gear/overclock.ts GearDefs"
provides:
  - "gear/registry.ts: GEAR_REGISTRY (satisfies Readonly<Record<string, GearDef>>), GearId — the ENG-01 one-file-plus-one-line gear catalogue"
  - "gear/gear.contract.test.ts: ENG-02's automatic per-registered-gear contract (shape, per-window 3/4/5-player-driven determinism/conservation/round-trip/attempt-scoping/finality/interim-no-leak), proven non-vacuous against a deliberately broken fake def and two broken toolkit ops"
affects: [11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "gear.contract.test.ts's findUsableFixture/candidateTargetsFor/targetOptionsFor/cartesian helpers deliberately re-derive run-test-support.ts's own (unexported) target-combination builder rather than importing it, so the contract's own non-vacuity ('at least one usable combination exists') is proven independently of enumerateLegalRunActions's candidate generation"
    - "The attempt-scoped-only check tolerates run.history growing by exactly one entry (a camp settling mid-gear-use, as Camouflage's remove-objective can trigger by completing the last objective) by re-comparing with history truncated back to its pre-action length, rather than requiring byte-identical run-scoped fields in every case"
    - "GEAR-05 finality and the interim no-leak check are both skipped when the action itself settled the camp (attempt becomes null) — there is no attempt left to re-check gear_already_used against, and reveals/log both live on the now-torn-down AttemptState"

key-files:
  created:
    - packages/rules/src/expedition/gear/registry.ts
    - packages/rules/src/expedition/gear/gear.contract.test.ts
  modified: []

key-decisions:
  - "Task 1 followed real RED/GREEN: gear.contract.test.ts was written and committed first (test(10-15)), confirmed failing on module resolution because gear/registry.ts did not yet exist, then registry.ts was added (feat(10-15)) in the same commit as one test fix (see Deviations) and the full suite went green."
  - "ENG-02 is now marked complete in REQUIREMENTS.md: this plan's gear contract is the last of the three catalogue halves (boss and objective-kind landed in 10-14), so 'every registered catalogue entry is checked automatically' now holds for gear, bosses and objective kinds."
  - "GEAR-05 and GEAR-06 stay unchecked, per this plan's own scope note: their engine sides are already complete (GEAR-05's finality is proven generically by this plan's second-use gear_already_used assertion; GEAR-06's reason strings are already produced by toolkit.ts's gearAvailability/use-gear.ts's checkUseGear, exercised throughout this contract) — only their UI halves (a confirm step, a visible reason in the UI) remain, and that is a later phase's job."

requirements-completed: [ENG-02]

# Metrics
duration: ~10min
completed: 2026-09-27
---

# Phase 10 Plan 15: Gear Registry & Catalogue Contract Test Summary

**gear/registry.ts's `GEAR_REGISTRY` registers all ten v1 gear items by id (ENG-01's "one file plus one line" now literally true for gear), and a new registry-iterating `gear.contract.test.ts` automatically proves every registered gear item is well-shaped, deterministic, card-conserving, attempt-scoped, finality-respecting (GEAR-05) and leak-free (interim), each proven non-vacuous against a deliberately broken fake def and two broken toolkit ops — completing ENG-02 for the whole catalogue (bosses and objective kinds landed in 10-14).**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-09-27
- **Tasks:** 1/1 completed
- **Files created:** 2

## Accomplishments

- `gear/registry.ts`'s `GEAR_REGISTRY` is a `satisfies Readonly<Record<string, GearDef>>` object literal with keys `chatter`, `peek`, `broadcast`, `ghost`, `reroll`, `pickpocket`, `commandeer`, `jam`, `reassign` and `overclock`, in spec §5.1 order, each equal to its def's own `id`; `GearId` is `keyof typeof GEAR_REGISTRY`.
- `gear.contract.test.ts` iterates `Object.entries(GEAR_REGISTRY)` only: a local `checkGearDef` proves an integer `size >= 0`, a known `GearWindow`, every target's kind a known `TargetKind`, and passive ⟺ no `apply`/no declared targets — verified `[]` for all ten real defs and shown to catch a fake def (`size: -1`, `window: "sometimes"`, target kind `"player-pair"`) in the non-vacuity section.
- For every non-passive entry, at 3, 4 and 5 players: a generic fixture (every seat equipped with only that gear item, campNumber 6/final-camp with a no-op `"contract-boss"` twist, advanced to the def's own window) is searched — seats in order, then target combinations built from each `TargetSpec` kind (teammates; the actor's first 3 own cards; face-up objectives; the actor's own pending objectives) — for the first combination `checkUseGear` accepts; one is asserted to exist (fixture non-vacuity), then applied via `applyRunAction` and checked for: determinism (two independent JSON-cloned inputs give deep-equal outputs), card conservation (`campCardIds` unchanged when a camp exists before and after), a JSON round-trip, "changes only attempt-scoped fields" (run-level `seed`/`seatIds`/`campNumber`/`supplies`/`seats`/`bossTwists` untouched, `history` unchanged or grown by exactly one entry when the action itself settles the camp), a second use rejected `gear_already_used` (GEAR-05 finality), and the interim no-leak check (every new reveal's audience is a non-empty subset of `seatIds`; every log entry carries only the five whitelisted, non-card keys).
- Passive gear (`overclock`/Energy Tonic): `use-gear` is refused `wrong_window` ("Passive gear is always active") once an attempt is in progress, and its `passiveModifier`'s returned `RuleModifier` keys are all verified members of `run-rules.ts`'s `HOOK_NAMES`.
- Non-vacuity is proven three ways: the fake `GearDef` above is flagged by `checkGearDef`; `applyToolkitOps` throws on a fake `reveal` op with an empty audience ("reveal to nobody"); `applyToolkitOps` throws on a fake `move-card` op naming a card not in the named seat's hand.
- `npx vitest run --project rules packages/rules/src/expedition/gear` — 5 files, 93 tests passed; full `packages/rules/src/expedition` suite — 30 files, 511 tests passed; `npm run typecheck` exits 0.

## Task Commits

Task 1 (`tdd="true"`) landed as a genuine TDD RED/GREEN pair:

1. **RED: failing gear catalogue contract test** - `79eedfa` (test)
2. **GREEN: register the ten v1 gear items** - `2d36050` (feat)

## Files Created/Modified

- `packages/rules/src/expedition/gear/registry.ts` - `GEAR_REGISTRY`, `GearId`
- `packages/rules/src/expedition/gear/gear.contract.test.ts` - ENG-02 gear catalogue contract, `checkGearDef`, `findUsableFixture`

## Decisions Made

- Task 1 genuinely followed RED/GREEN: the contract test was written and run first, confirmed failing (module resolution — `gear/registry.ts` did not exist), committed, then `registry.ts` was added. The GREEN commit also folds in one bug fix discovered while going green (see Deviations) rather than a separate commit, since it was found and fixed inside the same RED→GREEN iteration before any test had ever passed.
- ENG-02 is marked complete in `REQUIREMENTS.md`: this plan is the third and final catalogue half (bosses and objective kinds landed in Plan 10-14), so "every registered catalogue entry is checked automatically" now holds across gear, bosses and objective kinds.
- GEAR-05/GEAR-06 stay unchecked: their engine sides are complete (finality proven generically here; reason strings already produced by `toolkit.ts`/`use-gear.ts` and exercised throughout this contract) but the UI-facing halves (confirm step, visible reason in the UI) are out of this phase's scope, per the plan's own header.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in this plan's own new test, not pre-existing code] Passive-gear window check needed an in-progress attempt first**
- **Found during:** Task 1, going from RED to GREEN
- **Issue:** The passive-gear (`overclock`) `wrong_window` assertion originally called `checkUseGear` against a bare `setupRun` fixture (fireside, `run.attempt === null`). `gearAvailability` (toolkit.ts) checks `run.attempt === null` (→ `wrong_phase`) before it ever reaches the window check (→ `wrong_window`), so the test failed with `wrong_phase`/"No camp in progress" instead of the expected `wrong_window`.
- **Fix:** Advanced the fixture to `"between-tricks"` via `advanceTo` before asserting, so an attempt (and camp) is in progress and the window check is actually reached.
- **Files modified:** `packages/rules/src/expedition/gear/gear.contract.test.ts`
- **Commit:** `2d36050` (folded into the GREEN commit, since RED had never yet passed)

No bugs, missing critical functionality, or blocking issues were found in the Plan 02/04/06/07/08/09/10/11 code this plan depends on (`GearDef`, `toolkit.ts`, `use-gear.ts`, `run-test-support.ts`, the ten gear defs).

## Known Stubs

None — this plan adds only a registry and a test file; no UI or data-wiring stubs are introduced.

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/gear/registry.ts
- FOUND: packages/rules/src/expedition/gear/gear.contract.test.ts
- FOUND: 79eedfa (git log)
- FOUND: 2d36050 (git log)

## Verification

- `npx vitest run --project rules packages/rules/src/expedition/gear` — 5 files, 93 tests passed
- `npx vitest run --project rules packages/rules/src/expedition` — 30 files, 511 tests passed
- `npm run typecheck` — exits 0
- `grep -c "export const GEAR_REGISTRY" packages/rules/src/expedition/gear/registry.ts` — 1
- `grep -cE "chatter|peek|broadcast|ghost|reroll|pickpocket|commandeer|jam|reassign|overclock" packages/rules/src/expedition/gear/registry.ts` — 24 (>= 10)
- `grep -c "Object.entries(GEAR_REGISTRY)"` / `"campCardIds("` / `"JSON.parse(JSON.stringify("` / `"gear_already_used"` in `gear.contract.test.ts` — all present
- `grep -cE 'id === "(chatter|peek|broadcast|ghost|reroll|pickpocket|commandeer|jam|reassign|overclock)"' packages/rules/src/expedition/gear/gear.contract.test.ts` — 0 (no per-id branching)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ENG-02 is now fully delivered: gear, bosses and objective kinds are all automatically contract-checked.
- Full `packages/rules` test suite passes with these changes in place.
- Phase 10's remaining plan (10-16, and 10-17 for RUN-07 full replay) can proceed; Phase 11 will build `toPlayerView`/the leak checker on top of this catalogue, unblocked.

---
*Phase: 10-run-layer-gear-engine-bosses*
*Completed: 2026-09-27*
