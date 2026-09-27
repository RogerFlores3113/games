---
phase: 10-run-layer-gear-engine-bosses
plan: 16
subsystem: rules-engine
tags: [expedition, integration-test, replay, whisper, documentation, typescript, vitest]

# Dependency graph
requires:
  - phase: 10-run-layer-gear-engine-bosses
    plan: 14
    provides: "boss/registry.ts's BOSS_REGISTRY"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 15
    provides: "gear/registry.ts's GEAR_REGISTRY"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 7
    provides: "run/run-actions.ts's applyRunAction, run/run-test-support.ts's setupRun/advanceTo/enumerateLegalRunActions"
provides:
  - "run/catalog.ts: CATALOG = { gear: GEAR_REGISTRY, bosses: BOSS_REGISTRY } — the single production Catalog value Phase 11's adapter passes to applyRunAction/createRun"
  - "run/replay-reset.test.ts: an end-to-end fail-then-replay proof (ROADMAP success criterion 2, RUN-06/T-10-49/T-10-50) that gear-used flags, active modifiers, the leader, Whisper availability and reveals all reset on replay, on real content, while owned/equipped gear, bossTwists, history and capacity persist — plus a Whisper lifecycle proof (ROADMAP success criterion 1, COMM-01/COMM-02)"
  - "expedition/README.md: the ENG-01 recipes (add gear, add an objective kind, add a boss twist, add a hook, add a toolkit op) against the real registries, plus the Phase 12/14 forward contracts for card packs and interactables"
