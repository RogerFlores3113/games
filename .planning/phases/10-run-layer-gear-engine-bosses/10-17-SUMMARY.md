---
phase: 10-run-layer-gear-engine-bosses
plan: 17
subsystem: rules-engine
tags: [expedition, run-layer, property-testing, fast-check, determinism, typescript, vitest]

# Dependency graph
requires:
  - phase: 10-run-layer-gear-engine-bosses
    plan: 7
    provides: "run/run-test-support.ts's setupRun, driveRun, replayRun, advanceTo — the fixture builder, random-walk bot, and replay/phase-advance helpers this plan's properties are built exclusively on top of"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 14
    provides: "boss/registry.ts's BOSS_REGISTRY — the real four boss twists this plan draws bossTwists pairs from"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 15
    provides: "gear/registry.ts's GEAR_REGISTRY — the real ten gear items this plan draws per-seat loadout subarrays from"
provides:
  - "run/run.property.test.ts: whole-run fast-check properties proving RUN-07 (ROADMAP success criterion 3) — deterministic replay from seed + action log, plus whole-run termination, card conservation, JSON round-trippability, and structural no-leak/no-increase invariants, on the real gear and boss registries across 3/4/5 players, any starting camp, and any boss-twist pairing"
affects: [11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Properties A (RUN-07 replay) and D (whole-run safety) are combined into a single fc.property/fc.assert, driving the run ONCE via driveRun and checking both the replay-deep-equality and every per-step invariant off that one drive, halving runtime versus two separate fc.assert blocks over the same arbitrary — the plan's own explicit instruction"
    - "Per-attempt card-conservation is checked against the FIRST-SEEN campCardIds for that (campNumber, attemptNumber) key, not a hardcoded per-camp constant, so the same property test correctly covers camp 1 (fresh deal, no replay) and any replayed boss camp (a brand-new deal, still internally conserved) without special-casing replay attempts"
    - "Property C (seed sensitivity) is deliberately example-based over 20 fixed seed pairs, not a further fc.property, matching the plan's own instruction that this is 'not a property' — fast-check's seed-reordering across runs could otherwise make a property-based seed-sensitivity check flaky by construction"
    - "advanceTo(run, \"objective-pick\", catalog) (existing 10-07 helper) is reused directly for Property C's attempt-1 hand fetch instead of re-deriving a ready-then-skip-pre-deal loop, keeping this plan's only new production-adjacent logic to the property assertions themselves"

key-files:
  created:
    - packages/rules/src/expedition/run/run.property.test.ts
  modified: []

key-decisions:
  - "Loadouts are generated per-seatCount via fc.constantFrom(3,4,5).chain(...) rather than a flat fc.record, so the tuple of per-seat fc.subarray arbitraries is built against the ACTUAL seatIds array for that run (a fixed-shape fc.record can't parameterize its own field count by another generated value) — this is the standard fast-check idiom for a generated-length tuple of dependent arbitraries."
  - "The boss-twist pair is generated once per test case (an ordered pair of distinct BOSS_REGISTRY keys) and passed to setupRun's bossTwists for BOTH camps 3 and 6 regardless of the generated startCamp, mirroring the interface's own bossTwists shape ({3, 6} always present) and D-03 (never repeated) — unused when startCamp's run never reaches the other boss camp within maxSteps, which is fine since setupRun's bossTwists override is inert until that camp is actually reached."
  - "Property D's per-step card-conservation check compares the exact SORTED id array (not just set-equality) against the first-seen array for that attempt key, which is strictly stronger than set-equality and still holds because campCardIds always returns a sorted array (toolkit.ts's own doc comment) covering the same fixed set of dealt ids for the attempt's whole lifetime."

requirements-completed: [RUN-07]
# RUN-01, RUN-02, RUN-04, ENG-02 (also in this plan's frontmatter requirements
# list) were already marked Complete in REQUIREMENTS.md before this plan ran
# (by Plans 10-03/10-05/10-07/10-14/10-15's own engine work — this plan adds
# further property-test EVIDENCE for RUN-02/RUN-04's whole-run behavior, but
# does not newly flip those checkboxes). RUN-07 was the one requirement still
# Pending, and is the one this plan's properties directly and fully prove;
# its REQUIREMENTS.md checkbox and traceability-table row are both now
# Complete. Phase 10's ROADMAP checkbox and its 10-17-PLAN.md line-item
# checkbox are both now [x] — this is the phase's last plan.

# Metrics
duration: ~30min
completed: 2026-09-27
---

# Phase 10 Plan 17: Whole-Run Determinism & Safety Property Tests (RUN-07) Summary

**`run/run.property.test.ts` proves RUN-07 (ROADMAP success criterion 3) with fast-check: an arbitrary seed, 3/4/5-player seatCount, starting camp, boss-twist pairing and per-seat loadout drawn from the real GEAR_REGISTRY/BOSS_REGISTRY, driven by a random bot through `driveRun`, always replays byte-for-byte via `replayRun`, always terminates won/lost, conserves every dealt card for its whole attempt lifetime, stays JSON round-trippable, and keeps every reveal audience and log entry structurally leak-free at every step — closing out Phase 10.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-09-27
- **Tasks:** 1/1 completed
- **Files created:** 1
- **Measured test runtime:** 1.69s for the whole file (well under the plan's 90s ceiling; `numRuns: 40` for Property A/D combined, `numRuns: 15` for Property B, plus Property C's fixed 20-pair loop) — no need to lower `numRuns` or cap loadout size further.

## Accomplishments

- **Property A+D (combined, `numRuns: 40`):** for `runInputArb` (seatCount from {3,4,5}, non-empty `fc.string` seed, `choices` as `fc.array(fc.nat({max:1000}), {minLength:1, maxLength:64})`, `startCamp` from {1..6}, an ordered pair of distinct `BOSS_REGISTRY` keys, and per-seat `fc.subarray(GEAR_IDS, {maxLength:4})` loadouts), `setupRun` + `driveRun` drives one whole run on the real catalog, then:
  - `replayRun(initial, log, catalog)` deep-equals `states` (RUN-07's literal replay proof).
  - The final state's `runStatus` is never `"in_progress"` (the run always terminates won or lost).
  - Every state is `JSON.parse(JSON.stringify(state))`-round-trippable.
  - `supplies` never increases step-over-step.
  - Every seat's `draftOffer` never contains gear that seat already owns (RUN-04).
  - For every dealt camp, `campCardIds` has no duplicate id, and equals the exact sorted id array first observed for that `(campNumber, attemptNumber)` — proving conservation across the attempt's whole lifetime, including through a replay's brand-new deal.
  - Every `Reveal.audience` is non-empty and a subset of `seatIds`; every `LogEntry`'s keys are a subset of `{event, actorSeatId, subjectSeatIds, gearId, audience}` (structural no-leak, interim — Phase 11 owns the real per-seat leak checker for ENG-03/COMM-03).
  - Every `"failed"` history entry has `suppliesSpent >= 1` (RUN-02).
- **Property B (`numRuns: 15`):** two independently-built `setupRun` calls from identical inputs, driven by an identical `choices` stream through `driveRun`, give deep-equal `states` arrays — proving the run has no hidden nondeterministic input beyond the seed and the action log.
- **Property C (example-based, 20 fixed seed pairs):** across `seed-a-{i}`/`seed-b-{i}` for `i` in 0..19 (4 seats, camp 1, no gear), `advanceTo(run, "objective-pick", catalog)`'s dealt `camp.hands` differ in at least one of the 20 pairs — proving the seed is a real randomness root (A1), not example-based determinism disguised as randomness.
- `npx vitest run --project rules packages/rules/src/expedition/run/run.property.test.ts` — 3 tests passed in 1.69s; `npm test` (full monorepo) — 115 files, 1658 tests passed; `npm run typecheck` — exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Whole-run determinism and safety properties (RUN-07)** - `1f73063` (test)

**Plan metadata:** (pending — this SUMMARY's own commit)

## Files Created/Modified

- `packages/rules/src/expedition/run/run.property.test.ts` - Properties A+D (combined replay + whole-run safety), B (identical-input determinism), C (seed-sensitivity example), all driven exclusively through `run-test-support.ts`'s real fixture/drive/replay helpers over `applyRunAction`

## Decisions Made

- Properties A and D were combined into one `fc.property`/`fc.assert` (driving the run once, checking replay-equality and every per-step invariant off that single drive) per the plan's own explicit runtime instruction, rather than two separate `fc.assert` blocks re-driving the same arbitrary twice.
- Per-attempt card conservation is checked against the first-seen `campCardIds` for that `(campNumber, attemptNumber)` key rather than a hardcoded expected count, so the same check correctly covers both a fresh camp-1 deal and any replayed boss-camp deal (a different card set each time, but internally conserved either way) with no special-casing.
- Property C stayed strictly example-based (a plain `for` loop over 20 fixed seed pairs, not a further `fc.property`), matching the plan's own instruction that this specific check is "not a property" — fast-check's per-run seed reordering would otherwise make a property-wrapped version of this exact check nondeterministically flaky.
- `runInputArb` builds seatIds first via `fc.constantFrom(3,4,5).chain(...)`, then a per-seat tuple of `fc.subarray` loadout arbitraries sized to that seatIds array — the standard fast-check idiom for generating a variable-length collection of dependent arbitraries from an earlier-generated value, since a flat `fc.record` can't parameterize its own field count.

## Deviations from Plan

None — plan executed exactly as written. No bugs, missing critical functionality, or blocking issues were found in the Plan 05/07/14/15 code (`lifecycle.ts`, `run-actions.ts`, `run-test-support.ts`, `toolkit.ts`, `GEAR_REGISTRY`, `BOSS_REGISTRY`) this plan depends on and exercises through `driveRun`/`replayRun` across all 40+15 generated cases plus the 20 example seed pairs — every property held on first write, with no Rule 1/2/3 fix required.

## Known Stubs

None — this plan adds a test file only; no UI or data-wiring stubs are introduced.

## Threat Flags

None beyond the two the plan's own `<threat_model>` already named (T-10-51 nondeterministic-transition/replay, T-10-52 structural leak checks, T-10-53 non-terminating run), all three of which this plan's properties directly mitigate/prove. No new network endpoint, auth path, file access pattern, or schema change at a trust boundary was introduced.

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/run/run.property.test.ts
- FOUND: 1f73063 (git log)

## Verification

- `npx vitest run --project rules packages/rules/src/expedition/run/run.property.test.ts` — 3 tests passed, 1.69s (well under the 90s ceiling)
- `npm test` (full monorepo) — 115 files, 1658 tests passed
- `npm run typecheck` — exits 0
- `grep -c "fc.assert"` — 2; `grep -c "replayRun("` — 1 (present); `grep -c "driveRun("` — 3; `grep -c "GEAR_REGISTRY"` — 4; `grep -c "BOSS_REGISTRY"` — 4; `grep -c "numRuns"` — 3 — all acceptance-criteria greps confirmed present

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- RUN-07 is proven end to end on the real catalogue; ROADMAP success criterion 3 for Phase 10 is met.
- This is Phase 10's final plan (17 of 17) — every plan and every ROADMAP success criterion (1-5) for Phase 10 is now complete. `.planning/ROADMAP.md`'s Phase 10 checkbox and 10-17 line item are both marked `[x]`.
- Phase 11 (Adapter, Schemas & Worker Wiring) can now proceed: `run/catalog.ts`'s `CATALOG`, `run/run-actions.ts`'s `applyRunAction`, and this plan's whole-run property suite are all ready as the regression net Phase 11 extends with its own real per-seat leak checker (ENG-03/COMM-03).
- Full `packages/rules` suite (1658 tests across 115 files) and `npm run typecheck` pass with these changes in place.

---
*Phase: 10-run-layer-gear-engine-bosses*
*Completed: 2026-09-27*
