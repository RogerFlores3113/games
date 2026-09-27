---
phase: 10-run-layer-gear-engine-bosses
plan: 05
subsystem: rules-engine
tags: [expedition, run-layer, state-machine, boss, draft, typescript, vitest]

# Dependency graph
requires:
  - phase: 10-run-layer-gear-engine-bosses
    plan: 02
    provides: "run/types.ts's RunState/AttemptState/SeatRun/CampResult/RunStatus/RunPhase/CampNumber/Catalog, run/rng.ts's attemptSeed/STREAMS/seededIndex"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 03
    provides: "run/compose.ts's rulesFor/activeBossId, run/balance.ts's STARTING_SUPPLIES/FINAL_CAMP/BOSS_CAMPS/DRAFT_OFFER_SIZE/objectiveSlotsFor"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 04
    provides: "run/toolkit.ts's isGearSpent/gearAvailability, the GEAR-06 reason-string contract this plan's preDealPendingSeatIds reuses"
provides:
  - "run/draft.ts: draftOfferFor(seed, campNumber, seatId, allGearIds, ownedGearIds) — the single, private, seeded 1-of-3 draft offer builder (RUN-04, D-05)"
  - "run/lifecycle.ts: createRun, runStatus, runPhase, nextAttemptNumber, capacityOf, loadoutSize, preDealPendingSeatIds, drawBossTwist, startAttempt, dealAttempt, assignFaceDown, settleIfDecided, advanceRun — the full six-camp run state machine the dispatcher (Plan 10-07) calls after every accepted action"
