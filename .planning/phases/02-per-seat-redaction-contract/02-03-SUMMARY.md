---
phase: 02-per-seat-redaction-contract
plan: 03
subsystem: worker
tags: [redaction, fail-closed, adapter-registration, persistence, fast-check, wire-protocol]

# Dependency graph
requires:
  - phase: 02-per-seat-redaction-contract
    plan: 01
    provides: foreheadCardGame adapter, checkSeatViewForLeaks/secretsForSeat (@games/rules)
  - phase: 02-per-seat-redaction-contract
    plan: 02
    provides: ForeheadCardViewSchema / FOREHEAD_CARD_GAME_ID (@games/schema/games/forehead-card), closed ErrorDetailSchema
provides:
  - "apps/worker/src/game-registration.ts: the single non-test worker module permitted to name the active game (activeGame.adapter/viewSchema/gameId, ActiveGameState), with a compile-time ForeheadCardView<->ForeheadCardViewWire contract check"
  - "apps/worker/src/room-state.ts: adapter swapped from the D-15 counter to activeGame.adapter; toSeatView/applyGameAction cast to ActiveGameState"
  - "apps/worker/src/seat-projection.ts: projectSeatView/validateGameView fail-closed gate, ProjectedRoomView brand, OutboundFrame type — the future single toSeatView call site (Plan 04)"
  - "packages/schema/src/constants.ts: ROOM_SCHEMA_VERSION bumped 1 -> 2, closing the persisted adapterId:\"counter\" gap"
  - "apps/worker/src/redaction-wire.test.ts: D-11 layer-2 wire-string property test reusing @games/rules' checkSeatViewForLeaks"
