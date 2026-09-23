---
phase: 08-multi-game-rooms
plan: 05
subsystem: api
tags: [zod, durable-objects, game-registry, persisted-state, schema-versioning]

# Dependency graph
requires:
  - phase: 08-multi-game-rooms
    provides: "08-03 (gameId-keyed GAME_REGISTRY, resolveGame, injectable games parameter), 08-04 (RoomView carries gameId/config/limits, validateGameView dispatches per-game)"
provides:
  - "RoomStateSchema (D-04): persisted RoomState carries gameId, an opaque config, and gameLocked — the top-level Hanabi-only variant field is gone from the persisted envelope"
  - "room-state.ts's roomGame helper keyed by state.gameId (no longer the interim DEFAULT_GAME_ID constant 08-03 introduced)"
  - "setConfig (apps/worker/src/room-state.ts): host-only, lobby-only, validated fail-closed against the room's own game's configSchema before any mutation (MGR-03); replaces setVariant"
  - "startGame re-validates state.config against the registry's configSchema before creating initial state (defence in depth, T-8-02)"
  - "ROOM_SCHEMA_VERSION = 5 (MGR-06): a persisted pre-change (v4) Hanabi room resets to an empty lobby through the existing version-check path, proven to never read the old blob"
  - "MIN_PLAYERS/MAX_PLAYERS deleted from packages/schema/src/constants.ts — every reader now resolves seat limits through the registry"
