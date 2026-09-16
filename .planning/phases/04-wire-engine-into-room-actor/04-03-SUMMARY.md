---
phase: 04-wire-engine-into-room-actor
plan: 03
subsystem: api
tags: [engine-swap, redaction, hanabi, structural-audit, wire-protocol]

# Dependency graph
requires:
  - phase: 04-wire-engine-into-room-actor
    provides: "wave-1/2 groundwork (04-01, 04-02) — strict Hanabi wire view schema, actionId, ROOM_SCHEMA_VERSION bump"
provides:
  - "the worker running the real Hanabi engine through the single game-registration.ts seam (D-04)"
  - "wire-level redaction proof (redaction-wire.test.ts) repointed to checkHanabiViewForLeaks/secretsForHanabiSeat"
  - "seat-projection.test.ts's fail-closed gate fixtures repointed to Hanabi with a non-vacuous positive control (T-04-38)"
  - "CR-03 turn-order-refusal proof repointed to a legal Hanabi clue"
  - "layer-3 live-workerd frame-capture leak proof rebuilt against HanabiSeatSecrets"
  - "source-structure.test.ts A9 confinement check non-vacuously repointed to hanabiGame"
affects: ["04-04 (mapAdapterError / dedup logic can now build on a fully Hanabi-shaped worker suite)", "04-05 (RT-09 double-send test extends this plan's already-Hanabi-shaped room-do.test.ts harness)", "04-08 (deletes the forehead-card toy files this plan's tests no longer reference)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-frame identity recovery for client-only leak tests: a seat's own hand-card identity is never visible in that seat's own frames, so a wire-only integration test recovers it by observing the SAME card id, with real suit/rank, in another seat's otherHands sighting across the captured frame set"
    - "Positive control before fail-closed rejection tests: assert the unleaked fixture validates FIRST, so every subsequent rejection test can only be attributed to its own specific mutation rather than a whole-shape mismatch against the wrong game"
    - "Non-vacuous structural confinement: a 'confined to file X' assertion must also assert a nonzero hit count, or a future deletion of the identifier makes the assertion pass for the wrong reason"

key-files:
  created: []
  modified:
    - apps/worker/src/game-registration.ts
    - apps/worker/src/redaction-wire.test.ts
    - apps/worker/src/room-state.test.ts
    - apps/worker/src/seat-projection.test.ts
    - apps/worker/src/room-do.test.ts
    - apps/worker/src/source-structure.test.ts

key-decisions:
  - "legalActionFor priority order (clue > discard > play) implemented independently in three call sites (redaction-wire.test.ts, room-state.test.ts) rather than shared across files, per the plan's file-scoped task boundaries — each file's helper is a local, self-contained fixture generator, not a shared test-support module"
  - "allowedIdentityCounts for the layer-3 client-only leak check is computed as the element-wise max, per identity key, across each seat's own captured frames — the most permissive static allowance that still cannot mask a genuine excess-count leak within any single checked frame"
  - "room-state.test.ts's deck-exhaustion test rewritten to drive a Hanabi game to its natural end (fuses>=3 or finalTurnsRemaining hits 0) via legalActionFor, rather than trying to preserve the toy's fixed 14-guess iteration count, which had no Hanabi equivalent"

patterns-established:
  - "Fault-injection verification as a first-class step before committing a redaction/confinement test: temporarily break the invariant, confirm the test catches it, then revert (never commit the injected break) — done for seat-projection's positive control, redaction-wire's property test, and source-structure's A9"

requirements-completed: [RT-01]

# Metrics
duration: 55min
completed: 2026-09-15
---

# Phase 4 Plan 3: Swap Worker Registration to the Hanabi Engine Summary

**Swapped `game-registration.ts`'s two imports from the forehead-card toy to the real Hanabi engine, then repaired every one of the four test files that swap broke — wire-level redaction, room-state, seat-projection's fail-closed gate, CR-03, layer-3 live-frame capture, and the structural game-naming audit — closing the plan on a fully green, unfiltered `npm test`.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-09-15T20:00:00Z
- **Completed:** 2026-09-15T20:55:00Z
- **Tasks:** 4
- **Files modified:** 6

## Accomplishments
- `game-registration.ts` now binds `activeGame.adapter` to `hanabiGame`, `activeGame.viewSchema` to `HanabiViewSchema`, `activeGame.gameId` to `HANABI_GAME_ID`, and `ActiveGameState` to `HanabiState` — the only worker file that names Hanabi, with both compile-time assignability assertions (`_AssertViewAssignable`, `_AssertKeysMutuallyAssignable`) repointed and kept green under `tsc -b`
- `redaction-wire.test.ts`'s fast-check property (100 runs, 2-5 seats) and its "played to ended" test now drive the room through `legalActionFor`-derived Hanabi actions and check `checkHanabiViewForLeaks`/`secretsForHanabiSeat`; the wire canary asserts `"structural:hidden-card-has-identity"`
- `room-state.test.ts`'s `adapterId` assertion reads `"hanabi"`; its game-action and purity tests drive legal Hanabi actions; the deck-exhaustion test now plays a Hanabi game to its natural end and asserts every hidden `yourHand` entry's sorted keys equal `["facts","hidden","id"]`
- `seat-projection.test.ts` fully repointed to the `HanabiCardView` shape, with a load-bearing positive control (fault-injection verified) guarding all five fail-closed rejection tests against passing vacuously for the wrong reason
- `room-do.test.ts`'s CR-03 test now derives a legal rank clue from Alice's own wire frame and waits on `history.length === 1`, confined entirely to the CR-03 test body
- `room-do.test.ts`'s layer-3 HIDE-01/HIDE-04 test rebuilt wholesale: legal clue sends, `history.length` predicates, and a from-scratch `HanabiSeatSecrets` construction via cross-frame identity recovery (a seat's own card identity is only ever observable in another seat's `otherHands` sighting)
- `source-structure.test.ts`'s A9 rewritten to confine `hanabiGame` non-vacuously (floor of 1 hit) plus a separate zero-occurrence assertion that `foreheadCardGame` appears nowhere, scoped to the identifier (not the word "forehead") so the Hanabi engine's design-template comments survive
- Full `npm test` is green: 448 tests across 44 files, and `npx tsc -b` is clean in all four packages (`packages/schema`, `packages/rules`, `apps/worker`, `apps/web`)

## Task Commits

1. **Task 1: Swap the registration point to the Hanabi engine** - `7c6c3a6` (feat)
2. **Task 2: Repoint the worker's leak, room-state, seat-projection, and CR-03 coverage to Hanabi** - `33a44ee` (test)
3. **Task 3: Rewrite the structural game-naming confinement check for Hanabi** - `b6931e5` (test)
4. **Task 4: Rebuild the layer-3 frame-capture leak proof against the Hanabi view** - `e2898ea` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `apps/worker/src/game-registration.ts` - two imports + `activeGame` literal + both compile-time assertions repointed to Hanabi
- `apps/worker/src/redaction-wire.test.ts` - `checkHanabiViewForLeaks`/`secretsForHanabiSeat`, `legalActionFor` helper, canary repointed
- `apps/worker/src/room-state.test.ts` - `adapterId` assertion, `legalActionFor` helper, deck-exhaustion test rewritten for Hanabi's natural end
- `apps/worker/src/seat-projection.test.ts` - whole-file repoint to `HanabiCardView`, positive control added before the five rejection tests
- `apps/worker/src/room-do.test.ts` - CR-03 repointed to a legal clue + `history.length`; layer-3 test rebuilt (import, type aliases, sends, secrets construction)
- `apps/worker/src/source-structure.test.ts` - A9 rewritten to confine `hanabiGame` non-vacuously plus a separate `foreheadCardGame` zero-occurrence check

## Decisions Made
- `legalActionFor`'s priority order (clue when tokens available and an other seat holds cards; else discard below the token cap; else play) is implemented as a small local helper in each of the two files that need it (`redaction-wire.test.ts`, `room-state.test.ts`) rather than factored into a shared test-support module, matching the plan's per-file task scoping.
- The layer-3 test's `allowedIdentityCounts` per seat is the element-wise max of the identity multiset legitimately visible across that seat's own captured frames (rather than a single frame's snapshot), since the same static `secrets` object is reused across every frame check for a seat.
- `room-state.test.ts`'s "played to deck exhaustion" test lost its literal meaning under Hanabi (no fixed 14-guess cadence exists); rewritten to loop `legalActionFor` until `status === "ended"` under a 2000-iteration guard, preserving the test's intent (further actions refused; hidden own-hand keys correct) rather than its exact mechanics.

## Deviations from Plan

None beyond the plan's own explicit two-step structure (break in Task 1, repair in Tasks 2-4) — every acceptance criterion in the plan was met as written, including the required fault-injection checks (seat-projection positive control, redaction-wire property test, source-structure A9), all performed and reverted without being committed.

## Issues Encountered
- `npx tsc -b` at the repo root still fails with `TS5083: Cannot read file '/home/rflor/games/tsconfig.json'` (no root solution tsconfig; pre-existing, noted in 04-01/04-02 SUMMARYs too). Ran `tsc -b` from within each of the four package directories instead — all exit 0.
- `npm run test:integration --workspace apps/worker` reports "No test files found" when invoked via `npm run ... --workspace`, apparently a pre-existing npm-workspace/vitest-projects cwd interaction unrelated to this plan's changes (not present in either the plan's own acceptance criteria as a blocker nor reproducible via the equivalent `npx vitest run --project worker room-do` from the repo root, which passes 13/13 including the layer-3 test). Verified the underlying suite is green via the direct invocation; did not attempt to fix the npm script wiring as it is out of this plan's file scope.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 04-04 can implement `mapAdapterError`/dedup logic against a worker test suite that is already fully Hanabi-shaped — no remaining toy references anywhere in `apps/worker/src`.
- Plan 04-05's RT-09 double-send test can extend `room-do.test.ts`'s harness directly; the file's existing sends are already legal Hanabi `clue` actions with distinct `actionId` literals to model against.
- Plan 04-08 (forehead-card toy deletion) can proceed knowing no test in the worker suite references `foreheadCardGame`, `FOREHEAD_CARD_VALUES`, `checkSeatViewForLeaks`, or `secretsForSeat` — confirmed via `source-structure.test.ts`'s new zero-occurrence assertion.
- Full `npm test` is green (44 files / 448 tests) and all four packages type-check clean.

---
*Phase: 04-wire-engine-into-room-actor*
*Completed: 2026-09-15*