affects: [11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "replay-reset.test.ts precomputes attempt 1's leader by calling createCamp directly with the same attemptSeed/objectiveSlotsFor inputs dealAttempt itself will use, so the Machete/Camouflage gear bundle can be assigned to a seatId guaranteed non-leader (D-09 needs a non-leader Machete owner to prove 'the leader changes' rather than hitting its own already-leading guard) — without depending on trial-and-error seed picking"
    - "Post-replay used-flag-reset assertions check `error !== \"gear_already_used\"` rather than requiring `ok === true` — this is the literal T-10-50 property (the engine no longer believes the gear was used) and is robust to a gear item being legitimately blocked for an unrelated in-context reason after replay (an already-leading Machete owner in the fresh deal, or Monsoon re-blocking a whisper-checking gear), rather than assuming every gear is always immediately usable again"

key-files:
  created:
    - packages/rules/src/expedition/run/catalog.ts
    - packages/rules/src/expedition/run/replay-reset.test.ts
    - packages/rules/src/expedition/README.md
  modified: []

key-decisions:
  - "Rain Poncho's own downside ('nobody may Whisper this camp') blocks every whisper-checking gear too, by jam.ts's own documented design (Signal Whistle's canUse reads the same whisperAllowed hook a raw Whisper does) — so the fail-then-replay fixture proves its two attempt-1 active effects through Rain Poncho (jam) and Camouflage (ghost), and separately asserts Signal Whistle (chatter) is correctly REFUSED (gear_unavailable, 'Whispers are blocked this camp') while jam's effect is active, rather than forcing a third gear's effect through a use the engine correctly rejects. This is not a code bug — it is the plan's own literal step list ('p2 uses chatter (an effect exists)') not accounting for an interaction jam.ts's own header already documents; the test was adjusted to match the real, already-shipped, already-contract-tested gear semantics rather than the plan's literal script."
  - "For the same reason, the replay-phase assertion that gear 'passes checkUseGear again' is written as 'does not reject with gear_already_used' rather than 'is accepted' for commandeer/ghost/chatter: after replay, Monsoon (radio-silence) is active again (p0 skips the Poncho this time), which also correctly blocks chatter via the same whisperAllowed check, and the fresh deal may or may not make the Machete owner the new leader (which would correctly block commandeer via its own 'already leads' guard). The property under test (RUN-06/T-10-50: used flags reset) is proven precisely by the absence of gear_already_used, independent of these legitimate, unrelated refusals."
  - "ENG-01's REQUIREMENTS.md checkbox was already [x] before this plan (set at milestone-requirements-definition time, c1a5f7f/d92f617), even though no expedition/README.md existed until this plan — that predates and is unrelated to this plan's own work. This plan does not re-assert or newly claim ENG-01 as complete; per the plan's own instruction, the interactable/card-pack caveat is documented here rather than in REQUIREMENTS.md, and REQUIREMENTS.md's pre-existing checkbox was left untouched (out of scope for this plan to litigate a different plan/commit's traceability entry)."

requirements-completed: []
# RUN-06, COMM-01, COMM-02, RUN-02, RUN-03 and ENG-01 were ALL already marked
# [x]/Complete in REQUIREMENTS.md before this plan ran (RUN-06/COMM-01/
# COMM-02/RUN-02/RUN-03 by Plans 10-05/10-06/10-07's own engine work; ENG-01
# was checked at milestone-requirements-definition time, before any Phase 10
# plan existed). This plan adds the missing REAL-CONTENT integration proof
# for RUN-06/COMM-01/COMM-02 (ROADMAP criteria 1/2) and the missing README
# recipes for ENG-01's gear/objective-kind/boss/hook/toolkit-op halves — it
# does not newly flip any checkbox, and per its own scope note, ENG-01's
# interactable/card-pack halves remain forward contracts only (documented,
# not implemented — those registries live in apps/web, Phase 12/14's job).

# Metrics
duration: ~35min
completed: 2026-09-27
---

# Phase 10 Plan 16: Production Catalog, Replay/Whisper Integration Proof & README Summary

**run/catalog.ts wires the real ten-item gear catalogue and four boss twists into the single production `CATALOG` Phase 11's adapter will use; a new `replay-reset.test.ts` drives that real content through a fail-then-replay and a full Whisper lifecycle to prove ROADMAP success criteria 1 and 2 end to end; and `expedition/README.md` documents the ENG-01 recipes (gear, objective kind, boss twist, hook, toolkit op) against the actual registries, with the Phase 12/14 card-pack/interactable registries left as explicit forward contracts.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-09-27
- **Tasks:** 2/2 completed
- **Files created:** 3

## Accomplishments

- `run/catalog.ts` exports `CATALOG: Catalog = { gear: GEAR_REGISTRY, bosses: BOSS_REGISTRY }` — the one production catalogue value; its header states Phase 11's adapter is the intended consumer and that tests may extend it with local fakes (as `replay-reset.test.ts` itself does).
- `run/replay-reset.test.ts`'s first `describe` ("fail-then-replay resets every camp-scoped resource", ROADMAP criterion 2, RUN-06) drives a real camp-3 (boss) attempt on the production catalogue plus one local fixture gear (`test-sabotage`: between-tricks, no targets, unconditionally fires a failure check) through: Rain Poncho cancelling Monsoon while its own downside blocks Whispers instead (D-04); Spyglass producing an audience-scoped reveal (COMM-02); Machete changing the open trick's leader (D-09); Camouflage removing an objective from play and adding an active effect (D-11); a failure via the fixture gear; then asserts, after settling, `runPhase` is `"fireside"`, supplies dropped by exactly 1, every `draftOffer` is `null` (D-01), `seats` are byte-identical to a pre-failure snapshot (D-06), `bossTwists[3]` still reads `"radio-silence"` (D-02) even though it was cancelled for that attempt, `capacityOf` is 3 for every seat regardless of attempt count (RUN-03), and `nextAttemptNumber` is 2. It then replays: every attempt-scoped field (`gearUses`, `effects`, `reveals`, `log`, `bossCancelled`) resets to empty/false, the boss twist returns (`activeBossId` is `"radio-silence"` again, D-04), Rain Poncho is pending again in pre-deal, and — after p0 skips it this time — the fresh deal's leader resets to its own `expeditionLeaderSeatId`, a raw Whisper is refused `"whisper_blocked"` (Monsoon active again), every seat's `whispersUsedBy` is 0, and no gear rejects with `gear_already_used` again (T-10-50).
- The second `describe` ("Whisper end to end", ROADMAP criterion 1, COMM-01/COMM-02) proves, on a plain camp-2 run: a Whisper is refused `"wrong_window"` before objectives are picked and again mid-trick (D-13, no grace period); an accepted Whisper between tricks produces a reveal audience-scoped to the target only and a public log entry naming whisperer → target with no card id (COMM-01); the reveal survives a full completed trick; a forced failure (via `test-sabotage`) and replay clears `attempt.reveals` to `[]`; and the whisperer may Whisper again afterward.
- `expedition/README.md` documents, against the real files and identifiers: the package layout and layering order (base → boss → passives → effects), the A1 RNG stream-name table, and numbered recipes for adding gear (worked through Spyglass in prose), an objective kind, a boss twist, a hook, and a toolkit op — plus the Phase 12/14 forward contracts for card packs and interactables (both explicitly out of this package's scope), and the engine's core invariants (no mutation outside the toolkit, derive-don't-cache, seeded-only randomness, reveals as the only private channel, seed/draft-offer privacy, and the A3 throw policy for rule-hook defects).
- `npx vitest run --project rules packages/rules/src/expedition/run/replay-reset.test.ts` — 2 tests passed; `npx vitest run --project rules packages/rules/src/expedition` (full suite) — 49 files, 711 tests passed; `npm run typecheck` — exits 0.

## Task Commits

Each task was committed atomically (both landed as a single commit — see Deviations for why neither followed a RED/GREEN split):

1. **Task 1: Production CATALOG + fail-then-replay/Whisper integration test** - `bf38756` (test)
2. **Task 2: README recipes (ENG-01)** - `a088ab0` (docs)

## Files Created/Modified

- `packages/rules/src/expedition/run/catalog.ts` - `CATALOG`
- `packages/rules/src/expedition/run/replay-reset.test.ts` - the fail-then-replay and Whisper-lifecycle integration proofs
- `packages/rules/src/expedition/README.md` - the ENG-01 recipes

## Decisions Made

- `CATALOG` is three lines of pure wiring over already-shipped registries (10-14/10-15); the reset/Whisper behavior this plan proves was already fully implemented by 10-05/10-06/10-07 — so Task 1 landed as a single `test(10-16)` commit (proof-authoring for existing production code), the same category 10-14's Task 2 used for its objective-kind contract test, rather than a genuine RED/GREEN pair.
- Rain Poncho's whole-camp Whisper-blocking downside also blocks Signal Whistle (both read the same `whisperAllowed` hook) — the fixture's attempt-1 "two active effects" proof uses Rain Poncho + Camouflage, and separately asserts Signal Whistle is correctly refused while Poncho's effect is active, rather than assuming Signal Whistle succeeds alongside it (see key-decisions above for the full reasoning).
- Post-replay "used flags reset" assertions for commandeer/ghost/chatter check `error !== "gear_already_used"` rather than requiring outright acceptance, since Monsoon returning (chatter) and the fresh deal's leader (commandeer) can each legitimately refuse the gear for an unrelated, correct reason after replay — the reset property under test is specifically that the engine no longer believes the gear was used this attempt.
- ENG-01's REQUIREMENTS.md checkbox is left untouched: it predates this plan (set at milestone-requirements-definition time, before any Phase 10 plan existed) and is not something this plan's scope covers correcting; the interactable/card-pack caveat this plan's own instructions asked for is documented here instead, per that instruction.

## Deviations from Plan

### Adjustments to the plan's literal test script (not code bugs)

**1. "p2 uses chatter (an effect exists)" in attempt 1 does not hold as literally written**
- **Found during:** Task 1, drafting `replay-reset.test.ts`'s fail-then-replay scenario
- **Issue:** The plan's step list has p0 use Rain Poncho (jam) at pre-deal, then later has p2 use Signal Whistle (chatter) between tricks and expects it to succeed ("an effect exists"). But `jam.ts`'s own `effectModifier` sets `whisperAllowed` to `false` unconditionally for the rest of the attempt the instant Poncho is used (its own header states this is deliberate: "any gear whose canUse checks rules.whisperAllowed, e.g. chatter.ts/broadcast.ts, is blocked the same way a plain whisper action is"), and `chatter.ts`'s own `canUse` does exactly that check. So by the time p2 attempts to use chatter, it is correctly refused (`gear_unavailable`, "Whispers are blocked this camp") — not because of a code bug, but because the plan's script did not account for an interaction jam.ts's own comments already flag.
- **Fix:** The test proves attempt 1's two active effects (Poncho's own + Camouflage's) instead of forcing a third through chatter, and separately asserts chatter's refusal explicitly (proving the Poncho-blocks-whisper-gear-too interaction directly, which is arguably a stronger and more relevant assertion than the plan's literal step).
- **Files modified:** `packages/rules/src/expedition/run/replay-reset.test.ts` (written this way from the start, not a later correction)
- **Verification:** `npx vitest run --project rules packages/rules/src/expedition/run/replay-reset.test.ts` passes both scenarios; full expedition suite (711 tests) and `npm run typecheck` stay green.
- **Committed in:** `bf38756`

**2. The replay-phase "peek, commandeer, ghost and chatter pass checkUseGear again" is not literally true for chatter (and is edge-case-dependent for commandeer)**
- **Found during:** Task 1, same scenario, the replay half
- **Issue:** After replay, p0 skips Rain Poncho, so Monsoon (`radio-silence`) is active again — which blocks chatter for the same `whisperAllowed` reason as attempt 1, just via the boss twist instead of the gear. Separately, whether Machete's owner is already the new deal's leader (which would correctly refuse commandeer with "You already lead the next trick") depends on the fresh shuffle, which this plan does not control.
- **Fix:** The assertions check that none of these gear items reject with `gear_already_used` specifically (the literal RUN-06/T-10-50 property: the engine no longer believes the gear was used this attempt), rather than asserting outright success — a check that is both correct against the real composed rules and robust to which seat the fresh deal happens to make leader.
- **Files modified:** `packages/rules/src/expedition/run/replay-reset.test.ts`
- **Verification:** Same as above.
- **Committed in:** `bf38756`

No bugs, missing critical functionality, or blocking issues were found in the Plan 05/06/07/08/09/10/11/12/13/14/15 code this plan depends on (`lifecycle.ts`, `whisper.ts`, `use-gear.ts`, `toolkit.ts`, `compose.ts`, `jam.ts`, `chatter.ts`, `peek.ts`, `commandeer.ts`, `ghost.ts`, `radio-silence.ts`, `GEAR_REGISTRY`, `BOSS_REGISTRY`) — both adjustments above are test-authoring choices to match already-correct, already-contract-tested production behavior, not fixes to that behavior.

## Known Stubs

None — this plan adds a wiring file, an integration test, and documentation; no UI or data-wiring stubs are introduced.

## Threat Flags

None beyond the two the plan's own `<threat_model>` already named (T-10-49 stale reveals, T-10-50 gear-use-across-replay), both of which this plan's test directly mitigates/proves. No new network endpoint, auth path, file access pattern, or schema change at a trust boundary was introduced.

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/run/catalog.ts
- FOUND: packages/rules/src/expedition/run/replay-reset.test.ts
- FOUND: packages/rules/src/expedition/README.md
- FOUND: bf38756 (git log)
- FOUND: a088ab0 (git log)

## Verification

- `npx vitest run --project rules packages/rules/src/expedition/run/replay-reset.test.ts` — 2 tests passed
- `npx vitest run --project rules packages/rules/src/expedition` (full suite) — 49 files, 711 tests passed
- `npm run typecheck` — exits 0
- `grep -c "export const CATALOG" packages/rules/src/expedition/run/catalog.ts` — 1
- `replay-reset.test.ts` describe titles contain "ROADMAP criterion 2" and "ROADMAP criterion 1" — confirmed
- `replay-reset.test.ts` asserts `gearUses`/`effects`/`reveals`/`log` all `toEqual([])`, `bossCancelled` `false`, `whispersUsedBy(` returns 0, `leaderSeatId` equals `expeditionLeaderSeatId`, supplies decremented by exactly 1, every `draftOffer` `null` — confirmed present
- README.md contains all seven required headings ("## Add a piece of gear", "## Add an objective kind", "## Add a boss twist", "## Add a hook", "## Add an interactable", "## Add a card pack", "## Invariants") and mentions `GEAR_REGISTRY`, `BOSS_REGISTRY`, `OBJECTIVE_KINDS`, `HOOK_NAMES`, `applyToolkitOps` and `STREAMS` — confirmed present

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ROADMAP success criteria 1 and 2 are proven end to end on the real catalogue; `run/catalog.ts`'s `CATALOG` is ready for Phase 11's adapter to import directly.
- ENG-01's README recipes are complete for everything this package owns (gear, objective kinds, boss twists, hooks, toolkit ops); the interactable and card-pack recipes are documented as forward contracts only, since those registries live in `apps/web` and are built in Phase 14 and Phase 12 respectively — ENG-01 is not fully closable until those land.
- Only Plan 10-17 (whole-run property tests: deterministic replay from seed + action log, RUN-07) remains before Phase 10 is complete.
- Full `packages/rules` test suite (711 tests) and `npm run typecheck` pass with these changes in place.

---
*Phase: 10-run-layer-gear-engine-bosses*
*Completed: 2026-09-27*