affects: [10-06, 10-07, 10-08, 10-09, 10-10, 10-11, 10-12, 10-13, 10-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "derive-don't-cache for the run layer, same as camp.ts's Phase 9 discipline: runStatus/runPhase/nextAttemptNumber/capacityOf are all recomputed from RunState on every call — no stored phase/status field anywhere in lifecycle.ts (proven by a grep gate)"
    - "advanceRun is the single fold point: deal once preDealPendingSeatIds is empty, then settleIfDecided — every later plan's RunAction handler (Plan 10-07) calls only this one function after an accepted action, never dealAttempt/settleIfDecided directly"
    - "boss-twist draw-once-per-camp (D-02/D-03): startAttempt only calls drawBossTwist when bossTwists[N] is still null, and camp 6's pool excludes bossTwists[3] — a replay's startAttempt is therefore a no-op on bossTwists"
    - "failureCost is read from the composed rules BEFORE the attempt is cleared (POLICY A3): settleIfDecided throws a named Error if a boss/gear-composed failureCost is not an integer >= 1, so a failure can never be free and the run is bounded"
    - "A5 face-down round-robin: assignFaceDown shuffles objective ids on their own stream (STREAMS.faceDown) and assigns them round-robin from the expedition leader, so seats beyond the objective count structurally get none — no distinct 'leftover seats' branch needed"

key-files:
  created:
    - packages/rules/src/expedition/run/draft.ts
    - packages/rules/src/expedition/run/draft.test.ts
    - packages/rules/src/expedition/run/lifecycle.ts
    - packages/rules/src/expedition/run/lifecycle.test.ts

key-decisions:
  - "RUN-04's draftOfferFor is deliberately scoped to computing/returning an offer only; WHERE it is stored (a seat's own SeatRun.draftOffer, never shared) and the actual 'pick-draft' RunAction are left to Plan 10-07's dispatcher — this plan's createRun/settleIfDecided both call draftOfferFor and assign the result directly onto the offered seat's own record, matching RUN-04's privacy contract structurally rather than by a later redaction pass"
  - "settleIfDecided's failure branch never touches `seats` at all (not even to no-op reassign), so D-01 (no draft on replay) and D-06 (loadouts untouched) both fall out of 'this branch doesn't write to seats' rather than needing an explicit 'leave draftOffer null' step"
  - "isBossCampNumber is a small local type guard over run/balance.ts's BOSS_CAMPS rather than a literal `campNumber === 3 || campNumber === 6` check, so a future balance-table change to which camps are boss camps needs no edit here"

requirements-completed: [RUN-01, RUN-02, RUN-06]
# RUN-04 ("Each player drafts 1 of 3 offered gear...") is only PARTIALLY
# delivered: this plan builds and wires the private, seeded, never-owned
# offer (draftOfferFor, called from createRun at camp 1 and from
# settleIfDecided after every cleared camp) but the actual "pick-draft"
# RunAction that lets a player CHOOSE from their offer is Plan 10-07's
# dispatcher, not this plan. Left unchecked in REQUIREMENTS.md.
# BOSS-01 ("Each boss camp applies one twist from the provisional v1 set")
# is NOT delivered here: this plan builds the boss-twist DRAW mechanism
# (drawBossTwist, D-02/D-03 fixed-per-camp-and-never-repeated) generically
# against fake test catalogs, per the plan's own header ("do not import
# real gear or bosses; they arrive in wave 5"). The actual four provisional
# boss twists are catalogue content for a later plan. Left unchecked.

# Metrics
duration: ~50min
completed: 2026-09-26
---

# Phase 10 Plan 05: Run State Machine — Create, Draft, Capacity, Boss Draw, Deal, Settle Summary

**The six-camp run loop is now a working state machine on fake catalogs: `createRun` starts the fireside with a private seeded draft offer per seat, `startAttempt`/`dealAttempt`/`assignFaceDown` deal each attempt from `attemptSeed(seed, N, A)` with fresh objectives and Thick-Fog-style face-down assignment, and `settleIfDecided`/`advanceRun` spend supplies on failure (composed `failureCost`, computed before the attempt clears), replay with no draft and untouched loadouts (D-01/D-06), advance and re-draft on success, and resolve win/loss.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-09-26
- **Tasks:** 2/2 completed
- **Files created:** 4

## Accomplishments

- `run/draft.ts`'s `draftOfferFor(seed, campNumber, seatId, allGearIds, ownedGearIds)` sorts candidates before shuffling (so caller id-order never affects the draw), draws through the single `STREAMS.draft(campNumber, seatId)` stream, excludes only the OFFERED seat's own owned gear (D-05: two seats may see and later own the same gear), and returns `null` only when every gear id is already owned — proven deterministic, distinct, owned-exclusion-respecting, per-seat-independent, and cross-seat-overlap-permitting (D-05) across 20 seeds.
- `run/lifecycle.ts`'s `createRun` validates player count (3-5), duplicate seat ids and a non-empty seed, and builds every seat's fresh camp-1 draft offer; `runStatus`/`runPhase` are fully derived (lost at 0 supplies, won when history ends with camp 6 succeeded, phase fireside/pre-deal/camp/ended) with zero stored phase/status fields anywhere in the file (grep-proven).
- `capacityOf`/`loadoutSize` wrap `rulesFor(...).capacity` and a gear-size sum (throwing on an unknown gear id); `nextAttemptNumber` counts prior history entries at the current camp number.
- `preDealPendingSeatIds` waits only for seats with an equipped, unspent, currently-available (`gearAvailability(...).ok`) pre-deal-window gear (D-12) — proven both for the blocking case (`canUse` true) and the non-blocking case (`canUse` returns a reason string) and for seats with no pre-deal gear at all.
- `drawBossTwist`/`startAttempt` draw a boss twist only on first arrival at a boss camp (D-02: a second failed attempt at the same camp keeps the same id, proven with a fixture history entry) and camp 6's pool excludes camp 3's already-drawn twist (D-03, proven never-equal across 50 seeds).
- `dealAttempt` deals from `attemptSeed(seed, N, A)` and `objectiveSlotsFor(seed, N, A)` (RUN-02: attempt 1 and attempt 2 at the same camp are proven to produce different hands from the same seed); `assignFaceDown` (A5) shuffles objective ids on `STREAMS.faceDown(N, A)` and hands them round-robin from the expedition leader — proven every objective gets a non-null owner (`campPhase` becomes `"playing"`) and, with 3 objectives and 5 seats, exactly 2 seats own none.
- `settleIfDecided` computes `rules.failureCost(run)` BEFORE clearing the attempt (proven with a fake Energy-Tonic-style passive stacking to cost 3 across two equipped seats), throws a named `Error` for a non-integer or sub-1 composed cost (POLICY A3), returns to the fireside with no draft and untouched `equippedGearIds` on failure (D-01/D-06), advances the camp and deals fresh offers to every seat on success, and resolves `runStatus` to `"won"`/`"lost"` correctly (camp-6 clear; supplies at 0).
- `advanceRun` is the single fold: deal once `preDealPendingSeatIds` is empty, then settle — proven to deal-then-immediately-settle a forced failure in one call, matching the plan's own worked example.
- A new attempt after a failure is proven structurally reset (RUN-06): `gearUses`/`effects`/`reveals`/`log` all `[]`, `bossCancelled` `false`, while `seats` and `bossTwists` stay deep-equal to the pre-failure state.
- `npx vitest run --project rules packages/rules/src/expedition/run` — 6 files, 125 tests passed; `npx vitest run --project rules packages/rules/src/expedition` (full suite, including the directory-scanning purity guard) — 17 files, 297 tests passed; `npm run typecheck` — exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Draft offers (RUN-04, D-05)** - `f35a932` (feat)
2. **Task 2: Run lifecycle — create, derive, start/deal attempts, settle** - `665b288` (feat)

## Files Created/Modified

- `packages/rules/src/expedition/run/draft.ts` - `draftOfferFor`
- `packages/rules/src/expedition/run/draft.test.ts` - distinctness, determinism, owned-exclusion, 2-/0-candidate edge cases, per-seat independence, D-05 overlap
- `packages/rules/src/expedition/run/lifecycle.ts` - `createRun`, `runStatus`, `runPhase`, `nextAttemptNumber`, `capacityOf`, `loadoutSize`, `preDealPendingSeatIds`, `drawBossTwist`, `startAttempt`, `dealAttempt`, `assignFaceDown`, `settleIfDecided`, `advanceRun`
- `packages/rules/src/expedition/run/lifecycle.test.ts` - fake `GearDef`/`BossDef` fixtures covering every must_have behavior, including tests titled with "D-01", "D-02", "D-03", "D-12" and "RUN-03"

## Decisions Made

- `draftOfferFor` computes and returns an offer only; storing it privately on the offered seat's own `SeatRun.draftOffer` (never a shared list) and the actual "pick-draft" `RunAction` are Plan 10-07's dispatcher concern. This plan's `createRun`/`settleIfDecided` both assign the result directly onto the offered seat's own record, which is what makes RUN-04's privacy hold structurally rather than needing a later redaction pass.
- `settleIfDecided`'s failure branch never touches `seats` — D-01 (no draft on replay) and D-06 (loadouts untouched) both fall out of that branch simply not writing to `seats`, rather than an explicit "leave draftOffer null" step.
- `isBossCampNumber` is a small local type guard reading `run/balance.ts`'s `BOSS_CAMPS` rather than a literal `campNumber === 3 || campNumber === 6` check, so a future balance-table change to which camps are boss camps needs no edit in `lifecycle.ts`.

## Deviations from Plan

None — plan executed as written. No bugs, missing critical functionality, or blocking issues were found in the Plan 02/03/04 code this plan depends on (types, compose, balance, toolkit) requiring a Rule 1/2/3 fix.

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/run/draft.ts
- FOUND: packages/rules/src/expedition/run/draft.test.ts
- FOUND: packages/rules/src/expedition/run/lifecycle.ts
- FOUND: packages/rules/src/expedition/run/lifecycle.test.ts
- FOUND: f35a932 (git log)
- FOUND: 665b288 (git log)

## Verification

- `npx vitest run --project rules packages/rules/src/expedition/run/draft.test.ts` — 8 tests passed
- `npx vitest run --project rules packages/rules/src/expedition/run/lifecycle.test.ts` — 30 tests passed
- `npx vitest run --project rules packages/rules/src/expedition/run` — 6 files, 125 tests passed
- `npx vitest run --project rules packages/rules/src/expedition` — 17 files, 297 tests passed
- `npm run typecheck` — exits 0
- `grep -cE "export function (createRun|runStatus|runPhase|nextAttemptNumber|capacityOf|loadoutSize|preDealPendingSeatIds|drawBossTwist|startAttempt|dealAttempt|assignFaceDown|settleIfDecided|advanceRun)\b" packages/rules/src/expedition/run/lifecycle.ts` — 13
- `grep -c "attemptSeed(" packages/rules/src/expedition/run/lifecycle.ts` — 2 (>= 1)
- `grep -c "STREAMS.boss(" packages/rules/src/expedition/run/lifecycle.ts` — 1 (>= 1)
- `grep -cE "D-01|D-02|D-03|D-12|RUN-03" packages/rules/src/expedition/run/lifecycle.test.ts` — 6 (test titles present)
- `grep -cE "phase:|status: \"(won|lost|in_progress)\""  packages/rules/src/expedition/run/lifecycle.ts` — 0
- `grep -c "STREAMS.draft(" packages/rules/src/expedition/run/draft.ts` — 2 (code + comment reference, >= 1)
- `grep -c "DRAFT_OFFER_SIZE" packages/rules/src/expedition/run/draft.ts` — 3 (>= 1)
