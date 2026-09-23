---
phase: 04-wire-engine-into-room-actor
plan: 04
subsystem: api
tags: [dedup, actionId, error-mapping, room-state, hanabi]

# Dependency graph
requires:
  - phase: 04-wire-engine-into-room-actor
    provides: "04-01/04-02 wire shapes (actionId, ErrorDetail enum) and 04-03's fully Hanabi-shaped worker test suite"
provides:
  - "applyGameAction dedup: a repeated actionId from the same seat is never re-applied, checked unconditionally before adapter.applyAction for every action type"
  - "mapAdapterError(error): AdapterError -> ErrorDetail, an exhaustive 1:1 switch with a never-typed default"
  - "RoomResult's failure branch carries an optional closed-enum `detail` alongside the existing `reason`"
affects: ["04-05 (RT-09 double-send-over-the-wire test extends this plan's dedup with a real hibernation-eviction round trip)", "04-06/04-07 (client-visible error detail can now drive UI messaging)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dedup check runs unconditionally before the adapter call, keyed on the actor's own persisted seat field — the asymmetry between naturally-rejected (play/discard) and naturally-legal (clue) repeats is exactly why the check cannot be conditional on action type"
    - "Exhaustive switch with a never-typed default local, mirroring packages/rules/src/hanabi/variant.ts's idiom, so a future AdapterError member is a compile error here rather than a silent bad_request collapse"
    - "Fault-injection verification before committing: moved the dedup check after adapter.applyAction, confirmed the duplicate-clue tests fail, reverted, then committed the correct placement"

key-files:
  created: []
  modified:
    - apps/worker/src/room-state.ts
    - apps/worker/src/room-do.ts
    - apps/worker/src/room-state.test.ts
    - apps/worker/src/redaction-wire.test.ts

key-decisions:
  - "redaction-wire.test.ts's two applyGameAction call sites (not listed in the plan's files_modified) were updated for the new 5-parameter signature — required to keep the whole worker package type-checking (tsc -b was the plan's own instruction to find every call site, not grep alone)"
  - "The RoomStateSchema round-trip proof pads the test fixture's short placeholder seatTokens to the schema's exact 24-character length before parsing, since the dedup key under proof is lastAppliedActionId, not seatToken shape"

patterns-established:
  - "Per-task fault injection as a required step for any test proving a load-bearing ordering invariant (here: dedup-before-adapter-call), not just for redaction/confinement tests"

requirements-completed: []

# Metrics
duration: 35min
completed: 2026-09-15
---

# Phase 4 Plan 4: Dedup Game Actions and Map Adapter Errors Summary

**A repeated `actionId` from the same seat is now a no-op that re-sends the current view instead of re-running the engine, and every one of the adapter's 8 typed refusals reaches the wire as a specific closed-enum `detail` instead of a generic `bad_request` with no distinguishing information.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-09-15

## What Was Built

**Task 1 — `mapAdapterError` typed mapping (D-10).** Changed the signature from
parameterless to `(error: AdapterError) => ErrorDetail`, implemented as an
exhaustive `switch` over all 8 `AdapterError` members with a `never`-typed
`default` branch (the same idiom `variantConfig` uses in
`packages/rules/src/hanabi/variant.ts`). `RoomResult`'s failure branch widened
to `{ ok: false; reason: RefusalReason; detail?: ErrorDetail }`; the wire
`code` deliberately stays `bad_request` (the enum shared with join-time
`refused` frames is not widened), with the specific reason riding in `detail`.

**Task 2 — dedup before the adapter call (D-08/D-09/RT-09).**
`applyGameAction` gained an `actionId: string` parameter (inserted before
`request`). Immediately after the `status !== "in_progress"` guard and before
any adapter call, the actor's seat is looked up and its persisted
`lastAppliedActionId` compared against the incoming `actionId`; a match
returns `{ ok: true, state }` unchanged (not an error — the caller commits and
pushes, so a retry after a dropped response looks like success). On a
successful new action, `lastAppliedActionId` is recorded on the actor's seat
only, using the same immutable `.map()` idiom as `markConnected`/
`transferHost`. `room-do.ts`'s `game_action` branch passes `msg.actionId`
through and forwards `result.detail` on the error frame; no dedup logic was
added to the Durable Object (`actionId` appears exactly once in
`room-do.ts`).

**Task 3 — unit coverage.** Updated every existing `applyGameAction` call
site (`room-state.test.ts`, plus `redaction-wire.test.ts` which the plan
didn't list but which broke the build) for the new 5-parameter signature.
Added tests proving: a repeated CLUE `actionId` does not spend a second
token and leaves `clueTokens`/`history.length`/`turnIndex` unchanged; a
different `actionId` afterward is applied normally; the applied id lands on
the actor's seat only (not any other seat's); a duplicate id from a
*different* seat is applied normally (per-seat key); the dedup survives a
`RoomStateSchema.parse` round trip (the persisted-shape proof for
hibernation); and four `detail` values (`not_your_turn`, `invalid_action`,
`discard_at_max_clues`, `clue_touches_nothing`) are each produced by a
targeted refusal scenario. Fault-injected the dedup check to run after
`adapter.applyAction` to confirm the duplicate-clue tests fail without the
correct placement, then reverted before committing.

## Verification

- `npx tsc -p apps/worker/tsconfig.json --noEmit` — clean.
- `npx tsc -p packages/schema/tsconfig.json --noEmit`, `packages/rules`, `apps/web` — all clean.
- `npx vitest run --project worker room-state` — 37/37 passed.
- `npx vitest run --project worker source-structure` — 17/17 passed, chokepoint counts unchanged.
- `npm test` (full suite) — 457/457 passed across 44 test files.
- `grep -c 'mapAdapterError(result.error)' apps/worker/src/room-state.ts` → `1`.
- `grep -c 'msg.actionId' apps/worker/src/room-do.ts` → `1`; `grep -c 'actionId' apps/worker/src/room-do.ts` → `1` (no leaked dedup logic).
- Dedup comparison (line 351) precedes `adapter.applyAction(` (line 356) in `room-state.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking build error] Updated `redaction-wire.test.ts`'s two `applyGameAction` call sites**
- **Found during:** Task 1/2 typecheck (`tsc -p apps/worker/tsconfig.json --noEmit`)
- **Issue:** This file wasn't in the plan's `files_modified` list, but its two `applyGameAction(room, activeSeatId, legalActionFor(game), ...)` calls broke against the new 5-parameter signature, exactly the kind of missed call site the plan's critical notes warned a build (not grep) would catch.
- **Fix:** Inserted a distinct `actionId` (`action-${i}` / `action-${guard}`) as the third argument at both call sites.
- **Files modified:** apps/worker/src/redaction-wire.test.ts
- **Commit:** 8621243

None else — plan executed as written otherwise.

## Known Stubs

None.

## Threat Flags

None — this plan's changes are exactly the threat-register mitigations already specified in the plan's own `<threat_model>` (T-04-15 through T-04-20), with no new surface introduced.

## Self-Check: PASSED

- FOUND: apps/worker/src/room-state.ts (mapAdapterError, applyGameAction dedup)
- FOUND: apps/worker/src/room-do.ts (msg.actionId pass-through, result.detail on error frame)
- FOUND: apps/worker/src/room-state.test.ts (new D-09/D-10 describe blocks)
- FOUND: apps/worker/src/redaction-wire.test.ts (updated call sites)
- FOUND commit 984d638 (feat(04-04): dedup game_action by actionId and map adapter errors to closed detail enum)
- FOUND commit 8621243 (test(04-04): prove actionId dedup and typed error mapping in room-state)