affects: [08-06, 08-07, 08-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "roomGame(state, games) resolves through state.gameId — the interim DEFAULT_GAME_ID lookup 08-03 introduced (with state threaded through unused) is now the real re-key, exactly as 08-03's own SUMMARY predicted"
    - "setConfig mirrors setVariant's host-only/lobby-only gate exactly, inserting one extra fail-closed configSchema.safeParse step between the two existing guards — no new gate shape introduced"
    - "gameLocked follows the same first-write-wins idiom as hostSeatId (state.hostSeatId ?? seatId): set unconditionally to true in joinRoom's new-join branch only, never touched by the reclaim branches"

key-files:
  created: []
  modified:
    - packages/schema/src/room.ts
    - packages/schema/src/room.test.ts
    - packages/schema/src/constants.ts
    - apps/worker/src/room-state.ts
    - apps/worker/src/room-do.ts
    - apps/worker/src/room-state.test.ts
    - apps/worker/src/persistence.test.ts
    - apps/worker/src/scheduler.test.ts
    - apps/worker/src/seat-projection.test.ts
    - apps/worker/src/redaction-wire.test.ts

key-decisions:
  - "RoomStateSchema stayed z.object (not z.strictObject, unlike RoomViewSchema in 08-04) — persisted server-only state was already non-strict before this plan, and D-13's reset-on-version-mismatch path (not schema rejection) is the actual mechanism that keeps an old blob from ever being read, so strict-object enforcement here would be a scope-widening change beyond what D-04/D-13 called for; room.test.ts's new RoomStateSchema describe proves acceptance/rejection through the REQUIRED gameId/config/gameLocked fields instead"
  - "createEmptyRoom's variant parameter was dropped entirely (not defaulted) — every production and test call site already passes a hardcoded \"base\"/no variant, so the signature change from (code, variant, now, games?) to (code, now, games?) is a pure simplification with zero call-site ambiguity"
  - "room-state.test.ts's local MAX_PLAYERS is now `GAME_REGISTRY.hanabi.limits.max` (a module-level const derived from the real registry), not a re-declared literal 5 — so a future change to Hanabi's registered limits cannot silently desync this test file's expectations from production"

patterns-established: []

requirements-completed: [MGR-01, MGR-03, MGR-04, MGR-06]

# Metrics
duration: 45min
completed: 2026-09-23
---

# Phase 8 Plan 05: Persisted Room Carries gameId/Config, Schema v5 Reset Summary

**`RoomState` drops its top-level Hanabi-only `variant` field for `gameId` + an opaque `config` + `gameLocked` (D-01/D-03/D-04), `setVariant` becomes the registry-validated `setConfig` (MGR-03), and `ROOM_SCHEMA_VERSION` bumps to 5 with a test proving a real pre-change Hanabi blob resets to an empty lobby without ever being read (D-13/MGR-06) — Hanabi itself is unchanged.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 2 (landed as one commit per the plan's own instruction — Task 1 alone leaves `*.test.ts` non-compiling until Task 2's consumer updates land)
- **Files modified:** 10

## Accomplishments

- `RoomStateSchema` (packages/schema/src/room.ts) rewritten per D-04/D-01/D-03: `gameId: GameIdSchema` (which game this room plays, set once), `config: z.unknown()` (opaque here, validated by the worker registry's `configSchema`, mirroring the existing `game: z.unknown()` convention), and `gameLocked: z.boolean()` (D-01: false until the room's first ever join, true thereafter, first-write-wins like `hostSeatId`) replace the top-level `variant: VariantSchema` field
- `apps/worker/src/room-state.ts`'s private `roomGame(state, games)` helper now resolves through `state.gameId` — the real re-key 08-03's own interim `DEFAULT_GAME_ID` lookup was built to make a one-line change: `createEmptyRoom(code, now, games?)` (variant parameter removed) seeds `gameId: "hanabi"`, `config: entry.defaultConfig`, `gameLocked: false` (D-03); `joinRoom`'s new-join branch sets `gameLocked: true` in the same first-write-wins placement as `hostSeatId`; `setVariant` is replaced by `setConfig(state, actorSeatId, config, now, games?)` — host-only (`not_host`), lobby-only (`bad_request`), then `entry.configSchema.safeParse(config)` fail-closed to `bad_request` with state unchanged before any mutation (T-8-02, MGR-03); `startGame` re-validates `state.config` against the registry's `configSchema` as defence in depth before calling `createInitialState`; `toSeatView` emits `gameId: state.gameId` / `config: state.config` directly (no longer the interim `DEFAULT_GAME_ID`/`state.variant` bridge 08-04 documented)
- `apps/worker/src/room-do.ts`: `onStart`'s fallback room constructor drops the hardcoded `"base"` variant argument; the `set_variant` wire frame stays byte-identical this plan (plan 08-06 replaces it) and now routes into `setConfig(room, actorSeatId, msg.variant, now)` — proven by `room-do.test.ts`'s real `wrangler dev` integration suite (26/26) passing unchanged, still sending `set_variant` frames
- `constants.ts`: `ROOM_SCHEMA_VERSION` bumped 4 → 5 with a doc-comment paragraph appended in the file's own established bump-history style; `MIN_PLAYERS`/`MAX_PLAYERS` deleted (confirmed via a repo-wide grep that nothing outside test-local constants/doc-comment prose still reads them — everything resolves seat limits through the registry as of 08-03/08-04)
- **D-13 (MGR-06):** a new `persistence.test.ts` describe seeds a real v4-shaped storage blob — `schemaVersion: 4`, top-level `variant: "rainbow"`, `status: "in_progress"`, two real seats, and an actual `hanabiGame.createInitialState({...})` game object (not a stub) — and proves `loadRoom` resets to `fallbackRoom()` via the version-check path alone: `getCalls` never contains `STORAGE_KEYS.room`, so the old blob is provably never read, not merely "ended up reset" (which a corrupt-blob fallback would also produce). **Verified live:** temporarily reverting `ROOM_SCHEMA_VERSION` to 4 made this exact test fail (`expected 4 to be 5`), confirming the test is load-bearing against the real version constant, then the constant was restored to 5 and the full suite re-run green.
- Every `RoomState`/`createEmptyRoom` fixture across `room-state.test.ts`, `scheduler.test.ts`, `seat-projection.test.ts`, `redaction-wire.test.ts`, and `persistence.test.ts` renamed to the new envelope in the same commit (MGR-04: fixture-rename diffs only, zero behavior-assertion changes); `room.test.ts` gained a new `RoomStateSchema` describe proving the new envelope is accepted and a pre-D-04 (v4) shaped state (missing `gameId`/`config`/`gameLocked`) is rejected
- Full gate green: `npm test` 1075/1075, `npm run typecheck` (root `tsc -b`) clean, `room-do.test.ts`'s real `wrangler dev` integration suite 26/26, and the three targeted Playwright specs (`start-game`, `variant-rainbow`, `variant-black`) 15/15 — no deploy performed (D-14)

## Task Commits

Both tasks landed as ONE commit per the plan's explicit instruction (Task 1 alone is not independently buildable — every `*.test.ts` file referencing `RoomState`/`createEmptyRoom`/`setVariant`/`MAX_PLAYERS` fails `tsc -b` until Task 2's consumer updates land):

1. **Task 1 (schema/worker production code) + Task 2 (test consumers, D-13 proof, full gate): persisted room carries gameId/config, schema v5 reset (D-03, D-04, D-13)** — `730ea3d` (feat)

**Plan metadata:** this commit (docs: complete 08-05 plan)

## Files Created/Modified

