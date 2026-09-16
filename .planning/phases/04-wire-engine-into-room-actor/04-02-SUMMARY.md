---
phase: 04-wire-engine-into-room-actor
plan: 02
subsystem: api
tags: [zod, wire-protocol, idempotency, schema-migration]

# Dependency graph
requires:
  - phase: 04-wire-engine-into-room-actor
    provides: "wave-1 groundwork (04-01) — strict Hanabi wire view schema and subpath wiring"
provides:
  - "actionId on GameActionMessageSchema, required and bounded (D-07)"
  - "widened 9-member closed ErrorDetailSchema mirroring AdapterError 1:1 (D-10)"
  - "Seat.lastAppliedActionId, persisted-only idempotency bookkeeping (D-08)"
  - "ROOM_SCHEMA_VERSION bumped 2 -> 3 so toy-persisted rooms reset (D-06)"
affects: ["04-04 (dedup logic and mapAdapterError)", "04-05 (repointing game_action senders to real Hanabi actions)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotency key lives at the wire envelope level, never inside the hostile `request` payload, so the adapter's exact-own-key guards and the dedup key can both hold independently"
    - "Client-facing view schemas are declared independently (not via .omit()) so new persisted-only fields cannot leak by default"

key-files:
  created: []
  modified:
    - packages/schema/src/messages.ts
    - packages/schema/src/messages.test.ts
    - packages/schema/src/room.ts
    - packages/schema/src/constants.ts
    - apps/worker/src/persistence.test.ts
    - apps/worker/src/room-do.test.ts
    - "apps/web/app/room/[code]/RoomClient.tsx"

key-decisions:
  - "actionId bounds set to 1-64 characters (Claude's Discretion in 04-CONTEXT.md), matching nanoid's default output length with headroom"
  - "ErrorDetailSchema members are named identically to AdapterError members for a lossless 1:1 mapping in plan 04-04's mapAdapterError"

patterns-established:
  - "Schema-version bump as the toy-to-real-engine migration strategy: reset, never migrate (reused D-17 pattern from Phase 1/2)"

requirements-completed: [RT-09]

# Metrics
duration: 33min
completed: 2026-09-16
---

# Phase 4 Plan 2: Extend Wire Protocol and Persisted Room Shape Summary

**Added a required, bounded `actionId` to `game_action` frames and a persisted per-seat `lastAppliedActionId`, widened `ErrorDetail` to a 9-member closed enum mirroring `AdapterError`, and bumped `ROOM_SCHEMA_VERSION` to reset toy-tagged rooms — laying the wire/storage groundwork for RT-09 exactly-once actions without changing any worker behavior yet.**

## Performance

- **Duration:** 33 min
- **Started:** 2026-09-16T02:28:00Z
- **Completed:** 2026-09-16T03:01:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- `GameActionMessageSchema` now requires a bounded (1-64 char) `actionId` at the envelope level, kept structurally separate from the hostile `request` field
- `ErrorDetailSchema` widened from a 1-member to a 9-member closed enum (`view_unavailable` plus all 8 `AdapterError` names), still rejecting free text
- `SeatSchema` gained an optional/nullable `lastAppliedActionId` for persisted idempotency bookkeeping, explicitly kept out of `PublicSeatSchema`/`RoomViewSchema`
- `ROOM_SCHEMA_VERSION` bumped 2 → 3, proven by a new persistence test that a `forehead-card`-tagged schemaVersion-2 room resets without its blob being read
- All three existing `game_action` senders (two in `room-do.test.ts`, one in `RoomClient.tsx`) updated to include `actionId` so the suite stays green under the newly required field

## Task Commits

1. **Task 1: Add actionId to the wire and widen the closed error-detail enum** - `211cb61` (feat)
2. **Task 2: Add the persisted per-seat idempotency field and bump the schema version** - `b88dbe8` (feat)
3. **Task 3: Cover the new shapes with tests and keep every existing game_action sender valid** - `b6160da` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `packages/schema/src/messages.ts` - `actionId` on `GameActionMessageSchema`; widened `ErrorDetailSchema`
- `packages/schema/src/messages.test.ts` - tests for actionId bounds/requiredness, strict-mode rejection, all 9 `ErrorDetail` members, free-text rejection
- `packages/schema/src/room.ts` - `Seat.lastAppliedActionId`; `PublicSeatSchema` deliberate-absence comment
- `packages/schema/src/constants.ts` - `ROOM_SCHEMA_VERSION = 3` with extended bump-history docstring
- `apps/worker/src/persistence.test.ts` - new case proving a `forehead-card`-tagged room resets under the bump (D-06)
- `apps/worker/src/room-do.test.ts` - `actionId` added to the three existing `game_action` sends
- `apps/web/app/room/[code]/RoomClient.tsx` - `nanoid()`-minted `actionId` on the `game_action` send site, with a D-07 reuse-on-retry comment

## Decisions Made
- None beyond the plan's own Claude's-Discretion items (actionId bounds, enum member naming) — both already resolved above.

## Deviations from Plan

None - plan executed exactly as written. The one existing schema test that asserted a `game_action` without `actionId` was valid (`accepts a game_action with an arbitrary nested payload...`) was updated in the same Task 1 commit as the schema change that made it fail, since it lives in the same file the task already modifies — not treated as a separate deviation.

## Issues Encountered
- `npx tsc -b` at the repo root fails with `TS5083: Cannot read file '/home/rflor/games/tsconfig.json'` because there is no root solution `tsconfig.json` (only `tsconfig.base.json` plus per-package `tsconfig.json` files). Ran `tsc -b` from within each of the four package directories instead (all exit 0); `npm test` at the root runs vitest across all four projects and is unaffected.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 04-04 can now implement `mapAdapterError` against the 9-member `ErrorDetailSchema` and the dedup check against `Seat.lastAppliedActionId`.
- Plan 04-05 can repoint the three `game_action` sends (and the toy assertions around them) to real Hanabi actions; the `actionId` plumbing is already in place at each site.
- Full `npm test` is green (44 files / 446 tests) and all four packages type-check clean.

---
*Phase: 04-wire-engine-into-room-actor*
*Completed: 2026-09-16*