affects: [02-04 (room-do.ts #send consolidation + #viewFor switching to projectSeatView), 02-05 (apps/web toy UI), 02-06 (D-11 layer 3 wrangler-dev integration + D-02 counter deletion)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single adapter registration point: game-registration.ts is the only non-test worker file naming a specific game; room-state.ts and seat-projection.ts reach it only via activeGame"
    - "Fail-closed schema gate: validateGameView returns the original (branded) view on success, strictly null on any schema failure — never a partial/reconstructed object"
    - "Branded ProjectedRoomView type on top of the runtime check, so a joined/state frame's view can only type-check if it came from seat-projection.ts"
    - "Schema-version bump as the sole persisted-shape reset trigger (no second adapterId check added to persistence.ts, preserving its one-reset-condition design)"

key-files:
  created:
    - apps/worker/src/game-registration.ts
    - apps/worker/src/seat-projection.ts
    - apps/worker/src/seat-projection.test.ts
    - apps/worker/src/redaction-wire.test.ts
  modified:
    - apps/worker/src/room-state.ts
    - apps/worker/src/room-state.test.ts
    - apps/worker/src/room-do.test.ts
    - apps/worker/src/persistence.test.ts
    - packages/schema/src/constants.ts

key-decisions:
  - "game-registration.ts's compile-time contract check uses one-element-tuple-wrapped conditional types (mutual assignability of ForeheadCardView and ForeheadCardViewWire, plus their key sets) assigned to underscore-prefixed consts, per the plan's exact spec"
  - "seat-projection.ts's OutboundFrame is built with Exclude/Extract/Omit over ServerMessage per the plan, even though Plan 04 (not this plan) is the first consumer that will actually import it"
  - "persistence.test.ts's new Pitfall-1 test seeds a literal schemaVersion 1 and asserts ROOM_SCHEMA_VERSION > 1, so it stays meaningful regardless of future version bumps"

requirements-completed: [HIDE-01, HIDE-02, HIDE-03, HIDE-04]

# Metrics
duration: ~35min
completed: 2026-09-15
---

# Phase 2 Plan 3: Worker Wiring — Registration Point, Fail-Closed Gate, Schema-Version Bump, Wire-String Property Test Summary

**Wired the toy adapter into the worker through one registration module, added the branded fail-closed strict-schema projection gate, bumped ROOM_SCHEMA_VERSION to close the persisted-counter-room gap, and proved the encoded wire string never leaks own value, deck contents, or seed across 100+ random games plus a deterministic full game.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-15T19:32:00Z (approx.)
- **Completed:** 2026-09-15T20:07:00Z
- **Tasks:** 3
- **Files modified:** 9 (4 created, 5 modified)

## Accomplishments
- `game-registration.ts`: the sole non-test worker module naming `foreheadCardGame`/`ForeheadCardViewSchema`; `room-state.ts` reaches the game only through `activeGame.adapter`, with the D-15 `counterGame`/`CounterState`/`CounterAction` imports and casts fully removed from `apps/worker/src`
- A compile-time contract check (no runtime cost) proves `ForeheadCardView` and `ForeheadCardViewWire` stay mutually assignable, so the adapter's TS view type and the Zod schema's inferred type cannot silently drift apart
- `seat-projection.ts`: `validateGameView`/`projectSeatView` fail closed to `null` (never a fallback to the raw/unvalidated view) on any strict-schema rejection, logging only `seatId` + issue `code`/`path` — proven via 10 unit tests including a `console.error`-argument leak check
- `ROOM_SCHEMA_VERSION` bumped 1 -> 2 (`packages/schema/src/constants.ts`); a new persistence test proves a pre-swap `adapterId: "counter"` room resets via the existing reset path without ever reading the stale room blob
- `redaction-wire.test.ts` (D-11 layer 2): a 100-run fast-check property drives real rooms (2-5 seats) through `applyGameAction`, projects every seat's view with `projectSeatView`, encodes both `state` and `joined` frames with `encodeServerMessage`, and runs `checkSeatViewForLeaks` (the same checker layer 1 uses) against both the parsed and in-memory representations of the actual wire string — plus a deterministic 5-seat game played to `status: "ended"` (11 guesses) and a wire canary proving the strict game gate, not `RoomViewSchema.game` (which stays `z.unknown()`), is what blocks a leaky own-value view

## Task Commits

Each task was committed atomically:

1. **Task 1: Single registration point and adapter swap in room-state.ts** - `33851da` (feat)
2. **Task 2: Fail-closed projection gate and ROOM_SCHEMA_VERSION bump** - `f6dfb06` (feat)
3. **Task 3: D-11 layer 2 wire-string property test** - `f385b20` (test)

**Plan metadata:** (this commit, following this SUMMARY)

_TDD applied to Tasks 1 and 2 (both `tdd="true"`): seat-projection.test.ts was written and confirmed RED (module-not-found) before seat-projection.ts existed, then confirmed GREEN. room-state.test.ts's toy-behavior replacements and room-do.test.ts's CR-03 update were verified against the already-existing toy adapter (from Plan 01), so no separate RED step was needed there — the D-15 counter test they replaced was itself the "old" behavior being removed. Task 3 (redaction-wire.test.ts) is a new test file with no existing implementation to make RED first; it passed against the already-built Task 1/2 code on first run._

## Files Created/Modified
- `apps/worker/src/game-registration.ts` - single registration point (`activeGame`, `ActiveGameState`) + compile-time view/schema contract check
- `apps/worker/src/room-state.ts` - adapter swapped from `counterGame` to `activeGame.adapter`; casts to `ActiveGameState`
- `apps/worker/src/room-state.test.ts` - D-15 counter test replaced with toy behaviors (accept/refuse-repeat, deck-exhaustion `ended`, sorted `yourCard` keys, registration assertions)
- `apps/worker/src/room-do.test.ts` - CR-03 test drives a `guess` action instead of `increment`
- `apps/worker/src/seat-projection.ts` - `projectSeatView`, `validateGameView`, `ProjectedRoomView`, `OutboundFrame`
- `apps/worker/src/seat-projection.test.ts` - 10 tests covering lobby/started projection, clean-view acceptance, 5 leak-shape rejections, no-object-leak-on-failure, and the `console.error` secret-leak check
- `packages/schema/src/constants.ts` - `ROOM_SCHEMA_VERSION = 2`
- `apps/worker/src/persistence.test.ts` - new "Phase 2 adapter swap" test proving the pre-swap counter room resets without reading the room blob
- `apps/worker/src/redaction-wire.test.ts` - D-11 layer 2 property test + deterministic ended-game test + wire canary

## Decisions Made
- Compile-time contract check in `game-registration.ts` implemented exactly per the plan's spec (one-element-tuple-wrapped conditional types, underscore-prefixed unused consts) rather than a runtime assertion
- `OutboundFrame` built now in `seat-projection.ts` even though its first real consumer is Plan 04's `#send`/`#viewFor` consolidation, per the plan's explicit file/export list for this plan
- No second reset trigger added to `persistence.ts` — the version bump alone closes Pitfall 1, preserving the module's documented "one reset condition" invariant

## Deviations from Plan

None — plan executed exactly as written. All three tasks' behavior bullets, acceptance-criteria greps, and verification commands passed (Task 3 passed on first implementation without needing any fixes; Tasks 1-2 needed no deviation-triggering fixes either).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `game-registration.ts`'s `activeGame` and `seat-projection.ts`'s `projectSeatView`/`OutboundFrame` are ready for Plan 04, which consolidates `room-do.ts`'s scattered `connection.send` call sites behind a single `#send` and switches `#viewFor` to call `projectSeatView` instead of `toSeatView` directly (closing the last gap before `toSeatView(` has exactly one call site in the whole worker, per D-09).
- `room-do.ts` itself is untouched by this plan (as the plan's objective states) — it still calls `toSeatView` directly and has multiple `connection.send` sites; that consolidation is explicitly Plan 04's job.
- `ROOM_SCHEMA_VERSION = 2` is live; any room persisted under the pre-Phase-2 counter adapter will reset cleanly on next load.
- The `wrangler dev` D-11 layer 3 integration test (capturing real join/state/reconnect frames) and the D-02 deletion of `counter-game.ts`/`CounterGame.tsx` remain for a later plan in this phase (per RESEARCH.md's Wave 0 gaps and CONTEXT.md's D-02).

---
*Phase: 02-per-seat-redaction-contract*
*Completed: 2026-09-15*