- `packages/schema/src/room.ts` — `RoomStateSchema` gains `gameId`/`config`/`gameLocked`, drops `variant`
- `packages/schema/src/room.test.ts` — new `RoomStateSchema` describe: accepts the new envelope, rejects a pre-D-04 v4-shaped state, rejects missing `gameId`/`gameLocked`
- `packages/schema/src/constants.ts` — `ROOM_SCHEMA_VERSION` 4 → 5 with bump-history doc comment; `MIN_PLAYERS`/`MAX_PLAYERS` deleted
- `apps/worker/src/room-state.ts` — `roomGame` re-keyed to `state.gameId`; `createEmptyRoom`/`joinRoom`/`setConfig`(was `setVariant`)/`startGame`/`toSeatView` updated per D-01/D-03/D-04/MGR-03
- `apps/worker/src/room-do.ts` — `onStart` fallback drops the hardcoded variant arg; `set_variant` dispatch calls `setConfig`
- `apps/worker/src/room-state.test.ts` — fixture renames; `setVariant` → `setConfig`; local `MAX_PLAYERS` now derived from `GAME_REGISTRY.hanabi.limits.max`
- `apps/worker/src/persistence.test.ts` — `fallbackRoom()` fixture renamed; new D-13 describe block with a real Hanabi game-state blob
- `apps/worker/src/scheduler.test.ts` — `makeRoom` fixture renamed
- `apps/worker/src/seat-projection.test.ts` — `createEmptyRoom(ROOM_CODE, "base", 0)` calls renamed to the new 2-arg signature
- `apps/worker/src/redaction-wire.test.ts` — same `createEmptyRoom` signature fix

## Decisions Made

- `RoomStateSchema` stays `z.object` (not `z.strictObject`) — unlike `RoomViewSchema` (08-04), which is client-facing and warrants a closed shape, the persisted server-only envelope's actual reset guarantee comes from D-13's version-check-before-parse path in `persistence.ts` (unchanged this plan), not from schema strictness. Widening to strict here would be an uninstructed scope expansion; `room.test.ts`'s new tests instead prove the load-bearing invariant (the new fields are `required`, so an old v4 blob — missing them — fails `RoomStateSchema.safeParse` on the rare corrupt-but-matching-version path, and fails the version-check path first and foremost per D-13).
- `createEmptyRoom`'s `variant` parameter was removed entirely rather than defaulted or deprecated — every call site (production and test) already passed a hardcoded value with no runtime variability, so this is a pure signature simplification, confirmed via a full grep of every call site before the change.

## Deviations from Plan

None — plan executed exactly as written. Both tasks landed as the single commit the plan's own objective explicitly called for.

## Issues Encountered

None. `npm test`/`npm run typecheck` stayed green throughout; the one deliberate red state (temporarily reverting `ROOM_SCHEMA_VERSION` to 4 to prove the D-13 test is load-bearing) was intentional per the plan's own acceptance criteria and was reverted immediately after confirming the failure.

## User Setup Required

None — no external service configuration required. No deployment was performed (D-14: the executor does not deploy).

## Next Phase Readiness

- Plan 08-06 can now replace the `set_variant { variant }` wire frame with `set_config { config }` — the worker-side `setConfig` function and its `room-do.ts` dispatch are already in place and registry-validated; only the Zod message schema and its web-side callers change next.
- `MGR-01` (host picks game, proven with Hanabi + a test-only second game) is left **Pending**: this plan proves the persisted-state half of the registry seam (gameId/config/gameLocked all flow correctly for Hanabi), but the toy second game (D-10) is plan 08-07's deliverable — MGR-01's "proven with a test-only second game" clause is not yet satisfied.
- `MGR-03` (each game brings its own settings; host sees only current game's) is marked **Complete** for its worker-side half: `setConfig` validates fail-closed against the room's own registered game's `configSchema`, proven by the existing `ROOM-05` describe block (renamed, not re-authored) plus `startGame`'s new defence-in-depth re-validation. The web-side "host sees only current game's settings fieldset" (D-12) is out of this plan's scope (apps/web untouched here) — still tracked for a later plan.
- `MGR-04` (Hanabi unchanged, full suites pass with fixture-rename diffs only) is **Complete** for this plan's contribution: 1075/1075 unit tests, `room-do.test.ts`'s real-`wrangler-dev` integration suite (26/26, unchanged `set_variant` frames), and 15/15 targeted Playwright specs, all green with zero behavior-assertion changes beyond fixture renames.
- `MGR-06` (deploy resets saved rooms via schema-version bump) is **Complete**: `ROOM_SCHEMA_VERSION = 5`, D-13's test proves the version-check path (not a schema-rejection fallback) is what fires, and the reset is verified live by a temporary revert-and-fail check.
- No blockers for plan 08-06.

---
*Phase: 08-multi-game-rooms*
*Completed: 2026-09-23*

## Self-Check: PASSED

All files listed under Files Created/Modified confirmed present on disk. Commit `730ea3d` confirmed present in `git log --oneline`.
